'use strict';

const globalWindow = typeof window !== 'undefined' ? window : {};

const SESSIONS_PER_PAGE = 70;
const DEBUG_MODE = typeof globalWindow.api === 'undefined';
const THINKING_TIMER = new WeakMap();

const MARKDOWN_TEST_SESSION_TYPE = 'markdown-test';
const MARKDOWN_TEST_TITLE = 'Markdown Test Session';
const MARKDOWN_TEST_PROMPT = '[MARKDOWN TEST]';
const MARKDOWN_TEST_MODEL_INFO = Object.freeze({
  provider: 'local',
  model: 'markdown-test',
  label: 'Markdown Test',
});

const DEFAULT_MARKDOWN_TEST_TEMPLATE = Object.freeze({
  think:
    'Tidak ada isi form. Tampilkan contoh markdown bawaan agar renderer dapat diperiksa.',
  response: `## Markdown Showcase

Berikut contoh elemen markdown umum:

- **Teks tebal** dan _teks miring_
- Daftar bernomor:
  1. Langkah pertama
  2. Langkah kedua dengan tautan [Clustrix](https://example.com)
- Kutipan blok untuk catatan penting.

> Markdown membantu menjaga struktur jawaban.

### Potongan kode

\`\`\`js
function greet(name) {
  return \`Halo, \${name}!\`;
}
console.log(greet("Markdown Test"));
\`\`\`

| Komponen | Status |
| --- | --- |
| Heading | ✅ |
| List | ✅ |
| Code block | ✅ |

Tambahkan juga rumus inline seperti $E = mc^2$ dan teks akhir yang ringkas.
`,
});

const ICONS = {
  code: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
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
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
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
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
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
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
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
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
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
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-question-mark-icon lucide-file-question-mark">
  <path d="M12 17h.01"/>
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>
  <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/>
</svg>
</div>`.trim(),
};

const EXT_GROUPS = {
  spreadsheet: new Set(['xlsx', 'xls', 'csv', 'tsv']),
  terminal: new Set(['sh', 'bash', 'zsh', 'ksh', 'bat', 'cmd', 'ps1']),
  text: new Set(['txt', 'md', 'rtf', 'docx']),
  code: new Set([
    'js',
    'ts',
    'tsx',
    'jsx',
    'java',
    'py',
    'go',
    'rs',
    'rb',
    'php',
    'c',
    'cpp',
    'cs',
    'kt',
    'swift',
    'html',
    'css',
    'scss',
    'less',
    'xml',
    'yaml',
    'yml',
    'toml',
    'ini',
    'properties',
    'conf',
  ]),
};

module.exports = {
  DEBUG_MODE,
  DEFAULT_MARKDOWN_TEST_TEMPLATE,
  EXT_GROUPS,
  ICONS,
  MARKDOWN_TEST_MODEL_INFO,
  MARKDOWN_TEST_PROMPT,
  MARKDOWN_TEST_SESSION_TYPE,
  MARKDOWN_TEST_TITLE,
  SESSIONS_PER_PAGE,
  THINKING_TIMER,
};
