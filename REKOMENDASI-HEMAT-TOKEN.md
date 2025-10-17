# Rekomendasi Hemat Token untuk RE+ACT Agent

Berdasarkan analisis mendalam terhadap planning-hemat-token.md dan codebase yang ada, berikut adalah rekomendasi implementasi untuk mengurangi pemborosan token di project sessions.

---

## 1. **Hindari Panggilan API Perantara yang Diabaikan** ⭐⭐⭐

### Masalah
- Setelah setiap aksi (Aksi 1, 2, dll), sistem memanggil LLM untuk mendapatkan response, tetapi response tersebut **diabaikan** dan tidak mempengaruhi langkah berikutnya
- Sistem tetap melanjutkan dengan rencana awal, sehingga token `completion` dari response tersebut terbuang sia-sia
- Contoh: Response setelah Aksi 1 menggunakan 1.706 completion_tokens tapi outputnya tidak digunakan

### Solusi
Hapus panggilan API perantara yang tidak mengubah flow eksekusi. Di `reasoning-action-agent.js` line ~280-295:

**Saat ini:**
```javascript
// Setelah setiap action, system memanggil LLM untuk "followup"
const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, index);
const followupResult = await this.makeAIRequest(followupPrompt, sessionId);
// Tapi hasilnya tidak digunakan untuk memengaruhi rencana berikutnya!
```

**Rekomendasi:**
- **Jika rencana sudah final (tidak ada branch logic):** Langsung lanjutkan ke aksi berikutnya tanpa panggilan LLM perantara
- **Jika perlu evaluasi:** Hanya panggil LLM jika:
  - Aksi gagal (resultCount === 0), ATAU
  - Ada indikasi bahwa rencana perlu disesuaikan
  
**Implementasi:**
```javascript
// Hanya panggil followup jika diperlukan adaptasi
const shouldCallFollowup = actionResult.resultCount === 0 || 
                          actionResult.requiresFollowup === true;

if (shouldCallFollowup) {
  const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, index);
  const followupResult = await this.makeAIRequest(followupPrompt, sessionId);
  // Gunakan hasil untuk adaptasi rencana
  const adaptedPlan = this.parseFollowupResponse(followupResult);
  // Update rencana dengan hasil evaluasi
}
```

**Estimasi Penghematan:** ~40-50% pengurangan completion_tokens dari panggilan perantara

---

## 2. **Ringkas Hasil Pencarian Sebelum Sintesis Akhir** ⭐⭐⭐

### Masalah
- Prompt sintesis akhir menggabungkan **semua hasil mentah** dari keempat webSearch menjadi satu prompt raksasa (10.223 karakter)
- Ini adalah metode "stuffing" yang sangat mahal untuk `prompt_tokens` (mencatat 3.028 prompt_tokens hanya untuk satu call)
- Semua snippet, URL, dan teks raw di-include tanpa filtering atau ringkasan awal

### Solusi
Implementasikan **2-tier summarization** di `reasoning-action-agent.js`:

**Tier 1: Per-Action Summarization** (setelah setiap aksi selesai)
```javascript
// Di executeAction atau setelah actionResult diterima
if (actionResult.success && actionResult.resultCount > 5) {
  const summary = await this.summarizeActionResults(actionResult);
  // Simpan ringkasan, bukan raw results
  sessionState.actionHistory[index].summary = summary;
  sessionState.actionHistory[index].resultCount = actionResult.resultCount;
  // Hapus raw results untuk hemat memory
  delete sessionState.actionHistory[index].results;
}
```

**Tier 2: Synthesis dengan Ringkasan** (bukan raw data)
```javascript
// Di buildSynthesisPrompt atau sebelum memanggil synthesis LLM
const summaries = actionHistory.map(entry => 
  entry.summary ? `Action ${entry.action.type}: ${entry.summary}` 
                 : `Action ${entry.action.type}: (no results)`
).join('\n\n');

// Gunakan summaries ini di prompt, bukan raw results
const synthesisPrompt = `Based on these research summaries:
${summaries}

Answer the user query comprehensively...`;
```

**Estimasi Penghematan:** ~60-70% pengurangan prompt_tokens di synthesis call

---

## 3. **Optimalkan System Prompt - Cache & Reuse** ⭐⭐

### Masalah
- Setiap panggilan LLM mengirim blok CRITICAL INSTRUCTIONS yang sama dan panjang (2600+ karakter)
- Instruksi ini diulang untuk: planning, followup, dan synthesis calls
- Pengulangan ini menambah `prompt_tokens` secara signifikan di setiap call

### Solusi
Gunakan **prompt caching** atau **instruction deduplication**:

**Opsi A: Ekstrak Instruksi ke Variable Reusable**
```javascript
// Di class constructor atau sebagai static property
const CRITICAL_INSTRUCTIONS = `
1. REASON thoroughly about what information is required
2. PLAN a comprehensive sequence of search actions
...
`;

// Reuse di semua prompt builder methods
buildReasoningPrompt(userQuery, sessionState) {
  return `...
CRITICAL INSTRUCTIONS:
${CRITICAL_INSTRUCTIONS}
...`;
}

buildFollowupPrompt(action, actionResult, plan, index) {
  return `...
CRITICAL INSTRUCTIONS:
${CRITICAL_INSTRUCTIONS}
...`;
}
```

**Opsi B: Gunakan Sistem Prompt LLM (Jika API Mendukung)**
- Beberapa API (OpenAI, dll) memungkinkan "system prompt" yang di-cache dan dimahalkan lebih murah
- Pindahkan CRITICAL_INSTRUCTIONS ke `system` role di message array, jangan di `user` prompt

**Implementasi di makeAIRequest:**
```javascript
const messages = [
  {
    role: 'system',
    content: CRITICAL_INSTRUCTIONS + '\n\nYou are an autonomous research agent...'
  },
  {
    role: 'user',
    content: prompt // hanya prompt spesifik untuk call ini
  },
  // + conversation history
];
```

**Estimasi Penghematan:** ~20-30% pengurangan prompt_tokens dari deduplikasi instruksi

---

## 4. **Kontrol Output Model untuk Tugas Sederhana** ⭐

### Masalah
- Saat pembuatan judul, model menghasilkan `reasoning_content` yang sangat panjang (1.603 completion_tokens)
- Reasoning internal ini tidak diperlukan untuk output akhir (hanya perlu judul 3-5 kata)
- Prompt tidak memberi instruksi untuk "singkat dan langsung"

### Solusi
Tambahkan explicit brevity instructions di prompt untuk tugas-tugas sederhana:

**Current (buildReasoningPrompt):**
```javascript
"Respond with this exact template:
REASONING: [Your comprehensive thought process...]
PLAN:
1. ACTION: <toolName> with {...}
   WHY: <reason>
...";
```

**Improved:**
```javascript
"Respond with this exact template (BE CONCISE):
REASONING: [Max 200 chars - only key information needed to justify the plan]
PLAN:
1. ACTION: <toolName> with {...}
   WHY: [One sentence only]
...

IMPORTANT: This is a PLANNING phase, not final analysis. Keep responses brief.";
```

**Untuk Title Creation:**
```javascript
// Tambah explicit constraint
"Generate EXACTLY ONE title (3-7 words max). No reasoning, no explanation. Just the title.";
```

**Estimasi Penghematan:** ~25-40% pengurangan completion_tokens untuk tugas sederhana

---

## 5. **Implementasi Action Priority & Early Stopping** ⭐⭐

### Masalah
- Sistem mengeksekusi semua 4 actions regardless, bahkan jika sudah dapat enough information
- Tidak ada early stopping mechanism
- Semua results dijadwalkan tanpa evaluasi apakah sudah cukup untuk menjawab

### Solusi
Tambahkan quality evaluation antara actions:

**Di processWithReasoningAction, sebelum loop actions:**
```javascript
const MAX_ACTIONS_DEFAULT = 4;
let actualMaxActions = MAX_ACTIONS_DEFAULT;

// Jika data sudah cukup dari action pertama/kedua
for (let index = 0; index < plan.actions.length && totalActionsExecuted < actualMaxActions; index++) {
  const action = plan.actions[index];
  const actionResult = await this.executeAction(action, sessionId);
  
  // Evaluasi: apakah sudah cukup?
  const totalDataGathered = sessionState.actionHistory.reduce((sum, h) => 
    sum + (h.result?.resultCount || 0), 0
  );
  
  if (index === 1 && totalDataGathered > 100) {
    // Hasil sudah sangat baik setelah 2 actions
    log(`Early stopping: ${totalDataGathered} results gathered, sufficient for quality answer`);
    actualMaxActions = index + 1;
    break;
  }
}
```

**Estimasi Penghematan:** ~25-35% pengurangan dari fewer total API calls

---

## 6. **Batch Similar Searches di Single Prompt** ⭐

### Masalah
- Setiap search adalah API call terpisah, meski bisa di-batch
- Contoh: "berita teknologi Indonesia" dan "Indonesia technology trends" bisa di-batch dalam satu evaluation

### Solusi
Jika model mendukung, batch 2-3 similar searches dalam satu prompt:

```javascript
// Instead of 4 separate webSearch actions
// Create grouped search batch
[
  {
    type: 'batch-search',
    params: {
      searches: [
        { query: "berita teknologi Indonesia terbaru Oktober 2025", maxResults: 10 },
        { query: "Indonesia technology trends 2025 digital transformation", maxResults: 8 }
      ]
    },
    reason: 'Gather technology trends from both local and global perspectives'
  },
  {
    type: 'batch-search',
    params: {
      searches: [
        { query: "politik Indonesia terbaru 2025 pemilu kebijakan", maxResults: 10 },
        { query: "Indonesia political analysis 2025 government economy", maxResults: 8 }
      ]
    },
    reason: 'Gather political analysis from multiple angles'
  }
]
```

**Estimasi Penghematan:** ~40-50% pengurangan jumlah API calls (dari 4 menjadi 2)

---

## Rangkuman & Prioritas Implementasi

| Rekomendasi | Dampak Token | Kompleksitas | Prioritas |
|---|---|---|---|
| 1. Hindari Panggilan Perantara Diabaikan | 40-50% ⭐⭐⭐ | Medium | **CRITICAL** |
| 2. Ringkas Hasil Sebelum Sintesis | 60-70% ⭐⭐⭐ | High | **CRITICAL** |
| 3. Cache & Reuse System Prompt | 20-30% ⭐⭐ | Low | High |
| 4. Kontrol Output untuk Tugas Sederhana | 25-40% ⭐ | Low | Medium |
| 5. Early Stopping Mechanism | 25-35% ⭐⭐ | Medium | High |
| 6. Batch Similar Searches | 40-50% ⭐ | Medium | Medium |

### Rekomendasi Urutan Implementasi:
1. **Tahap 1 (Prioritas CRITICAL):** #1 + #2 = Potensial 100-120% penghematan
2. **Tahap 2 (High Impact):** #3 + #5 = Potensial 45-65% penghematan tambahan
3. **Tahap 3 (Optimasi):** #4 + #6 = Potensial 65-90% penghematan tambahan

---

## Kode Implementasi Quick Start

Untuk memulai, tambahkan di `reasoning-action-agent.js`:

```javascript
// 1. Cek apakah followup diperlukan
async shouldCallFollowupEvaluation(actionResult, actionIndex, totalResults) {
  return actionResult.resultCount === 0 || 
         (actionIndex === plan.actions.length - 1 && totalResults < 30);
}

// 2. Ringkas hasil action
async summarizeActionResults(actionResult) {
  // Gunakan local summarization atau simple aggregation
  const snippets = actionResult.results
    .slice(0, 5) // Top 5 results
    .map(r => `- ${r.fileName}: ${r.context.substring(0, 150)}`)
    .join('\n');
  
  return `Found ${actionResult.resultCount} results:\n${snippets}`;
}

// 3. Evaluasi early stopping
shouldStopEarly(actionIndex, totalResults, plan) {
  return actionIndex >= 1 && totalResults > 100;
}
```

---

## Expected Hasil Setelah Implementasi

Berdasarkan analisis:
- **Before:** 24.832 tokens (16.825 input + 8.007 output)
- **After (dengan semua rekomendasi):** ~10-12 tokens (~60% pengurangan)

**Breakdown penghematan:**
- Eliminasi panggilan perantara: -45% completion_tokens
- Ringkasan sebelum synthesis: -65% prompt_tokens di synthesis call
- Deduplikasi instruksi: -25% prompt_tokens
- Early stopping: -30% total API calls
- Output control: -30% untuk tugas sederhana

**Total: 60-70% pengurangan total token cost** ✅
