import { ElevenLabsClient } from 'elevenlabs';
import { createLogger } from '@agencl/shared/utils';
import { writeFile } from 'fs/promises';
import { Readable } from 'stream';

const logger = createLogger('elevenlabs-service');

export interface ElevenLabsServiceConfig {
  apiKey: string;
  voiceId: string;
  model?: string;
}

/**
 * ElevenLabs service for text-to-speech (Portuguese)
 */
export class ElevenLabsService {
  private client: ElevenLabsClient;
  private voiceId: string;
  private model: string;

  constructor(config: ElevenLabsServiceConfig) {
    this.client = new ElevenLabsClient({
      apiKey: config.apiKey,
    });
    this.voiceId = config.voiceId;
    this.model = config.model || 'eleven_flash_v2_5';
  }

  /**
   * Generate audio from text
   * @param text Text to convert to speech
   * @param outputPath Path to save the audio file
   * @returns Duration in milliseconds
   */
  async generateAudio(text: string, outputPath: string): Promise<number> {
    const startTime = Date.now();

    try {
      logger.info('Generating audio from text', {
        textLength: text.length,
        outputPath,
      });

      const audio = await this.client.textToSpeech.convert(this.voiceId, {
        text,
        model_id: this.model,
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      });

      // Convert async generator to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audio) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);

      // Save to file
      await writeFile(outputPath, audioBuffer);

      // Estimate duration (rough calculation based on speech rate)
      // Average Portuguese: ~150 words per minute
      const words = text.split(/\s+/).length;
      const estimatedDurationSeconds = (words / 150) * 60;
      const durationMs = Math.round(estimatedDurationSeconds * 1000);

      const processingTime = Date.now() - startTime;
      logger.info('Audio generated successfully', {
        processingTime,
        estimatedDuration: durationMs,
        fileSize: audioBuffer.length,
      });

      return durationMs;
    } catch (error) {
      logger.error('Failed to generate audio', error as Error, {
        textLength: text.length,
      });
      throw error;
    }
  }

  /**
   * Generate audio and return as stream (for direct upload)
   */
  async generateAudioStream(text: string): Promise<{
    stream: ReadableStream;
    durationMs: number;
  }> {
    const startTime = Date.now();

    try {
      logger.info('Generating audio stream from text', {
        textLength: text.length,
      });

      const audio = await this.client.textToSpeech.convert(this.voiceId, {
        text,
        model_id: this.model,
        output_format: 'mp3_44100_128',
      });

      // Estimate duration
      const words = text.split(/\s+/).length;
      const estimatedDurationSeconds = (words / 150) * 60;
      const durationMs = Math.round(estimatedDurationSeconds * 1000);

      const processingTime = Date.now() - startTime;
      logger.info('Audio stream generated', {
        processingTime,
        estimatedDuration: durationMs,
      });

      // Convert async iterator to ReadableStream
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of audio) {
              controller.enqueue(new Uint8Array(chunk));
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return { stream, durationMs };
    } catch (error) {
      logger.error('Failed to generate audio stream', error as Error);
      throw error;
    }
  }
}
