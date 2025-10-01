/*
 * markdown.worker.js
 * Offloads markdown rendering, syntax highlighting, and expensive string
 * transformations to a background thread so the renderer can stay
 * responsive during streaming updates.
 */

/* global self */

const MARKDOWN_LATEX_PLACEHOLDER_PREFIX = "¤LATEX_";
let fullResponse = "";
let markdownRendererInstance = null;

function esc(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return esc(value).replace(/`/g, "&#96;");
}

function normalizeLanguage(lang) {
  if (!lang) return "text";
  return lang.toLowerCase().replace(/[^\w+-]+/g, "");
}

function ensureRenderer() {
  if (markdownRendererInstance) return markdownRendererInstance;

  if (typeof self.importScripts === "function") {
    try {
      self.importScripts("../node_modules/markdown-it/dist/markdown-it.min.js");
    } catch (err) {
      console.warn("Failed to import markdown-it in worker", err);
    }
    try {
      self.importScripts("../local_modules/highlight/modules/highlight.min.js");
    } catch (err) {
      console.warn("Failed to import highlight.js in worker", err);
    }
  }

  const MarkdownIt = self.markdownit || self.MarkdownIt;
  if (!MarkdownIt) {
    markdownRendererInstance = {
      render: (text) => esc(text).replace(/\n/g, "<br>"),
    };
    return markdownRendererInstance;
  }

  const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
  });

  md.enable(["table", "strikethrough"]);

  const highlightCode = (code, language) => {
    const targetLanguage = normalizeLanguage(language);
    if (self.hljs && targetLanguage && self.hljs.getLanguage?.(targetLanguage)) {
      try {
        return self.hljs.highlight(code, { language: targetLanguage }).value;
      } catch (err) {
        console.warn("highlight.js failed in worker", err);
      }
    }
    return esc(code);
  };

  const renderCodeContainer = (code, info = "") => {
    const language = normalizeLanguage(info.split(/\s+/)[0] || "text");
    const normalizedCode = code.endsWith("\n") ? code.slice(0, -1) : code;
    const highlighted = highlightCode(normalizedCode, language);
    const attributeCode = escapeAttribute(normalizedCode);

    return `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="language-name">${language}</span>
          <div class="code-block-actions">
            <button class="save-code-btn" title="Save to artifacts" data-code="${attributeCode}" data-language="${language}">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
            </button>
            <button class="copy-code-btn" title="Copy code">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>
        </div>
        <pre><code class="hljs language-${language}">${highlighted}</code></pre>
      </div>`;
  };

  const originalLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));
  const originalImage =
    md.renderer.rules.image ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));
  const originalTableOpen =
    md.renderer.rules.table_open ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));
  const originalTableClose =
    md.renderer.rules.table_close ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    return renderCodeContainer(token.content || "", token.info || "");
  };
  md.renderer.rules.code_block = (tokens, idx) => {
    const token = tokens[idx];
    return renderCodeContainer(token.content || "", "");
  };

  md.renderer.rules.link_open = (tokens, idx, options, env, selfRef) => {
    const token = tokens[idx];
    const existingClass = token.attrGet("class");
    if (existingClass) {
      const parts = new Set(existingClass.split(/\s+/).filter(Boolean));
      parts.add("link");
      token.attrSet("class", Array.from(parts).join(" "));
    } else {
      token.attrSet("class", "link");
    }
    token.attrSet("target", "_blank");
    const rel = token.attrGet("rel");
    if (rel) {
      const relParts = new Set(rel.split(/\s+/).filter(Boolean));
      relParts.add("noopener");
      relParts.add("noreferrer");
      token.attrSet("rel", Array.from(relParts).join(" "));
    } else {
      token.attrSet("rel", "noopener noreferrer");
    }
    return originalLinkOpen(tokens, idx, options, env, selfRef);
  };

  md.renderer.rules.image = (tokens, idx, options, env, selfRef) => {
    const token = tokens[idx];
    token.attrJoin("class", "md-image");
    return originalImage(tokens, idx, options, env, selfRef);
  };

  md.renderer.rules.table_open = (tokens, idx, options, env, selfRef) =>
    `<div class="table-container">${originalTableOpen(tokens, idx, options, env, selfRef)}`;
  md.renderer.rules.table_close = (tokens, idx, options, env, selfRef) =>
    `${originalTableClose(tokens, idx, options, env, selfRef)}</div>`;
  md.renderer.rules.hardbreak = () => "<br>";

  if (md.linkify && typeof md.linkify.set === "function") {
    md.linkify.set({ fuzzyLink: true, fuzzyIP: true, fuzzyEmail: false });
  }

  markdownRendererInstance = md;
  return markdownRendererInstance;
}

function preprocessMarkdownSource(src) {
  if (!src) {
    return { text: "", latex: [] };
  }

  let sanitizedSrc = src.trimStart();
  const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
  sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");

  const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");

  const latexBlocks = [];
  const latexRegex = /(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g;

  const protectedSrc = normalizedSrc.replace(latexRegex, (match) => {
    const placeholder = `${MARKDOWN_LATEX_PLACEHOLDER_PREFIX}${latexBlocks.length}¤`;
    latexBlocks.push(match);
    return placeholder;
  });

  return { text: protectedSrc, latex: latexBlocks };
}

function restoreLatexPlaceholders(html, latexBlocks) {
  let result = html;
  latexBlocks.forEach((block, index) => {
    const placeholder = `${MARKDOWN_LATEX_PLACEHOLDER_PREFIX}${index}¤`;
    result = result.replaceAll(placeholder, block);
  });
  return result;
}

function postRenderAdjustments(html) {
  if (!html) return "";
  return html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/<div class="table-container">([\s\S]*?)<\/div>/g, (match, tableContent) => {
      return `<div class="table-container">${tableContent.replace(/<(td|th)>([\s\S]*?)<\/\1>/g, (cellMatch, tag, cellContent) => {
        const decodedContent = cellContent
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');

        if (/(^|\n)\s*[-*+•]\s+/m.test(decodedContent) || decodedContent.includes('<br>')) {
          const MarkdownIt = self.markdownit || self.MarkdownIt;
          if (!MarkdownIt) return cellMatch;
          const cellMd = new MarkdownIt({
            html: true,
            breaks: true,
            linkify: true,
            typographer: false,
          });
          cellMd.enable(["strikethrough", "linkify", "list", "paragraph"]);
          cellMd.disable(["table"]);
          const markdownContent = decodedContent.replace(/•/g, '-').replace(/<br\s*\/?>/gi, '\n').trim();
          const processedCell = cellMd.render(markdownContent);
          return `<${tag}>${processedCell.trim()}</${tag}>`;
        }
        return cellMatch;
      })}</div>`;
    });
}

function renderMarkdown(src) {
  const renderer = ensureRenderer();
  const { text, latex } = preprocessMarkdownSource(src);
  const rendered = renderer.render(text.trim());
  const withLatex = restoreLatexPlaceholders(rendered, latex);
  return postRenderAdjustments(withLatex);
}

function trimEndMarker(value) {
  if (!value) return "";
  return value.replace(/\s*<!--\s*\[\/END\]\s*-->\s*$/g, "");
}

function handleUpdate(streamId) {
  const display = trimEndMarker(fullResponse);
  const html = renderMarkdown(display);
  self.postMessage({ type: "update", html, streamId });
}

self.onmessage = function onmessage(event) {
  const { type, payload = "", streamId } = event.data || {};
  if (!type || !streamId) return;

  if (type === "init") {
    fullResponse = typeof payload === "string" ? payload : "";
    if (fullResponse) {
      handleUpdate(streamId);
    } else {
      self.postMessage({ type: "update", html: "", streamId });
    }
    return;
  }

  if (type === "token") {
    fullResponse += typeof payload === "string" ? payload : "";
    handleUpdate(streamId);
    return;
  }

  if (type === "end") {
    const finalText = typeof payload === "string" ? payload : trimEndMarker(fullResponse);
    const html = renderMarkdown(finalText);
    self.postMessage({ type: "final", html, streamId });
    fullResponse = "";
    return;
  }
};
