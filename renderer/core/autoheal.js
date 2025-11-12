const PREVIEW_LIMIT = 200;

function createLogger(logger) {
  if (typeof logger !== 'function') {
    return () => {};
  }

  return (level, fn, message, details = {}) => {
    try {
      logger(level, fn, message, details);
    } catch (err) {
      // Swallow logging errors to keep healing resilient
    }
  };
}

function preview(value) {
  if (typeof value !== 'string') return '';
  if (value.length <= PREVIEW_LIMIT) return value;
  return `${value.slice(0, PREVIEW_LIMIT)}…`;
}

function autoheal(response, options = {}) {
  const { logger: rawLogger } = options;
  const log = createLogger(rawLogger);
  let working = typeof response === 'string' ? response : '';

  log(1, 'autoheal:start', 'Autoheal invoked', {
    originalPreview: preview(working),
  });

  const applyTransform = (stage, transform) => {
    const before = working;
    const after = transform(before);
    if (before !== after) {
      log(1, `autoheal:${stage}`, 'Applied autoheal transformation', {
        stage,
        before: preview(before),
        after: preview(after),
      });
    }
    working = after;
  };

  applyTransform('trim', (value) => value.trim());
  applyTransform('normalize-try-open', (value) => value.replace(/<TRY>/gi, '<try>'));
  applyTransform('normalize-try-close', (value) => value.replace(/<\/TRY>/gi, '</try>'));
  applyTransform('normalize-li-open', (value) => value.replace(/<LI>/gi, '<li>'));
  applyTransform('normalize-li-close', (value) => value.replace(/<\/LI>/gi, '</li>'));
  applyTransform('normalize-try-title-open', (value) => value.replace(/<TRY-TITLE>/gi, '<try-title>'));
  applyTransform('normalize-try-title-close', (value) => value.replace(/<\/TRY-TITLE>/gi, '</try-title>'));
  applyTransform('fix-li-join', (value) => value.replace(/<\/li<li>/g, '</li><li>'));
  applyTransform('close-li', (value) =>
    value.replace(/<li>([^<]*?)(?=<li|<\/try-title|<\/try|$)/g, '<li>$1</li>'),
  );

  let prefix = '';
  let suffix = '';

  const tryOpenIndex = working.indexOf('<try>');
  if (tryOpenIndex > 0) {
    prefix = working.slice(0, tryOpenIndex);
    working = working.slice(tryOpenIndex);
    log(1, 'autoheal:preserve-prefix', 'Preserved leading content outside <try>', {
      prefixPreview: preview(prefix),
    });
  }

  const tryCloseIndex = working.lastIndexOf('</try>');
  if (tryCloseIndex !== -1 && tryCloseIndex + 6 < working.length) {
    suffix = working.slice(tryCloseIndex + 6);
    working = working.slice(0, tryCloseIndex + 6);
    log(1, 'autoheal:preserve-suffix', 'Preserved trailing content outside </try>', {
      suffixPreview: preview(suffix),
    });
  }

  const finalize = (healed = '') => `${prefix}${healed}${suffix}`;

  if (!working.startsWith('<try>')) {
    const before = working;
    working = `<try>${working}`;
    log(1, 'autoheal:ensure-try-open', 'Added missing <try> opening tag', {
      before: preview(before),
      after: preview(working),
    });
  }

  if (!working.endsWith('</try>')) {
    const before = working;
    working = `${working}</try>`;
    log(1, 'autoheal:ensure-try-close', 'Added missing </try> closing tag', {
      before: preview(before),
      after: preview(working),
    });
  }

  const tryMatch = working.match(/^<try>([\s\S]*)<\/try>$/);
  if (!tryMatch) {
    log(2, 'autoheal:skip', 'Unable to locate <try> wrapper, returning raw response', {
      preview: preview(working),
    });
    return finalize(working);
  }

  let content = tryMatch[1];

  if (content.trim() === '') {
    const healed = '<try></try>';
    log(1, 'autoheal:empty', 'Normalized empty try block', {
      before: preview(working),
      after: healed,
    });
    return finalize(healed);
  }

  if (!content.includes('<')) {
    const healed = `<try><li>${content}</li></try>`;
    log(1, 'autoheal:plain-text', 'Wrapped plain text in list item', {
      plainText: preview(content),
      resultPreview: preview(healed),
    });
    return finalize(healed);
  }

  let title = '';
  const titleRegex = /<try-title>([\s\S]*?)<\/try-title>/;
  const titleMatch = content.match(titleRegex);
  if (titleMatch) {
    title = titleMatch[0];
    content = content.replace(titleMatch[0], '');
    log(1, 'autoheal:title-extract', 'Extracted try-title block', {
      titlePreview: preview(title),
    });
  } else {
    const titleStart = content.indexOf('<try-title>');
    if (titleStart !== -1) {
      let titleEnd = content.indexOf('</try-title>', titleStart);
      if (titleEnd === -1) {
        const titleContent = content.slice(titleStart + 11).split('<')[0];
        const endPos = titleStart + 11 + titleContent.length;
        title = `<try-title>${titleContent}</try-title>`;
        content = content.slice(0, titleStart) + content.slice(endPos);
        log(1, 'autoheal:title-heal', 'Reconstructed missing </try-title> tag', {
          titlePreview: preview(title),
        });
      } else {
        title = content.slice(titleStart, titleEnd + 13);
        content = content.slice(0, titleStart) + content.slice(titleEnd + 13);
        log(1, 'autoheal:title-trim', 'Normalized try-title placement', {
          titlePreview: preview(title),
        });
      }
    }
  }

  let lis = [];
  const liRegex = /<li>([\s\S]*?)<\/li>/gs;
  let match;
  while ((match = liRegex.exec(content)) !== null) {
    lis.push(`<li>${match[1]}</li>`);
  }

  if (lis.length === 0) {
    log(2, 'autoheal:no-list-items', 'No list items found during autoheal', {
      contentPreview: preview(content),
    });
  }

  const uniqueLis = [...new Set(lis)];
  if (uniqueLis.length !== lis.length) {
    log(1, 'autoheal:dedupe', 'Removed duplicate list items', {
      removed: lis.length - uniqueLis.length,
    });
  }
  lis = uniqueLis;

  let result = '<try>' + title;
  for (const li of lis) {
    result += li;
  }
  result += '</try>';

  log(1, 'autoheal:complete', 'Autoheal completed', {
    finalPreview: preview(result),
  });

  return finalize(result);
}

function hasMalformedTags(response, options = {}) {
  const { logger: rawLogger } = options;
  const log = createLogger(rawLogger);
  const text = typeof response === 'string' ? response : '';

  if (text.includes('<try>') && !/^<try>[\s\S]*<\/try>$/.test(text)) {
    log(1, 'hasMalformedTags', 'Detected incomplete <try> wrapper', {
      preview: preview(text),
    });
    return true;
  }

  const titleCount = (text.match(/<try-title>/g) || []).length;
  const titleCloseCount = (text.match(/<\/try-title>/g) || []).length;
  if (titleCount !== titleCloseCount) {
    log(1, 'hasMalformedTags', 'Detected unbalanced <try-title> tags', {
      preview: preview(text),
      openCount: titleCount,
      closeCount: titleCloseCount,
    });
    return true;
  }

  const liCount = (text.match(/<li>/g) || []).length;
  const liCloseCount = (text.match(/<\/li>/g) || []).length;
  if (liCount !== liCloseCount) {
    log(1, 'hasMalformedTags', 'Detected unbalanced <li> tags', {
      preview: preview(text),
      openCount: liCount,
      closeCount: liCloseCount,
    });
    return true;
  }

  return false;
}

export { autoheal, hasMalformedTags };