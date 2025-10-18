/*
 * md.worker.js
 * Offloads custom markdown rendering to a background thread
 * Based on md.js formatter with improved nested list support
 */

/* global self */

const MARKDOWN_LATEX_PLACEHOLDER_PREFIX = "¤LATEX_";
let fullResponse = "";
let markdownRendererInstance = null;

// Import highlight.js for syntax highlighting
if (typeof self.importScripts === "function") {
  try {
    self.importScripts("../local_modules/highlight/modules/highlight.min.js");
  } catch (err) {
    console.warn("Failed to import highlight.js in worker", err);
  }
}

// Copy core functions from md.js
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

function enhancedMarkdownParse(src, options = {}) {
  const isThinkingText = options.isThinkingText || false;
  let sanitizedSrc = src.trimStart();
  const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
  sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");
  const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
  const codeBlocks = [];
  const latexBlocks = [];
  const containerBlocks = [];
  const latexRegex = /(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g;
  let protectedSrc = normalizedSrc.replace(latexRegex, match => {
    const placeholder = `__LATEX_${latexBlocks.length}__`;
    latexBlocks.push(match);
    return placeholder;
  });
  
  // Extract container tags before processing
  let processedSrcAfterContainers = protectedSrc.replace(/<(brain|prompt)>([\s\S]*?)<\/\1>/gi, (match) => {
    const placeholder = `XCONTAINERX${containerBlocks.length}XCONTAINERX`;
    containerBlocks.push(match);
    return placeholder;
  });
  let processedSrc = processedSrcAfterContainers.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
    const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
    let codeContent = code; // Don't trim yet - we need original whitespace for dedent
    const language = lang || "text";
    
    // Clean blockquote markers from code content if present
    // This handles codeblocks inside blockquotes where the content includes blockquote prefixes
    const lines = codeContent.split('\n');
    const cleanedLines = lines.map(line => {
      // Remove all leading > markers and whitespace that are from blockquote nesting
      let cleaned = line;
      // Keep removing > markers at the start (after optional whitespace)
      while (true) {
        const beforeClean = cleaned;
        // Remove leading whitespace + > + optional space
        cleaned = cleaned.replace(/^\s*>\s?/, '');
        // If nothing changed, we're done
        if (cleaned === beforeClean) break;
      }
      return cleaned;
    });
    
    // Normalize indentation: remove common leading whitespace from all non-empty lines
    // This handles codeblocks in nested lists where markdown indentation should not appear in code
    const nonEmptyLines = cleanedLines.filter(line => line.trim().length > 0);
    if (nonEmptyLines.length > 0) {
      const indents = nonEmptyLines.map(line => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
      });
      const minIndent = Math.min(...indents);
      if (minIndent > 0) {
        for (let i = 0; i < cleanedLines.length; i++) {
          if (cleanedLines[i].trim().length > 0) {
            cleanedLines[i] = cleanedLines[i].substring(minIndent);
          }
        }
      }
    }
    
    codeContent = cleanedLines.join('\n').trim();

    // Different structure for thinking-text (no action buttons)
    const newStructure = isThinkingText ?
      `<div class="code-block-container thinking-code"><div class="code-block-header"><span class="language-name">${language}</span></div><pre><code class="language-${language}">${esc(codeContent)}</code></pre></div>` :
      `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="language-name">${language}</span>
          <div class="code-block-actions">
            <button class="save-code-btn" title="Save to artifacts" data-code="${esc(codeContent).replace(/"/g, "&quot;")}" data-language="${language}">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
            </button>
            <button class="copy-code-btn" title="Copy code">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>
        </div>
        <pre><code class="language-${language}">${esc(codeContent)}</code></pre>
      </div>`;
    codeBlocks.push(newStructure);
    return placeholder;
  });
  const lines = processedSrc.split("\n");
  let html = "";
  const listStack = [];
  let paragraphBuffer = [];
  let currentListItemEndPos = -1; // Track end position of current list item
  let lastLineWasCodeblock = false;
  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      html += `<p>${paragraphBuffer.join("<br>")}</p>`;
      paragraphBuffer = [];
    }
  };
  const appendToCurrentListItem = content => {
    if (listStack.length > 0 && currentListItemEndPos !== -1) {
      html = `${html.substring(0, currentListItemEndPos)}${content}${html.substring(currentListItemEndPos)}`;
      currentListItemEndPos += content.length;
      return true;
    }
    return false;
  };
  const closeOpenBlocks = () => {
    flushParagraph();
    while (listStack.length > 0) html += `</${listStack.pop().type}>`;
    currentListItemEndPos = -1; // Reset when closing list blocks
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      const nextLine = lines[i + 1] ? lines[i + 1] : "";
      const nextLineTrimmed = nextLine.trim();
      const nextLineIndent = nextLine.length - nextLine.trimStart().length;
      const nextNextLine = lines[i + 2] ? lines[i + 2].trim() : "";
      const upcomingTableSeparator = nextNextLine && nextNextLine.includes("|") && nextNextLine.includes("-") && !/[^|:-\s]/.test(nextNextLine);
      const isUpcomingTableHeader = nextLineTrimmed && nextLineTrimmed.includes("|") && upcomingTableSeparator;

      // Check if we should continue the list with enhanced look-ahead
      let shouldContinueList = false;
      if (listStack.length > 0) {
        const currentListIndent = listStack[listStack.length - 1].indent;

        // Look ahead up to 3 lines to find continuation content
        for (let lookAhead = 1; lookAhead <= 3 && i + lookAhead < lines.length; lookAhead++) {
          const lookAheadLine = lines[i + lookAhead];
          const lookAheadTrimmed = lookAheadLine.trim();
          const lookAheadIndent = lookAheadLine.length - lookAheadTrimmed.length;

          // Skip empty lines
          if (lookAheadTrimmed === "") continue;

          // Continue list if next non-empty line is a list item at same or greater indent
          if (lookAheadTrimmed.match(/^(\s*)[*-]\s+/) || lookAheadTrimmed.match(/^(\s*)\d+\.\s+/)) {
            const nextListMatch = lookAheadTrimmed.match(/^(\s*)[*-]\s+/) || lookAheadTrimmed.match(/^(\s*)\d+\.\s+/);
            const nextListIndent = nextListMatch[1].length;
            if (nextListIndent >= currentListIndent) {
              shouldContinueList = true;
              break;
            }
          }
          // Continue list if next non-empty line is codeblock, blockquote, or table at proper indent
          else if (lookAheadTrimmed.startsWith("__CODEBLOCK_") || lookAheadTrimmed.startsWith(">") || 
                   (lookAheadTrimmed.includes("|") && !lookAheadTrimmed.match(/^(\s*)[*-]\s+/) && !lookAheadTrimmed.match(/^(\s*)\d+\.\s+/))) {
            // For nested content, check if it's indented properly (at least current list indent + 2)
            if (lookAheadIndent >= currentListIndent + 2) {
              shouldContinueList = true;
              break;
            }
          }
          // If we hit content that doesn't continue the list, stop looking
          break;
        }
      }

      if (shouldContinueList) {
        lastLineWasCodeblock = false;
        continue;
      }
      closeOpenBlocks();
      lastLineWasCodeblock = false;
      continue;
    }
    const hMatch = line.match(/^(#+)\s+(.*)/);
    const hrMatch = /^---+$/.test(trimmedLine);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    const ulMatch = line.match(/^(\s*)[*-]\s+(.*)/);
    const listMatch = olMatch || ulMatch;
    const codeMatch = trimmedLine.startsWith("__CODEBLOCK_");
    const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
    const isTableHeader = trimmedLine.includes("|") && !listMatch && !hMatch;
    const bqMatch = line.match(/^\s*>\s?(.*)/);
    const isNextLineSeparator = isTableHeader && nextLine.includes("|") && nextLine.includes("-") && !/[^|:-\s]/.test(nextLine);
    if (isTableHeader && isNextLineSeparator) {
      let tableHtml = '<div class="table-container"><table>';
      const headers = trimmedLine.split("|").map(h => h.trim()).filter(Boolean);
      tableHtml += "<thead><tr>";
      for (const header of headers) tableHtml += `<th>${parseInlineMarkdown(header)}</th>`;
      tableHtml += "</tr></thead><tbody>";
      let tableRowIndex = i + 2;
      while (tableRowIndex < lines.length && lines[tableRowIndex].trim().includes("|")) {
        const cells = lines[tableRowIndex].trim().split("|").map(c => c.trim()).filter(Boolean);
        tableHtml += "<tr>";
        for (let j = 0; j < headers.length; j++) {
          const cellContent = cells[j] || "";
          tableHtml += `<td>${parseInlineMarkdown(cellContent)}</td>`;
        }
        tableHtml += "</tr>";
        tableRowIndex++;
      }
      tableHtml += "</tbody></table></div>";
      // For tables in lists, always append to current list item to maintain proper nesting
      if (listStack.length > 0) {
        appendToCurrentListItem(tableHtml);
      } else {
        closeOpenBlocks();
        html += tableHtml;
      }
      lastLineWasCodeblock = false;
      i = tableRowIndex - 1;
      continue;
    }
    if (listMatch) {
      flushParagraph();
      let indent = listMatch[1].length;
      const type = olMatch ? "ol" : "ul";
      const number = olMatch ? parseInt(olMatch[2], 10) : null;
      const content = olMatch ? listMatch[3] : ulMatch[2];
      const lastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
      if (type === "ul" && lastList?.type === "ul" && lastList.implicit && indent < lastList.indent) indent = lastList.indent;
      else if (type === "ul" && lastList?.type === "ol" && indent <= lastList.indent) indent = lastList.indent + 2;
      while (listStack.length > 0 && (listStack[listStack.length - 1].indent > indent || (listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))) {
        html += `</${listStack.pop().type}>`;
      }
      const currentLastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
      if (!currentLastList || indent > currentLastList.indent || type !== currentLastList.type) {
        if (currentLastList && indent > currentLastList.indent) {
          const lastLiPos = html.lastIndexOf("</li>");
          if (lastLiPos !== -1) html = html.substring(0, lastLiPos);
        }
        const isImplicit = type === "ul" && currentLastList?.type === "ol";
        const startAttr = type === "ol" && number > 1 ? ` start="${number}"` : "";
        html += `<${type}${startAttr}>`;
        listStack.push({ type, indent, implicit: isImplicit });
      }
      // Wrap text content with <p> for consistent styling
      const parsedContent = parseInlineMarkdown(content);
      html += `<li><p>${parsedContent}</p></li>`;
      // Track the end position of this list item for appending nested content
      // Position before "</p></li>" to insert nested content after the paragraph
      currentListItemEndPos = html.length - 9; // Position before "</p></li>"
      lastLineWasCodeblock = false;
    } else if (bqMatch) {
      const bqBlockLines = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() !== "") {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();
        const isNewBlock = /^(#|---|```|[*-] |\d+\.\s)/.test(nextTrimmed) && (nextLine.length - nextTrimmed.length === 0);
        if (isNewBlock) break;
        i++;
        bqBlockLines.push(nextLine);
      }
      const nestedContent = bqBlockLines.map(l => l.replace(/^\s*>\s?/, "")).join("\n");
      // Replace any codeblock placeholders in nested content with special tokens
      const processedNestedContent = nestedContent.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
        return `CODEBLOCKEMBED${index}PLACEHOLDER`;
      });
      
      // Process the content with full markdown parsing
      const parsedContent = enhancedMarkdownParse(processedNestedContent);
      
      // Replace embedded codeblock tokens with actual HTML
      const blockquoteContent = parsedContent.replace(/CODEBLOCKEMBED(\d+)PLACEHOLDER/g, (match, index) => {
        return codeBlocks[parseInt(index)];
      });
      
      const blockquoteHtml = `<blockquote>${blockquoteContent}</blockquote>`;
      // For blockquotes in lists, always append to current list item to maintain proper nesting
      if (listStack.length > 0) {
        appendToCurrentListItem(blockquoteHtml);
      } else {
        closeOpenBlocks();
        html += blockquoteHtml;
      }
      lastLineWasCodeblock = false;
    } else if (codeMatch) {
      // For codeblocks in lists, always append to current list item to maintain proper nesting
      if (listStack.length > 0) {
        appendToCurrentListItem(trimmedLine);
      } else {
        closeOpenBlocks();
        html += trimmedLine;
      }
      lastLineWasCodeblock = true;
    } else if (hMatch || hrMatch) {
      closeOpenBlocks();
      if (hMatch) html += `<h${hMatch[1].length}>${parseInlineMarkdown(hMatch[2])}</h${hMatch[1].length}>`;
      else if (hrMatch) html += "<hr>";
      lastLineWasCodeblock = false;
    } else {
      if (listStack.length > 0) {
        // For regular text in lists, append to current list item using the tracked position
        if (currentListItemEndPos !== -1) {
          // Don't add <br> if previous line was a codeblock
          const prefix = lastLineWasCodeblock ? '' : '<br>';
          const textHtml = `${prefix}${parseInlineMarkdown(line.trim())}`;
          html = `${html.substring(0, currentListItemEndPos)}${textHtml}${html.substring(currentListItemEndPos)}`;
          currentListItemEndPos += textHtml.length;
        }
      } else {
        // Check if this line is a container tag (brain or prompt) - don't wrap in <p>
        if (trimmedLine.includes("XCONTAINERX")) {
          flushParagraph();
          html += parseInlineMarkdown(line) + '\n';
        } else {
          paragraphBuffer.push(parseInlineMarkdown(line));
        }
      }
      lastLineWasCodeblock = false;
    }
  }
  closeOpenBlocks();
  let finalHtml = codeBlocks.reduce((acc, block, i) => acc.replace(`__CODEBLOCK_${i}__`, block), html);
  finalHtml = latexBlocks.reduce((acc, block, i) => acc.replace(`__LATEX_${i}__`, block), finalHtml);
  finalHtml = containerBlocks.reduce((acc, block, i) => {
    // Don't call parseInlineMarkdown - it will escape the HTML
    // Instead, just process the inner tags
    const processed = block
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') // Unescape first
      .replace(/<brain>(.*?)<\/brain>/gis, '<div class="brain">$1</div>')
      .replace(/<prompt>(.*?)<\/prompt>/gis, '<div class="prompt">$1</div>')
      .replace(/<bli-title>(.*?)<\/bli-title>/gi, '<div class="bli-title">$1</div>')
      .replace(/<pli-title>(.*?)<\/pli-title>/gi, '<div class="pli-title">$1</div>')
      .replace(/<bli>(.*?)<\/bli>/gi, '<span class="bli"><svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="text-emerald-600 dark:text-emerald-400/80 w-3.5 h-auto" aria-label="Tip"><path d="M3.12794 12.4232C3.12794 12.5954 3.1776 12.7634 3.27244 12.907L3.74114 13.6095C3.88471 13.8248 4.21067 14 4.46964 14H6.15606C6.41415 14 6.74017 13.825 6.88373 13.6095L7.3508 12.9073C7.43114 12.7859 7.49705 12.569 7.49705 12.4232L7.50055 11.3513H3.12521L3.12794 12.4232ZM5.31288 0C2.52414 0.00875889 0.5 2.26889 0.5 4.78826C0.5 6.00188 0.949566 7.10829 1.69119 7.95492C2.14321 8.47011 2.84901 9.54727 3.11919 10.4557C3.12005 10.4625 3.12175 10.4698 3.12261 10.4771H7.50342C7.50427 10.4698 7.50598 10.463 7.50684 10.4557C7.77688 9.54727 8.48281 8.47011 8.93484 7.95492C9.67728 7.13181 10.1258 6.02703 10.1258 4.78826C10.1258 2.15486 7.9709 0.000106649 5.31288 0ZM7.94902 7.11267C7.52078 7.60079 6.99082 8.37878 6.6077 9.18794H4.02051C3.63739 8.37878 3.10743 7.60079 2.67947 7.11294C2.11997 6.47551 1.8126 5.63599 1.8126 4.78826C1.8126 3.09829 3.12794 1.31944 5.28827 1.3126C7.2435 1.3126 8.81315 2.88226 8.81315 4.78826C8.81315 5.63599 8.50688 6.47551 7.94902 7.11267ZM4.87534 2.18767C3.66939 2.18767 2.68767 3.16939 2.68767 4.37534C2.68767 4.61719 2.88336 4.81288 3.12521 4.81288C3.36705 4.81288 3.56274 4.61599 3.56274 4.37534C3.56274 3.6515 4.1515 3.06274 4.87534 3.06274C5.11719 3.06274 5.31288 2.86727 5.31288 2.62548C5.31288 2.38369 5.11599 2.18767 4.87534 2.18767Z"></path></svg> $1</span>')
      .replace(/<pli>(.*?)<\/pli>/gi, '<span class="pli" data-text="$1"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-corner-down-right-icon lucide-corner-down-right"><path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg> $1</span>');
    return acc.replace(`XCONTAINERX${i}XCONTAINERX`, processed);
  }, finalHtml);
  return finalHtml;
}

function parseInlineMarkdown(text) {
  if (!text) return "";
  // Unescape HTML entities first to handle custom tags that might be escaped
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // Handle custom tags
  text = text.replace(/<bli>(.*?)<\/bli>/gi, '<span class="bli">? $1</span>');
  text = text.replace(/<pli>(.*?)<\/pli>/gi, '<span class="pli" data-text="$1">$1</span>');
  text = text.replace(/<bli-title>(.*?)<\/bli-title>/gi, '<div class="bli-title">$1</div>');
  text = text.replace(/<pli-title>(.*?)<\/pli-title>/gi, '<div class="pli-title">$1</div>');
  // Handle container tags
  text = text.replace(/<brain>(.*?)<\/brain>/gis, '<div class="brain">$1</div>');
  text = text.replace(/<prompt>(.*?)<\/prompt>/gis, '<div class="prompt">$1</div>');
  if (text.includes('<br>') && (text.includes('<br>•') || text.includes('<br>-'))) {
    const parts = text.split(/(<br\s*\/?>)/i);
    let listItems = [];
    let currentItem = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.match(/<br\s*\/?>/i)) {
        if (currentItem.trim()) {
          listItems.push(currentItem.trim());
          currentItem = "";
        }
      } else {
        currentItem += part;
      }
    }
    if (currentItem.trim()) listItems.push(currentItem.trim());
    listItems = listItems.filter(item => item.trim());
    if (listItems.length > 1) {
      let listHtml = '<ul class="br-list">';
      listItems.forEach(item => {
        const cleanItem = item.replace(/^[-•]\s*/, "");
        const processedItem = processMarkdownFormatting(cleanItem);
        listHtml += `<li>${processedItem}</li>`;
      });
      listHtml += "</ul>";
      return listHtml;
    }
  }
  let processedText = text.replace(/<br\s*\/?>/gi, "__BR_TAG__");

  // Parse links BEFORE HTML escaping to handle parentheses in URLs
  // processedText = parseMarkdownLinks(processedText);

  let html = processedText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  html = html.replace(/__BR_TAG__/g, "<br>");
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  html = html.replace(imageRegex, '<img class="md-image" src="$2" alt="$1">');
  const footnoteGroupRegex = /((?:\[Source\s+\d+\]\((?:.*?)\)(?:\s*,\s*)?)+)/g;
  html = html.replace(footnoteGroupRegex, match => {
    const individualFootnoteRegex = /\[Source\s+(\d+)\]\((.*?)\)/g;
    const links = [];
    let result;
    while ((result = individualFootnoteRegex.exec(match)) !== null) {
      const number = result[1];
      const url = result[2];
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">[${number}]</a>`);
    }
    return `<sup class="footnote-ref">${links.join(", ")}</sup>`;
  });
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  
  html = html.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer" class="link">$1</a>');
  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  const inlineCodeBlocks = [];
  html = html.replace(/`([^`]+?)`/g, (match, content) => {
    const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
    inlineCodeBlocks.push(`<code>${content}</code>`);
    return placeholder;
  });
  const tldList = ["com","net","org","io","gov","edu","co","info","biz","online","app","id","me","site","tech","dev","ai","cloud","shop","store","live","blog","club","news","xyz","link","cloud","space","page","pro","design","agency","group","company","inc","us","uk","au","ca","de","fr","es","it","nl","se","no","fi","ru","cn","jp","br","in","cz","pl","be","ch","at","sg","hk","nz","mx","ar","cl","kr","za","ae","sa"];
  const tldPattern = tldList.join("|");
  const autoLinkRegex = new RegExp('(\\b(?:https?:\\/\\/|www\\.)[^\\s<>"]+)' + "|" + "(?<!\\w)([a-zA-Z0-9.-]+\\.(?:" + tldPattern + ')(?:\\/[^\\s<>"]*)?)', "gi");
  html = html.replace(autoLinkRegex, (match, protocolUrl, domainUrl) => {
    if (html.includes(`href="${match}"`) || html.includes(`src="${match}"`)) return match;
    let href = protocolUrl || domainUrl;
    if (!/^https?:\/\//i.test(href)) href = "https://" + href;
    return `<a class="link" href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
  html = inlineCodeBlocks.reduce((acc, block, i) => acc.replace(`__INLINE_CODE_${i}__`, block), html);
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>").replace(/___(.*?)___/g, "<strong><em>$1</em></strong>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/__(.*?)__/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/_([^_]+)_/g, "<em>$1</em>").replace(/~~(.*?)~~/g, "<del>$1</del>");
  return html;
}

function processMarkdownFormatting(text) {
  if (!text) return "";

  // Parse links BEFORE HTML escaping to handle parentheses in URLs
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let processedText = text.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer" class="link">$1</a>');

  let html = processedText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  html = html.replace(imageRegex, '<img class="md-image" src="$2" alt="$1">');
  const footnoteGroupRegex = /((?:\[Source\s+\d+\]\((?:.*?)\)(?:\s*,\s*)?)+)/g;
  html = html.replace(footnoteGroupRegex, match => {
    const individualFootnoteRegex = /\[Source\s+(\d+)\]\((.*?)\)/g;
    const links = [];
    let result;
    while ((result = individualFootnoteRegex.exec(match)) !== null) {
      const number = result[1];
      const url = result[2];
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">[${number}]</a>`);
    }
    return `<sup class="footnote-ref">${links.join(", ")}</sup>`;
  });

  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  const inlineCodeBlocks = [];
  html = html.replace(/`([^`]+?)`/g, (match, content) => {
    const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
    inlineCodeBlocks.push(`<code>${content}</code>`);
    return placeholder;
  });
  const tldList = ["com","net","org","io","gov","edu","co","info","biz","online","app","id","me","site","tech","dev","ai","cloud","shop","store","live","blog","club","news","xyz","link","cloud","space","page","pro","design","agency","group","company","inc","us","uk","au","ca","de","fr","es","it","nl","se","no","fi","ru","cn","jp","br","in","cz","pl","be","ch","at","sg","hk","nz","mx","ar","cl","kr","za","ae","sa"];
  const tldPattern = tldList.join("|");
  const autoLinkRegex = new RegExp('(\\b(?:https?:\\/\\/|www\\.)[^\\s<>"]+)' + "|" + "(?<!\\w)([a-zA-Z0-9.-]+\\.(?:" + tldPattern + ')(?:\\/[^\\s<>"]*)?)', "gi");
  html = html.replace(autoLinkRegex, (match, protocolUrl, domainUrl) => {
    if (html.includes(`href="${match}"`) || html.includes(`src="${match}"`)) return match;
    let href = protocolUrl || domainUrl;
    if (!/^https?:\/\//i.test(href)) href = "https://" + href;
    return `<a class="link" href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
  html = inlineCodeBlocks.reduce((acc, block, i) => acc.replace(`__INLINE_CODE_${i}__`, block), html);
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>").replace(/___(.*?)___/g, "<strong><em>$1</em></strong>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/__(.*?)__/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/_([^_]+)_/g, "<em>$1</em>").replace(/~~(.*?)~~/g, "<del>$1</del>");
  return html;
}

function ensureRenderer() {
  if (markdownRendererInstance) return markdownRendererInstance;

  markdownRendererInstance = {
    render: (text) => {
      try {
        return enhancedMarkdownParse(text);
      } catch (error) {
        console.warn('Custom markdown rendering error:', error);
        return esc(text).replace(/\n/g, "<br>");
      }
    }
  };

  return markdownRendererInstance;
}

function preprocessMarkdownSource(src) {
  const latex = [];
  const text = src.replace(/(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g, (match) => {
    const placeholder = `${MARKDOWN_LATEX_PLACEHOLDER_PREFIX}${latex.length}`;
    latex.push(match);
    return placeholder;
  });
  return { text, latex };
}

function restoreLatexPlaceholders(html, latex) {
  return latex.reduce((result, latexBlock, index) => {
    return result.replace(`${MARKDOWN_LATEX_PLACEHOLDER_PREFIX}${index}`, latexBlock);
  }, html);
}

function addPHasListClass(html) {
  // Add class "p-has-li" to <p> tags that come before <ul> or <ol>
  // This regex handles optional whitespace/newlines between </p> and <ul|ol>
  return html.replace(/<p(\s+class="([^"]*)")?>([\s\S]*?)<\/p>(\s*)(<(?:ul|ol)(?:\s[^>]*)?>)/gi, (match, classAttr, existingClass, content, whitespace, listTag) => {
    if (existingClass) {
      // P tag already has classes, add p-has-li to them
      if (!existingClass.includes('p-has-li')) {
        return `<p class="${existingClass} p-has-li">${content}</p>${whitespace}${listTag}`;
      }
      return match; // Already has the class
    } else {
      // P tag has no class, add p-has-li
      return `<p class="p-has-li">${content}</p>${whitespace}${listTag}`;
    }
  });
}

function postRenderAdjustments(html) {
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
          const markdownContent = decodedContent.replace(/•/g, '-').replace(/<br\s*\/?>/gi, '\n').trim();
          const processedCell = enhancedMarkdownParse(markdownContent);
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
  const withAdjustments = postRenderAdjustments(withLatex);
  return addPHasListClass(withAdjustments);
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
  const { type, payload = "", streamId, messageId } = event.data || {};
  if (!type || !streamId) return;

  if (type === "init") {
    fullResponse = typeof payload === "string" ? payload : "";
    const html = renderMarkdown(fullResponse);

    // For sync rendering (used by main thread md() function)
    if (messageId) {
      self.postMessage({ type: "update", html, streamId, messageId });
    } else {
      // For streaming
      if (fullResponse) {
        handleUpdate(streamId);
      } else {
        self.postMessage({ type: "update", html: "", streamId });
      }
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