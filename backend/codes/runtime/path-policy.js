/** Reject platform aliases that can address protected metadata, devices or alternate data streams. */
function validateRelativePath(relative, platform = process.platform) {
  const segments = platform === 'win32' ? relative.split(/[\\/]/) : relative.split('/');
  for (const segment of segments) {
    if (segment.toLowerCase() === '.git') throw new Error('Direct access to .git is not permitted.');
    if (platform !== 'win32' || !segment || segment === '.') continue;
    if (/[. ]$/.test(segment) || /[:<>"|?*\x00-\x1f]/.test(segment)) {
      throw new Error('Windows path aliases and alternate data streams are not permitted.');
    }
    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)) {
      throw new Error('Windows device paths are not permitted.');
    }
  }
}

module.exports = { validateRelativePath };
