import Anthropic from '@anthropic-ai/sdk';
import { ClaudeDecision, ChatMessage } from '@agencl/shared/types';
import { createLogger } from '@agencl/shared/utils';

const logger = createLogger('claude-service');

export interface ClaudeServiceConfig {
  apiKey: string;
  model?: string;
}

/**
 * Claude AI service for decision-making and response generation
 */
export class ClaudeService {
  private client: Anthropic;
  private model: string;

  constructor(config: ClaudeServiceConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  /**
   * Ask Claude to make a decision about how to respond
   */
  async makeDecision(params: {
    messages: ChatMessage[];
    systemPrompt: string;
    conversationContext?: Record<string, unknown>;
  }): Promise<ClaudeDecision> {
    const startTime = Date.now();

    try {
      const decisionPrompt = this.buildDecisionPrompt(
        params.messages,
        params.conversationContext
      );

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: params.systemPrompt,
        messages: [
          {
            role: 'user',
            content: decisionPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Parse JSON response
      const decision = this.parseDecisionResponse(content.text);

      const duration = Date.now() - startTime;
      logger.info('Claude decision made', {
        duration,
        shouldRespond: decision.should_respond,
        responseType: decision.response_type,
      });

      return decision;
    } catch (error) {
      logger.error('Failed to get Claude decision', error as Error);
      throw error;
    }
  }

  /**
   * Generate a conversational response
   */
  async generateResponse(params: {
    messages: ChatMessage[];
    systemPrompt: string;
    tone?: string;
  }): Promise<string> {
    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: params.systemPrompt,
        messages: params.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const duration = Date.now() - startTime;
      logger.info('Claude response generated', { duration });

      return content.text;
    } catch (error) {
      logger.error('Failed to generate Claude response', error as Error);
      throw error;
    }
  }

  /**
   * Build the decision prompt for Claude
   */
  private buildDecisionPrompt(
    messages: ChatMessage[],
    context?: Record<string, unknown>
  ): string {
    const conversationHistory = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    return `
Analise as mensagens abaixo e decida as ações apropriadas.

## Histórico da Conversa:
${conversationHistory}

${context ? `## Contexto Adicional:\n${JSON.stringify(context, null, 2)}` : ''}

Forneça sua análise em JSON no seguinte formato:

{
  "should_respond": true/false,
  "reasoning": "Explique seu raciocínio",
  "response_type": "text" | "audio" | "none",
  "response_tone": "formal" | "casual" | "empathetic" | "enthusiastic",
  "should_react": true/false,
  "emoji_reaction": "😊" | null,
  "emoji_reasoning": "Por que este emoji é apropriado",
  "response_content": "Sua resposta aqui (se should_respond = true)",
  "handoff_needed": true/false,
  "handoff_reason": "Razão para transferir para humano (se aplicável)"
}

## Critérios para Decisão:

**Should Respond:**
- Responda se: pergunta direta, pedido de ajuda, oportunidade de vendas
- NÃO responda se: mensagem de cortesia simples ("ok", "obrigado"), cliente está claramente digitando mais

**Should React:**
- Reaja apenas quando adiciona valor emocional
- NÃO reaja a todas as mensagens
- Escolha emojis que correspondam à emoção apropriada
- Exemplos válidos: 👍 para confirmação, ❤️ para gratidão, 😊 para positivo

**Response Type:**
- Use "audio" se o cliente enviou áudio
- Use "text" se o cliente enviou texto
- Mantenha consistência com a preferência do cliente

**Handoff Needed:**
- True se: pergunta muito complexa, cliente frustrado, solicitação explícita de humano
- False se: você pode resolver com confiança
`.trim();
  }

  /**
   * Parse Claude's JSON decision response
   */
  private parseDecisionResponse(text: string): ClaudeDecision {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      const parsed = JSON.parse(jsonText);
      return ClaudeDecision.parse(parsed);
    } catch (error) {
      logger.error('Failed to parse Claude decision', error as Error, {
        rawText: text,
      });
      throw new Error('Invalid decision format from Claude');
    }
  }
}
