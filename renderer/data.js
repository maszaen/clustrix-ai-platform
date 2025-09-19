const welcomeMessages = {
  pagi: [
    "Morning, [USERNAME]! What's up?",
    "Rise and grind, [USERNAME]!",
    "Good morning, [USERNAME]!",
    "Morning check-in, [USERNAME]!",
  ],
  siang: [
    "Afternoon, [USERNAME]!",
    "Hey [USERNAME], what's good?",
    "Midday check-in, [USERNAME]!",
    "Afternoon vibes, [USERNAME]!",
  ],
  sore: [
    "Evening, [USERNAME]!",
    "Good evening, [USERNAME]!",
    "Evening check-in, [USERNAME]!",
    "Hey [USERNAME], what's up?",
  ],
  malam: [
    "Night session, [USERNAME]!",
    "Evening, [USERNAME]!",
    "Late night work, [USERNAME]?",
    "Night check-in, [USERNAME]!",
  ],
  anytime: [
    "What's new, [USERNAME]?",
    "Hey there, [USERNAME]!",
    "Yo [USERNAME], what's the mission?",
    "What's poppin', [USERNAME]?",
    "Back again, [USERNAME]?",
    "Let's get it, [USERNAME]!",
    "Another day, another slay, [USERNAME]!",
    "Ready to get things done, [USERNAME]?",
  ],
};

const DEMO_RESPONSE = `# Arsitektur UI Chat Modern: Performa, Aksesibilitas, dan Skalabilitas 

Kualitas pengalaman chat bukan cuma soal "jawaban cepat". Di balik layar ada orkestrasi rendering, state, jaringan, serta strategi fallback. Berikut ringkasan keputusan arsitektural yang terbukti praktis pada aplikasi chat skala menengah–besar.

## Prioritas Performa di Lintasan Render

Sasaran utama: *responsiveness* stabil di bawah 100–150 ms untuk interaksi umum. Strategi inti:

* **Defer pekerjaan berat** ke *idle* atau *next tick*:

  * Streaming token meng-update DOM per chunk? Batasi via \`requestAnimationFrame\` atau *batching* setiap N karakter.
  * Syntax highlight: jalankan \`Prism.highlightAllUnder(container)\` **setelah** \`innerHTML\` final untuk mencegah listener hilang saat re-render.
* **Hindari layout thrash**:

  * Pakai kelas utilitas untuk show/hide (alih-alih set gaya inline berulang).
  * Kunci tinggi textarea sebelum animasi, lepas setelah transisi selesai.
* **Minimalkan repaint**:

  * Gunakan *delegasi event* pada \`document\` untuk tombol dinamis seperti \`.copy-code-btn\` dan \`.regenerate\`, sehingga tidak perlu rebind setiap render.

### Checklist mikro yang sering dilupakan

1. Cache node yang sering diakses (mis. container chat).
2. Pakai \`dataset.index\` untuk mengikat elemen ke message index.
3. Tangani kasus gagal jaringan dengan placeholder yang bisa diregenerate.

## Aksesibilitas: Small Things, Big Impact

* **Fokus & keyboard**:

  * Pastikan tombol *"Send"* dapat di-trigger \`Enter\` dan \`Space\`.
  * Escape harus menutup modal aktif terlebih dahulu, lalu menu.
* **Teks hidup (live region)**:

  * Buat SR-only status "assistant mengetik..." saat stream aktif.
* **Kontras dan tema**:

  * Pastikan minimum kontras WCAG saat dark mode.
  * Slider tema harus sinkron dengan kelas \`dark-theme\`/\`light-theme\`.

### Contoh aturan warna dasar (CSS)

\`\`\`css
/* Palet netral dengan kontras aman */
:root {
  --bg: #0b0f14;
  --panel: #121821;
  --text: #e6edf3;
  --muted: #9fb0c0;
  --accent: #4da3ff;
  --success: #3ddc97;
  --danger: #ff6b6b;
}

/* Container chat */
.chat-log-container {
  background: var(--bg);
  color: var(--text);
  overflow-y: auto;
  scrollbar-gutter: stable; /* mengurangi layout shift saat scrollbar muncul */
}

/* Tombol copy sederhana */
.copy-code-btn {
  display: inline-flex;
  gap: .5rem;
  align-items: center;
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  padding: .35rem .6rem;
  border-radius: .6rem;
  font-size: .85rem;
  cursor: pointer;
}

.copy-code-btn.copied {
  outline: 2px solid var(--success);
  outline-offset: 2px;
}
\`\`\`

## Skalabilitas State dan Stream

Arsitektur stream perlu memikirkan *cancelation*, *recovery*, dan *partial renders*.

1. **Manajemen Stream**:

   * Satu *controller* per stream; pastikan \`cancel()\` membersihkan timer/interval.
   * State \`activeStreams\` berupa map \`{ streamId: { controller, session, messageIndex, ... } }\`.

2. **Aturan interaksi**:

   * **Satu stream per sesi** untuk menghindari interleaving pesan.
   * *Regenerate* men-truncate pesan setelah indeks AI terakhir, lalu memulai stream baru.

3. **Fallback**:

   * Mode demo/latensi: gunakan interval yang mengalirkan chunk teks per 20–40 ms.
   * Kegagalan 50% progres: tampilkan UI "regenerate" non-destruktif.

### Pseudo-utility untuk stream yang aman (JS)

\`\`\`js
function withStreamBatchedRender({ onChunk, onDone, onError }) {
  let queue = '';
  let scheduled = false;

  const scheduleFlush = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (queue) { onChunk(queue); queue = ''; }
    });
  };

  return {
    handle(data) {
      if (data === null) return onDone?.();
      if (typeof data === 'string') { queue += data; scheduleFlush(); }
      else if (data?.error) onError?.(data.error);
    }
  };
}
\`\`\`

## Pola Interaksi dan UX Mikro

* **Pesan panjang** sebaiknya dipotong menjadi paragraf dengan transisi halus.
* **Copy code** memberi umpan balik visual singkat (ikon ✅ lalu kembali ke ikon 📄).
* **Welcome screen** muncul ketika belum ada sesi aktif, atau setelah pengguna menghapus semuanya.

### Hierarki tugas konten

* H1 untuk tema utama,
* H2 untuk subbagian,
* H3 untuk detail implementasi atau catatan lanjutan.

## Contoh Daftar & Penomoran

* Kapan *debounce* cocok:

  * Input pencarian sesi.
  * Resize textarea.
* Kapan *throttle* lebih pas:

  * Scroll handler pada kontainer chat.
  * Batch write untuk stream.

1. Urutan render pesan:

  1. Tambah node user (final).
  2. Sisipkan placeholder AI (non-final).
  3. Jalankan stream → update placeholder.
  4. Finalisasi: apply highlight, aktifkan aksi (copy, regenerate).

2. Urutan hapus sesi:

  1. Tampilkan konfirmasi.
  2. Hentikan stream aktif.
  3. Hapus sesi dari state.
  4. Tampilkan welcome page.

## Ringkasan Parameter Kritis

| Parameter           | Rekomendasi                       | Dampak Utama                     |
| ------------------- | --------------------------------- | -------------------------------- |
| Batch render chunk  | 16–64 karakter per frame          | Mengurangi jank saat streaming   |
| Debounce input      | 150–250 ms                        | Stabilkan pencarian & resize     |
| Kontras teks (dark) | WCAG AA/AAA                       | Keterbacaan di low light         |
| Strategi listener   | Delegasi di \`document\`            | Tahan terhadap re-render dinamis |
| Welcome state       | \`current = null\` + render welcome | UX bersih setelah "Delete all"   |

## Catatan Penutup

Keputusan kecil (delegasi event, *batching* render, tema terstandar) bikin UI chat jauh lebih tangguh. Selama rantai "input → stream → render → aksi" konsisten dan dapat dipulihkan, pengalaman pengguna bakal terasa mulus, bahkan saat jaringan lagi moody.
`;

const ICONS = {
  code: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-code-icon lucide-file-code">
  <path d="M10 12.5 8 15l2 2.5"/>
  <path d="m14 12.5 2 2.5-2 2.5"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>
</svg>
</div>`.trim(),

  text: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-text-icon lucide-file-text">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M10 9H8"/>
  <path d="M16 13H8"/>
  <path d="M16 17H8"/>
</svg>
</div>`.trim(),

  spreadsheet: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-spreadsheet-icon lucide-file-spreadsheet">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M8 13h2"/>
  <path d="M14 13h2"/>
  <path d="M8 17h2"/>
  <path d="M14 17h2"/>
</svg>
</div>`.trim(),

  terminal: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-terminal-icon lucide-file-terminal">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="m8 16 2-2-2-2"/>
  <path d="M12 18h4"/>
</svg>
</div>`.trim(),

  json: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-json-icon lucide-file-json">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/>
  <path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>
</svg>
</div>`.trim(),

  unknown: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-question-mark-icon lucide-file-question-mark">
  <path d="M12 17h.01"/>
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>
  <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/>
</svg>
</div>`.trim(),
};

const EXT_GROUPS = {
  spreadsheet: new Set(['xlsx','xls','csv','tsv']),
  terminal: new Set(['sh','bash','zsh','ksh','bat','cmd','ps1']),
  text: new Set(['txt','md','rtf','docx']),
  code: new Set([
    'js','ts','tsx','jsx','java','py','go','rs','rb','php','c','cpp','cs','kt','swift',
    'html','css','scss','less','xml','yaml','yml','toml','ini','properties','conf'
  ]),
};