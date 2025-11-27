
function padCell(content, width) {
    const padding = width - content.length;
    if (padding <= 0) return content;

    return content + ' '.repeat(padding);
}
