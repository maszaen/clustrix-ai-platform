'use strict';

const { nowISO } = require('../../utils/formatters');
const { createLogger } = require('../../utils/logger');

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

function buildMarkdownTestScenario(rawInput) {
  const text =
    typeof rawInput === 'string' ? rawInput.replace(/\r\n/g, '\n') : '';
  const trimmed = text.trim();

  if (!trimmed) {
    return DEFAULT_MARKDOWN_TEST_TEMPLATE;
  }

  return {
    think:
      'Salin isi form ke balasan markdown agar mudah diverifikasi secara lokal tanpa request eksternal.',
    response: text,
  };
}

function isMarkdownTestSession(session) {
  return (
    !!session &&
    (session.type === MARKDOWN_TEST_SESSION_TYPE ||
      session.isMarkdownTest === true)
  );
}

async function runMarkdownTestTurn({
  session,
  rawInput,
  createSession,
  appendThinking,
  renderer,
  streamManager,
  logger = createLogger('MARKDOWN_TEST'),
}) {
  if (!session || !renderer || !streamManager) {
    throw new Error('runMarkdownTestTurn requires session, renderer, and streamManager');
  }

  const scenario = buildMarkdownTestScenario(rawInput);
  const streamId = `${session.id}-markdown-${Date.now()}`;

  const controller = {
    cancel() {
      streamManager.stop && streamManager.stop(streamId);
    },
  };

  streamManager.startStream?.(streamId, {
    controller,
    session,
    messageIndex: session.messages?.length || 0,
    messages: [],
    contextPrompt: MARKDOWN_TEST_PROMPT,
    fullResponse: '',
    startedAt: Date.now(),
    thinkStartTime: Date.now(),
  });

  appendThinking?.(null, scenario.think, session, session.messages?.length || 0);

  const html = await renderer.render(scenario.response, { forceSync: true });
  logger.debug('run', 'Markdown test rendered', {
    sessionId: session.id,
    htmlLength: html.length,
  });

  streamManager.completeStream?.(streamId, {
    html,
    timestamp: nowISO(),
    metadata: MARKDOWN_TEST_MODEL_INFO,
  });

  return html;
}

module.exports = {
  MARKDOWN_TEST_SESSION_TYPE,
  MARKDOWN_TEST_TITLE,
  MARKDOWN_TEST_PROMPT,
  MARKDOWN_TEST_MODEL_INFO,
  DEFAULT_MARKDOWN_TEST_TEMPLATE,
  buildMarkdownTestScenario,
  isMarkdownTestSession,
  runMarkdownTestTurn,
};
