import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  bigint,
  decimal,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// Enums
// ============================================================================

export const conversationStatusEnum = pgEnum('conversation_status', [
  'bot',
  'handed_off',
  'closed',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'system',
  'agent',
]);

export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'audio',
  'image',
  'video',
  'document',
]);

export const audioKindEnum = pgEnum('audio_kind', ['incoming', 'reply']);

export const eventLevelEnum = pgEnum('event_level', [
  'debug',
  'info',
  'warn',
  'error',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const taskKindEnum = pgEnum('task_kind', [
  'process_message',
  'transcribe_audio',
  'generate_tts',
  'send_reply',
  'embed_message',
  'kb_ingest',
]);

// ============================================================================
// Tables
// ============================================================================

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    name: text('name'),
    locale: text('locale').notNull().default('pt-BR'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    consent: boolean('consent').notNull().default(false),
    tags: text('tags').array().default([]),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    phoneUniqueIdx: uniqueIndex('customers_phone_unique').on(
      table.orgId,
      table.phoneE164
    ),
    orgIdIdx: index('idx_customers_org_id').on(table.orgId),
    phoneIdx: index('idx_customers_phone').on(table.phoneE164),
    lastSeenIdx: index('idx_customers_last_seen').on(table.lastSeenAt),
  })
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    chatwootConversationId: bigint('chatwoot_conversation_id', { mode: 'number' }),
    status: conversationStatusEnum('status').notNull().default('bot'),
    channel: text('channel').notNull().default('whatsapp'),
    lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    chatwootUniqueIdx: uniqueIndex('conversations_chatwoot_unique').on(
      table.orgId,
      table.chatwootConversationId
    ),
    orgIdIdx: index('idx_conversations_org_id').on(table.orgId),
    customerIdIdx: index('idx_conversations_customer_id').on(table.customerId),
    statusIdx: index('idx_conversations_status').on(table.status),
    lastActivityIdx: index('idx_conversations_last_activity').on(
      table.lastActivityAt
    ),
  })
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    type: messageTypeEnum('type').notNull(),
    body: text('body'),
    mediaUrl: text('media_url'),
    durationMs: integer('duration_ms'),
    emojis: text('emojis').array().default([]),
    vendorMsgId: text('vendor_msg_id'),
    chatwootMessageId: bigint('chatwoot_message_id', { mode: 'number' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('idx_messages_org_id').on(table.orgId),
    conversationIdIdx: index('idx_messages_conversation_id').on(
      table.conversationId
    ),
    createdAtIdx: index('idx_messages_created_at').on(table.createdAt),
    roleIdx: index('idx_messages_role').on(table.role),
  })
);

export const audioAssets = pgTable(
  'audio_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    kind: audioKindEnum('kind').notNull(),
    path: text('path').notNull(),
    bytes: integer('bytes').notNull(),
    format: text('format').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    messageIdIdx: index('idx_audio_assets_message_id').on(table.messageId),
  })
);

export const agentState = pgTable(
  'agent_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    waitingUntil: timestamp('waiting_until'),
    burstCount: integer('burst_count').notNull().default(0),
    lastUserMsgAt: timestamp('last_user_msg_at'),
    lastReplyAt: timestamp('last_reply_at'),
    isTyping: boolean('is_typing').notNull().default(false),
    isRecording: boolean('is_recording').notNull().default(false),
    policy: jsonb('policy').default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    conversationUniqueIdx: uniqueIndex('agent_state_conversation_unique').on(
      table.conversationId
    ),
    conversationIdIdx: index('idx_agent_state_conversation_id').on(
      table.conversationId
    ),
    waitingUntilIdx: index('idx_agent_state_waiting_until').on(
      table.waitingUntil
    ),
  })
);

export const config = pgTable(
  'config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    killSwitch: boolean('kill_switch').notNull().default(false),
    idleWindowMs: integer('idle_window_ms').notNull().default(2500),
    burstExtensionMs: integer('burst_extension_ms').notNull().default(1200),
    maxIdleWindowMs: integer('max_idle_window_ms').notNull().default(5000),
    emojiAggressiveness: decimal('emoji_aggressiveness', {
      precision: 3,
      scale: 2,
    })
      .notNull()
      .default('0.30'),
    enableTts: boolean('enable_tts').notNull().default(true),
    locale: text('locale').notNull().default('pt-BR'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    agentName: text('agent_name').notNull().default('Assistente'),
    systemPrompt: text('system_prompt'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgUniqueIdx: uniqueIndex('config_org_unique').on(table.orgId),
    orgIdIdx: index('idx_config_org_id').on(table.orgId),
  })
);

export const kbSources = pgTable(
  'kb_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    url: text('url'),
    content: text('content'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('idx_kb_sources_org_id').on(table.orgId),
  })
);

export const kbChunks = pgTable(
  'kb_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => kbSources.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('idx_kb_chunks_org_id').on(table.orgId),
    sourceIdIdx: index('idx_kb_chunks_source_id').on(table.sourceId),
  })
);

export const agentDecisions = pgTable(
  'agent_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    shouldRespond: boolean('should_respond').notNull(),
    shouldReact: boolean('should_react').notNull(),
    emojiReaction: text('emoji_reaction'),
    responseType: text('response_type'),
    responseTone: text('response_tone'),
    reasoning: jsonb('reasoning'),
    processingTimeMs: integer('processing_time_ms'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    messageIdIdx: index('idx_agent_decisions_message_id').on(table.messageId),
    createdAtIdx: index('idx_agent_decisions_created_at').on(table.createdAt),
  })
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    level: eventLevelEnum('level').notNull().default('info'),
    message: text('message'),
    payload: jsonb('payload').default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('idx_events_org_id').on(table.orgId),
    kindIdx: index('idx_events_kind').on(table.kind),
    levelIdx: index('idx_events_level').on(table.level),
    createdAtIdx: index('idx_events_created_at').on(table.createdAt),
  })
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    kind: taskKindEnum('kind').notNull(),
    payload: jsonb('payload').notNull(),
    runAt: timestamp('run_at').notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    status: taskStatusEnum('status').notNull().default('pending'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('idx_tasks_org_id').on(table.orgId),
    statusIdx: index('idx_tasks_status').on(table.status),
    runAtIdx: index('idx_tasks_run_at').on(table.runAt),
    kindIdx: index('idx_tasks_kind').on(table.kind),
  })
);

// ============================================================================
// Relations
// ============================================================================

export const orgsRelations = relations(orgs, ({ many }) => ({
  customers: many(customers),
  conversations: many(conversations),
  messages: many(messages),
  config: many(config),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(orgs, {
    fields: [customers.orgId],
    references: [orgs.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    org: one(orgs, {
      fields: [conversations.orgId],
      references: [orgs.id],
    }),
    customer: one(customers, {
      fields: [conversations.customerId],
      references: [customers.id],
    }),
    messages: many(messages),
    agentState: one(agentState, {
      fields: [conversations.id],
      references: [agentState.conversationId],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  org: one(orgs, {
    fields: [messages.orgId],
    references: [orgs.id],
  }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  audioAssets: many(audioAssets),
  agentDecisions: many(agentDecisions),
}));

// ============================================================================
// Export types
// ============================================================================

export type Org = typeof orgs.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AudioAsset = typeof audioAssets.$inferSelect;
export type AgentState = typeof agentState.$inferSelect;
export type Config = typeof config.$inferSelect;
export type KbSource = typeof kbSources.$inferSelect;
export type KbChunk = typeof kbChunks.$inferSelect;
export type AgentDecision = typeof agentDecisions.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Task = typeof tasks.$inferSelect;
