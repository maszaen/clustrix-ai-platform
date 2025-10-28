/**
 * Markdown Test Mode Module
 * Extracted from renderer.js - 99% exact code
 * Debug mode for testing markdown rendering
 */

(function() {
  'use strict';

  const DEBUG_MARKDOWN = false;
  const LOGGING = true;

  const MARKDOWN_TEST_SESSION_TYPE = "markdown-test";
  const MARKDOWN_TEST_TITLE = "Markdown Test Session";
  const MARKDOWN_TEST_PROMPT = "[MARKDOWN TEST]";
  const MARKDOWN_TEST_MODEL_INFO = Object.freeze({
    provider: "local",
    model: "markdown-test",
    label: "Markdown Test",
  });

  const DEFAULT_MARKDOWN_TEST_TEMPLATE = Object.freeze({
    think:
      "Tidak ada isi form. Tampilkan contoh markdown bawaan agar renderer dapat diperiksa.",
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
    const text = typeof rawInput === "string" ? rawInput.replace(/\r\n/g, "\n") : "";
    const trimmed = text.trim();

    if (!trimmed) {
      return DEFAULT_MARKDOWN_TEST_TEMPLATE;
    }

    return {
      think:
        "Salin isi form ke balasan markdown agar mudah diverifikasi secara lokal tanpa request eksternal.",
      response: text,
    };
  }

  function isMarkdownTestSession(session) {
    return session && session.type === MARKDOWN_TEST_SESSION_TYPE;
  }

  function startMarkdownTestFromWelcome() {
    const msgCentral = $("#msg-central");
    if (!msgCentral) return;

    const userInput = msgCentral.value.trim();
    const scenario = buildMarkdownTestScenario(userInput);

    const testSession = {
      id: `md-test-${Date.now()}`,
      type: MARKDOWN_TEST_SESSION_TYPE,
      name: MARKDOWN_TEST_TITLE,
      messages: [
        {
          role: "user",
          content: MARKDOWN_TEST_PROMPT,
          timestamp: new Date().toISOString(),
        },
      ],
      model: MARKDOWN_TEST_MODEL_INFO,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    state.sessions.unshift(testSession);
    setCurrent(testSession);

    msgCentral.value = "";
    showChatPage();

    setTimeout(() => {
      runMarkdownTestTurn(testSession, scenario);
    }, 50);
  }

  function runMarkdownTestTurn(session, scenario) {
    if (!session || !scenario) return;

    const aiIndex = session.messages.length;
    const aiMsg = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      thinking: scenario.think || "",
    };

    session.messages.push(aiMsg);
    session.updated_at = new Date().toISOString();

    const aiNode = addMessage(
      "ai",
      "",
      aiIndex,
      aiMsg.timestamp,
      session.model || MARKDOWN_TEST_MODEL_INFO
    );

    if (!aiNode) return;

    if (aiMsg.thinking) {
      ensureThinkingUI(aiNode);
      if (aiNode._thinkingEl) {
        aiNode._thinkingEl.text.textContent = aiMsg.thinking;
      }
    }

    streamMarkdownTestResponse(session, aiNode, aiIndex, scenario.response);
  }

  function streamMarkdownTestResponse(session, aiNode, aiIndex, fullResponse) {
    const chunkSize = 8;
    const delayMs = 20;
    let offset = 0;

    const contentDiv = aiNode.querySelector(".message-text");
    if (!contentDiv) return;

    const timer = setInterval(async () => {
      if (offset >= fullResponse.length) {
        clearInterval(timer);

        session.messages[aiIndex].content = fullResponse;
        session.updated_at = new Date().toISOString();

        if (aiNode._thinkingEl) {
          finalizeThinkingUI(aiNode, 1500);
        }

        saveToFile();
        return;
      }

      const end = Math.min(offset + chunkSize, fullResponse.length);
      const slice = fullResponse.slice(0, end);
      offset = end;

      session.messages[aiIndex].content = slice;

      try {
        const html = await md(slice, { isStreaming: true });
        contentDiv.innerHTML = html;

        if (contentDiv.querySelector("pre code")) {
          highlightAllUnder(contentDiv);
        }

        scrollToBottomSmooth();
      } catch (err) {
        log("MARKDOWN_TEST", 3, "streamMarkdownTestResponse", "Render error", {
          error: err.message,
        });
      }
    }, delayMs);
  }

  // Export to global window object
  window.DEBUG_MARKDOWN = DEBUG_MARKDOWN;
  window.LOGGING = LOGGING;
  window.MARKDOWN_TEST_SESSION_TYPE = MARKDOWN_TEST_SESSION_TYPE;
  window.MARKDOWN_TEST_TITLE = MARKDOWN_TEST_TITLE;
  window.MARKDOWN_TEST_PROMPT = MARKDOWN_TEST_PROMPT;
  window.MARKDOWN_TEST_MODEL_INFO = MARKDOWN_TEST_MODEL_INFO;
  window.DEFAULT_MARKDOWN_TEST_TEMPLATE = DEFAULT_MARKDOWN_TEST_TEMPLATE;
  window.buildMarkdownTestScenario = buildMarkdownTestScenario;
  window.isMarkdownTestSession = isMarkdownTestSession;
  window.startMarkdownTestFromWelcome = startMarkdownTestFromWelcome;
  window.runMarkdownTestTurn = runMarkdownTestTurn;
  window.streamMarkdownTestResponse = streamMarkdownTestResponse;
})();
