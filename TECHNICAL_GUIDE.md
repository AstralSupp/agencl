# WhatsApp AI Agent - Complete Technical Guide

## Project Overview

Building an intelligent WhatsApp AI agent for Brazilian market using:
- **Chatwoot** for WhatsApp message management
- **Supabase** for database and backend
- **Claude (Anthropic)** for AI decision-making
- **OpenAI Whisper** for speech-to-text
- **ElevenLabs** for text-to-speech (Portuguese)
- **FastAPI + Celery + Redis** for async processing
- **Coolify** for VPS deployment

---

## 1. CHATWOOT INTEGRATION

### 1.1 Webhook Events

Chatwoot sends webhooks for these key events:
- `message_created` - When a customer sends a message
- `conversation_created` - New conversation started
- `conversation_updated` - Conversation details changed
- `conversation_status_changed` - Status changed (open/resolved/pending)

### 1.2 Message Created Webhook Payload

```json
{
  "event": "message_created",
  "id": 12345,
  "content": "Text message content",
  "message_type": "incoming",
  "content_type": "text",  // or "audio", "image", etc.
  "created_at": "2025-10-22T10:30:00Z",
  "private": false,
  "source_id": "whatsapp_message_id",
  "content_attributes": {
    "audio_url": "https://...",  // if audio message
    "duration": 5  // audio duration in seconds
  },
  "sender": {
    "id": 123,
    "name": "Customer Name",
    "phone_number": "+5511999999999",
    "identifier": "whatsapp:+5511999999999"
  },
  "conversation": {
    "id": 456,
    "inbox_id": 789,
    "status": "open",
    "contact_last_seen_at": "2025-10-22T10:29:55Z"
  },
  "account": {
    "id": 1,
    "name": "Your Company"
  },
  "inbox": {
    "id": 789,
    "name": "WhatsApp Business"
  }
}
```

### 1.3 Sending Messages via Chatwoot API

**Endpoint:** `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`

**Headers:**
```
Content-Type: application/json
api_access_token: YOUR_CHATWOOT_TOKEN
```

**Text Message Body:**
```json
{
  "content": "Your response message",
  "message_type": "outgoing",
  "private": false
}
```

**Audio Message Body:**
```json
{
  "content": "Audio transcription for reference",
  "message_type": "outgoing",
  "private": false,
  "attachments": [
    {
      "url": "https://your-audio-file.mp3"
    }
  ]
}
```

### 1.4 Typing Indicator

**Endpoint:** `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/toggle_typing_status`

**Body:**
```json
{
  "typing_status": "on"  // or "off"
}
```

**Important Notes:**
- Typing indicator lasts up to 25 seconds
- Must be turned off manually or it expires
- Requires personal access token (not agent bot token)

### 1.5 WhatsApp-Specific Features

#### Recording Indicator
WhatsApp Cloud API supports typing indicators. For audio responses, show "recording" status using the same typing indicator API.

#### Emoji Reactions
Send emoji reactions to messages using Chatwoot's message API with appropriate parameters.

---

## 2. PYTHON TECH STACK

### 2.1 Core Dependencies

```txt
# Web Framework
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.0
pydantic-settings==2.5.0

# Async Task Queue
celery==5.5.1
redis==5.2.0
flower==2.0.1  # Celery monitoring

# Database
supabase==2.9.0
asyncpg==0.30.0

# AI Services
anthropic==0.39.0
openai==1.54.0
elevenlabs==1.10.0

# HTTP Client
httpx==0.27.2  # async HTTP for Chatwoot API

# Audio Processing
pydub==0.25.1
ffmpeg-python==0.2.0

# Utilities
python-multipart==0.0.12
python-dotenv==1.0.1
```

### 2.2 Project Structure

```
agencl/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entry point
│   ├── config.py                  # Settings & env vars
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── webhooks/
│   │   │   ├── __init__.py
│   │   │   └── chatwoot.py       # Webhook endpoints
│   │   └── health.py              # Health check endpoint
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── chatwoot.py           # Chatwoot API client
│   │   ├── claude.py             # Claude AI service
│   │   ├── whisper.py            # OpenAI Whisper STT
│   │   ├── elevenlabs.py         # ElevenLabs TTS
│   │   ├── supabase.py           # Database operations
│   │   └── message_processor.py  # Core message processing
│   │
│   ├── tasks/
│   │   ├── __init__.py
│   │   ├── celery_app.py         # Celery configuration
│   │   └── message_tasks.py      # Async task definitions
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── message.py            # Pydantic models
│   │   ├── conversation.py
│   │   └── agent_decision.py
│   │
│   ├── prompts/
│   │   ├── __init__.py
│   │   ├── system_prompt.py      # Claude system prompts
│   │   └── decision_prompt.py    # Decision-making prompts
│   │
│   └── utils/
│       ├── __init__.py
│       ├── debouncer.py          # Message batching logic
│       ├── typing_calculator.py  # Timing calculations
│       └── audio_handler.py      # Audio processing utils
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env.example
├── .dockerignore
├── .gitignore
└── README.md
```

---

## 3. DATABASE SCHEMA (SUPABASE)

### 3.1 Tables

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255),
    chatwoot_contact_id BIGINT,
    language VARCHAR(10) DEFAULT 'pt-BR',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    chatwoot_conversation_id BIGINT UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    context_summary TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    chatwoot_message_id BIGINT,
    direction VARCHAR(10) NOT NULL, -- 'incoming' or 'outgoing'
    content_type VARCHAR(20) NOT NULL, -- 'text', 'audio', 'image'
    content_text TEXT,
    audio_url TEXT,
    audio_duration INTEGER, -- seconds
    transcription TEXT, -- for audio messages
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent decisions table (for tracking AI behavior)
CREATE TABLE agent_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    should_respond BOOLEAN NOT NULL,
    should_react BOOLEAN NOT NULL,
    emoji_reaction VARCHAR(10),
    response_type VARCHAR(20), -- 'text', 'audio', 'both', 'none'
    response_tone VARCHAR(50),
    reasoning JSONB, -- Claude's thinking process
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message batches table (track when customer is typing)
CREATE TABLE message_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_ids UUID[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed'
    first_message_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_message_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_conversations_chatwoot_id ON conversations(chatwoot_conversation_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_message_batches_status ON message_batches(status);
CREATE INDEX idx_message_batches_conversation_id ON message_batches(conversation_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. AI SERVICES INTEGRATION

### 4.1 Anthropic Claude

**Model:** `claude-sonnet-4-5-20241022` (latest, best for conversation)

**Python SDK Setup:**
```python
from anthropic import AsyncAnthropic

client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

# Conversation with history
messages = [
    {"role": "user", "content": "Previous message"},
    {"role": "assistant", "content": "Previous response"},
    {"role": "user", "content": "Current message"}
]

response = await client.messages.create(
    model="claude-sonnet-4-5-20241022",
    max_tokens=1024,
    system=SYSTEM_PROMPT,
    messages=messages
)
```

**Context Management (2025 Features):**
- Use built-in context awareness (tracks tokens automatically)
- Implement sliding window for long conversations
- Store conversation summaries in Supabase
- Use Claude's new memory tool for long-term context

### 4.2 OpenAI Whisper

**Model:** `whisper-1` (latest API model)

**Python SDK Setup:**
```python
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# Transcribe audio
with open("audio.mp3", "rb") as audio_file:
    transcription = await client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language="pt"  # Portuguese
    )

text = transcription.text
```

**Limitations:**
- Max file size: 25MB
- Supported formats: MP3, WAV, M4A, MP4
- For larger files, split into chunks

### 4.3 ElevenLabs

**Model:** `eleven_flash_v2_5` (fastest, 75ms latency) or `eleven_multilingual_v2`

**Python SDK Setup:**
```python
from elevenlabs.client import AsyncElevenLabs
from elevenlabs import VoiceSettings

client = AsyncElevenLabs(api_key=settings.ELEVENLABS_API_KEY)

# Generate Portuguese audio
audio = await client.text_to_speech.convert(
    text="Olá! Como posso ajudar você hoje?",
    voice_id=settings.ELEVENLABS_VOICE_ID,  # Brazilian Portuguese voice
    model_id="eleven_flash_v2_5",
    output_format="mp3_44100_128",
    voice_settings=VoiceSettings(
        stability=0.5,
        similarity_boost=0.75,
        style=0.0,
        use_speaker_boost=True
    )
)

# Save audio
with open("response.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)
```

**Voice Selection:**
- Use Brazilian Portuguese accent voices
- Free tier: 10,000 characters/month
- Recommended: Test multiple voices, choose most natural

---

## 5. MESSAGE PROCESSING FLOW

### 5.1 Architecture Overview

```
Customer Message
    ↓
Chatwoot Webhook → FastAPI Endpoint
    ↓
Quick Validation & Enqueue → Celery Task Queue (Redis)
    ↓
Message Batcher (Debouncer) → Wait 3-5 seconds for burst
    ↓
Process Batch:
    1. Download audio (if applicable)
    2. Transcribe with Whisper
    3. Load conversation context from Supabase
    4. Claude makes decisions:
       - Should I respond?
       - Text or audio response?
       - Should I react with emoji?
       - What's the appropriate response?
    5. Generate response (TTS if audio)
    6. Calculate typing/recording time
    ↓
Send Response:
    1. Show typing/recording indicator
    2. Wait realistic time
    3. Send message via Chatwoot API
    4. Send emoji reaction (if decided)
    5. Save to Supabase
```

### 5.2 Message Batching (Debouncing)

**Problem:** Customers often send multiple messages in quick succession.

**Solution:** Wait for customer to finish before responding.

**Implementation Strategy:**
```python
# In Redis, track latest message timestamp per conversation
# When new message arrives:
# 1. Add to batch
# 2. Set/update timer (4 seconds)
# 3. If timer expires without new messages, process batch
# 4. If new message arrives, reset timer

DEBOUNCE_WINDOW = 4  # seconds
```

**Detection Logic:**
1. Track message timestamps
2. If time_since_last_message < DEBOUNCE_WINDOW: wait
3. If time_since_last_message >= DEBOUNCE_WINDOW: process

### 5.3 Typing Indicator Timing

**Calculate realistic timing:**

```python
def calculate_typing_time(text: str, is_audio: bool = False) -> float:
    """Calculate realistic typing/recording time"""
    if is_audio:
        # For audio: estimate spoken duration + processing buffer
        words = len(text.split())
        words_per_minute = 150  # Average Portuguese speaking speed
        duration = (words / words_per_minute) * 60
        return duration + 2  # Add 2s processing time
    else:
        # For text: simulate typing speed
        chars_per_second = 50  # Average typing speed
        duration = len(text) / chars_per_second

        # Add human-like randomness (±20%)
        import random
        variance = duration * 0.2
        duration += random.uniform(-variance, variance)

        # Min 1s, max 25s (WhatsApp limit)
        return max(1, min(duration, 25))
```

---

## 6. CLAUDE PROMPTS (PORTUGUESE)

### 6.1 System Prompt

```python
SYSTEM_PROMPT = """
Você é um assistente virtual brasileiro altamente inteligente chamado {agent_name}
que trabalha para {company_name}. Você atende clientes via WhatsApp de forma natural,
humana e empática.

## Suas Responsabilidades:
- Fornecer atendimento ao cliente excepcional
- Atuar como consultor de vendas (sem ser agressivo)
- Resolver problemas e responder perguntas
- Coletar informações quando necessário
- Escalar para humanos quando apropriado

## Estilo de Comunicação:
- Português brasileiro natural e coloquial
- Use emojis ocasionalmente (não exagere)
- Seja empático e amigável
- Adapte-se ao tom do cliente (formal/informal)
- Seja conciso - WhatsApp favorece mensagens curtas
- NUNCA pareça robótico ou artificial

## Regras de Áudio:
- Se o cliente enviar áudio, SEMPRE responda com áudio
- Se o cliente enviar texto, responda com texto
- Mantenha consistência com a preferência do cliente

## Contexto da Empresa:
{company_context}

## Informações do Cliente:
{customer_info}

Lembre-se: Você está tendo uma conversa real com uma pessoa real. Seja genuíno,
prestativo e humano.
"""
```

### 6.2 Decision Making Prompt

```python
DECISION_PROMPT = """
Analise as mensagens abaixo e decida as ações apropriadas.

## Histórico da Conversa:
{conversation_history}

## Novas Mensagens do Cliente:
{new_messages}

Forneça sua análise em JSON no seguinte formato:

{
  "should_respond": true/false,
  "reasoning": "Explique seu raciocínio",
  "response_type": "text" | "audio" | "none",
  "response_tone": "formal" | "casual" | "empathetic" | "enthusiastic",
  "should_react": true/false,
  "emoji_reaction": "😊" | null,
  "emoji_reasoning": "Por que este emoji é apropriado",
  "response_content": "Sua resposta aqui (se should_respond = true)"
}

## Critérios para Decisão:

**Should Respond:**
- Responda se: pergunta direta, pedido de ajuda, oportunidade de vendas
- NÃO responda se: mensagem de cortesia simples ("ok", "obrigado"),
  cliente está claramente digitando mais, mensagem não requer resposta

**Should React:**
- Reaja apenas quando adiciona valor emocional
- NÃO reaja a todas as mensagens
- Escolha emojis que correspondam à emoção apropriada
- Exemplos válidos: 👍 para confirmação, ❤️ para gratidão, 😊 para positivo

**Response Type:**
- Use "audio" se o cliente enviou áudio
- Use "text" se o cliente enviou texto
- Mantenha consistência com a preferência do cliente
"""
```

---

## 7. FASTAPI + CELERY IMPLEMENTATION

### 7.1 FastAPI Webhook Endpoint

```python
# app/api/webhooks/chatwoot.py
from fastapi import APIRouter, BackgroundTasks, Request
from app.tasks.message_tasks import process_message_batch
from app.services.supabase import supabase_client

router = APIRouter()

@router.post("/chatwoot")
async def chatwoot_webhook(request: Request):
    """Receive Chatwoot webhooks"""
    payload = await request.json()

    event = payload.get("event")

    if event == "message_created":
        message_type = payload.get("message_type")

        # Only process incoming messages
        if message_type == "incoming":
            conversation_id = payload["conversation"]["id"]

            # Store message in batch
            await add_to_batch(conversation_id, payload)

            # Trigger debounced processing
            process_message_batch.apply_async(
                args=[conversation_id],
                countdown=4  # Wait 4 seconds before processing
            )

    return {"status": "received"}

async def add_to_batch(conversation_id: int, message: dict):
    """Add message to pending batch in Supabase"""
    # Implementation details...
    pass
```

### 7.2 Celery Configuration

```python
# app/tasks/celery_app.py
from celery import Celery
from app.config import settings

celery_app = Celery(
    "agencl",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max
    task_soft_time_limit=240,  # 4 minutes soft limit
    worker_prefetch_multiplier=1,  # Process one task at a time
    worker_max_tasks_per_child=100,
)
```

### 7.3 Celery Task

```python
# app/tasks/message_tasks.py
from app.tasks.celery_app import celery_app
from app.services.message_processor import MessageProcessor

@celery_app.task(bind=True, max_retries=3)
def process_message_batch(self, conversation_id: int):
    """Process batched messages for a conversation"""
    try:
        processor = MessageProcessor()
        result = processor.process(conversation_id)
        return result
    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

---

## 8. COOLIFY DEPLOYMENT

### 8.1 What is Coolify?

Coolify is a self-hosted, open-source platform similar to Heroku/Vercel that simplifies deploying applications on your own VPS using Docker.

**Key Features:**
- Docker/Docker Compose support
- Automatic SSL certificates
- Git integration
- Environment variable management
- Resource monitoring
- Nixpacks auto-detection
- Zero-downtime deployments

### 8.2 Dockerfile for Production

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 8.3 Docker Compose (for local dev and Coolify)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      - redis
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  celery_worker:
    build: .
    env_file:
      - .env
    depends_on:
      - redis
    command: celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

  celery_beat:
    build: .
    env_file:
      - .env
    depends_on:
      - redis
    command: celery -A app.tasks.celery_app beat --loglevel=info

  flower:
    build: .
    ports:
      - "5555:5555"
    env_file:
      - .env
    depends_on:
      - redis
      - celery_worker
    command: celery -A app.tasks.celery_app flower --port=5555

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### 8.4 Deploying to Coolify

**Step 1: Connect Git Repository**
- In Coolify dashboard, click "New Resource"
- Select "Application"
- Connect your GitHub/GitLab repository
- Select branch (e.g., `main`)

**Step 2: Configure Build**
- Build Pack: Choose "Dockerfile" (Coolify will detect it)
- Port: 8000 (must match your app)
- Health Check: `/health`

**Step 3: Environment Variables**
Add all required env vars:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx
CHATWOOT_URL=https://app.chatwoot.com
CHATWOOT_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
OPENAI_API_KEY=xxx
ELEVENLABS_API_KEY=xxx
ELEVENLABS_VOICE_ID=xxx
REDIS_URL=redis://redis:6379
```

**Step 4: Deploy**
- Click "Deploy"
- Coolify will build and deploy automatically
- SSL certificate is auto-generated

**Step 5: Configure Webhook**
- Get your Coolify app URL: `https://your-app.yourdomain.com`
- In Chatwoot, set webhook URL: `https://your-app.yourdomain.com/webhooks/chatwoot`

### 8.5 Coolify Multi-Container Setup

For the full stack (API + Celery + Redis), use Docker Compose in Coolify:

1. Create "Docker Compose" resource in Coolify
2. Upload your `docker-compose.yml`
3. Set environment variables
4. Deploy

Coolify will manage all containers together.

---

## 9. ENVIRONMENT VARIABLES

```bash
# .env.example

# Application
ENVIRONMENT=production
DEBUG=false
PORT=8000

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_KEY=eyJxxx...

# Chatwoot
CHATWOOT_URL=https://app.chatwoot.com
CHATWOOT_API_KEY=your_chatwoot_api_key
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_INBOX_ID=123

# AI Services
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
ELEVENLABS_API_KEY=xxx
ELEVENLABS_VOICE_ID=xxx  # Brazilian Portuguese voice

# Redis
REDIS_URL=redis://redis:6379/0

# Agent Configuration
AGENT_NAME=Assistente
COMPANY_NAME=Sua Empresa
COMPANY_CONTEXT=Descrição da sua empresa, produtos, serviços...
DEBOUNCE_TIMEOUT=4  # seconds
LANGUAGE=pt-BR

# Webhook Security (optional)
WEBHOOK_SECRET=random_secret_string
```

---

## 10. IMPLEMENTATION CHECKLIST

### Phase 1: Foundation
- [ ] Set up Python project structure
- [ ] Configure environment variables
- [ ] Create Supabase database schema
- [ ] Set up Redis locally/remote

### Phase 2: Core Services
- [ ] Implement Chatwoot API client
- [ ] Implement Supabase client
- [ ] Implement Claude service
- [ ] Implement Whisper service
- [ ] Implement ElevenLabs service

### Phase 3: Message Processing
- [ ] Create FastAPI webhook endpoint
- [ ] Implement message batching/debouncing
- [ ] Create Celery tasks
- [ ] Implement typing indicator logic
- [ ] Build main message processor

### Phase 4: AI Logic
- [ ] Write Brazilian Portuguese prompts
- [ ] Implement decision-making logic
- [ ] Add emoji reaction logic
- [ ] Add conversation context management

### Phase 5: Testing
- [ ] Test with mock WhatsApp messages
- [ ] Test audio message flow
- [ ] Test message batching
- [ ] Load testing with multiple conversations

### Phase 6: Deployment
- [ ] Create Dockerfile
- [ ] Create docker-compose.yml
- [ ] Deploy to Coolify VPS
- [ ] Configure Chatwoot webhook
- [ ] Test production environment
- [ ] Monitor with Flower

### Phase 7: Optimization
- [ ] Fine-tune prompts based on real usage
- [ ] Optimize response times
- [ ] Add analytics and logging
- [ ] Implement error alerting

---

## 11. BEST PRACTICES

### WhatsApp Communication
- Keep messages under 4 lines when possible
- Use typing indicators for messages over 2 seconds
- Don't send more than 2 messages without user input
- Respect the 24-hour message window
- Match customer's communication style

### Message Batching
- Use 3-5 second debounce window
- Group messages by conversation
- Process batches atomically
- Handle race conditions with Redis locks

### Error Handling
- Retry failed API calls (exponential backoff)
- Log all errors to Supabase
- Fallback to text if audio generation fails
- Alert team for critical failures

### Performance
- Use async/await throughout
- Cache frequently accessed data (Redis)
- Summarize old conversation context
- Limit conversation history to last 20 messages

### Security
- Validate webhook signatures
- Use HTTPS everywhere
- Store API keys in environment variables
- Rate limit webhook endpoint
- Implement request authentication

---

## 12. MONITORING & MAINTENANCE

### Logging
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)
```

### Metrics to Track
- Message processing time
- API response times (Chatwoot, Claude, Whisper, ElevenLabs)
- Error rates by service
- Conversation resolution time
- Customer satisfaction signals

### Celery Monitoring with Flower
Access at: `http://your-domain.com:5555`

Monitor:
- Task execution times
- Worker status
- Queue length
- Failed tasks

---

## 13. COST ESTIMATION

### API Costs (Monthly)

**Anthropic Claude:**
- Input: $3 per 1M tokens
- Output: $15 per 1M tokens
- Estimate: 500 conversations/day = ~$50-100/month

**OpenAI Whisper:**
- $0.006 per minute of audio
- Estimate: 100 audio messages/day × 30s avg = $9/month

**ElevenLabs:**
- Free: 10,000 chars/month
- Starter: $5/month for 30,000 chars
- Creator: $22/month for 100,000 chars
- Estimate: $22-44/month

**Supabase:**
- Free tier: 500MB database, 2GB bandwidth
- Pro: $25/month (8GB database, 50GB bandwidth)

**VPS (Coolify):**
- 2 vCPU, 4GB RAM: ~$20-40/month (DigitalOcean, Hetzner, etc.)

**Total Estimate: $130-230/month** for moderate usage

---

## 14. NEXT STEPS

1. **Set up development environment**
2. **Create Supabase project and run migrations**
3. **Set up Chatwoot instance (cloud or self-hosted)**
4. **Get API keys for all services**
5. **Start building incrementally following the checklist**

Ready to start building? Let's begin! 🚀
