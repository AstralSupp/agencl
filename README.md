# Agencl - AI-Powered WhatsApp Agent System

An intelligent, production-ready WhatsApp agent system built with TypeScript, Supabase, and Claude AI. Designed for customer service automation with natural, human-like interactions.

## 🚀 Features

- **Multi-Modal Communication**: Handles text and audio messages seamlessly
- **Smart Burst Detection**: Waits for customers to finish typing before responding
- **Natural Indicators**: Shows typing/recording indicators based on message length
- **Intelligent Reactions**: Smartly uses emoji reactions when appropriate
- **Human Handoff**: Smooth transitions to live agents when needed
- **Knowledge Base**: RAG-powered responses using pgvector
- **Multi-Tenant**: Supports multiple organizations
- **Audio Processing**: Portuguese speech-to-text (Whisper) and text-to-speech (ElevenLabs)
- **Production Ready**: Built for scale with proper error handling, retries, and logging

## 📦 Architecture

```
agencl/
├── packages/
│   ├── shared/          # Shared types, utilities, config
│   ├── db/              # Database schema and Drizzle ORM
│   └── worker/          # Message processing worker
├── supabase/            # Database migrations and Edge Functions
└── apps/                # Future: Admin & Agent dashboards
```

### Tech Stack

- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase) with pgvector
- **Message Queue**: Task table polling (simple, reliable)
- **AI**: Anthropic Claude for decision-making
- **STT**: OpenAI Whisper
- **TTS**: ElevenLabs (Portuguese)
- **WhatsApp**: Chatwoot integration
- **Deployment**: Coolify (Docker)

## 🛠️ Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL with pgvector extension
- Supabase account (or self-hosted)
- API keys for: Anthropic, OpenAI, ElevenLabs, Chatwoot

### Installation

1. **Clone the repository**

```bash
git clone <repo-url>
cd agencl
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Run database migrations**

```bash
# Using Supabase CLI
supabase db push

# Or using psql
psql $DATABASE_URL -f supabase/migrations/20250101000000_initial_schema.sql
```

5. **Start the worker**

```bash
pnpm worker
```

## 🔧 Configuration

### Environment Variables

See `.env.example` for all required variables.

Key configurations:

- `IDLE_WINDOW_MS`: Initial wait time for burst detection (default: 2500ms)
- `BURST_EXTENSION_MS`: Additional wait per message (default: 1200ms)
- `MAX_IDLE_WINDOW_MS`: Maximum wait time (default: 5000ms)
- `WORKER_CONCURRENCY`: Number of parallel tasks (default: 4)

### Organization Config

Each organization has a `config` record in the database:

```sql
-- Example: Update system prompt
UPDATE config
SET system_prompt = 'Your custom Portuguese prompt here...'
WHERE org_id = 'your-org-id';

-- Toggle kill switch (stops AI responses)
UPDATE config
SET kill_switch = true
WHERE org_id = 'your-org-id';
```

## 🏗️ How It Works

### Message Flow

1. **Webhook receives message** → Stores in DB → Creates task
2. **Worker polls tasks** → Picks up pending tasks
3. **Burst detection** → Waits if user is still typing
4. **Audio transcription** (if needed) → Whisper API
5. **Load context** → Conversation history + knowledge base
6. **Claude decision** → Should respond? React? Handoff?
7. **Generate response** → Text or audio (ElevenLabs)
8. **Send via Chatwoot** → Show typing indicator first
9. **Store in DB** → Save message and decision audit trail

### Burst Detection Logic

```typescript
// Dynamic idle window calculation
const baseWindow = 2500ms
const extension = 1200ms per message
const maxWindow = 5000ms

idleWindow = min(baseWindow + (burstCount * extension), maxWindow)

// Wait if:
// - Message looks incomplete (no punctuation, short)
// - Within idle window since last message
```

### Human Handoff Triggers

- Customer explicitly asks ("falar com humano")
- AI confidence is low
- Complex question requiring escalation
- Customer frustration detected

## 🚢 Deployment (Coolify)

### Build Docker Image

```dockerfile
# See Dockerfile in project root
docker build -t agencl-worker .
docker run --env-file .env agencl-worker
```

### Deploy to Coolify

1. Create new **Application** in Coolify
2. Connect your Git repository
3. Select branch
4. Set build pack to **Dockerfile**
5. Add environment variables
6. Deploy!

Coolify will:
- Auto-build on push
- Manage SSL certificates
- Provide logs and monitoring
- Handle restarts

### Self-Hosted Stack

For complete self-hosting:

1. **Supabase** (PostgreSQL + pgvector)
2. **Worker** (this app)
3. **Chatwoot** (optional, can use WhatsApp Business API directly)

All can run on the same VPS with Docker Compose.

## 📊 Monitoring

### Logs

Structured JSON logs with:

```json
{
  "level": "info",
  "namespace": "message-processor",
  "message": "Processing message",
  "conversationId": "uuid",
  "duration": 1234,
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### Database Tables

- `events`: All system events
- `agent_decisions`: AI decision audit trail
- `tasks`: Task queue status

### Metrics to Track

- Messages processed per minute
- Average processing time
- Handoff rate
- Response accuracy
- Audio transcription errors

## 🧪 Development

### Run in dev mode

```bash
# Start worker with hot-reload
pnpm worker

# Type checking
pnpm type-check

# Run tests (when added)
pnpm test
```

### Project Structure

```
packages/worker/src/
├── services/
│   ├── claude.ts         # Claude AI client
│   ├── whisper.ts        # Speech-to-text
│   ├── elevenlabs.ts     # Text-to-speech
│   └── chatwoot.ts       # Chatwoot API client
├── processor/
│   └── message-processor.ts  # Main processing logic
└── index.ts              # Worker entry point
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📝 License

MIT

## 🙋 Support

For questions or issues, please open a GitHub issue.

---

**Built with ❤️ for Brazilian businesses**
