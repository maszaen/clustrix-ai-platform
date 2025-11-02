export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function cleanLeadingWhitespace(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(
    /^[\s\u200B\u200C\u200D\u2060\ufeff\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/,
    ''
  );
}

export function cleanInvisibleContent(html) {
  if (!html) return html;

  let cleanedHtml = html
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+(\r?\n|\r)\s*/g, '')
    .replace(/(\r?\n|\r)+/g, '\n')
    .trim();

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;

  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_ALL,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          if (!['br', 'hr', 'img', 'input'].includes(tagName) &&
              !node.textContent.trim() &&
              node.children.length === 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          if (/^\s*$/.test(node.nodeValue)) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodesToRemove = [];
  let node;
  while (node = walker.nextNode()) {
    nodesToRemove.push(node);
  }

  nodesToRemove.forEach((n) => {
    if (n.parentNode) {
      n.parentNode.removeChild(n);
    }
  });

  const finalHtml = tempDiv.innerHTML
    .replace(/>\s+</g, (match) => {
      if (tempDiv.innerHTML.includes('<br>')) {
        return match;
      }
      return '><';
    })
    .replace(/\s+/g, ' ')
    .trim();

  return finalHtml;
}

export function renderWithExistingFormatter(raw) {
  if (raw == null) return '';
  const cleaned = cleanLeadingWhitespace(String(raw));
  return escapeHtml(cleaned).replace(/\r?\n/g, '<br/>');
}

export async function customMarkdownFormat(raw) {
  if (raw == null) return '';
  const cleaned = cleanLeadingWhitespace(String(raw));

  if (typeof md === 'function') {
    try {
      const result = md(cleaned);
      const finalResult = result && typeof result.then === 'function' ? await result : result;
      return cleanInvisibleContent(finalResult);
    } catch (error) {
      console.warn('Custom formatter error:', error);
      return renderWithExistingFormatter(raw);
    }
  }

  return renderWithExistingFormatter(raw);
}

export function renderThinkingText(raw) {
  if (raw == null) return '';
  const cleaned = cleanLeadingWhitespace(String(raw));

  let formatted = escapeHtml(cleaned);
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  formatted = formatted.replace(/\n\n+/g, '</p><p>');
  formatted = formatted.replace(/\n/g, '<br>');

  formatted = '<p>' + formatted + '</p>';
  formatted = formatted.replace(/<p>\s*<\/p>/g, '');
  formatted = formatted.replace(/<p><\/p>/g, '');

  return formatted;
}
