# Clustrix AI Platform (This is deprecated readme file)

**Clustrix** adalah platform AI desktop canggih berbasis Electron yang menggabungkan kemampuan AI mutakhir dengan pengalaman chat yang intuitif. Dirancang untuk power-user yang membutuhkan kontrol penuh atas model AI, kemampuan reasoning yang mendalam, dan integrasi yang mulus dengan workflow pengembangan.

---

## 🎯 Fitur Utama

### 🤖 **Multi-Agent AI Orchestration**
- **Dynamic Research Agent**: Sistem multi-agent yang secara otomatis merencanakan, mencari, dan mensintesis informasi
- **RE+ACT Reasoning Engine**: Agent yang dapat berpikir dan bertindak (Reasoning + Action) untuk menyelesaikan tugas kompleks
- **Thinking Mode**: UI yang menampilkan proses reasoning AI secara real-time dengan indikator visual

### 🔍 **Advanced Search & Knowledge Base**
- **Web Search Integration**: SerpAPI dan Google Custom Search Engine untuk pencarian web real-time
- **Local Desktop Search Engine**: Indexing dan pencarian file lokal tanpa koneksi internet
- **Vector Memory Store**: Penyimpanan memori vektor untuk konteks percakapan yang persisten
- **Local Embedding Engine**: Sistem embedding TF-IDF lokal tanpa biaya API

### 📁 **File Processing & Analysis**
- **Multi-format Support**: Docx, Excel, CSV, dan file teks
- **Intelligent Summarization**: Ringkasan otomatis file panjang dengan AI
- **Project Context Integration**: Analisis file proyek untuk konteks yang lebih akurat
- **File Upload & Processing**: Drag-and-drop dengan preview dan parsing otomatis

### 🎨 **Modern Chat Interface**
- **Real-time Streaming**: Respons streaming dengan indikator typing dan thinking
- **Markdown Rendering**: Dukungan lengkap markdown dengan syntax highlighting
- **MathJax Integration**: Rendering matematika dan formula LaTeX
- **Code Artifacts**: Ekstraksi dan highlighting kode dari respons AI
- **Continue Placeholder**: Sistem resume untuk respons yang terputus

### 🔧 **Multi-Provider AI Support**
- **OpenRouter**: Akses ke ratusan model AI (free & paid)
- **Groq**: Inferensi cepat dengan model Llama dan Mixtral
- **Gemini**: Model Google dengan multimodal capabilities
- **Z AI**: Platform AI Indonesia
- **Custom OpenAI-compatible**: Endpoint apa saja yang mendukung format OpenAI

### 🛠️ **Developer Features**
- **Per-Provider Configuration**: API key dan endpoint terpisah per provider
- **Model Switching**: Ganti model real-time tanpa restart
- **Debug Mode**: Logging komprehensif dan error tracking
- **Session Management**: Multi-session dengan persistence
- **Project Workflows**: Dukungan workflow development dengan file staging

---

## 📋 Daftar Isi

* [Instalasi & Setup](#instalasi--setup)
* [Konfigurasi Model](#konfigurasi-model)
* [Fitur AI Canggih](#fitur-ai-canggih)
* [File Processing](#file-processing)
* [Web Search](#web-search)
* [Local Search Engine](#local-search-engine)
* [UI & UX Features](#ui--ux-features)
* [Troubleshooting](#troubleshooting)
* [Architecture](#architecture)
* [Contributing](#contributing)

---

## 🚀 Instalasi & Setup

### Prasyarat
- **Node.js** ≥ 18.0.0
- **npm** atau **yarn**
- OS: Windows 10+, macOS 10.15+, Linux (Ubuntu 18.04+)

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/maszaen/zenai-4.5-flash.git
cd zenai-4.5-flash

# 2. Install dependencies
npm install

# 3. Jalankan development mode
npm run dev

# 4. Build untuk production (opsional)
npm run make
```

### Environment Variables
```bash
# Untuk debugging
CLUSTRIX_DEBUG=true

# Custom API endpoints (opsional)
OPENROUTER_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
SERPAPI_KEY=your_key_here
```

---

## ⚙️ Konfigurasi Model

### Multi-Provider Setup

1. **Buka Personalization → Switch Model**
2. **Pilih Provider**: OpenRouter, Groq, Gemini, Z AI, atau Custom
3. **Konfigurasi per Provider**:
   - **Base URL**: Endpoint API spesifik provider
   - **API Key**: Kunci akses (disimpan plain text untuk debugging)
   - **Model Selection**: Pilih dari daftar model tersedia
   - **Label & Notes**: Kustomisasi tampilan dan deskripsi

### Model Management

```javascript
// Contoh konfigurasi models
{
  "openrouter": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKey": "sk-or-v1-...",
    "models": [
      {
        "id": "anthropic/claude-3-haiku",
        "label": "Claude 3 Haiku",
        "note": "Fast and efficient for general tasks"
      }
    ]
  }
}
```

### Title Generator
Pilih model khusus untuk pembuatan judul otomatis:
- **Default**: Gunakan model chat aktif
- **Custom**: Pilih model spesifik untuk efisiensi biaya

---

## 🧠 Fitur AI Canggih

### Multi-Agent Orchestration

**Dynamic Research Agent** secara otomatis:
- 📋 **Planning**: Menganalisis query dan merencanakan pendekatan
- 🔍 **Research**: Melakukan web search dan file analysis
- 📝 **Synthesis**: Menggabungkan informasi menjadi respons koheren
- 🎯 **Action**: Menjalankan task-specific actions

### RE+ACT Reasoning Engine

```javascript
// Contoh workflow RE+ACT
1. Think: "User asked about React performance"
2. Search: Query local files for React patterns
3. Analyze: Review code examples and best practices
4. Synthesize: Provide comprehensive optimization guide
5. Act: Generate code examples and benchmarks
```

### Thinking Mode UI

- **Real-time Indicators**: "Reading your request" → "Processing thoughts" → "Organizing response"
- **Progress Visualization**: Typing animation dengan smooth transitions
- **Duration Tracking**: Waktu reasoning ditampilkan setelah selesai

### Memory & Context Management

- **Vector Store**: Persistent memory untuk konteks percakapan
- **Session Memory**: Riwayat percakapan dengan embeddings
- **File Context**: Integrasi konten file ke dalam reasoning
- **Project Awareness**: Pemahaman struktur proyek untuk respons yang lebih akurat

---

## 📁 File Processing

### Supported Formats

| Format | Library | Capabilities |
|--------|---------|--------------|
| **.docx** | Mammoth | Text extraction, formatting preservation |
| **.xlsx/.xls** | XLSX | Sheet parsing, data extraction |
| **.csv** | Native | Delimiter detection, encoding support |
| **.txt/.md** | Native | Full text processing |
| **.json** | Native | Structured data parsing |

### Intelligent Summarization

```javascript
// Automatic file analysis
- Token estimation (>1500 tokens trigger summarization)
- Code file prioritization (JS, Python, Java, etc.)
- Content chunking dengan overlap
- AI-powered summarization dengan context preservation
```

### File Upload Workflow

1. **Drag & Drop** atau **Dialog Selection**
2. **Preview** dengan syntax highlighting
3. **Automatic Processing** berdasarkan tipe file
4. **Context Integration** ke AI reasoning
5. **Persistent Storage** dalam session

---

## 🌐 Web Search

### Provider Support

#### SerpAPI Integration
```javascript
// Konfigurasi SerpAPI
{
  "provider": "serpapi",
  "apiKey": "your_serpapi_key",
  "maxResults": 5
}
```

#### Google Custom Search Engine
```javascript
// Konfigurasi Google CSE
{
  "provider": "google",
  "apiKey": "your_google_api_key",
  "cseId": "your_cse_id",
  "region": "id"
}
```

### Search Capabilities

- **Multi-query Processing**: Parallel search untuk efisiensi
- **Result Synthesis**: AI menggabungkan hasil pencarian
- **Source Attribution**: Link dan referensi otomatis
- **Caching**: Hasil pencarian disimpan untuk performa

---

## 💻 Local Search Engine

### Desktop Indexing

```javascript
// Local file indexing tanpa internet
- TF-IDF vectorization
- Cosine similarity matching
- Stop word filtering
- Incremental indexing
```

### Search Capabilities

- **Pattern Matching**: Regex dan text search
- **Semantic Search**: Meaning-based file discovery
- **Project Context**: Pemahaman struktur kode
- **Action Planning**: RE+ACT integration untuk task execution

### Performance Features

- **No API Costs**: Semua processing lokal
- **Instant Results**: Sub-second response times
- **Memory Efficient**: Optimized untuk large codebases
- **Persistent Index**: Index tersimpan di disk

---

## 🎨 UI & UX Features

### Streaming Interface

- **Real-time Token Streaming**: Respons muncul secara bertahap
- **Thinking Indicators**: Visual feedback selama AI processing
- **Smooth Transitions**: Animasi antara thinking dan content
- **Error Handling**: Graceful degradation dengan continue options

### Advanced Chat Features

- **Multi-session Management**: Switch antar percakapan
- **Message Actions**: Copy, regenerate, continue
- **Code Highlighting**: Syntax highlighting dengan Prism.js
- **Math Rendering**: LaTeX dan MathJax support
- **Artifact Extraction**: Code snippets otomatis disimpan

### Accessibility & Performance

- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: ARIA labels dan live regions
- **Performance Optimized**: Virtual scrolling untuk chat panjang
- **Memory Management**: Automatic cleanup dan garbage collection

---

## 🏗️ Architecture

### Core Components

```
├── Main Process (Electron)
│   ├── Window Management
│   ├── IPC Bridge
│   └── File System Access
│
├── Backend Services
│   ├── LangChain Service (AI Orchestration)
│   ├── Multi-Agent System
│   ├── Web Search Engine
│   ├── Local Search Engine
│   ├── File Processor
│   └── Vector Store
│
└── Renderer (UI)
    ├── Chat Interface
    ├── File Management
    ├── Model Configuration
    └── Streaming Engine
```

### Data Flow

1. **User Input** → IPC Bridge → Main Process
2. **AI Processing** → LangChain → Model APIs
3. **Response Streaming** → IPC Events → UI Updates
4. **File Processing** → Local Analysis → Context Integration
5. **Search Queries** → Web/Local Engines → Result Synthesis

### Security Model

- **Context Isolation**: Renderer tidak akses langsung ke Node.js
- **IPC Validation**: Semua komunikasi divalidasi
- **File Access Control**: Sandboxed file operations
- **API Key Management**: Plain text untuk debugging (development)

---

## 🔧 Troubleshooting

### Common Issues

#### "Response Interrupted"
```
Cause: Network timeout atau rate limiting
Solution: Gunakan "Continue" button atau switch model
```

#### "Model Not Found"
```
Cause: Invalid model ID atau API key expired
Solution: Check model configuration dan refresh API keys
```

#### "File Processing Failed"
```
Cause: Unsupported format atau corrupted file
Solution: Check file format dan try re-uploading
```

#### "Search Not Working"
```
Cause: API key missing atau quota exceeded
Solution: Configure search provider credentials
```

### Debug Mode

```bash
# Enable debug logging
CLUSTRIX_DEBUG=true npm run dev

# Check logs
tail -f app.log
```

### Reset Configuration

```bash
# Delete config files
rm -rf ~/AppData/Roaming/Clustrix/ai-model.conf.json
rm -rf ~/AppData/Roaming/Clustrix/vector_data.json

# Restart application
npm run dev
```

---

## 🤝 Contributing

### Development Setup

```bash
# Fork dan clone
git clone https://github.com/your-username/clustrix-ai-platform.git
cd clustrix-ai-platform

# Install dependencies
npm install

# Setup development environment
npm run dev

# Run tests
npm test
```

### Code Structure

```
├── main.js                 # Electron main process
├── preload.js              # IPC bridge dan security
├── renderer/
│   ├── renderer.js         # UI logic dan state management
│   ├── index.html          # Main UI template
│   ├── style.css           # Styling dan themes
│   └── md.worker.js  # Markdown processing worker
├── backend/
│   ├── langchain-service.js    # AI orchestration
│   ├── langchain-agents.js     # Multi-agent system
│   ├── web-search.js           # Web search integration
│   ├── desktop-search-engine.js # Local search
│   ├── file-summarizer.js      # File processing
│   └── local-embedding-engine.js # TF-IDF embeddings
├── utils/
│   └── logger.js           # Logging system
└── public/                 # Static assets
```

### Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

---

## 📄 License

**Clustrix AI Platform** adalah software open-source yang didistribusikan di bawah lisensi MIT.

---

## 🙏 Acknowledgments

- **Electron**: Desktop application framework
- **LangChain**: AI orchestration framework
- **OpenRouter**: Multi-model AI platform
- **SerpAPI**: Web search API
- **MathJax**: Mathematical rendering
- **Prism.js**: Code syntax highlighting
- **Perfect Scrollbar**: Custom scrollbar implementation

---

*Built with ❤️ for the AI-powered future*

---

## Isi

* [Fitur Utama](#fitur-utama)
* [Instalasi & Menjalankan](#instalasi--menjalankan)
* [Konfigurasi Model (Switch Model)](#konfigurasi-model-switch-model)
* [Generator Judul (Title Generator)](#generator-judul-title-generator)
* [Penyimpanan Data](#penyimpanan-data)
* [Perilaku UI: Continue Placeholder](#perilaku-ui-continue-placeholder)
* [Provider & Base URL](#provider--base-url)
* [Menambah Model Baru](#menambah-model-baru)
* [Troubleshooting](#troubleshooting)

---

## Fitur Utama

* **Multi-Provider Switch**
  Ganti platform & model lewat **Personalization → Switch Model**:

  * **OpenRouter** (beragam model free/paid)
  * **Groq**
  * **Gemini**
  * **Z AI**
  * **Custom (OpenAI-style)**

* **Per-Provider Credentials**
  Setiap provider punya **Base URL** dan **API Key** sendiri. Key **tidak disembunyikan** (plain text) untuk memudahkan debug lokal.

* **Label & Catatan per Model**

  * Header menampilkan **label** (ringkas) alih-alih ID panjang.
  * Di modal, kamu bisa set **Label** dan **Note**. Note tampil otomatis di bawah pilihan model dan berubah saat model diganti.

* **Title Generator Model**
  Pilih model khusus untuk pembuat judul via dropdown **“Model for Title Generator”** dengan opsi:

  * **Default (using current model)**, atau
  * Pilih model tertentu (mis. **DeepSeek v3.1** atau **GPT-OSS 120B**).

* **Streaming Stabil**
  Mendukung aliran token real-time. *Free Model Endpoint* bisa diaktifkan (jika tersedia) untuk akses model gratis yang mendukung stream.

* **Continue Placeholder UX**
  Saat respons terlihat terputus, muncul banner **di atas** tombol aksi:

  * Tombol **Continue** & **Close**
  * **Auto-hide 5 detik**

---

## Instalasi & Menjalankan

### Prasyarat

* **Node.js** ≥ 18
* **npm** atau **pnpm/yarn**
* OS: Windows / macOS / Linux

### Setup Cepat

```bash
# 1) install deps
npm install

# 2) jalankan (dev)
npm run dev
# atau
npx electron .

# 3) build (opsional)
npm run build
# atau electron-builder jika disiapkan:
npx electron-builder
```

> Script build/dev bisa berbeda tergantung `package.json` milikmu.

---

## Konfigurasi Model (Switch Model)

Buka **Personalization → Switch Model**. Form berisi:

* **Platform**: OpenRouter / Groq / Gemini / Z AI / Custom
* **Model**: pilih dari list provider, atau isi manual (jika diaktifkan)
* **Base URL**: endpoint API (per provider berbeda)
* **API Key**: kunci akses (per provider, tidak disembunyikan)
* **Label tampilan**: nama pendek untuk header (mis. `Deepseek v3.1`)
* **Catatan**: deskripsi singkat (mis. `Model pintar, dan cepat`)

**Penyimpanan**: setiap platform menyimpan **Base URL**, **API Key**, dan **list model** masing-masing. Saat kamu ganti platform, field akan **ikut berubah** ke kredensial platform tersebut.

**Tips**

* Pakai **Reset Defaults** untuk mengembalikan seed bawaan.
* Untuk model yang baru muncul/berubah status free, cukup **ketik manual ID** lalu **Save**. Model akan di-append ke daftar provider.

---

## Generator Judul (Title Generator)

Di bagian bawah modal **Switch Model** terdapat:

* **Model for Title Generator**:

  * **Default (using current model)** → judul dibuat oleh model yang sama dengan chat aktif.
  * Atau pilih model tertentu (mis. **DeepSeek v3.1**, **GPT-OSS 120B**).

> Ini mempercepat pembuatan judul dengan model yang lebih murah/cepat tanpa mengganggu model utama chat.

---

## Penyimpanan Data

* **Models config**:
  `${userData}/ai-model.conf.json`
  Menyimpan platform aktif, model aktif, base URL, API key, daftar model per provider (beserta label & note).

* **Sessions/riwayat chat**:
  `${userData}/chat_data.json` (sesuai implementasi aplikasi)

* **Debug mirror**:
  **localStorage** juga menyimpan cermin konfigurasi (untuk debugging cepat).

> `userData` Electron (Windows contoh):
> `C:\Users\<nama>\AppData\Roaming\<NamaApp>\`

---

## Perilaku UI: Continue Placeholder

Jika model tidak mengirim end-indicator/stream berhenti tiba-tiba, UI menampilkan **placeholder**:

* Letak **di atas** tombol **Copy / Regenerate**
* Tombol **Continue** (mengirimkan prompt `continue`) dan **Close**
* **Otomatis hilang setelah 5 detik**

Kamu tetap bisa lanjutkan chat atau menutup banner jika tidak diperlukan.

---

## Provider & Base URL

Contoh base URL standar (ubah sesuai kebutuhan):

* **OpenRouter**: `https://openrouter.ai/api/v1`
* **Groq**: `https://api.groq.com/openai/v1`
* **Gemini**: `https://generativelanguage.googleapis.com/v1beta`
* **Z AI**: `https://api.z.ai/api/paas/v4/`
* **Custom (OpenAI-style)**: isi sendiri (wajib dukung `POST /chat/completions`)

> **Catatan**: Status **free** model sering berubah (rate limit/kuota/promosi). Kalau 429/error, coba model lain yang free.

---

## Menambah Model Baru

### Cara 1 — Lewat UI (disarankan)

1. Buka **Switch Model**.
2. Pilih **Platform**.
3. (Opsional) Centang “manual model ID” lalu **ketik ID** (mis. `deepseek/deepseek-chat-v3.1:free`).
4. Isi **Label** dan **Catatan**.
5. **Save**. Model akan otomatis ditambahkan ke daftar provider tersebut.

### Cara 2 — Hardcode Default Seed (opsional untuk developer)

* Tambahkan ke fungsi **`defaultModels()`** (renderer) dan **`defaultModelsConf()`** (main) di bagian `providers.<platform>.models`.
* Gunakan format objek:

  ```json
  { "id": "deepseek/deepseek-chat-v3.1:free", "label": "Deepseek v3.1", "note": "Model pintar, dan cepat" }
  ```
* Tekan **Reset Defaults** di aplikasi untuk menerapkan seed baru pada instalasi yang sudah punya config.

---

## Troubleshooting

### “Response Interrupted”

* Penyebab umum:

  * Model free **rate-limited** / habis kuota sementara.
  * Provider mengubah perilaku stream.
* Solusi:

  * Klik **Continue** pada placeholder, atau **Switch Model** ke kandidat lain yang free.
  * Pastikan **Free Model Endpoint** sudah aktif (jika memakai integrasi itu).

### Judul error “invalid model id”

* Biasanya terjadi saat **Title Generator** menembak provider A dengan **model milik provider B**.
* Buka **Switch Model → Model for Title Generator**:

  * Pilih **Default (using current model)**, atau
  * Pilih model yang **valid** di provider tersebut.

### Dropdown “Model for Title Generator” kosong

* Pastikan fungsi pengisi opsi dipanggil saat modal dibuka & platform diganti.
* Normalisasi daftar model ke `{ id, label, note }`.
* Cek `models-conf` di localStorage/file apakah list model memang ada.

### Tidak ada output / sangat lambat

* Model free bisa padat. Ganti ke model lain (DeepSeek v3 / GPT-OSS 120B / Llama 3.\*).
* Cek koneksi; coba ulang prompt yang sama.

### Reset total konfigurasi

* Hapus `${userData}/ai-model.conf.json`, lalu jalankan aplikasi lagi.
* Atau gunakan tombol **Reset Defaults** di modal.

---

### Kredit

* App desktop: **Electron**
* Model & API: **OpenRouter / Groq / Gemini / Z AI / Custom OpenAI-style**
* UX: model label & notes, title-gen selector, continue placeholder.
