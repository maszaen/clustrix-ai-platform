const welcomeMessages = [
  "Ready when you are. What's up?",
  "Let's untangle this. Where to start?",
  "Problem to solve, or idea to explore?",
  "Alright, let's dive in. Topic today?",
  "I'm all ears. Tell me.",
  "What's that idea stuck in your head?",
  "Need clarity or a spark?",
  "No idea's too small. Share it.",
  "Let's act on it. What's our quest?",
  "Your thoughts, my focus. Go.",
  "What's one thing to move forward?",
  "Ready to build? Start me off.",
  "Lay it on me. What's the challenge?",
  "Let's find a breakthrough. Thoughts?",
  "Circuits buzzing. What create today?",
  "How can I help right now?",
];

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