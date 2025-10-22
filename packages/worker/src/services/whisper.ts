import OpenAI from 'openai';
import { createLogger } from '@agencl/shared/utils';
import { createReadStream } from 'fs';

const logger = createLogger('whisper-service');

export interface WhisperServiceConfig {
  apiKey: string;
}

/**
 * OpenAI Whisper service for speech-to-text
 */
export class WhisperService {
  private client: OpenAI;

  constructor(config: WhisperServiceConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  /**
   * Transcribe audio file to text
   * @param audioPath Path to audio file
   * @param language Language code (default: 'pt' for Portuguese)
   */
  async transcribe(audioPath: string, language: string = 'pt'): Promise<string> {
    const startTime = Date.now();

    try {
      logger.info('Starting audio transcription', { audioPath, language });

      const transcription = await this.client.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: 'whisper-1',
        language,
        response_format: 'text',
      });

      const duration = Date.now() - startTime;
      logger.info('Audio transcribed successfully', {
        duration,
        textLength: transcription.length,
      });

      return transcription;
    } catch (error) {
      logger.error('Failed to transcribe audio', error as Error, { audioPath });
      throw error;
    }
  }

  /**
   * Transcribe audio with timestamps (verbose format)
   */
  async transcribeVerbose(
    audioPath: string,
    language: string = 'pt'
  ): Promise<OpenAI.Audio.Transcription> {
    const startTime = Date.now();

    try {
      logger.info('Starting verbose audio transcription', {
        audioPath,
        language,
      });

      const transcription = await this.client.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: 'whisper-1',
        language,
        response_format: 'verbose_json',
      });

      const duration = Date.now() - startTime;
      logger.info('Verbose audio transcribed successfully', { duration });

      return transcription;
    } catch (error) {
      logger.error('Failed to transcribe audio (verbose)', error as Error, {
        audioPath,
      });
      throw error;
    }
  }
}
