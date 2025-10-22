import { createDbClient } from '@agencl/db';
import { loadEnv } from '@agencl/shared/config';
import { createLogger, sleep } from '@agencl/shared/utils';
import { ClaudeService } from './services/claude';
import { WhisperService } from './services/whisper';
import { ElevenLabsService } from './services/elevenlabs';
import { ChatwootService } from './services/chatwoot';
import { MessageProcessor } from './processor/message-processor';
import { eq, and, lte } from 'drizzle-orm';
import { tasks } from '@agencl/db/schema';

const logger = createLogger('worker');

/**
 * Main worker process
 * Polls the tasks table and processes messages
 */
class Worker {
  private env: ReturnType<typeof loadEnv>;
  private db: ReturnType<typeof createDbClient>;
  private processor: MessageProcessor;
  private isRunning: boolean = false;
  private concurrency: number;
  private pollInterval: number;

  constructor() {
    logger.info('Initializing worker...');

    // Load environment
    this.env = loadEnv();

    // Initialize database
    this.db = createDbClient(this.env.DATABASE_URL);

    // Initialize services
    const claude = new ClaudeService({
      apiKey: this.env.ANTHROPIC_API_KEY,
    });

    const whisper = new WhisperService({
      apiKey: this.env.OPENAI_API_KEY,
    });

    const elevenlabs = new ElevenLabsService({
      apiKey: this.env.ELEVENLABS_API_KEY,
      voiceId: this.env.ELEVENLABS_VOICE_ID,
    });

    const chatwoot = new ChatwootService({
      url: this.env.CHATWOOT_URL,
      apiKey: this.env.CHATWOOT_API_KEY,
      accountId: this.env.CHATWOOT_ACCOUNT_ID,
      inboxId: this.env.CHATWOOT_INBOX_ID,
    });

    // Initialize message processor
    this.processor = new MessageProcessor({
      db: this.db,
      claude,
      whisper,
      elevenlabs,
      chatwoot,
      orgId: '00000000-0000-0000-0000-000000000001', // Default org
    });

    this.concurrency = this.env.WORKER_CONCURRENCY;
    this.pollInterval = this.env.WORKER_POLL_INTERVAL_MS;

    logger.info('Worker initialized', {
      concurrency: this.concurrency,
      pollInterval: this.pollInterval,
    });
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    this.isRunning = true;
    logger.info('Worker started - polling for tasks');

    while (this.isRunning) {
      try {
        await this.pollAndProcess();
      } catch (error) {
        logger.error('Error in worker loop', error as Error);
      }

      // Wait before next poll
      await sleep(this.pollInterval);
    }

    logger.info('Worker stopped');
  }

  /**
   * Stop the worker
   */
  stop(): void {
    logger.info('Stopping worker...');
    this.isRunning = false;
  }

  /**
   * Poll for pending tasks and process them
   */
  private async pollAndProcess(): Promise<void> {
    // Find pending tasks that are ready to run
    const pendingTasks = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'pending'),
          lte(tasks.runAt, new Date())
        )
      )
      .limit(this.concurrency);

    if (pendingTasks.length === 0) {
      return;
    }

    logger.info(`Found ${pendingTasks.length} pending tasks`);

    // Process tasks in parallel (up to concurrency limit)
    await Promise.allSettled(
      pendingTasks.map((task) => this.processTask(task))
    );
  }

  /**
   * Process a single task
   */
  private async processTask(task: any): Promise<void> {
    const taskId = task.id;
    const startTime = Date.now();

    try {
      logger.info('Processing task', {
        taskId,
        kind: task.kind,
        attempt: task.attempts + 1,
      });

      // Mark task as processing
      await this.db
        .update(tasks)
        .set({
          status: 'processing',
          attempts: task.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      // Process based on task kind
      switch (task.kind) {
        case 'process_message':
          await this.processor.process(task.payload);
          break;

        default:
          throw new Error(`Unknown task kind: ${task.kind}`);
      }

      // Mark task as completed
      await this.db
        .update(tasks)
        .set({
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      const duration = Date.now() - startTime;
      logger.info('Task completed', {
        taskId,
        kind: task.kind,
        duration,
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('Task failed', error as Error, {
        taskId,
        kind: task.kind,
        attempt: task.attempts + 1,
      });

      // Check if we should retry
      const shouldRetry = task.attempts + 1 < task.maxAttempts;

      if (shouldRetry) {
        // Calculate exponential backoff delay
        const delay = Math.min(1000 * Math.pow(2, task.attempts), 30000);
        const runAt = new Date(Date.now() + delay);

        await this.db
          .update(tasks)
          .set({
            status: 'pending',
            runAt,
            error: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        logger.info('Task will be retried', {
          taskId,
          retryIn: delay,
          nextAttempt: task.attempts + 2,
        });
      } else {
        // Mark as failed
        await this.db
          .update(tasks)
          .set({
            status: 'failed',
            error: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        logger.error('Task failed permanently', undefined, {
          taskId,
          totalAttempts: task.attempts + 1,
        });
      }
    }
  }
}

// ============================================================================
// Main
// ============================================================================

const worker = new Worker();

// Handle shutdown gracefully
process.on('SIGINT', () => {
  logger.info('Received SIGINT');
  worker.stop();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM');
  worker.stop();
});

// Start worker
worker.start().catch((error) => {
  logger.error('Fatal worker error', error as Error);
  process.exit(1);
});
