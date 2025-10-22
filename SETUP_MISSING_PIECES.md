# Complete Setup Guide - Missing Pieces

This guide covers all the **additional setup steps** not fully detailed in the README or DEPLOYMENT docs.

---

## 🔐 1. WhatsApp Business API Setup

### Getting WhatsApp Credentials

The WhatsApp Business API requires setup through **Meta (Facebook)**:

#### **Option A: Through Chatwoot (Easier)**

1. **In Chatwoot Dashboard:**
   - Go to **Settings** → **Inboxes** → **Add Inbox**
   - Select **WhatsApp**
   - Choose **WhatsApp Cloud** (Meta's official API)

2. **Click "Connect with Facebook"**
   - This opens Meta's embedded signup flow
   - Login with your Facebook account
   - Select your Business Portfolio
   - Choose or create a WhatsApp Business Account

3. **Chatwoot will automatically configure:**
   - Webhook URL (points to Chatwoot)
   - Verify token
   - Access token

4. **Get credentials from Chatwoot:**
   ```
   Settings → Inboxes → Your WhatsApp Inbox → Configuration
   ```

   You'll see:
   - **Phone Number ID**: Copy this
   - **Business Account ID**: Note this down
   - **Inbox ID**: In the URL bar (`.../inboxes/{INBOX_ID}`)

5. **Get access token from Meta:**
   - Go to [Meta Business Suite](https://business.facebook.com/)
   - Select your app → **WhatsApp** → **API Setup**
   - Copy **Temporary Access Token** (expires in 24h)
   - For permanent token, create a **System User** (see below)

#### **Option B: Direct Meta Setup (Advanced)**

1. **Create Meta App:**
   - Go to [Meta Developers](https://developers.facebook.com/)
   - Create new app → **Business** type
   - Add **WhatsApp** product

2. **Configure WhatsApp:**
   - Go to **WhatsApp** → **API Setup**
   - Note the **Phone Number ID**
   - Generate **Access Token**

3. **Set up Webhook:**
   ```
   Webhook URL: https://your-project.supabase.co/functions/v1/chatwoot-webhook
   Verify Token: any-random-string-you-choose
   ```

4. **Subscribe to webhook fields:**
   - ✅ messages
   - ✅ message_status (optional)

5. **Environment variables:**
   ```bash
   WHATSAPP_PHONE_NUMBER_ID=123456789012345
   WHATSAPP_ACCESS_TOKEN=EAAxxxxxx...  # From Meta
   WHATSAPP_VERIFY_TOKEN=your-random-verify-token
   ```

### Getting a Permanent WhatsApp Access Token

Meta's temporary tokens expire in 24 hours. For production:

1. **Create System User:**
   - Go to [Meta Business Suite](https://business.facebook.com/)
   - **Settings** → **Users** → **System Users**
   - Click **Add** → Name it "WhatsApp Agent"
   - Role: **Admin**

2. **Generate Token:**
   - Click on the system user
   - **Add Assets** → Select your WhatsApp app
   - **Generate New Token**
   - Permissions needed:
     - ✅ `whatsapp_business_messaging`
     - ✅ `whatsapp_business_management`
   - **Token never expires** (check this option!)
   - Copy and save securely

3. **Update environment:**
   ```bash
   WHATSAPP_ACCESS_TOKEN=your-permanent-token-here
   ```

---

## 🎙️ 2. ElevenLabs Voice Selection

### Finding the Right Brazilian Portuguese Voice

1. **Go to ElevenLabs Voice Library:**
   ```
   https://elevenlabs.io/voice-library
   ```

2. **Filter:**
   - Language: **Portuguese**
   - Country: **Brazil** (pt-BR)
   - Gender: (your preference)

3. **Recommended voices for customer service:**
   - **Joana** - Warm, friendly female
   - **Ricardo** - Professional male
   - **Camila** - Young, energetic female
   - **Lucas** - Casual, approachable male

4. **Get Voice ID:**
   - Click on voice → **Use Voice**
   - Copy the **Voice ID** (looks like: `21m00Tcm4TlvDq8ikWAM`)

5. **Test the voice:**
   ```bash
   curl -X POST https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID} \
     -H "xi-api-key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"text": "Olá! Como posso ajudar você hoje?"}' \
     --output test.mp3
   ```

6. **Update environment:**
   ```bash
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
   ```

### ElevenLabs Free Tier Limits

- **10,000 characters/month** free
- **~70 messages** of 150 characters each
- Upgrade to **Creator** ($22/mo) for 100k characters

---

## 🔒 3. Supabase Security Setup

### Generate Secure JWT Secrets

If self-hosting Supabase, you need JWT secrets:

```bash
# Generate JWT secret (random 32-char string)
openssl rand -base64 32

# Example output:
# Kl8x9mP2vN4qW6rT7yU8zA1bC3dE5fG9
```

**Add to Supabase env:**
```bash
JWT_SECRET=Kl8x9mP2vN4qW6rT7yU8zA1bC3dE5fG9
```

### Generate Supabase Service Role Key

If using Supabase cloud:
1. Go to **Project Settings** → **API**
2. Copy **service_role** key (secret!)

If self-hosting:
1. The JWT secret is used to generate service keys
2. Use Supabase's internal key generation
3. Or use the provided keys from Supabase Docker setup

**Environment variables needed:**
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Public, safe to expose
SUPABASE_SERVICE_KEY=eyJhbGc...  # Secret! Never expose to client
```

---

## 📦 4. Audio File Storage Setup

Currently the code has a **TODO** for audio storage. You need to set this up:

### **Option A: Supabase Storage (Recommended)**

1. **Create storage bucket in Supabase:**

```sql
-- In Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-messages', 'audio-messages', true);

-- Set up RLS policy
CREATE POLICY "Public audio access"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-messages');

CREATE POLICY "Authenticated can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio-messages'
  AND auth.role() = 'service_role'
);
```

2. **Update worker code** (packages/worker/src/processor/message-processor.ts):

```typescript
// Replace the TODO section around line 180

// Generate audio if needed
if (isAudio) {
  logger.info('Generating audio response');
  const audioFileName = `${Date.now()}-${conversation.id}.mp3`;
  const audioPath = `/tmp/${audioFileName}`;

  await this.config.elevenlabs.generateAudio(content, audioPath);

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('audio-messages')
    .upload(audioFileName, await fs.readFile(audioPath), {
      contentType: 'audio/mpeg',
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('audio-messages')
    .getPublicUrl(audioFileName);

  const audioUrl = urlData.publicUrl;

  // Send audio message
  await this.config.chatwoot.sendAudioMessage({
    conversationId,
    audioUrl,
    content,
  });

  // Clean up temp file
  await fs.unlink(audioPath);
}
```

3. **Add dependencies:**

```bash
cd packages/worker
pnpm add @supabase/supabase-js
```

4. **Environment variable:**

```bash
# Already have SUPABASE_URL and SUPABASE_SERVICE_KEY
# No additional vars needed
```

### **Option B: External Storage (S3, CloudFlare R2)**

If you prefer external storage:

```bash
# Additional environment variables needed:
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_ENDPOINT=https://s3.amazonaws.com  # Or CloudFlare R2 endpoint
```

---

## 🌐 5. Webhook URL Configuration

### Getting the Correct Webhook URLs

After deploying the Edge Function:

```bash
# Deploy Edge Function
supabase functions deploy chatwoot-webhook

# Get the URL (output from deploy command):
# https://xxxxx.supabase.co/functions/v1/chatwoot-webhook
```

### Configure Chatwoot Webhook

1. **In Chatwoot:**
   - Settings → Integrations → Webhooks
   - Click **Configure**

2. **Add webhook:**
   ```
   URL: https://YOUR-PROJECT.supabase.co/functions/v1/chatwoot-webhook

   Subscribe to events:
   ✅ message_created
   ✅ conversation_status_changed (optional)
   ```

3. **Test webhook:**
   ```bash
   # Send test payload
   curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/chatwoot-webhook \
     -H "Content-Type: application/json" \
     -d '{
       "event": "message_created",
       "message_type": "incoming",
       "content": "Test message",
       "sender": {
         "phone_number": "+5511999999999"
       },
       "conversation": {
         "id": 1
       }
     }'
   ```

---

## 🐳 6. Coolify-Specific Configuration

### Internal Service Communication

When running multiple services in Coolify on the same VPS:

1. **Supabase PostgreSQL internal URL:**
   ```bash
   # If Supabase is in Coolify, use internal Docker network
   DATABASE_URL=postgresql://postgres:password@supabase-postgres:5432/postgres

   # Replace 'supabase-postgres' with actual container name
   # Find it in Coolify: Services → Supabase → Postgres → Container Name
   ```

2. **Worker cannot connect to database:**
   - Check if both services are in same Docker network
   - In Coolify: Both apps should be in same "project" or "network"
   - Or use external URL: `DATABASE_URL=postgresql://...supabase.co...`

### Health Checks in Coolify

Add health check endpoint to worker:

```typescript
// packages/worker/src/index.ts
// Add before starting worker

import http from 'http';

// Simple health check server
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(8000, () => {
  logger.info('Health check server running on port 8000');
});
```

**Update Dockerfile:**
```dockerfile
# Add EXPOSE
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

**In Coolify:**
- Health Check Path: `/health`
- Port: `8000`

---

## 🧪 7. First-Time Initialization

After deploying everything, run this checklist:

### **Step 1: Verify Database**

```sql
-- Connect to your database
psql $DATABASE_URL

-- Check tables exist
\dt

-- Verify default org exists
SELECT * FROM orgs;

-- Verify default config exists
SELECT * FROM config;

-- If missing, insert manually:
INSERT INTO orgs (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

INSERT INTO config (org_id, agent_name, system_prompt)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Assistente',
  'Você é um assistente virtual brasileiro inteligente e prestativo.'
)
ON CONFLICT (org_id) DO NOTHING;
```

### **Step 2: Test Edge Function**

```bash
# Test the webhook endpoint
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/chatwoot-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "message_type": "incoming",
    "content": "Olá, preciso de ajuda",
    "sender": {
      "id": 1,
      "name": "Test User",
      "phone_number": "+5511999999999"
    },
    "conversation": {
      "id": 1
    }
  }'

# Should return:
# {"status":"success","conversation_id":"uuid","message_id":"uuid"}
```

### **Step 3: Verify Task Creation**

```sql
-- Check if task was created
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1;

-- Check if customer was created
SELECT * FROM customers ORDER BY created_at DESC LIMIT 1;

-- Check if conversation was created
SELECT * FROM conversations ORDER BY created_at DESC LIMIT 1;

-- Check if message was created
SELECT * FROM messages ORDER BY created_at DESC LIMIT 1;
```

### **Step 4: Test Worker Processing**

Check worker logs in Coolify:

```json
// Should see:
{"level":"info","namespace":"worker","message":"Worker started - polling for tasks"}
{"level":"info","namespace":"worker","message":"Found 1 pending tasks"}
{"level":"info","namespace":"message-processor","message":"Processing message"}
{"level":"info","namespace":"claude-service","message":"Claude decision made"}
```

### **Step 5: Send Real WhatsApp Message**

1. Send a message to your WhatsApp number
2. Check Chatwoot inbox
3. Check Coolify worker logs
4. Verify bot responds

---

## 🔑 8. Complete Environment Variables Checklist

Here's the **complete list** with where to get each value:

```bash
# ============================================================================
# NODE
# ============================================================================
NODE_ENV=production

# ============================================================================
# DATABASE (Supabase)
# ============================================================================
# If self-hosted Supabase in Coolify:
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@supabase-postgres:5432/postgres

# If using Supabase Cloud:
DATABASE_URL=postgresql://postgres.xxxxx.supabase.co:5432/postgres?password=YOUR_PASSWORD

# Supabase Dashboard → Project Settings → API:
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...  # KEEP SECRET!

# ============================================================================
# CHATWOOT
# ============================================================================
# If using Chatwoot Cloud:
CHATWOOT_URL=https://app.chatwoot.com

# If self-hosted:
CHATWOOT_URL=https://your-chatwoot-domain.com

# Chatwoot → Settings → Integrations → Access Tokens → Create new:
CHATWOOT_API_KEY=your-api-key-here

# Chatwoot → Settings → Account Settings → (see account ID in URL):
CHATWOOT_ACCOUNT_ID=1

# Chatwoot → Settings → Inboxes → Your WhatsApp Inbox → (see ID in URL):
CHATWOOT_INBOX_ID=1

# ============================================================================
# WHATSAPP BUSINESS API
# ============================================================================
WHATSAPP_API_URL=https://graph.facebook.com/v21.0

# Meta Business Suite → WhatsApp → API Setup → Phone Number ID:
WHATSAPP_PHONE_NUMBER_ID=123456789012345

# Meta → System Users → Generate Token (permanent):
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxx

# Choose any random string (used for webhook verification):
WHATSAPP_VERIFY_TOKEN=my-secure-verify-token-123

# ============================================================================
# AI SERVICES
# ============================================================================
# Anthropic Console → API Keys:
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# OpenAI Platform → API Keys:
OPENAI_API_KEY=sk-xxxxx

# ElevenLabs → Profile → API Key:
ELEVENLABS_API_KEY=xxxxx

# ElevenLabs → Voice Library → Select voice → Copy Voice ID:
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# ============================================================================
# AGENT CONFIGURATION
# ============================================================================
AGENT_NAME=Assistente
IDLE_WINDOW_MS=2500
BURST_EXTENSION_MS=1200
MAX_IDLE_WINDOW_MS=5000
DEFAULT_LOCALE=pt-BR
DEFAULT_TIMEZONE=America/Sao_Paulo

# ============================================================================
# WORKER
# ============================================================================
WORKER_CONCURRENCY=4
WORKER_POLL_INTERVAL_MS=1000
```

---

## ⚠️ 9. Common Issues & Solutions

### Issue: "Cannot connect to database"

**Solution:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# If fails, check:
# 1. DATABASE_URL format is correct
# 2. Supabase/Postgres is running
# 3. Firewall allows connection
# 4. In Coolify, both services are in same network
```

### Issue: "Webhook not receiving messages"

**Solution:**
```bash
# 1. Test Edge Function directly
curl https://YOUR-PROJECT.supabase.co/functions/v1/chatwoot-webhook

# 2. Check Chatwoot webhook logs
Chatwoot → Settings → Integrations → Webhooks → View Logs

# 3. Verify webhook URL is correct
# 4. Check Supabase Edge Function logs
supabase functions logs chatwoot-webhook
```

### Issue: "Worker not processing tasks"

**Solution:**
```sql
-- Check for pending tasks
SELECT * FROM tasks WHERE status = 'pending';

-- Check for failed tasks
SELECT * FROM tasks WHERE status = 'failed' ORDER BY created_at DESC;

-- Manually retry a task
UPDATE tasks SET status = 'pending', attempts = 0, run_at = NOW()
WHERE id = 'task-uuid-here';

-- Check worker logs in Coolify
```

### Issue: "Audio generation fails"

**Solution:**
```bash
# 1. Verify ElevenLabs API key
curl https://api.elevenlabs.io/v1/user \
  -H "xi-api-key: YOUR_KEY"

# 2. Check voice ID exists
curl https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: YOUR_KEY"

# 3. Ensure storage is set up (see section 4)

# 4. Check worker has ffmpeg
docker exec -it worker-container-id which ffmpeg
```

---

## ✅ Final Checklist

Before going live:

- [ ] WhatsApp permanent access token generated
- [ ] Brazilian Portuguese voice selected in ElevenLabs
- [ ] Supabase storage bucket created for audio
- [ ] Database migration run successfully
- [ ] Default org and config exist in database
- [ ] Edge Function deployed and accessible
- [ ] Chatwoot webhook configured and tested
- [ ] Worker deployed and running in Coolify
- [ ] Health check endpoint working
- [ ] Test message sent and bot responded
- [ ] All environment variables set
- [ ] Logs showing no errors
- [ ] Audio upload/download working
- [ ] Human handoff tested
- [ ] Kill switch tested

---

**You're now ready for production! 🎉**

If you encounter any issues not covered here, check the logs first:
- Coolify → Worker → Logs
- Supabase → Edge Functions → Logs
- Chatwoot → Integrations → Webhook Logs
