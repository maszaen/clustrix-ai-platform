# Clustrix - Enterprise Grade AI Platform

<div align="center">

![Version](https://img.shields.io/badge/version-32.0.5-blue.svg)
![Electron](https://img.shields.io/badge/Electron-38.3.0-47848F.svg)
![Node](https://img.shields.io/badge/Node-%E2%89%A518.0.0-339933.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Platform AI desktop berbasis Electron dengan kemampuan multi-agent orchestration, advanced markdown parsing, dan integrasi mendalam dengan berbagai AI providers**

[Quick Start](#-quick-start) • [Features](#-fitur-utama) • [Documentation](#-dokumentasi) • [Architecture](#-arsitektur)

</div>

---

## 📖 Tentang Clustrix

**Clustrix** adalah platform AI desktop yang dirancang untuk power-user yang membutuhkan kontrol penuh atas model AI, kemampuan reasoning yang mendalam, dan integrasi mulus dengan workflow pengembangan. Dibangun dengan Electron dan LangChain, Clustrix menyediakan pengalaman chat AI yang kaya fitur dengan dukungan multi-provider, file processing, web search, dan banyak lagi.

<div align="center">
  <img src="public/images/preview/code-preview.png" alt="Code Rendering" width="45%" />
  <img src="public/images/preview/mermaid-preview.png" alt="Mermaid Diagrams" width="45%" />
</div>

<p align="center"><i>Advanced markdown rendering dengan syntax highlighting dan Mermaid diagram support</i></p>

### Mengapa Clustrix?

- 🎯 **Multi-Provider Support**: Gunakan OpenRouter, Groq, Gemini, Z AI, atau custom endpoints
- 🤖 **AI Orchestration**: Multi-agent system dengan RE+ACT reasoning engine
- 📁 **File Intelligence**: Upload dan analisis DOCX, Excel, CSV, dan format lainnya
- 🔍 **Dual Search Engine**: Web search (SerpAPI) dan local desktop search tanpa internet
- 🎨 **Enterprise-Grade Parser**: Markdown parser yang powerful dengan MathJax dan syntax highlighting
- 💾 **Data Management**: SQLite database dengan GitHub sync/backup integration
- 🔒 **Privacy-First**: Semua data disimpan lokal dengan kontrol penuh

---

## 🎯 Fitur Utama

### 🤖 Multi-Agent AI Orchestration
- **Dynamic Research Agent**: Sistem multi-agent yang merencanakan, mencari, dan mensintesis informasi otomatis
- **RE+ACT Reasoning Engine**: Agent dengan kemampuan berpikir dan bertindak (Reasoning + Action) untuk tugas kompleks
- **Thinking Mode**: UI real-time yang menampilkan proses reasoning AI dengan indikator visual
- **Memory & Context**: Vector store untuk konteks percakapan persisten dengan embeddings

### 🔧 Multi-Provider AI Support
- **OpenRouter**: Akses ke ratusan model AI (free & paid)
- **Groq**: Inferensi super cepat dengan model Llama dan Mixtral
- **Gemini**: Model Google dengan multimodal capabilities
- **Z AI**: Platform AI Indonesia
- **Custom**: Endpoint OpenAI-compatible lainnya
- **Per-Provider Config**: API key dan endpoint terpisah untuk setiap provider
- **Model Switching**: Ganti model real-time tanpa restart

<div align="center">
  <img src="public/images/preview/personalization-preview.png" alt="Personalization Settings" width="80%" />
</div>

<p align="center"><i>UI Personalization dengan kontrol penuh atas model dan provider</i></p>

### 📁 File Processing & Analysis
- **Multi-Format Support**: DOCX (Mammoth), XLSX/XLS (native), CSV, TXT, MD, JSON
- **Intelligent Summarization**: Ringkasan otomatis untuk file >1500 tokens
- **Project Context**: Analisis struktur proyek untuk respons akurat
- **Drag & Drop**: Upload mudah dengan preview dan parsing otomatis

### 🔍 Advanced Search
- **Web Search**: Integrasi SerpAPI dan Google Custom Search Engine
- **Desktop Search**: Indexing lokal dengan TF-IDF vectorization tanpa internet
- **Semantic Search**: Pencarian berbasis makna untuk file discovery
- **Multi-Query**: Parallel search untuk efisiensi maksimal

<div align="center">
  <img src="public/images/preview/web-search-features-preview.png" alt="Web Search" width="45%" />
  <img src="public/images/preview/local-search-research-agent-web-searching-preview.png" alt="Research Agent" width="45%" />
</div>

<p align="center"><i>Web search integration dan research agent dengan multi-query capabilities</i></p>

<div align="center">
  <img src="public/images/preview/local-search-research-agent-files-searching-preview.png" alt="Local File Search" width="80%" />
</div>

<p align="center"><i>Local desktop search dengan semantic understanding</i></p>

### 🎨 Modern UI/UX
- **Real-time Streaming**: Token streaming dengan typing indicators
- **Markdown Excellence**: Parser enterprise-grade dengan dukungan nested blockquotes, tables, dan codeblocks
- **MathJax Integration**: Rendering formula matematika dan LaTeX
- **Syntax Highlighting**: Prism.js untuk 200+ bahasa pemrograman
- **Multi-Session**: Switch antar percakapan dengan session management
- **Continue Placeholder**: Auto-handling untuk respons terputus

<div align="center">
  <img src="public/images/preview/prompt-recommendation-preview.png" alt="Prompt Recommendations" width="45%" />
  <img src="public/images/preview/can-search-for-image-preview.png" alt="Image Search" width="45%" />
</div>

<p align="center"><i>Smart prompt recommendations dan image search capabilities</i></p>

### 💾 Data & Sync
- **SQLite Database**: Database lokal untuk performa tinggi
- **GitHub Integration**: Sync dan backup otomatis ke GitHub
- **Smart Backup**: Timestamped backups dengan conflict resolution
- **Migration Tools**: JSON to SQLite migrator untuk legacy data

<div align="center">
  <img src="public/images/preview/account-settings-and-data-source-preview.png" alt="Account & Data Settings" width="45%" />
  <img src="public/images/preview/settings-modal-preview.png" alt="Settings Modal" width="45%" />
</div>

<p align="center"><i>Account settings, data source management, dan comprehensive settings modal</i></p>

### 🛠️ Developer Features
- **Comprehensive Logging**: Debug mode dengan contextual logging
- **Session Management**: Multi-session dengan persistence
- **Message Optimization**: Token usage optimization
- **IPC Bridge**: Secure communication antara main dan renderer process
- **Testing Suite**: Unit, integration, dan E2E tests dengan Jest

<div align="center">
  <img src="public/images/preview/projects-detail-page-preview.png" alt="Projects Detail" width="80%" />
</div>

<p align="center"><i>Project management dengan detail view untuk organized workflow</i></p>

---

## 🚀 Quick Start

### Prasyarat
- **Node.js** ≥ 18.0.0
- **npm**, **yarn**, atau **pnpm**
- OS: Windows 10+, macOS 10.15+, Linux (Ubuntu 18.04+)

### Instalasi

```bash
# Clone repository
git clone https://github.com/maszaen/clustrix-ai-platform.git
cd clustrix-ai-platform

# Install dependencies
npm install

# Jalankan development mode
npm run dev

# Build untuk production
npm run make
```

### Konfigurasi Awal

1. Jalankan aplikasi
2. Buka **Personalization → Switch Model**
3. Pilih **Provider** (OpenRouter, Groq, Gemini, Z AI, atau Custom)
4. Masukkan **API Key** dan **Base URL**
5. Pilih **Model** dari daftar
6. Mulai chat!

### Environment Variables (Opsional)

```bash
# Debug mode
CLUSTRIX_DEBUG=true

# Custom API keys
OPENROUTER_API_KEY=your_key
GROQ_API_KEY=your_key
GOOGLE_API_KEY=your_key
SERPAPI_KEY=your_key
```

---

## 📋 Dokumentasi

### Konfigurasi Model

**Personalization → Switch Model** menyediakan kontrol penuh atas:

#### Per-Provider Settings
- **Base URL**: Endpoint API spesifik provider
- **API Key**: Kunci akses (disimpan plain text untuk debugging)
- **Model List**: Daftar model dengan label dan catatan kustom

#### Model Management
```javascript
// Format konfigurasi model
{
  "id": "anthropic/claude-3-haiku",
  "label": "Claude 3 Haiku",
  "note": "Fast and efficient for general tasks"
}
```

#### Title Generator
- **Default**: Gunakan model chat aktif
- **Custom**: Pilih model spesifik (lebih murah/cepat) untuk pembuatan judul

### Provider Base URLs

| Provider | Base URL | Catatan |
|----------|----------|---------|
| OpenRouter | `https://openrouter.ai/api/v1` | Ratusan model tersedia |
| Groq | `https://api.groq.com/openai/v1` | Inferensi super cepat |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | Multimodal capabilities |
| Z AI | `https://api.z.ai/api/paas/v4/` | Platform AI Indonesia |
| Custom | Your endpoint | OpenAI-compatible format |

### File Processing

#### Supported Formats
- **DOCX**: Text extraction dengan Mammoth
- **XLSX/XLS**: Sheet parsing dan data extraction
- **CSV**: Auto-detection delimiter dan encoding
- **TXT/MD**: Full text processing
- **JSON**: Structured data parsing

#### Workflow
1. **Upload**: Drag & drop atau file dialog
2. **Preview**: Syntax highlighting otomatis
3. **Processing**: Parsing berdasarkan format
4. **Integration**: Context disuntikkan ke AI reasoning
5. **Storage**: Persistent dalam session

### Search Engines

#### Web Search (SerpAPI/Google CSE)
```javascript
// Konfigurasi SerpAPI
{
  "provider": "serpapi",
  "apiKey": "your_key",
  "maxResults": 5
}

// Konfigurasi Google CSE
{
  "provider": "google",
  "apiKey": "your_key",
  "cseId": "your_cse_id"
}
```

#### Local Desktop Search
- **TF-IDF Vectorization**: Semantic search lokal
- **No API Costs**: Semua processing offline
- **Instant Results**: Sub-second response time
- **Incremental Indexing**: Update otomatis saat file berubah

### UI Features

#### Streaming Interface
- **Real-time Streaming**: Respons muncul bertahap
- **Thinking Indicators**: Visual feedback saat AI processing
- **Continue Placeholder**: Auto-handling respons terputus (auto-hide 5 detik)

#### Message Actions
- **Copy**: Copy respons ke clipboard
- **Regenerate**: Generate ulang respons dengan parameter sama
- **Continue**: Lanjutkan respons yang terputus

#### Markdown Parser
Parser enterprise-grade yang menangani:
- ✅ Nested blockquotes dengan benar
- ✅ Codeblocks dalam lists dengan indentasi tepat
- ✅ Tables dengan row continuation
- ✅ MathJax inline dan block
- ✅ Syntax highlighting 200+ bahasa
- ✅ Mermaid diagrams

---

## 🏗️ Arsitektur

### Struktur Aplikasi

```
Clustrix-AI-Platform/
├── main.js                      # Electron main process
├── preload.js                   # IPC bridge & security layer
├── renderer/
│   ├── renderer.js              # UI logic & state management
│   ├── index.html               # Main UI template
│   ├── style.css                # Styling & themes
│   ├── md.js                    # Markdown parser
│   ├── md.worker.js             # Markdown worker thread
│   └── core/
│       └── title-gen.js         # Title generation logic
├── backend/
│   ├── langchain-service.js     # LangChain orchestration
│   ├── langchain-agents.js      # Multi-agent system
│   ├── reasoning-action-agent.js # RE+ACT engine
│   ├── web-search.js            # Web search integration
│   ├── desktop-search-engine.js # Local search engine
│   ├── file-summarizer.js       # File processing
│   ├── local-embedding-engine.js # TF-IDF embeddings
│   ├── database-manager.js      # SQLite manager
│   ├── github-storage-service.js # GitHub sync
│   ├── smart-backup-service.js  # Backup automation
│   └── sync-manager.js          # Sync orchestration
├── utils/
│   ├── logger.js                # Logging system
│   └── message-optimizer.js     # Token optimization
├── local_modules/
│   ├── custom/                  # Custom modules
│   ├── custom-formatter/        # Markdown formatter
│   ├── prism/                   # Syntax highlighting
│   └── xlsx/                    # Excel parser
└── public/
    ├── images/                  # Assets
    └── fonts/                   # Custom fonts
```

### Data Flow

```
User Input
    ↓
IPC Bridge (preload.js)
    ↓
Main Process (main.js)
    ↓
Backend Services
    ├─→ LangChain Service → AI Providers
    ├─→ File Processor → Context Integration
    ├─→ Web/Local Search → Results Synthesis
    └─→ Database Manager → Persistent Storage
    ↓
Response Streaming
    ↓
IPC Events → Renderer Process
    ↓
UI Updates (renderer.js)
    ├─→ Markdown Parser → Rendered HTML
    ├─→ Syntax Highlighting → Code Blocks
    └─→ MathJax → Math Formulas
```

### Security Model

- **Context Isolation**: Renderer tidak akses langsung Node.js APIs
- **IPC Validation**: Semua komunikasi main-renderer divalidasi
- **File Sandboxing**: File operations terbatas pada allowed directories
- **API Key Storage**: Plain text (development) dengan rencana encryption (production)

---

## 🔧 Troubleshooting

### Common Issues

#### "Response Interrupted"
**Penyebab**: Network timeout, rate limiting, atau model behavior  
**Solusi**: Klik tombol **Continue** atau switch ke model lain

#### "Model Not Found"
**Penyebab**: Invalid model ID atau API key expired  
**Solusi**: Periksa konfigurasi di Switch Model, refresh API key

#### "File Processing Failed"
**Penyebab**: Format tidak didukung atau file corrupt  
**Solusi**: Periksa format file, coba upload ulang

#### "Search Not Working"
**Penyebab**: API key missing atau quota exceeded  
**Solusi**: Konfigurasi credentials di settings

### Debug Mode

```bash
# Enable debug logging
CLUSTRIX_DEBUG=true npm run dev

# Check logs (Windows)
type %APPDATA%\Clustrix\logs\app.log

# Check logs (macOS/Linux)
tail -f ~/Library/Application\ Support/Clustrix/logs/app.log
```

### Reset Configuration

```bash
# Windows
del %APPDATA%\Clustrix\ai-model.conf.json
del %APPDATA%\Clustrix\chat_data.db

# macOS/Linux
rm ~/Library/Application\ Support/Clustrix/ai-model.conf.json
rm ~/Library/Application\ Support/Clustrix/chat_data.db
```

Atau gunakan tombol **Reset Defaults** di modal Switch Model.

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm test -- file-summarizer.test.js
```

### Test Coverage
- ✅ Unit tests untuk backend services
- ✅ Integration tests untuk IPC communication
- ⏳ E2E tests (in progress)

---

## 🤝 Contributing

Kontribusi sangat diterima! Untuk berkontribusi:

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Development Guidelines

- Follow existing code style dan patterns
- Add tests untuk fitur baru
- Update dokumentasi jika diperlukan
- Gunakan conventional commits
- Test thoroughly sebelum submit PR

---

## 📄 License

Distributed under the MIT License. See `LICENSE` file for more information.

---

## 🙏 Acknowledgments

### Core Technologies
- **Electron** - Desktop application framework
- **LangChain** - AI orchestration dan agent framework
- **OpenRouter** - Multi-model AI platform
- **Better SQLite3** - High-performance database

### Libraries & Tools
- **Mammoth** - DOCX processing
- **SerpAPI** - Web search API
- **MathJax** - Mathematical rendering
- **Prism.js** - Syntax highlighting
- **Cheerio** - HTML/XML parsing
- **UUID** - Unique identifier generation

### Acknowledgments
Special thanks ke semua contributors dan open-source community yang membuat Clustrix mungkin terwujud.

---

<div align="center">

**Built with ❤️ by [Maszaen Corporation](https://github.com/maszaen)**

*For the AI-powered future*

</div>
