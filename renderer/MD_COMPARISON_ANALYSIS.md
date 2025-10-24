# Perbandingan md.js vs md.worker.js

## Ringkasan
Kedua file memiliki logika parsing markdown yang sama, namun `md.worker.js` memiliki beberapa perbedaan penting yang bisa menyebabkan inkonsistensi rendering antara mode streaming dan non-streaming.

## Fungsi Utama yang Sama
- ✅ **enhancedMarkdownParse()** - Fungsi parsing utama (identik)
- ✅ **parseInlineMarkdown()** - Parsing inline markdown (hampir identik, ada 1 masalah)
- ✅ **processMarkdownFormatting()** - Format text processing (identik)
- ✅ Container tags (`<clarify>`, `<try>`)
- ✅ Code block handling dengan syntax highlighting
- ✅ List nesting support
- ✅ Blockquote parsing
- ✅ Table rendering

## Perbedaan Kunci

### 1. **Link Parsing Issue** ⚠️ PENTING
**md.js:**
```javascript
function parseInlineMarkdown(text) {
  // Parse links BEFORE HTML escaping to handle parentheses in URLs
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let processedText = text.replace(linkRegex, `<a href="$2"...>`);
  
  let html = processedText.replaceAll("&", "&amp;")...
```

**md.worker.js:**
```javascript
function parseInlineMarkdown(text) {
  let processedText = text.replace(/<br\s*\/?>/gi, "__BR_TAG__");
  
  // Parse links BEFORE HTML escaping to handle parentheses in URLs
  // processedText = parseMarkdownLinks(processedText); // ⚠️ COMMENTED OUT!
  
  let html = processedText.replaceAll("&", "&amp;")...
```

**Masalah:** Di md.worker.js, parsing link sebelum HTML escaping dikomentari. Ini bisa menyebabkan URL dengan karakter khusus (terutama tanda kurung) tidak di-parse dengan benar saat streaming.

### 2. **Fungsi DOM yang Hilang** (Normal untuk Worker)
**md.js memiliki:**
- `md()` - Entry point utama dengan DOM manipulation
- `mdThinking()` - Untuk thinking text rendering
- `addPHasListClass()` - Manipulasi DOM untuk menambah class
- `highlightAllUnder()` - Apply syntax highlighting (memerlukan DOM)
- `attachCodeBlockListeners()` - Event listeners untuk copy/save buttons
- `updateCodeBlocksWithArtifactInfo()` - Update artifact info (async)

**md.worker.js memiliki:**
- `renderMarkdown()` - Wrapper untuk worker
- `ensureRenderer()` - Singleton pattern untuk renderer
- `preprocessMarkdownSource()` / `restoreLatexPlaceholders()` - LaTeX handling
- `postRenderAdjustments()` - Post-processing adjustments
- `trimEndMarker()` - Remove end markers
- `handleUpdate()` - Streaming update handler
- `addPHasListClass()` - Versi regex (non-DOM)

### 3. **addPHasListClass Implementation**
**md.js (DOM-based):**
```javascript
function addPHasListClass(container) {
  const pTags = container.querySelectorAll('p');
  pTags.forEach(p => {
    const nextElement = p.nextElementSibling;
    if (nextElement && (nextElement.tagName === 'UL' || nextElement.tagName === 'OL')) {
      p.classList.add('p-has-li');
    }
  });
}
```

**md.worker.js (Regex-based):**
```javascript
function addPHasListClass(html) {
  return html.replace(/<p(\s+class="([^"]*)")?>([\s\S]*?)<\/p>(\s*)(<(?:ul|ol)(?:\s[^>]*)?>)/gi, 
    (match, classAttr, existingClass, content, whitespace, listTag) => {
      // Add p-has-li class via string manipulation
    });
}
```

### 4. **Import Handling**
**md.js:** Assumes highlight.js tersedia secara global
**md.worker.js:** Menggunakan `self.importScripts()` untuk load highlight.js

## Rekomendasi Perbaikan

### 1. **Fix Link Parsing di md.worker.js** 🔴 CRITICAL
Uncomment dan implementasikan link parsing yang benar:
```javascript
function parseInlineMarkdown(text) {
  // ... existing code ...
  
  // Parse links BEFORE HTML escaping to handle parentheses in URLs
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let processedText = text.replace(linkRegex, `<a href="$2" target="_blank" rel="noopener noreferrer" class="link">$1${BROWSER_ICON}</a>`);
  
  // Continue with HTML escaping
  let html = processedText.replaceAll("&", "&amp;")...
```

### 2. **Sinkronisasi processMarkdownFormatting**
Pastikan fungsi `processMarkdownFormatting` juga memproses links dengan benar sebelum HTML escaping (sama seperti di md.js).

### 3. **Testing Recommendations**
Buat test cases untuk memastikan konsistensi:
```javascript
// Test cases yang perlu dicek
const testCases = [
  // URLs dengan parentheses
  "[Wikipedia](https://en.wikipedia.org/wiki/Markdown_(markup_language))",
  
  // Nested lists dengan code blocks
  "- Item 1\n  ```js\n  code\n  ```\n- Item 2",
  
  // Blockquotes dengan tables
  "> | Header |\n> |--------|\n> | Cell   |",
  
  // Container tags
  "<clarify>Clarification content</clarify>",
  "<try>Try this prompt</try>"
];
```

### 4. **Pertimbangkan Shared Module**
Untuk menghindari duplikasi dan inkonsistensi, pertimbangkan:
```javascript
// shared-markdown-core.js
export const enhancedMarkdownParse = ...
export const parseInlineMarkdown = ...
export const processMarkdownFormatting = ...

// md.js
import { enhancedMarkdownParse, ... } from './shared-markdown-core.js';

// md.worker.js
importScripts('./shared-markdown-core.js');
```

## Kesimpulan
Perbedaan utama yang perlu diperbaiki adalah:
1. ~~**Link parsing yang dikomentari di md.worker.js**~~ ✅ **FIXED** - Sudah diimplementasikan dengan placeholder system
2. **Pastikan kedua file selalu sinkron** ✅ **DONE** - Kedua file sekarang memiliki logic yang sama

Fungsi DOM yang berbeda adalah normal dan expected karena worker tidak memiliki akses DOM. Yang penting adalah memastikan output HTML yang dihasilkan konsisten antara kedua implementasi.

## Update: Perbaikan Telah Dilakukan ✅

### Fitur Baru yang Ditambahkan:
1. **Email Link Support** - `[text](mailto:email@example.com)` dengan icon email khusus
2. **Improved Image Alt Text** - Alt text yang proper dengan fallback "Image"
3. **Lazy Loading** - Images sekarang menggunakan `loading="lazy"` untuk performa
4. **Placeholder System** - Mencegah konflik dengan HTML escaping

### File yang Diubah:
- ✅ `renderer/md.worker.js` - Fixed dan ditambahkan fitur baru
- ✅ `local_modules/custom-formatter/md.js` - Fixed dan ditambahkan fitur baru

Lihat `MARKDOWN_FIX_SUMMARY.md` untuk detail lengkap perbaikan.
