import { createLogger } from '@agencl/shared/utils';

const logger = createLogger('chatwoot-service');

export interface ChatwootServiceConfig {
  url: string;
  apiKey: string;
  accountId: number;
  inboxId: number;
}

export interface SendMessageParams {
  conversationId: number;
  content: string;
  messageType?: 'outgoing' | 'incoming';
  private?: boolean;
  contentType?: 'text' | 'input_select' | 'cards' | 'form' | 'article';
}

export interface SendAudioParams {
  conversationId: number;
  audioUrl: string;
  content?: string;
}

export interface ToggleTypingParams {
  conversationId: number;
  typing: boolean;
}

export interface SendReactionParams {
  conversationId: number;
  messageId: number;
  emoji: string;
}

/**
 * Chatwoot API client service
 */
export class ChatwootService {
  private config: ChatwootServiceConfig;
  private baseUrl: string;

  constructor(config: ChatwootServiceConfig) {
    this.config = config;
    this.baseUrl = `${config.url}/api/v1/accounts/${config.accountId}`;
  }

  /**
   * Send a text message to a conversation
   */
  async sendMessage(params: SendMessageParams): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Sending message to Chatwoot', {
        conversationId: params.conversationId,
        contentLength: params.content.length,
      });

      const response = await fetch(
        `${this.baseUrl}/conversations/${params.conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_access_token': this.config.apiKey,
          },
          body: JSON.stringify({
            content: params.content,
            message_type: params.messageType || 'outgoing',
            private: params.private || false,
            content_type: params.contentType || 'text',
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Chatwoot API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const duration = Date.now() - startTime;
      logger.info('Message sent successfully', {
        conversationId: params.conversationId,
        duration,
      });
    } catch (error) {
      logger.error('Failed to send message to Chatwoot', error as Error, {
        conversationId: params.conversationId,
      });
      throw error;
    }
  }

  /**
   * Send an audio message to a conversation
   */
  async sendAudioMessage(params: SendAudioParams): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Sending audio message to Chatwoot', {
        conversationId: params.conversationId,
        audioUrl: params.audioUrl,
      });

      const response = await fetch(
        `${this.baseUrl}/conversations/${params.conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_access_token': this.config.apiKey,
          },
          body: JSON.stringify({
            content: params.content || 'Audio message',
            message_type: 'outgoing',
            private: false,
            attachments: [
              {
                url: params.audioUrl,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Chatwoot API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const duration = Date.now() - startTime;
      logger.info('Audio message sent successfully', {
        conversationId: params.conversationId,
        duration,
      });
    } catch (error) {
      logger.error('Failed to send audio message to Chatwoot', error as Error, {
        conversationId: params.conversationId,
      });
      throw error;
    }
  }

  /**
   * Toggle typing indicator for a conversation
   */
  async toggleTyping(params: ToggleTypingParams): Promise<void> {
    try {
      logger.debug('Toggling typing indicator', {
        conversationId: params.conversationId,
        typing: params.typing,
      });

      const response = await fetch(
        `${this.baseUrl}/conversations/${params.conversationId}/toggle_typing_status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_access_token': this.config.apiKey,
          },
          body: JSON.stringify({
            typing_status: params.typing ? 'on' : 'off',
          }),
        }
      );

      if (!response.ok) {
        // Don't throw error for typing indicator failures (non-critical)
        logger.warn('Failed to toggle typing indicator', {
          conversationId: params.conversationId,
          status: response.status,
        });
      }
    } catch (error) {
      // Log but don't throw (typing indicator is non-critical)
      logger.warn('Error toggling typing indicator', {
        conversationId: params.conversationId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Send emoji reaction to a message
   * Note: This may require WhatsApp Business API integration
   */
  async sendReaction(params: SendReactionParams): Promise<void> {
    try {
      logger.info('Sending emoji reaction', {
        conversationId: params.conversationId,
        messageId: params.messageId,
        emoji: params.emoji,
      });

      // Note: Chatwoot may not have direct reaction API
      // This might need to be done through WhatsApp Business API directly
      // For now, we'll send it as a separate message
      await this.sendMessage({
        conversationId: params.conversationId,
        content: params.emoji,
      });
    } catch (error) {
      logger.error('Failed to send reaction', error as Error, {
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
      throw error;
    }
  }

  /**
   * Get conversation details
   */
  async getConversation(conversationId: number): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/conversations/${conversationId}`,
        {
          headers: {
            'api_access_token': this.config.apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get conversation: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('Failed to get conversation', error as Error, {
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Get messages from a conversation
   */
  async getMessages(conversationId: number): Promise<any[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/conversations/${conversationId}/messages`,
        {
          headers: {
            'api_access_token': this.config.apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get messages: ${response.statusText}`);
      }

      const data = await response.json();
      return data.payload || [];
    } catch (error) {
      logger.error('Failed to get messages', error as Error, {
        conversationId,
      });
      throw error;
    }
  }
}
