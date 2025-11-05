/**
 * GitHub API Utilities
 * Handles interactions with GitHub releases API
 */

/**
 * Get latest release from GitHub
 * @returns {Promise<Object>} Release information
 */
export async function getLatestRelease() {
  if (!process.env.GH_TOKEN) {
    throw new Error('GH_TOKEN environment variable is not set');
  }

  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/releases/latest`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Get all releases from GitHub
 * @param {number} page - Page number for pagination
 * @param {number} perPage - Number of releases per page
 * @returns {Promise<Array>} Array of releases
 */
export async function getReleases(page = 1, perPage = 10) {
  if (!process.env.GH_TOKEN) {
    throw new Error('GH_TOKEN environment variable is not set');
  }

  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/releases?page=${page}&per_page=${perPage}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Generate signed download URL for a GitHub release asset
 * This creates a temporary authenticated URL that expires
 *
 * @param {number} assetId - GitHub asset ID
 * @param {number} expiresIn - Expiration time in seconds (default 3600 = 1 hour)
 * @returns {Promise<string>} Signed download URL
 */
export async function generateSignedDownloadUrl(assetId, expiresIn = 3600) {
  if (!process.env.GH_TOKEN) {
    throw new Error('GH_TOKEN environment variable is not set');
  }

  // GitHub API provides a redirect URL for assets
  // We need to get the actual download URL first
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/releases/assets/${assetId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.GH_TOKEN}`,
        'Accept': 'application/octet-stream',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      redirect: 'manual' // Don't follow redirects
    }
  );

  // GitHub returns a 302 redirect with the download URL
  const downloadUrl = response.headers.get('location');

  if (!downloadUrl) {
    throw new Error('Failed to get download URL from GitHub');
  }

  // The redirect URL already contains authentication
  // and is time-limited by GitHub (typically 5-10 minutes)
  return downloadUrl;
}

/**
 * Find Windows installer asset in release
 * @param {Object} release - GitHub release object
 * @returns {Object|null} Asset object or null
 */
export function findWindowsInstaller(release) {
  if (!release || !release.assets) {
    return null;
  }

  // Look for .exe installer
  const installer = release.assets.find(asset =>
    asset.name.endsWith('.exe') &&
    (asset.name.includes('Setup') || asset.name.includes('Installer'))
  );

  return installer || null;
}

/**
 * Parse version string to compare versions
 * @param {string} version - Version string (e.g., "v1.2.3" or "1.2.3")
 * @returns {Array<number>} Array of version numbers [major, minor, patch]
 */
export function parseVersion(version) {
  const cleanVersion = version.replace(/^v/, '');
  return cleanVersion.split('.').map(n => parseInt(n, 10) || 0);
}

/**
 * Compare two version strings
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(version1, version2) {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}
