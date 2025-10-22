import { z } from 'zod';

/**
 * Environment configuration schema
 */
export const EnvSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),

  // Chatwoot
  CHATWOOT_URL: z.string().url(),
  CHATWOOT_API_KEY: z.string().min(1),
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_INBOX_ID: z.coerce.number().int().positive(),

  // WhatsApp
  WHATSAPP_API_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),

  // AI Services
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),

  // Agent Config
  AGENT_NAME: z.string().default('Assistente'),
  IDLE_WINDOW_MS: z.coerce.number().int().positive().default(2500),
  BURST_EXTENSION_MS: z.coerce.number().int().positive().default(1200),
  MAX_IDLE_WINDOW_MS: z.coerce.number().int().positive().default(5000),
  DEFAULT_LOCALE: z.string().default('pt-BR'),
  DEFAULT_TIMEZONE: z.string().default('America/Sao_Paulo'),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Load and validate environment variables
 */
export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  return parsed.data;
}
