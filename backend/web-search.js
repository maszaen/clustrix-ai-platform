const https = require('https');
const cheerio = require('cheerio');
const { getJson } = require('serpapi');

function log(logHelper, context, func, message, details = {}) {
  if (typeof logHelper === 'function') {
    try {
      logHelper(context, func, message, details);
    } catch (err) {
      console.warn('web-search logHelper failed:', err.message);
    }
  }
}

async function performWebSearch(queries, config, logHelper) {
  if (!Array.isArray(queries) || queries.length === 0) {
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Skipping search - no queries received.');
    return [];
  }

  if (!config || typeof config !== 'object') {
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Invalid or missing search configuration.', { config });
    return [];
  }

  const provider = config.provider || 'serpapi';
  log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Starting search with provider ${provider}.`, { queries });

  if (provider === 'google') {
    if (!config.googleApiKey || !config.googleCseId) {
      log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Missing Google API key or CSE ID.', { config });
      return [];
    }

    try {
      const promises = queries.map((q) => new Promise((resolve, reject) => {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', config.googleApiKey);
        url.searchParams.set('cx', config.googleCseId);
        url.searchParams.set('q', q);
        url.searchParams.set('hl', 'id');
        url.searchParams.set('gl', 'id');

        log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Dispatching Google CSE request.', { query: q });

        const req = https.get(url, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch (error) {
                log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Failed parsing Google CSE response.', { error: error.message });
                resolve({ items: [] });
              }
            } else {
              log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Google CSE HTTP ${res.statusCode}.`, { response: data });
              resolve({ items: [] });
            }
          });
        });

        req.on('error', (err) => {
          log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Google CSE request failed.', { error: err.message });
          resolve({ items: [] });
        });
      }));

      const responses = await Promise.all(promises);
      const transformed = responses
        .flatMap((res) => Array.isArray(res.items) ? res.items : [])
        .map((item) => ({
          link: item.link,
          title: item.title,
          snippet: item.snippet,
        }))
        .filter((item) => item.link && !item.link.includes('youtube.com'))
        .slice(0, 5);

      log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Google CSE returned ${transformed.length} results.`);
      return transformed;
    } catch (error) {
      log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Google CSE fatal error.', { error: error.message });
      return [];
    }
  }

  // Default to SerpAPI
  if (!config.serpApiKey) {
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Missing SerpAPI key.', { config });
    return [];
  }

  try {
    const responses = await Promise.all(
      queries.map((q) => getJson({ q, api_key: config.serpApiKey, hl: 'id', gl: 'id' }))
    );
    const organicResults = responses
      .flatMap((res) => Array.isArray(res.organic_results) ? res.organic_results : [])
      .filter((item) => item.link && !item.link.includes('youtube.com'))
      .slice(0, 5);

    log(logHelper, 'WEB_SEARCH', 'performWebSearch', `SerpAPI returned ${organicResults.length} results.`);
    return organicResults;
  } catch (error) {
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'SerpAPI fatal error.', { error: error.message });
    return [];
  }
}

async function scrapeUrls(urls, logHelper) {
  if (!Array.isArray(urls) || urls.length === 0) {
    log(logHelper, 'WEB_SEARCH', 'scrapeUrls', 'No URLs to scrape.');
    return [];
  }

  const MAX_CHARS_PER_PAGE = 2000;
  const scrapePromises = urls.map(async (url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        log(logHelper, 'WEB_SEARCH', 'scrapeUrls', 'Fetch failed.', { url, status: response.status });
        return '';
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header, aside, form').remove();
      const text = $('body').text().replace(/\s\s+/g, ' ').trim();
      return text.substring(0, MAX_CHARS_PER_PAGE);
    } catch (error) {
      log(logHelper, 'WEB_SEARCH', 'scrapeUrls', 'Error scraping URL.', { url, error: error.message });
      return '';
    }
  });

  return Promise.all(scrapePromises);
}

module.exports = {
  performWebSearch,
  scrapeUrls,
};
