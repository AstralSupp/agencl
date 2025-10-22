-- ============================================================================
-- Agencl Initial Database Schema
-- AI-powered WhatsApp agent system
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Organizations (Multi-tenancy)
-- ============================================================================

CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Customers
-- ============================================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  name TEXT,
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT customers_phone_unique UNIQUE (org_id, phone_e164)
);

CREATE INDEX idx_customers_org_id ON customers(org_id);
CREATE INDEX idx_customers_phone ON customers(phone_e164);
CREATE INDEX idx_customers_last_seen ON customers(last_seen_at DESC);

-- ============================================================================
-- Conversations
-- ============================================================================

CREATE TYPE conversation_status AS ENUM ('bot', 'handed_off', 'closed');

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  chatwoot_conversation_id BIGINT,
  status conversation_status NOT NULL DEFAULT 'bot',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversations_chatwoot_unique UNIQUE (org_id, chatwoot_conversation_id)
);

CREATE INDEX idx_conversations_org_id ON conversations(org_id);
CREATE INDEX idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity_at DESC);

-- ============================================================================
-- Messages
-- ============================================================================

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'agent');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'video', 'document');

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  type message_type NOT NULL,
  body TEXT,
  media_url TEXT,
  duration_ms INTEGER,
  emojis TEXT[] DEFAULT '{}',
  vendor_msg_id TEXT,
  chatwoot_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_org_id ON messages(org_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_role ON messages(role);

-- ============================================================================
-- Audio Assets
-- ============================================================================

CREATE TYPE audio_kind AS ENUM ('incoming', 'reply');

CREATE TABLE audio_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind audio_kind NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  format TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audio_assets_message_id ON audio_assets(message_id);

-- ============================================================================
-- Agent State (for burst detection & typing indicators)
-- ============================================================================

CREATE TABLE agent_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  waiting_until TIMESTAMPTZ,
  burst_count INTEGER NOT NULL DEFAULT 0,
  last_user_msg_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  is_recording BOOLEAN NOT NULL DEFAULT false,
  policy JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_state_conversation_unique UNIQUE (conversation_id)
);

CREATE INDEX idx_agent_state_conversation_id ON agent_state(conversation_id);
CREATE INDEX idx_agent_state_waiting_until ON agent_state(waiting_until);

-- ============================================================================
-- Configuration (per-org settings)
-- ============================================================================

CREATE TABLE config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  idle_window_ms INTEGER NOT NULL DEFAULT 2500,
  burst_extension_ms INTEGER NOT NULL DEFAULT 1200,
  max_idle_window_ms INTEGER NOT NULL DEFAULT 5000,
  emoji_aggressiveness DECIMAL(3,2) NOT NULL DEFAULT 0.30 CHECK (emoji_aggressiveness >= 0 AND emoji_aggressiveness <= 1),
  enable_tts BOOLEAN NOT NULL DEFAULT true,
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  agent_name TEXT NOT NULL DEFAULT 'Assistente',
  system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT config_org_unique UNIQUE (org_id)
);

CREATE INDEX idx_config_org_id ON config(org_id);

-- ============================================================================
-- Knowledge Base
-- ============================================================================

CREATE TABLE kb_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'document', 'url', 'text'
  url TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_sources_org_id ON kb_sources(org_id);

CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES kb_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_chunks_org_id ON kb_chunks(org_id);
CREATE INDEX idx_kb_chunks_source_id ON kb_chunks(source_id);

CREATE TABLE kb_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES kb_chunks(id) ON DELETE CASCADE,
  embedding vector(1536), -- OpenAI ada-002 dimensions
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_embeddings_org_id ON kb_embeddings(org_id);
CREATE INDEX idx_kb_embeddings_chunk_id ON kb_embeddings(chunk_id);

-- Vector similarity search index (ivfflat)
CREATE INDEX idx_kb_embeddings_vector ON kb_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- Message Embeddings (for conversation context)
-- ============================================================================

CREATE TABLE message_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_embeddings_message_id ON message_embeddings(message_id);
CREATE INDEX idx_message_embeddings_vector ON message_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- Agent Decisions (audit trail)
-- ============================================================================

CREATE TABLE agent_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  should_respond BOOLEAN NOT NULL,
  should_react BOOLEAN NOT NULL,
  emoji_reaction TEXT,
  response_type TEXT,
  response_tone TEXT,
  reasoning JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_decisions_message_id ON agent_decisions(message_id);
CREATE INDEX idx_agent_decisions_created_at ON agent_decisions(created_at DESC);

-- ============================================================================
-- Events/Logs
-- ============================================================================

CREATE TYPE event_level AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  level event_level NOT NULL DEFAULT 'info',
  message TEXT,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_org_id ON events(org_id);
CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_level ON events(level);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- ============================================================================
-- Rate Limits
-- ============================================================================

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rate_limits_unique UNIQUE (org_id, key, window_start)
);

CREATE INDEX idx_rate_limits_key ON rate_limits(key);
CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);

-- ============================================================================
-- Tasks (pgmq will be initialized separately)
-- ============================================================================

CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE task_kind AS ENUM (
  'process_message',
  'transcribe_audio',
  'generate_tts',
  'send_reply',
  'embed_message',
  'kb_ingest'
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind task_kind NOT NULL,
  payload JSONB NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  status task_status NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_org_id ON tasks(org_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_run_at ON tasks(run_at);
CREATE INDEX idx_tasks_kind ON tasks(kind);

-- ============================================================================
-- Updated At Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orgs_updated_at BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agent_state_updated_at BEFORE UPDATE ON agent_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER config_updated_at BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER kb_sources_updated_at BEFORE UPDATE ON kb_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rate_limits_updated_at BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security (RLS) - Enable on all tables
-- ============================================================================

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for worker)
-- Authenticated users see only their org's data

CREATE POLICY "Service role can access all orgs"
  ON orgs FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all customers"
  ON customers FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all conversations"
  ON conversations FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all messages"
  ON messages FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all audio_assets"
  ON audio_assets FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all agent_state"
  ON agent_state FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all config"
  ON config FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all kb_sources"
  ON kb_sources FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all kb_chunks"
  ON kb_chunks FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all kb_embeddings"
  ON kb_embeddings FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all message_embeddings"
  ON message_embeddings FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all agent_decisions"
  ON agent_decisions FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all events"
  ON events FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all rate_limits"
  ON rate_limits FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can access all tasks"
  ON tasks FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- Seed Data (Default org & config)
-- ============================================================================

-- Insert default organization
INSERT INTO orgs (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization');

-- Insert default config
INSERT INTO config (org_id, agent_name, system_prompt)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Assistente',
  'Você é um assistente virtual brasileiro inteligente e prestativo. Responda de forma natural, empática e profissional em português brasileiro.'
);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get or create customer by phone
CREATE OR REPLACE FUNCTION get_or_create_customer(
  p_org_id UUID,
  p_phone_e164 TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Try to find existing customer
  SELECT id INTO v_customer_id
  FROM customers
  WHERE org_id = p_org_id AND phone_e164 = p_phone_e164;

  -- If not found, create new customer
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (org_id, phone_e164, name, first_seen_at, last_seen_at)
    VALUES (p_org_id, p_phone_e164, p_name, NOW(), NOW())
    RETURNING id INTO v_customer_id;
  ELSE
    -- Update last_seen_at and name if provided
    UPDATE customers
    SET last_seen_at = NOW(),
        name = COALESCE(p_name, name)
    WHERE id = v_customer_id;
  END IF;

  RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vector similarity search for knowledge base
CREATE OR REPLACE FUNCTION search_knowledge_base(
  p_org_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    1 - (ke.embedding <=> p_query_embedding) AS similarity
  FROM kb_embeddings ke
  JOIN kb_chunks kc ON kc.id = ke.chunk_id
  WHERE ke.org_id = p_org_id
  ORDER BY ke.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Complete!
-- ============================================================================

COMMENT ON SCHEMA public IS 'Agencl AI Agent System - Initial Schema';
