/**
 * Thinking-Text Markdown Formatter
 * Uses markdown-it directly (not worker) with same processing as worker
 * but without action buttons for clean thinking-text display
 */

function createThinkingMarkdownFormatter() {
  if (typeof window.markdownit !== 'function') {
    console.warn('MarkdownIt not available for thinking formatter');
    return null;
  }

  const md = new window.markdownit({
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
  });

  md.enable(["table", "strikethrough"]);

  // Helper functions (same as worker)
  function esc(value) {
    if (!value) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeLanguage(lang) {
    if (!lang) return "text";
    return lang.toLowerCase().replace(/[^\w+-]+/g, "");
  }

  function highlightCode(code, language) {
    const targetLanguage = normalizeLanguage(language);
    console.log('🎯 HIGHLIGHT INPUT:', JSON.stringify(code));
    if (window.hljs && targetLanguage && window.hljs.getLanguage?.(targetLanguage)) {
      try {
        const result = window.hljs.highlight(code, { language: targetLanguage }).value;
        console.log('🎯 HIGHLIGHT OUTPUT:', JSON.stringify(result));
        return result;
      } catch (err) {
        console.warn("highlight.js failed in thinking formatter", err);
      }
    }
    const escaped = esc(code);
    console.log('🎯 ESC OUTPUT:', JSON.stringify(escaped));
    return escaped;
  }

  // Code block renderer WITHOUT action buttons
  function renderThinkingCodeContainer(code, info = "") {
    const language = normalizeLanguage(info.split(/\s+/)[0] || "text");
    console.log('🧠 THINKING CODE INPUT:', JSON.stringify(code));
    const highlighted = highlightCode(code, language);
    console.log('🧠 THINKING CODE HIGHLIGHTED:', JSON.stringify(highlighted));

    return `<div class="code-block-container thinking-code"><div class="code-block-header"><span class="language-name">${language}</span></div><pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`;
  }

  // Set up renderers (same as worker but thinking-specific)
  const originalLinkOpen = md.renderer.rules.link_open ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));
  const originalImage = md.renderer.rules.image ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));
  const originalTableOpen = md.renderer.rules.table_open ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));
  const originalTableClose = md.renderer.rules.table_close ||
    ((tokens, idx, options, env, selfRef) => selfRef.renderToken(tokens, idx, options));

  // Code blocks without action buttons
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    return renderThinkingCodeContainer(token.content || "", token.info || "");
  };
  md.renderer.rules.code_block = (tokens, idx) => {
    const token = tokens[idx];
    return renderThinkingCodeContainer(token.content || "", "");
  };

  // Links with proper attributes
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

  // Images with class
  md.renderer.rules.image = (tokens, idx, options, env, selfRef) => {
    const token = tokens[idx];
    token.attrJoin("class", "md-image");
    return originalImage(tokens, idx, options, env, selfRef);
  };

  // Tables with container
  md.renderer.rules.table_open = (tokens, idx, options, env, selfRef) =>
    `<div class="table-container">${originalTableOpen(tokens, idx, options, env, selfRef)}`;
  md.renderer.rules.table_close = (tokens, idx, options, env, selfRef) =>
    `${originalTableClose(tokens, idx, options, env, selfRef)}</div>`;
  md.renderer.rules.hardbreak = () => "<br>";

  // Linkify settings
  if (md.linkify && typeof md.linkify.set === "function") {
    md.linkify.set({ fuzzyLink: true, fuzzyIP: true, fuzzyEmail: false });
  }

  return md;
}

// Preprocessing (same as worker)
function preprocessThinkingMarkdown(src) {
  if (!src) {
    return { text: "", latex: [] };
  }

  let sanitizedSrc = src.trimStart();
  const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
  sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");

  const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");

  const latexBlocks = [];
  const latexRegex = /(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g;
  const LATEX_PREFIX = "¤LATEX_";

  const protectedSrc = normalizedSrc.replace(latexRegex, (match) => {
    const placeholder = `${LATEX_PREFIX}${latexBlocks.length}¤`;
    latexBlocks.push(match);
    return placeholder;
  });

  return { text: protectedSrc, latex: latexBlocks };
}

function restoreThinkingLatex(html, latexBlocks) {
  let result = html;
  const LATEX_PREFIX = "¤LATEX_";
  latexBlocks.forEach((block, index) => {
    const placeholder = `${LATEX_PREFIX}${index}¤`;
    result = result.replaceAll(placeholder, block);
  });
  return result;
}

function postProcessThinking(html) {
  if (!html) return "";
  return html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
}

// Initialize thinking formatter
const thinkingMarkdownFormatter = createThinkingMarkdownFormatter();

// Clean functions (same as renderer.js)
function cleanLeadingWhitespace(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(
    /^[\s\u200B\u200C\u200D\u2060\ufeff\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/,
    "",
  );
}

function cleanInvisibleContent(html) {
  if (!html) return html;
  
  // REGEX APPROACH: Extract and protect code blocks
  const codeBlockRegex = /<pre><code[^>]*>[\s\S]*?<\/code><\/pre>/g;
  const codeBlocks = [];
  let index = 0;
  
  // Replace code blocks with placeholders
  let protectedHtml = html.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODEBLOCK_PLACEHOLDER_${index}__`;
    codeBlocks[index] = match;
    index++;
    return placeholder;
  });
  
  // Clean the HTML (without code blocks)
  let cleanedHtml = protectedHtml
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
    .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
    .replace(/>\s+</g, '><') // Remove whitespace between tags
    .trim();
  
  // Restore code blocks with original formatting
  codeBlocks.forEach((codeBlock, i) => {
    const placeholder = `__CODEBLOCK_PLACEHOLDER_${i}__`;
    cleanedHtml = cleanedHtml.replace(placeholder, codeBlock);
  });
  
  return cleanedHtml;
}

// Main thinking formatter function
window.formatThinkingMarkdown = function(src) {
  if (!src || !thinkingMarkdownFormatter) {
    return src ? src.replace(/\n/g, '<br>') : '';
  }

  try {
    console.log('🧠 INPUT SRC:', JSON.stringify(src));
    const cleaned = cleanLeadingWhitespace(String(src));
    console.log('🧠 AFTER CLEAN LEADING:', JSON.stringify(cleaned));
    const { text, latex } = preprocessThinkingMarkdown(cleaned);
    console.log('🧠 AFTER PREPROCESS:', JSON.stringify(text));
    let html = thinkingMarkdownFormatter.render(text);
    console.log('🧠 AFTER RENDER:', html);
    html = restoreThinkingLatex(html, latex);
    console.log('🧠 AFTER RESTORE LATEX:', html);
    html = postProcessThinking(html);
    console.log('🧠 AFTER POST PROCESS:', html);
    // Clean invisible content but protect code blocks
    console.log('🧠 BEFORE CLEAN INVISIBLE:', html);
    html = cleanInvisibleContent(html);
    console.log('🧠 AFTER CLEAN INVISIBLE:', html);
    console.log('🧠 FINAL HTML:', html);
    return html;
  } catch (error) {
    console.warn('Thinking markdown formatting error:', error);
    return src.replace(/\n/g, '<br>');
  }
};