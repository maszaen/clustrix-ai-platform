function autoheal(response) {
  // Trim
  response = response.trim();

  // Normalize uppercase tags
  response = response.replace(/<TRY>/gi, '<try>');
  response = response.replace(/<\/TRY>/gi, '</try>');
  response = response.replace(/<LI>/gi, '<li>');
  response = response.replace(/<\/LI>/gi, '</li>');
  response = response.replace(/<TRY-TITLE>/gi, '<try-title>');
  response = response.replace(/<\/TRY-TITLE>/gi, '</try-title>');

  // Fix specific malformed
  response = response.replace(/<\/li<li>/g, '</li><li>');

  // Close unclosed <li>
  response = response.replace(/<li>([^<]*?)(?=<li|<\/try-title|<\/try|$)/g, '<li>$1</li>');

  // Ensure starts with <try>
  if (!response.startsWith('<try>')) {
    response = '<try>' + response;
  }

  // Ensure ends with </try>
  if (!response.endsWith('</try>')) {
    response = response + '</try>';
  }

  // Extract content inside <try>
  const tryMatch = response.match(/^<try>([\s\S]*)<\/try>$/);
  if (!tryMatch) return response; // fallback
  let content = tryMatch[1];

  // Handle plain text
  if (content.trim() === '') {
    return '<try></try>';
  } else if (!content.includes('<')) {
    return '<try><li>' + content + '</li></try>';
  }

  // Handle <try-title>
  let title = '';
  const titleRegex = /<try-title>([\s\S]*?)<\/try-title>/;
  const titleMatch = content.match(titleRegex);
  if (titleMatch) {
    title = titleMatch[0];
    content = content.replace(titleMatch[0], '');
  } else {
    // Look for unclosed
    const titleStart = content.indexOf('<try-title>');
    if (titleStart !== -1) {
      let titleEnd = content.indexOf('</try-title>', titleStart);
      if (titleEnd === -1) {
        // Find next tag
        const titleContent = content.slice(titleStart + 11).split('<')[0];
        const endPos = titleStart + 11 + titleContent.length;
        title = '<try-title>' + titleContent + '</try-title>';
        content = content.slice(0, titleStart) + content.slice(endPos);
      } else {
        title = content.slice(titleStart, titleEnd + 13);
        content = content.slice(0, titleStart) + content.slice(titleEnd + 13);
      }
    }
  }

  // Handle <li>
  let lis = [];
  const liRegex = /<li>([\s\S]*?)<\/li>/gs;
  let match;
  while ((match = liRegex.exec(content)) !== null) {
    lis.push('<li>' + match[1] + '</li>');
  }

  // Remove duplicates
  lis = [...new Set(lis)];

  // Rebuild
  let result = '<try>' + title;
  for (let li of lis) {
    result += li;
  }
  result += '</try>';

  return result;
}

function hasMalformedTags(response) {
  // Cek jika ada <try> tapi tidak lengkap
  if (response.includes('<try>') && !/^<try>[\s\S]*<\/try>$/.test(response)) return true;

  // Cek jika ada <try-title> tanpa </try-title>
  const titleCount = (response.match(/<try-title>/g) || []).length;
  const titleCloseCount = (response.match(/<\/try-title>/g) || []).length;
  if (titleCount !== titleCloseCount) return true;

  // Cek <li> tanpa </li>
  const liCount = (response.match(/<li>/g) || []).length;
  const liCloseCount = (response.match(/<\/li>/g) || []).length;
  if (liCount !== liCloseCount) return true;

  return false;
}

export { autoheal, hasMalformedTags };