# Clustrix × LangChain — Developer Guide

> Dokumen ini menjelaskan integrasi LangChain di Clustrix untuk kebutuhan RAG (Retrieval-Augmented Generation) dan multi‑agent workflow. Fokusnya: cara pakai sebagai developer, bagaimana arsitektur bekerja, dan pattern yang disarankan untuk produksi.

---

## 1) Ringkasan

Integrasi LangChain di Clustrix menyediakan:

* **Vector Store** untuk penyimpanan & pencarian konteks berbasis embedding.
* **Multi‑Agent Orchestrator** (Code Analysis, Research, Debugging, Project Management) untuk penanganan tugas kompleks.
* **Session Modes**: *regular* vs *project* (dengan persistent memory per project).
* **Enhanced File Processing**: chunking, vectorization, semantic search.
* **Token‑aware context**: limitasi konteks & relevance filtering sebelum prompt dikirim ke model.

> Outcome: request ke model hanya membawa konteks yang relevan, dengan biaya token lebih efisien, dan tetap mempertahankan memori project.

---

## 2) Arsitektur

### 2.1 Komponen

* **`langchain-service.js`** — Service utama untuk vector store, embeddings, memory project, file processing, & context generation.
* **`langchain-agents.js`** — Orkestrator multi‑agent: routing permintaan ke agent spesialis.
* **`langchain-helpers.js`** — Utilitas umum (scoring, token math, dsb.).
* **`main.js`** — Entry point aplikasi dengan hook integrasi.

### 2.2 Struktur Service (Ringkas)

```
ClustrixLangChainService
├── Vector Store (MemoryVectorStore)
├── Embeddings (OpenAI / Mock / OpenRouter)
├── Project Memory (persisted)
├── File Processing (chunking + vectorize)
└── RAG Context Generation

MultiAgentOrchestrator
├── CodeAnalysisAgent
├── ResearchAgent
├── DebuggingAgent
└── ProjectManagementAgent
```

### 2.3 Data Flow (tingkat tinggi)

1. **Upload file** → di‑chunk → di‑embed → disimpan ke **Vector Store**.
2. **User query** → semantic retrieval → **context packing** (token‑aware) → prompt.
3. **Project session** → **Agent selection** → proses spesialis + memory project.
4. **Response** → (opsional) update memori project.

---

## 3) Instalasi & Prasyarat

* **Node.js** 18+.
* **API key**: prefer **OpenAI** untuk embeddings; fallback **OpenRouter**; jika tidak tersedia, gunakan **mock embeddings** (untuk dev/testing).

> Catatan: service melakukan **lazy init** saat tidak ada API key; sistem tetap berjalan dengan mock untuk pengujian lokal.

---

## 4) Konfigurasi

### 4.1 Kredensial

Prioritas penggunaan key:

1. `OPENAI_API_KEY`
2. `OPENROUTER_API_KEY`
3. *Mock embeddings* (otomatis jika kedua key tidak tersedia)

### 4.2 Persistensi

Lokasi file (per userData):

```
${userData}/vector_data.json       // penyimpanan vector store
${userData}/project_memory.json    // memori khusus project
```

> Pastikan permission di direktori userData sudah benar sebelum menjalankan di produksi.

---

## 5) Penggunaan (API Surface)

### 5.1 Mengaktifkan Project Mode

```js
// pada objek session
session.type = 'project';
// atau
session.isProject = true;
```

Impact:

* Orchestrator mengaktifkan **multi‑agent**.
* **Persistent project memory** dibaca/ditulis untuk sesi ini.

### 5.2 Pemrosesan File → Vector Store

```js
await langchainService.processUploadedFiles(files, sessionId);
```

Yang terjadi di belakang:

* File di‑chunk → di‑embed → disimpan ke vector store.
* Metadata file disiapkan untuk semantic search.

### 5.3 Generasi Context RAG (Token‑Aware)

```js
const enhancedContext = await langchainService.generateEnhancedContext(
  query,
  sessionId,
  maxTokens // batas token untuk packing context
);
```

Perilaku:

* Semantic search + relevance scoring.
* Packing berdasarkan **batas token** dan **skor relevansi**.

### 5.4 Menjalankan Multi‑Agent Workflow

```js
const response = await agentOrchestrator.processComplexRequest(
  userQuery,
  sessionId,
  session, // termasuk flag project
  model,
  apiKey
);
```

Routing agent otomatis berdasarkan sinyal intent:

* **Code Analysis** — analisis/debug/refactor kode.
* **Research** — pengumpulan informasi, dokumentasi.
* **Debugging** — root‑cause & rekomendasi fix.
* **Project Management** — perencanaan & tracking.

---

## 6) Contoh Alur

### 6.1 Regular Chat (context enrichment non‑persisten)

```
User Query → Semantic Retrieval → Context Packing → Model Response
```

### 6.2 Project Session (persisten + multi‑agent)

```
User Query → Agent Selection → Specialized Processing → Response
              └─ File/Code Analysis + Project Memory + Vector Search
```

---

## 7) Praktik Terbaik (Production‑minded)

* **Batasi token**: selalu tentukan `maxTokens` untuk menjaga biaya dan latensi.
* **Saring konteks**: gunakan relevance score; hindari “lempar semua konten”.
* **Pisahkan memori per project**: kurangi kebocoran konteks antar proyek.
* **Monitoring**: log `isInitialized`, daftar agent aktif, serta hasil `similaritySearch()` untuk sanity‑check.
* **Idempotensi pemrosesan file**: hindari re‑embedding yang tidak perlu (gunakan checksum/mtime).

---

## 8) Debugging & Observabilitas

### 8.1 Pemeriksaan Cepat

```js
// status service
console.log(langchainService.isInitialized);

// daftar agent
console.log(agentOrchestrator.agents.map(a => a.name));

// uji vector search
const results = await langchainService.vectorStore.similaritySearch(query, 3);
```

### 8.2 Isu Umum & Solusi

**Tidak ada API key**

* Tambahkan `OPENAI_API_KEY` atau `OPENROUTER_API_KEY`.
* Untuk dev: mock embeddings tetap memungkinkan alur E2E.

**Vector store korup/bermasalah**

* Hapus `vector_data.json` lalu restart service.
* Cek permission direktori userData.

**Agent tidak merespons**

* Pastikan `session.type = 'project'`.
* Verifikasi service sudah inisialisasi.

---

## 9) Kinerja

* **Lazy init**: service tidak mem‑bootstrap penuh tanpa API key.
* **Mock embeddings**: mempercepat dev loop tanpa biaya eksternal.
* **Token‑aware chunking**: mengontrol ukuran konteks.
* **Relevance‑based filtering**: hanya konteks penting yang diikutkan.

---

## 10) Keamanan & Privasi (Ringkas)

* Simpan hanya data yang diperlukan untuk pencarian.
* Gunakan storage terisolasi per‑user/per‑project bila memungkinkan.
* Hindari memasukkan data sensitif ke prompt kecuali benar‑benar perlu.

---

## 11) Roadmap (opsional)

* Pluggable embeddings (Cohere, Voyage, local models).
* Disk‑backed vector store (mis. SQLite/FAISS) untuk skala besar.
* Policy‑based agent routing & rate‑limiting per tenant.

---

## 12) Lampiran (Snippet Referensi)

### 12.1 Menjalankan dev mode

```bash
npm run dev
```

### 12.2 Logging minimal saat init

```js
console.log('LangChain service initialized:', langchainService.isInitialized);
```

### 12.3 Menambahkan Custom Agent

```js
class CustomAgent extends BaseAgent {
  constructor(langchainService) {
    super('custom', 'Custom task handling', langchainService);
  }

  canHandle(query) {
    // return true bila agent relevan untuk query
  }

  async processRequest(query, context, sessionId) {
    // implementasi pemrosesan spesifik
  }
}
```

---

## 13) FAQ singkat

**Apa beda regular vs project session?**

* *Regular*: context enrichment sementara, tidak menyimpan memori project.
* *Project*: multi‑agent aktif, persistent memory per project.

**Apakah semua file otomatis terindeks?**

* Ya, setiap upload diproses (chunk→embed→store) dan siap untuk semantic search.

**Bisa jalan tanpa API key?**

* Bisa, untuk dev/test memakai mock embeddings (akurasi retrieval terbatas).

---

> Siap dipakai di produksi dengan pengamanan & monitoring yang tepat. Jika butuh tuning lanjut (storage alternatif, strategi packing, atau kebijakan routing agent), extend di level service dan orchestrator.
