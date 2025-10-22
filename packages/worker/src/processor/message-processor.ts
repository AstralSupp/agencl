import { eq, and, desc } from 'drizzle-orm';
import type { DbClient } from '@agencl/db';
import { messages, conversations, agentState, config, customers } from '@agencl/db/schema';
import { ClaudeService } from '../services/claude';
import { WhisperService } from '../services/whisper';
import { ElevenLabsService } from '../services/elevenlabs';
import { ChatwootService } from '../services/chatwoot';
import {
  createLogger,
  calculateTypingTime,
  calculateRecordingTime,
  looksLikeTyping,
  sanitizeEmojis,
  sleep,
} from '@agencl/shared/utils';
import type { ChatMessage } from '@agencl/shared/types';

const logger = createLogger('message-processor');

export interface MessageProcessorConfig {
  db: DbClient;
  claude: ClaudeService;
  whisper: WhisperService;
  elevenlabs: ElevenLabsService;
  chatwoot: ChatwootService;
  orgId: string;
}

export interface ProcessMessageParams {
  conversationId: string;
  messageId: string;
}

/**
 * Main message processor - orchestrates the entire flow
 */
export class MessageProcessor {
  private config: MessageProcessorConfig;

  constructor(config: MessageProcessorConfig) {
    this.config = config;
  }

  /**
   * Process a message from the queue
   */
  async process(params: ProcessMessageParams): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Processing message', params);

      // 1. Load org config
      const orgConfig = await this.loadConfig();
      if (!orgConfig) {
        throw new Error('Organization config not found');
      }

      // Check kill switch
      if (orgConfig.killSwitch) {
        logger.info('Kill switch is ON - skipping message processing');
        return;
      }

      // 2. Load conversation and check status
      const conversation = await this.loadConversation(params.conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Don't process if handed off to agent
      if (conversation.status === 'handed_off') {
        logger.info('Conversation is handed off - skipping AI response');
        return;
      }

      // 3. Load message
      const message = await this.loadMessage(params.messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Only process incoming user messages
      if (message.role !== 'user') {
        logger.info('Message is not from user - skipping');
        return;
      }

      // 4. Check burst detection
      const state = await this.getOrCreateAgentState(params.conversationId);
      const shouldWait = await this.checkBurstDetection(
        state,
        message,
        orgConfig
      );

      if (shouldWait) {
        logger.info('User is still typing - re-queuing for later');
        // TODO: Re-queue task with delay
        return;
      }

      // 5. Transcribe audio if needed
      let messageText = message.body || '';
      if (message.type === 'audio' && message.mediaUrl) {
        logger.info('Transcribing audio message');
        messageText = await this.transcribeAudio(message.mediaUrl);

        // Update message with transcription
        await this.config.db
          .update(messages)
          .set({ body: messageText })
          .where(eq(messages.id, message.id));
      }

      // 6. Load conversation history
      const history = await this.loadConversationHistory(params.conversationId);

      // 7. Get Claude's decision
      logger.info('Getting AI decision');
      const decision = await this.config.claude.makeDecision({
        messages: history,
        systemPrompt: orgConfig.systemPrompt || this.getDefaultSystemPrompt(orgConfig),
        conversationContext: {
          customerName: conversation.metadata?.customerName,
          previousSummary: conversation.metadata?.summary,
        },
      });

      logger.info('AI decision made', {
        shouldRespond: decision.should_respond,
        responseType: decision.response_type,
        shouldReact: decision.should_react,
      });

      // 8. Handle handoff if needed
      if (decision.handoff_needed) {
        await this.handleHandoff(conversation, decision.handoff_reason || 'Unknown');
        return;
      }

      // 9. Send emoji reaction if appropriate
      if (decision.should_react && decision.emoji_reaction) {
        const emojis = sanitizeEmojis([decision.emoji_reaction], messageText);
        if (emojis.length > 0 && conversation.chatwootConversationId) {
          await this.config.chatwoot.sendReaction({
            conversationId: conversation.chatwootConversationId,
            messageId: message.chatwootMessageId || 0,
            emoji: emojis[0],
          });
        }
      }

      // 10. Generate and send response if needed
      if (decision.should_respond && decision.response_content) {
        await this.sendResponse(
          conversation,
          decision.response_content,
          decision.response_type,
          orgConfig
        );
      }

      // 11. Update agent state
      await this.updateAgentState(state.id, {
        lastReplyAt: new Date(),
        burstCount: 0,
        isTyping: false,
        isRecording: false,
      });

      const duration = Date.now() - startTime;
      logger.info('Message processed successfully', {
        duration,
        conversationId: params.conversationId,
      });
    } catch (error) {
      logger.error('Failed to process message', error as Error, params);
      throw error;
    }
  }

  /**
   * Check if we should wait for more messages (burst detection)
   */
  private async checkBurstDetection(
    state: any,
    message: any,
    orgConfig: any
  ): Promise<boolean> {
    const now = Date.now();
    const lastMsgTime = state.lastUserMsgAt
      ? new Date(state.lastUserMsgAt).getTime()
      : 0;
    const timeSinceLastMsg = now - lastMsgTime;

    // Calculate dynamic idle window
    const baseIdleWindow = orgConfig.idleWindowMs || 2500;
    const burstExtension = orgConfig.burstExtensionMs || 1200;
    const maxIdleWindow = orgConfig.maxIdleWindowMs || 5000;

    const currentIdleWindow = Math.min(
      baseIdleWindow + state.burstCount * burstExtension,
      maxIdleWindow
    );

    // Check if message looks like user is still typing
    const messageText = message.body || '';
    const isStillTyping = looksLikeTyping(messageText);

    // Update state
    await this.updateAgentState(state.id, {
      lastUserMsgAt: new Date(),
      burstCount: isStillTyping ? state.burstCount + 1 : 0,
    });

    // Should wait if:
    // 1. Message looks incomplete AND
    // 2. Within the idle window
    return isStillTyping && timeSinceLastMsg < currentIdleWindow;
  }

  /**
   * Send response (text or audio)
   */
  private async sendResponse(
    conversation: any,
    content: string,
    responseType: string,
    orgConfig: any
  ): Promise<void> {
    if (!conversation.chatwootConversationId) {
      logger.warn('No Chatwoot conversation ID - cannot send response');
      return;
    }

    const conversationId = conversation.chatwootConversationId;

    // Show typing/recording indicator
    const isAudio = responseType === 'audio' && orgConfig.enableTts;
    const indicatorTime = isAudio
      ? calculateRecordingTime(content)
      : calculateTypingTime(content);

    await this.config.chatwoot.toggleTyping({
      conversationId,
      typing: true,
    });

    // Wait for realistic time
    await sleep(indicatorTime);

    // Generate audio if needed
    if (isAudio) {
      logger.info('Generating audio response');
      const audioPath = `/tmp/audio-${Date.now()}.mp3`;
      await this.config.elevenlabs.generateAudio(content, audioPath);

      // Upload and send audio
      // TODO: Upload to storage and get URL
      const audioUrl = 'https://placeholder-audio-url.com/audio.mp3';

      await this.config.chatwoot.sendAudioMessage({
        conversationId,
        audioUrl,
        content,
      });
    } else {
      // Send text message
      await this.config.chatwoot.sendMessage({
        conversationId,
        content,
      });
    }

    // Turn off typing indicator
    await this.config.chatwoot.toggleTyping({
      conversationId,
      typing: false,
    });

    // Save message to DB
    await this.config.db.insert(messages).values({
      orgId: this.config.orgId,
      conversationId: conversation.id,
      role: 'assistant',
      type: isAudio ? 'audio' : 'text',
      body: content,
      createdAt: new Date(),
    });
  }

  /**
   * Handle handoff to human agent
   */
  private async handleHandoff(
    conversation: any,
    reason: string
  ): Promise<void> {
    logger.info('Handing off conversation to human agent', {
      conversationId: conversation.id,
      reason,
    });

    // Update conversation status
    await this.config.db
      .update(conversations)
      .set({ status: 'handed_off' })
      .where(eq(conversations.id, conversation.id));

    // Send handoff message to customer
    if (conversation.chatwootConversationId) {
      await this.config.chatwoot.sendMessage({
        conversationId: conversation.chatwootConversationId,
        content: 'Um momento, vou transferir você para um de nossos atendentes. 👤',
      });
    }

    // TODO: Notify agents through Chatwoot or custom platform
  }

  /**
   * Transcribe audio file
   */
  private async transcribeAudio(audioUrl: string): Promise<string> {
    // TODO: Download audio file
    const audioPath = '/tmp/audio-download.mp3';

    const transcription = await this.config.whisper.transcribe(audioPath, 'pt');
    return transcription;
  }

  /**
   * Load conversation history for context
   */
  private async loadConversationHistory(
    conversationId: string,
    limit: number = 20
  ): Promise<ChatMessage[]> {
    const msgs = await this.config.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return msgs
      .reverse()
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.body || '',
      }));
  }

  /**
   * Helper methods to load data
   */
  private async loadConfig() {
    const result = await this.config.db
      .select()
      .from(config)
      .where(eq(config.orgId, this.config.orgId))
      .limit(1);
    return result[0];
  }

  private async loadConversation(conversationId: string) {
    const result = await this.config.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.orgId, this.config.orgId)
        )
      )
      .limit(1);
    return result[0];
  }

  private async loadMessage(messageId: string) {
    const result = await this.config.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.orgId, this.config.orgId)
        )
      )
      .limit(1);
    return result[0];
  }

  private async getOrCreateAgentState(conversationId: string) {
    let state = await this.config.db
      .select()
      .from(agentState)
      .where(eq(agentState.conversationId, conversationId))
      .limit(1);

    if (state.length === 0) {
      const [newState] = await this.config.db
        .insert(agentState)
        .values({
          orgId: this.config.orgId,
          conversationId,
          burstCount: 0,
          isTyping: false,
          isRecording: false,
        })
        .returning();
      return newState;
    }

    return state[0];
  }

  private async updateAgentState(stateId: string, updates: any) {
    await this.config.db
      .update(agentState)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(agentState.id, stateId));
  }

  private getDefaultSystemPrompt(orgConfig: any): string {
    return `
Você é ${orgConfig.agentName}, um assistente virtual brasileiro inteligente e prestativo.

## Comportamento:
- Seja natural, empático e profissional
- Responda sempre em português brasileiro
- Use linguagem clara e direta
- Seja conciso - prefira mensagens curtas
- Adapte-se ao tom do cliente (formal/informal)

## Regras:
- Se o cliente enviar áudio, responda com áudio
- Se o cliente enviar texto, responda com texto
- Não reaja com emoji em todas as mensagens
- Reaja apenas quando for genuinamente apropriado (agradecimentos, piadas, confirmações positivas)
- Nunca use emoji em números, códigos ou informações sensíveis

## Quando transferir para humano:
- Perguntas muito complexas ou técnicas
- Cliente explicitamente pede para falar com humano
- Cliente está frustrado ou insatisfeito
- Você não tem certeza da resposta

Lembre-se: Você está tendo uma conversa real com uma pessoa real. Seja autêntico e útil.
`.trim();
  }
}
