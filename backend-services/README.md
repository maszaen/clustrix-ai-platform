# Clustrix Backend Services

Express.js backend for Clustrix AI Platform - proxies AI requests, manages rate limits, and provides analytics.

## 🚀 Quick Start (Local)

```bash
# Install dependencies
npm install

# Copy env example
cp .env.example .env

# Edit .env with your API keys
# ...

# Run in development
npm run dev
```

## 📁 Project Structure

```
src/
├── config/
│   └── models.js       # AI model configurations
├── middleware/
│   ├── auth.js         # Google ID token verification
│   ├── logger.js       # Request logging
│   ├── rateLimit.js    # Rate limiting
│   └── validation.js   # Input validation
├── routes/
│   ├── admin.js        # Admin panel & API
│   ├── agentic.js      # Web search agentic mode
│   ├── chat.js         # Chat completions
│   ├── imageGen.js     # Image generation mode
│   ├── models.js       # Available models list
│   ├── sandbox.js      # Daytona sandbox API
│   └── user.js         # User info
├── services/
│   └── analytics.js    # Usage analytics
└── index.js            # Express server entry
```

## 🤖 AI Tools (Agentic Mode)

AI models have access to these tools when using `/api/agentic`:

| Tool | Description |
|------|-------------|
| `web_search` | Search the web for current information |
| `list_attachments` | List files attached to the session |
| `reattach_file` | Retrieve a previously attached file |
| `view_reminder` | View all scheduled reminders |
| `set_reminder` | Schedule a new reminder |
| `complete_reminder` | Mark reminder as done |
| `remove_reminder` | Delete a reminder |
| `run_code` | Execute code in Daytona sandbox (Python, JS, TS, etc.) |
| `run_command` | Run shell command in sandbox |

## 🔑 Required API Keys

| Provider | Env Variable | Get Key |
|----------|-------------|---------|
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Google Gemini | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| Anthropic | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| Groq | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com/) |
| DeepSeek | `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com/) |
| xAI | `XAI_API_KEY` | [console.x.ai](https://console.x.ai/) |
| Mistral | `MISTRAL_API_KEY` | [console.mistral.ai](https://console.mistral.ai/) |
| OpenRouter | `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai/keys) |

### Search APIs (for Agentic Mode)

| Provider | Env Variable | Get Key |
|----------|-------------|---------|
| Tavily | `TAVILY_API_KEY` | [tavily.com](https://tavily.com/) |
| SerpAPI | `SERPAPI_API_KEY` | [serpapi.com](https://serpapi.com/) |
| Google CSE | `GOOGLE_SEARCH_API_KEY` + `GOOGLE_CSE_ID` | [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) |

### Sandbox API (Daytona)

| Provider | Env Variable | Get Key |
|----------|-------------|---------|
| Daytona | `DAYTONA_API_KEY` | [app.daytona.io/dashboard/keys](https://app.daytona.io/dashboard/keys) |
| Daytona Target | `DAYTONA_TARGET` | `us` or `eu` (default: `us`) |

## 🖥️ Sandbox API Endpoints

Secure code execution in isolated Daytona sandboxes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sandbox/create` | POST | Create new sandbox |
| `/api/sandbox/:id/run-code` | POST | Execute Python/JS/TS code |
| `/api/sandbox/:id/run-command` | POST | Run shell command |
| `/api/sandbox/:id/upload` | POST | Upload file |
| `/api/sandbox/:id/download` | GET | Download file |
| `/api/sandbox/:id/files` | GET | List directory |
| `/api/sandbox/:id/preview` | GET | Get preview URL |
| `/api/sandbox/:id/status` | GET | Get sandbox info |
| `/api/sandbox/:id/start` | POST | Start sandbox |
| `/api/sandbox/:id/stop` | POST | Stop sandbox |
| `/api/sandbox/:id` | DELETE | Delete sandbox |
| `/api/sandbox/list` | GET | List sandboxes |

## ☁️ Deploy to Google Cloud Run

### Prerequisites

1. Install [gcloud CLI](https://cloud.google.com/sdk/docs/install)
2. Login: `gcloud auth login`
3. Create project: `gcloud projects create YOUR_PROJECT_ID`
4. Set project: `gcloud config set project YOUR_PROJECT_ID`

### Quick Deploy (Windows)

```powershell
# Edit deploy.ps1 to set your PROJECT_ID
.\deploy.ps1
```

### Quick Deploy (Linux/Mac)

```bash
chmod +x deploy.sh
./deploy.sh
```

### Manual Deploy

```bash
gcloud run deploy clustrix-backend \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --set-env-vars "NODE_ENV=production"
```

### Setting Environment Variables

Option 1: Cloud Console UI
- Go to [Cloud Run](https://console.cloud.google.com/run)
- Click your service → Edit & Deploy → Variables & Secrets

Option 2: Command Line (inline)
```bash
gcloud run deploy clustrix-backend \
  --set-env-vars "OPENAI_API_KEY=sk-xxx,GEMINI_API_KEY=xxx,..."
```

Option 3: Secret Manager (recommended for production)
```powershell
# Create secrets
.\setup-secrets.ps1

# Deploy with secrets
gcloud run deploy clustrix-backend \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest,..."
```

## 📊 Admin Panel

Access:
- API/admin routes: send `x-admin-secret: YOUR_ADMIN_SECRET` (recommended) or Basic auth (password = `ADMIN_SECRET`).
- Console: open `https://admin:YOUR_ADMIN_SECRET@YOUR_URL/console` (uses Basic auth).

Features:
- Model enable/disable toggles
- Real-time request logs
- Analytics dashboard
- Online users monitoring

## 📡 API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check |
| `/api/models` | GET | Yes | List available models |
| `/api/chat` | POST | Yes | Chat completions |
| `/api/agentic` | POST | Yes | Agentic mode (web search) |
| `/api/image-gen` | POST | Yes | Image generation mode |
| `/api/user/usage` | GET | Yes | User rate limit status |
| `/admin/*` | GET/POST | Admin | Admin endpoints |

## 🔒 Security

- Google ID Token verification (Firebase Auth)
- Rate limiting per user (burst + daily)
- Input validation & sanitization
- Timing-safe admin auth
- Non-root Docker container

## 📈 Free Tier Limits

Cloud Run free tier includes:
- 2 million requests/month
- 360,000 GB-seconds compute
- 180,000 vCPU-seconds

For personal use, this is effectively **free**!

## 🛠️ Development

```bash
# Watch mode
npm run dev

# Production
npm start
```

## 📝 License

MIT
