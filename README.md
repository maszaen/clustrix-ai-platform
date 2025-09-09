# ZenAI Desktop

Aplikasi chat AI berbasis **Electron** dengan dukungan **multi-provider**, **streaming**, dan **Switch Model** yang fleksibel (OpenRouter, Groq, Gemini, Z AI, dan Custom). Fokus ke kecepatan, kemudahan debug, serta *power-user features* untuk main di ekosistem **free models**.

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
