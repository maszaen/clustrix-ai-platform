/**
 * Markdown Renderer Module
 * Extracted from renderer.js - 99% exact code
 * Main markdown processing with worker/fallback strategy
 */

(function() {
  'use strict';

  const MARKDOWN_LATEX_PLACEHOLDER_PREFIX = "___LATEX_BLOCK_";
  let markdownRendererInstance = null;

  function ensureMarkdownRenderer() {
    if (markdownRendererInstance) return markdownRendererInstance;

    console.warn("Using simple markdown renderer fallback.");
    return {
      render: (text) =>
        text
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replace(/\n/g, "<br>"),
    };
  }

  function preprocessMarkdownSource(src) {
    if (!src) {
      return { text: "", latex: [] };
    }

    let sanitizedSrc = src.trimStart();
    const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
    sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");

    const normalizedSrc = sanitizedSrc
      .replace(/\u00A0/g, " ")
      .replace(/\r\n/g, "\n");

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

  function ensureBreakSeparatedLists(container) {
    const paragraphs = Array.from(container.querySelectorAll("p"));
    paragraphs.forEach((paragraph) => {
      const parts = paragraph.innerHTML.split(/<br\s*\/?>/i);
      if (parts.length < 2) return;

      const items = parts.map((part) => part.trim()).filter(Boolean);
      if (items.length < 2) return;
      if (!items.every((item) => /^[-•]\s+/.test(item))) return;

      const list = document.createElement("ul");
      list.className = "br-list";
      items.forEach((item) => {
        const li = document.createElement("li");
        li.innerHTML = item.replace(/^[-•]\s+/, "");
        list.appendChild(li);
      });
      paragraph.replaceWith(list);
    });
  }

  function transformSourceFootnotes(container) {
    const anchors = Array.from(container.querySelectorAll("a"));
    anchors.forEach((anchor) => {
      if (!anchor.isConnected) return;
      const text = anchor.textContent.trim();
      if (!/^Source\s+\d+$/i.test(text)) return;

      let prev = anchor.previousSibling;
      while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === "") {
        prev = prev.previousSibling;
      }
      if (prev) {
        if (
          prev.nodeType === Node.ELEMENT_NODE &&
          prev.tagName === "A" &&
          /^Source\s+\d+$/i.test(prev.textContent.trim())
        ) {
          return;
        }
        if (
          prev.nodeType === Node.TEXT_NODE &&
          /^[,\s]+$/.test(prev.textContent) &&
          prev.previousSibling &&
          prev.previousSibling.nodeType === Node.ELEMENT_NODE &&
          prev.previousSibling.tagName === "A" &&
          /^Source\s+\d+$/i.test(prev.previousSibling.textContent.trim())
        ) {
          return;
        }
      }

      const collected = [];
      let cursor = anchor;
      let endNode = anchor;
      while (cursor) {
        if (
          cursor.nodeType === Node.ELEMENT_NODE &&
          cursor.tagName === "A" &&
          /^Source\s+\d+$/i.test(cursor.textContent.trim())
        ) {
          collected.push(cursor);
          endNode = cursor;
          cursor = cursor.nextSibling;
          continue;
        }
        if (cursor.nodeType === Node.TEXT_NODE && /^[,\s]+$/.test(cursor.textContent)) {
          endNode = cursor;
          cursor = cursor.nextSibling;
          continue;
        }
        break;
      }

      if (collected.length === 0) return;

      const sup = document.createElement("sup");
      sup.className = "footnote-ref";

      collected.forEach((link, index) => {
        const clone = link.cloneNode(true);
        const numMatch = clone.textContent.match(/(\d+)/);
        clone.textContent = numMatch ? `[${numMatch[1]}]` : `[${clone.textContent.trim()}]`;
        const cls = clone.getAttribute("class");
        if (cls) {
          if (!cls.split(/\s+/).includes("link")) {
            clone.setAttribute("class", `${cls} link`.trim());
          }
        } else {
          clone.setAttribute("class", "link");
        }
        clone.setAttribute("target", "_blank");
        const rel = clone.getAttribute("rel");
        if (rel) {
          const relParts = new Set(rel.split(/\s+/).filter(Boolean));
          relParts.add("noopener");
          relParts.add("noreferrer");
          clone.setAttribute("rel", Array.from(relParts).join(" "));
        } else {
          clone.setAttribute("rel", "noopener noreferrer");
        }
        sup.appendChild(clone);
        if (index < collected.length - 1) {
          sup.appendChild(document.createTextNode(", "));
        }
      });

      const parent = anchor.parentNode;
      if (!parent) return;
      parent.insertBefore(sup, anchor);

      let node = anchor;
      while (node) {
        const next = node.nextSibling;
        parent.removeChild(node);
        if (node === endNode) break;
        node = next;
      }
    });
  }

  async function renderMathInElement(element) {
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      try {
        await window.MathJax.typesetPromise([element]);
      } catch (e) {
        log("MATHJAX", 4, "renderMathInElement", "Gagal merender LaTeX", {
          error: e,
        });
      }
    }
  }

  // Export to global window object
  window.ensureMarkdownRenderer = ensureMarkdownRenderer;
  window.preprocessMarkdownSource = preprocessMarkdownSource;
  window.restoreLatexPlaceholders = restoreLatexPlaceholders;
  window.ensureBreakSeparatedLists = ensureBreakSeparatedLists;
  window.transformSourceFootnotes = transformSourceFootnotes;
  window.renderMathInElement = renderMathInElement;
  window.MARKDOWN_LATEX_PLACEHOLDER_PREFIX = MARKDOWN_LATEX_PLACEHOLDER_PREFIX;
})();
