# Deployment Guide - Coolify VPS

Complete guide to deploy the Agencl AI agent system on Coolify with self-hosted Supabase.

## 🎯 Deployment Overview

We'll deploy three main components:

1. **Supabase** (PostgreSQL + pgvector + Edge Functions)
2. **Worker** (Message processing service)
3. **Chatwoot** (Optional - or use hosted version)

All running on a single Coolify VPS.

---

## 📋 Prerequisites

### VPS Requirements

- **CPU**: 2+ vCPUs
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 20GB+ SSD
- **OS**: Ubuntu 22.04 LTS
- **Coolify**: Installed and running

### External Services

You'll need API keys for:

- ✅ **Anthropic** (Claude) - [Get key](https://console.anthropic.com/)
- ✅ **OpenAI** (Whisper) - [Get key](https://platform.openai.com/)
- ✅ **ElevenLabs** (TTS) - [Get key](https://elevenlabs.io/)
- ✅ **Chatwoot** - Self-hosted or cloud
- ✅ **WhatsApp Business API** - Through Chatwoot or Meta

---

## 🚀 Step 1: Deploy Supabase (Self-Hosted)

### Option A: Using Coolify's Supabase Template

1. Go to Coolify Dashboard
2. Click **New Resource** → **Service**
3. Search for "Supabase"
4. Click **Deploy**
5. Configure:
   - **Domain**: `supabase.yourdomain.com`
   - **PostgreSQL Password**: Strong password
   - **JWT Secret**: Random string (generate one)
   - **Service Role Key**: Random string
   - **Anon Key**: Random string

6. Wait for deployment (~5 mins)
7. Access Supabase Studio at `https://supabase.yourdomain.com`

### Option B: Manual Docker Compose

If Coolify doesn't have Supabase template:

```yaml
# supabase-docker-compose.yml
version: '3.8'

services:
  postgres:
    image: supabase/postgres:15.1.0.117
    environment:
      POSTGRES_PASSWORD: your-super-secret-password
      POSTGRES_DB: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  studio:
    image: supabase/studio:latest
    environment:
      SUPABASE_URL: http://kong:8000
      STUDIO_PG_META_URL: http://meta:8080
      SUPABASE_ANON_KEY: your-anon-key
      SUPABASE_SERVICE_KEY: your-service-key
    ports:
      - "3000:3000"

  kong:
    image: kong:2.8.1
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /var/lib/kong/kong.yml
    volumes:
      - ./kong.yml:/var/lib/kong/kong.yml
    ports:
      - "8000:8000"

  meta:
    image: supabase/postgres-meta:latest
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: postgres
      PG_META_DB_PASSWORD: your-super-secret-password

volumes:
  postgres_data:
```

Deploy in Coolify:
1. **New Resource** → **Docker Compose**
2. Paste the compose file
3. Deploy

---

## 🗄️ Step 2: Set Up Database

### Run Migrations

```bash
# Connect to your Supabase PostgreSQL
psql "postgresql://postgres:password@your-supabase-url:5432/postgres"

# Or using Supabase CLI
supabase db push
```

Apply the migration:

```bash
psql $DATABASE_URL -f supabase/migrations/20250101000000_initial_schema.sql
```

### Verify Setup

```sql
-- Check tables were created
\dt

-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check default org exists
SELECT * FROM orgs;
SELECT * FROM config;
```

---

## 🤖 Step 3: Deploy Worker

### In Coolify Dashboard

1. **New Resource** → **Application**

2. **Source**: Connect your Git repository
   - Repository: `https://github.com/yourusername/agencl`
   - Branch: `main`

3. **Build Configuration**:
   - Build Pack: **Dockerfile**
   - Dockerfile Path: `./Dockerfile`
   - Port: `8000` (not used, but required)

4. **Environment Variables**:

```bash
# Node
NODE_ENV=production

# Database (Supabase)
DATABASE_URL=postgresql://postgres:password@supabase-postgres:5432/postgres
SUPABASE_URL=https://your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Chatwoot
CHATWOOT_URL=https://app.chatwoot.com
CHATWOOT_API_KEY=your-chatwoot-api-key
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_INBOX_ID=1

# WhatsApp Business API
WHATSAPP_API_URL=https://graph.facebook.com/v21.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_ACCESS_TOKEN=your-token
WHATSAPP_VERIFY_TOKEN=random-verify-token

# AI Services
ANTHROPIC_API_KEY=sk-ant-your-key
OPENAI_API_KEY=sk-your-key
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=your-brazilian-voice-id

# Agent Config
AGENT_NAME=Assistente
IDLE_WINDOW_MS=2500
BURST_EXTENSION_MS=1200
MAX_IDLE_WINDOW_MS=5000
DEFAULT_LOCALE=pt-BR
DEFAULT_TIMEZONE=America/Sao_Paulo

# Worker
WORKER_CONCURRENCY=4
WORKER_POLL_INTERVAL_MS=1000
```

5. **Deploy**

Coolify will:
- Clone your repo
- Build Docker image
- Run the worker
- Auto-restart on failure

---

## 🔗 Step 4: Deploy Edge Function (Webhook)

### Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy Edge Function
cd supabase/functions
supabase functions deploy chatwoot-webhook

# Get the function URL
# https://your-project-ref.supabase.co/functions/v1/chatwoot-webhook
```

### Set Environment Variables for Edge Function

In Supabase Dashboard → **Edge Functions** → **Settings**:

```
SUPABASE_URL=your-url
SUPABASE_SERVICE_KEY=your-service-key
```

---

## 📲 Step 5: Configure Chatwoot Webhook

1. Go to Chatwoot → **Settings** → **Integrations** → **Webhooks**

2. Click **Add Webhook**

3. Configure:
   - **Webhook URL**: `https://your-project.supabase.co/functions/v1/chatwoot-webhook`
   - **Subscribe to**:
     - ✅ `message_created`
   - **Save**

4. Test by sending a WhatsApp message

---

## 🎨 Step 6: Configure AI Settings

### Update System Prompt

```sql
UPDATE config
SET system_prompt = '
Você é um assistente virtual brasileiro inteligente que trabalha para [SUA EMPRESA].

[Adicione instruções específicas aqui sobre:
- Produtos/serviços que você oferece
- Tom de voz (formal/casual)
- Regras de negócio
- Quando escalar para humano]

Responda sempre em português brasileiro de forma natural e prestativa.
'
WHERE org_id = '00000000-0000-0000-0000-000000000001';
```

### Adjust Burst Detection

```sql
-- Make bot respond faster (less waiting)
UPDATE config
SET
  idle_window_ms = 2000,
  burst_extension_ms = 1000,
  max_idle_window_ms = 4000
WHERE org_id = '00000000-0000-0000-0000-000000000001';

-- Make bot wait longer (more patience)
UPDATE config
SET
  idle_window_ms = 3000,
  burst_extension_ms = 1500,
  max_idle_window_ms = 6000
WHERE org_id = '00000000-0000-0000-0000-000000000001';
```

### Select ElevenLabs Voice

1. Go to [ElevenLabs Voice Library](https://elevenlabs.io/voice-library)
2. Filter: **Language → Portuguese (Brazil)**
3. Listen to samples
4. Copy the Voice ID
5. Update env var: `ELEVENLABS_VOICE_ID=voice-id-here`
6. Restart worker in Coolify

---

## ✅ Step 7: Test the System

### Send Test Message

1. Send a WhatsApp message to your Chatwoot number
2. Check logs in Coolify worker
3. Verify:
   - Message appears in Chatwoot
   - Database has new records (customer, conversation, message)
   - Task was created and processed
   - Bot replied

### Check Logs

**Coolify Dashboard** → Your worker app → **Logs**

Look for:

```json
{"level":"info","namespace":"message-processor","message":"Processing message",...}
{"level":"info","namespace":"claude-service","message":"Claude decision made",...}
{"level":"info","namespace":"message-processor","message":"Message processed successfully",...}
```

### Debug Common Issues

**Bot not responding?**

```sql
-- Check kill switch
SELECT kill_switch FROM config WHERE org_id = '00000000-0000-0000-0000-000000000001';

-- Check tasks
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10;

-- Check for errors
SELECT * FROM events WHERE level = 'error' ORDER BY created_at DESC LIMIT 10;
```

**Worker not processing tasks?**

- Check Coolify logs
- Verify DATABASE_URL is correct
- Ensure all API keys are valid
- Check worker is running (`ps aux | grep node`)

---

## 📊 Monitoring

### Database Queries

```sql
-- Total messages processed today
SELECT COUNT(*)
FROM messages
WHERE created_at::date = CURRENT_DATE;

-- Conversations by status
SELECT status, COUNT(*)
FROM conversations
GROUP BY status;

-- Failed tasks
SELECT *
FROM tasks
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Average processing time
SELECT
  AVG(processing_time_ms) as avg_ms,
  MAX(processing_time_ms) as max_ms
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Set Up Alerts

In Coolify, configure health checks:

- **Health Check Path**: `/` (add a health endpoint to worker if needed)
- **Restart Policy**: `unless-stopped`

---

## 🔒 Security Checklist

- ✅ Use strong PostgreSQL password
- ✅ Enable RLS policies (already done in migration)
- ✅ Use HTTPS for all endpoints
- ✅ Rotate API keys regularly
- ✅ Don't expose Supabase service key to client
- ✅ Set up firewall rules (only allow Coolify, Chatwoot IPs)
- ✅ Enable 2FA on all admin accounts
- ✅ Regular database backups

---

## 🔄 Updates & Maintenance

### Deploy New Version

1. Push code to Git
2. Coolify auto-deploys (if enabled)
3. Or manually: **Coolify** → Your app → **Redeploy**

### Database Migrations

```bash
# Create new migration
psql $DATABASE_URL -f supabase/migrations/new-migration.sql

# Or use Supabase CLI
supabase db diff -f new-migration
supabase db push
```

### Backup Database

```bash
# Manual backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup-20250101.sql
```

### Scale Worker

In Coolify, you can't directly scale horizontally, but you can:

1. **Increase concurrency**: Set `WORKER_CONCURRENCY=8`
2. **Deploy multiple workers**: Create duplicate apps pointing to same DB
3. **Upgrade VPS**: More RAM = more concurrent tasks

---

## 💰 Cost Estimation

### VPS (Coolify)

- **Hetzner CPX21**: €5.83/mo (2 vCPU, 4GB RAM)
- **DigitalOcean Basic**: $24/mo (2 vCPU, 4GB RAM)
- **Vultr High Frequency**: $18/mo (2 vCPU, 4GB RAM)

### AI APIs (per 1000 customers/mo)

- **Anthropic Claude**: ~$30-50
- **OpenAI Whisper**: ~$10-20
- **ElevenLabs**: $22-44 (Creator tier)

**Total**: ~$80-140/month for moderate usage

---

## 🆘 Troubleshooting

### Worker won't start

```bash
# Check logs
docker logs worker-container-id

# Common issues:
# - Missing env vars → Check .env
# - Can't connect to DB → Check DATABASE_URL
# - Build failed → Check Dockerfile
```

### Messages not processing

```sql
-- Check pending tasks
SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at DESC;

-- Check failed tasks with errors
SELECT id, kind, error, attempts
FROM tasks
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- Manually retry a task
UPDATE tasks
SET status = 'pending', run_at = NOW(), attempts = 0
WHERE id = 'task-uuid-here';
```

### Audio not working

- Verify ElevenLabs API key
- Check voice ID is valid
- Ensure ffmpeg is installed in Docker image (it is)
- Check file storage/upload setup

---

## 📚 Next Steps

1. ✅ Deploy and test basic flow
2. ✅ Add company-specific knowledge base
3. ✅ Fine-tune prompts and burst detection
4. ✅ Set up monitoring and alerts
5. ✅ Build admin dashboard (Next.js)
6. ✅ Build agent platform (Astral)
7. ✅ Add analytics and reporting

---

**Deployment complete! 🎉**

Your AI agent is now running on Coolify and ready to handle WhatsApp conversations.

For questions, check the main README or open an issue.
