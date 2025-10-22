import { z } from 'zod';

// ============================================================================
// Core Types
// ============================================================================

export const MessageRole = z.enum(['user', 'assistant', 'system', 'agent']);
export type MessageRole = z.infer<typeof MessageRole>;

export const MessageType = z.enum(['text', 'audio', 'image', 'video', 'document']);
export type MessageType = z.infer<typeof MessageType>;

export const ConversationStatus = z.enum(['bot', 'handed_off', 'closed']);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const TaskKind = z.enum([
  'process_message',
  'transcribe_audio',
  'generate_tts',
  'send_reply',
  'embed_message',
  'kb_ingest'
]);
export type TaskKind = z.infer<typeof TaskKind>;

// ============================================================================
// Database Models
// ============================================================================

export const Customer = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  phone_e164: z.string(),
  name: z.string().nullable(),
  locale: z.string().default('pt-BR'),
  timezone: z.string().default('America/Sao_Paulo'),
  first_seen_at: z.date(),
  last_seen_at: z.date(),
  consent: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Customer = z.infer<typeof Customer>;

export const Conversation = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  chatwoot_conversation_id: z.number().nullable(),
  status: ConversationStatus,
  channel: z.string().default('whatsapp'),
  last_activity_at: z.date(),
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Conversation = z.infer<typeof Conversation>;

export const Message = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: MessageRole,
  type: MessageType,
  body: z.string().nullable(),
  media_url: z.string().url().nullable(),
  duration_ms: z.number().int().nullable(),
  emojis: z.array(z.string()).default([]),
  vendor_msg_id: z.string().nullable(),
  chatwoot_message_id: z.number().nullable(),
  created_at: z.date(),
});
export type Message = z.infer<typeof Message>;

export const AgentState = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  waiting_until: z.date().nullable(),
  burst_count: z.number().int().default(0),
  last_user_msg_at: z.date().nullable(),
  last_reply_at: z.date().nullable(),
  is_typing: z.boolean().default(false),
  is_recording: z.boolean().default(false),
  policy: z.record(z.unknown()).nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type AgentState = z.infer<typeof AgentState>;

export const Config = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  kill_switch: z.boolean().default(false),
  idle_window_ms: z.number().int().default(2500),
  burst_extension_ms: z.number().int().default(1200),
  max_idle_window_ms: z.number().int().default(5000),
  emoji_aggressiveness: z.number().min(0).max(1).default(0.3),
  enable_tts: z.boolean().default(true),
  locale: z.string().default('pt-BR'),
  timezone: z.string().default('America/Sao_Paulo'),
  agent_name: z.string().default('Assistente'),
  system_prompt: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Config = z.infer<typeof Config>;

// ============================================================================
// AI Service Types
// ============================================================================

export const ClaudeDecision = z.object({
  should_respond: z.boolean(),
  reasoning: z.string(),
  response_type: z.enum(['text', 'audio', 'none']),
  response_tone: z.enum(['formal', 'casual', 'empathetic', 'enthusiastic']),
  should_react: z.boolean(),
  emoji_reaction: z.string().nullable(),
  emoji_reasoning: z.string().nullable(),
  response_content: z.string().nullable(),
  thinking_delay_ms: z.number().int().optional(),
  handoff_needed: z.boolean().default(false),
  handoff_reason: z.string().nullable().optional(),
});
export type ClaudeDecision = z.infer<typeof ClaudeDecision>;

export const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

// ============================================================================
// Task Types
// ============================================================================

export const Task = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  kind: TaskKind,
  payload: z.record(z.unknown()),
  run_at: z.date(),
  attempts: z.number().int().default(0),
  max_attempts: z.number().int().default(3),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  error: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Task = z.infer<typeof Task>;

export const ProcessMessagePayload = z.object({
  conversation_id: z.string().uuid(),
  message_id: z.string().uuid(),
});
export type ProcessMessagePayload = z.infer<typeof ProcessMessagePayload>;

// ============================================================================
// Chatwoot Webhook Types
// ============================================================================

export const ChatwootWebhook = z.object({
  event: z.string(),
  id: z.number().optional(),
  content: z.string().optional(),
  message_type: z.enum(['incoming', 'outgoing']).optional(),
  content_type: z.enum(['text', 'audio', 'image', 'video', 'file']).optional(),
  created_at: z.string().optional(),
  private: z.boolean().optional(),
  source_id: z.string().optional(),
  content_attributes: z.record(z.unknown()).optional(),
  sender: z.object({
    id: z.number(),
    name: z.string().optional(),
    phone_number: z.string().optional(),
    identifier: z.string().optional(),
  }).optional(),
  conversation: z.object({
    id: z.number(),
    inbox_id: z.number(),
    status: z.string(),
    contact_last_seen_at: z.string().optional(),
  }).optional(),
  account: z.object({
    id: z.number(),
    name: z.string(),
  }).optional(),
  inbox: z.object({
    id: z.number(),
    name: z.string(),
  }).optional(),
});
export type ChatwootWebhook = z.infer<typeof ChatwootWebhook>;

// ============================================================================
// WhatsApp Types
// ============================================================================

export const WhatsAppMessage = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'audio', 'image', 'video', 'document']),
  text: z.object({
    body: z.string(),
  }).optional(),
  audio: z.object({
    id: z.string(),
    mime_type: z.string(),
  }).optional(),
  image: z.object({
    id: z.string(),
    mime_type: z.string(),
    caption: z.string().optional(),
  }).optional(),
});
export type WhatsAppMessage = z.infer<typeof WhatsAppMessage>;

// ============================================================================
// Utility Types
// ============================================================================

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
