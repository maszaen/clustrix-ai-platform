// HTML escape function
function esc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function enhancedMarkdownParse(src, options = {}, sharedCodeBlocks = null) {
  const isThinkingText = options.isThinkingText || false;
  let sanitizedSrc = src.trimStart();
  const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
  sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");
  const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
  const codeBlocks = sharedCodeBlocks || [];
  const isTopLevel = !sharedCodeBlocks;
  const latexBlocks = [];
  const latexRegex = /(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g;
  let protectedSrc = normalizedSrc.replace(latexRegex, match => {
    const placeholder = `__LATEX_${latexBlocks.length}__`;
    latexBlocks.push(match);
    return placeholder;
  });
  
  // Only process codeblocks at top level, not in recursive calls
  let processedSrc = normalizedSrc;
  if (isTopLevel) {
    processedSrc = normalizedSrc.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
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
  }
  const lines = processedSrc.split("\n");
  let html = "";
  const listStack = [];
  let paragraphBuffer = [];
  let currentListItemEndPos = -1; // Track end position of current list item

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      html += `<p>${paragraphBuffer.join("<br>")}</p>`;
      paragraphBuffer = [];
    }
  };
  const appendToCurrentListItem = content => {
    if (listStack.length > 0 && currentListItemEndPos !== -1) {
      // Insert content before the closing </li> tag of current list item
      html = `${html.substring(0, currentListItemEndPos)}${content}${html.substring(currentListItemEndPos)}`;
      // Update the end position since we inserted content
      currentListItemEndPos += content.length;
      return true;
    }
    return false;
  };
  const closeOpenBlocks = () => {
    flushParagraph();
    while (listStack.length > 0) html += `</${listStack.pop().type}>`;
  };
  let lastLineWasCodeblock = false;
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

      // Check if we should continue the list
      let shouldContinueList = false;
      if (listStack.length > 0) {
        const currentListIndent = listStack[listStack.length - 1].indent;

        // Continue list if next line is a list item at same or greater indent
        if (nextLineTrimmed.match(/^(\s*)[*-]\s+/) || nextLineTrimmed.match(/^(\s*)\d+\.\s+/)) {
          const nextListMatch = nextLineTrimmed.match(/^(\s*)[*-]\s+/) || nextLineTrimmed.match(/^(\s*)\d+\.\s+/);
          const nextListIndent = nextListMatch[1].length;
          if (nextListIndent >= currentListIndent) {
            shouldContinueList = true;
          }
        }
        // Continue list if next line is codeblock, blockquote, or table at proper indent
        else if (nextLineTrimmed.startsWith("__CODEBLOCK_") || nextLineTrimmed.startsWith(">") || isUpcomingTableHeader) {
          // For nested content, allow same indent as list item (more flexible than markdown-it strict rules)
          if (nextLineIndent >= currentListIndent) {
            shouldContinueList = true;
          }
        }
        // If next line is empty or end of content, check a few lines ahead for nested content
        else if (!nextLineTrimmed) {
          // Look ahead up to 3 lines for nested content
          for (let lookAhead = 1; lookAhead <= 3 && i + lookAhead < lines.length; lookAhead++) {
            const lookAheadLine = lines[i + lookAhead];
            const lookAheadTrimmed = lookAheadLine.trim();
            const lookAheadIndent = lookAheadLine.length - lookAheadLine.trimStart().length;
            
            if (lookAheadTrimmed.startsWith("__CODEBLOCK_") || lookAheadTrimmed.startsWith(">") || 
                (lookAheadTrimmed.includes("|") && lines[i + lookAhead + 1] && lines[i + lookAhead + 1].trim().includes("|") && lines[i + lookAhead + 1].trim().includes("-"))) {
              if (lookAheadIndent >= currentListIndent) {
                shouldContinueList = true;
                break;
              }
            }
          }
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
      html += `<li>${parseInlineMarkdown(content)}</li>`;
      // Track the end position of this list item for appending nested content
      currentListItemEndPos = html.length - 5; // Position before "</li>"
      lastLineWasCodeblock = false;
    } else if (bqMatch) {
      const bqBlockLines = [line];
      // Collect all consecutive blockquote lines (including empty lines within blockquotes)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();
        
        // Stop if we hit a truly empty line (no > marker)
        if (nextTrimmed === "" && !nextLine.match(/^\s*>/)) break;
        
        // Stop if we hit a non-blockquote block-level element at root level
        const isNewBlock = /^(#|---|```|[*-] |\d+\.\s)/.test(nextTrimmed) && (nextLine.length - nextTrimmed.length === 0);
        if (isNewBlock) break;
        
        // Special case: Allow table rows without > prefix if previous line was a table row
        const prevLine = bqBlockLines[bqBlockLines.length - 1];
        const prevTrimmed = prevLine.replace(/^\s*>\s?/, '').trim();
        const isTableRow = nextTrimmed.startsWith('|') && nextTrimmed.includes('|');
        const prevWasTableRow = prevTrimmed.includes('|');
        
        if (isTableRow && prevWasTableRow) {
          // Continue collecting table row even without > prefix
          i++;
          bqBlockLines.push(nextLine);
          continue;
        }
        
        // Stop if line doesn't start with > and isn't empty
        if (!nextLine.match(/^\s*>/) && nextTrimmed !== "") break;
        
        i++;
        bqBlockLines.push(nextLine);
      }
      
      // Count the minimum number of > markers to determine the depth
      let minDepth = Infinity;
      const depthMap = bqBlockLines.map(l => {
        const match = l.match(/^(\s*>)+/);
        if (match) {
          const depth = (match[0].match(/>/g) || []).length;
          minDepth = Math.min(minDepth, depth);
          return { line: l, depth };
        }
        return { line: l, depth: 0 };
      });
      
      // Remove only the minimum depth level (one blockquote level)
      const nestedContent = depthMap.map(({ line, depth }) => {
        if (depth > 0) {
          // Remove exactly one > marker (the first one)
          return line.replace(/^\s*>\s?/, "");
        }
        return line;
      }).join("\n");
      
      // Replace any codeblock placeholders in nested content with special tokens
      const processedNestedContent = nestedContent.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
        return `CODEBLOCKEMBED${index}PLACEHOLDER`;
      });
      
      // Process the content with full markdown parsing, passing shared codeBlocks array
      const parsedContent = enhancedMarkdownParse(processedNestedContent, options, codeBlocks);
      
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
        paragraphBuffer.push(parseInlineMarkdown(line));
      }
      lastLineWasCodeblock = false;
    }
  }
  closeOpenBlocks();
  let finalHtml = codeBlocks.reduce((acc, block, i) => acc.replace(`__CODEBLOCK_${i}__`, block), html);
  finalHtml = latexBlocks.reduce((acc, block, i) => acc.replace(`__LATEX_${i}__`, block), finalHtml);
  return finalHtml;
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

function parseInlineMarkdown(text) {
  if (!text) return "";
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

function md(src, options = {}) {
  if (!src) return "";
  const cleanSrc = src.trim();
  const html = enhancedMarkdownParse(cleanSrc, options);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  if (tempDiv.querySelector("pre code")) highlightAllUnder(tempDiv);
  attachCodeBlockListeners(tempDiv);
  setTimeout(() => updateCodeBlocksWithArtifactInfo(tempDiv), 0);
  return tempDiv.innerHTML;
}

// Wrapper for thinking-text formatting (no action buttons)
function mdThinking(src) {
  if (!src) return "";
  const cleanSrc = src.trim();
  const html = enhancedMarkdownParse(cleanSrc, { isThinkingText: true });
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  if (tempDiv.querySelector("pre code")) highlightAllUnder(tempDiv);
  attachCodeBlockListeners(tempDiv);
  return tempDiv.innerHTML;
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { md, mdThinking, enhancedMarkdownParse, parseInlineMarkdown };
}
