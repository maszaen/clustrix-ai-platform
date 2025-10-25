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

async function performWebSearch(queries, config, logHelper, options = {}) {
  if (!Array.isArray(queries) || queries.length === 0) {
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Skipping search - no queries received.');
    return [];
  }

  if (!config || typeof config !== 'object') {
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Invalid or missing search configuration.', { config });
    return [];
  }

  const provider = config.provider || 'serpapi';
  const includeImages = options.includeImages !== false;
  const imageCount = options.imageCount || 2;
  
  log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Starting search with provider ${provider}.`, { queries, includeImages });

  if (provider === 'google') {
    if (!config.googleApiKey || !config.googleCseId) {
      log(logHelper, 'WEB_SEARCH', 'performWebSearch', 'Missing Google API key or CSE ID.', { config });
      return [];
    }

    try {
      const makeGoogleRequest = (query, searchType = null) => new Promise((resolve, reject) => {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', config.googleApiKey);
        url.searchParams.set('cx', config.googleCseId);
        url.searchParams.set('q', query);
        url.searchParams.set('hl', 'id');
        url.searchParams.set('gl', 'id');
        if (searchType) {
          url.searchParams.set('searchType', searchType);
          url.searchParams.set('num', String(imageCount));
        }

        const logType = searchType === 'image' ? 'image search' : 'web search';
        log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Dispatching Google CSE ${logType} request.`, { query });

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
      });

      const webPromises = queries.map((q) => makeGoogleRequest(q, null));
      const allPromises = [...webPromises];
      
      if (includeImages && queries.length > 0) {
        const imagePromise = makeGoogleRequest(queries[0], 'image');
        allPromises.push(imagePromise);
      }

      const responses = await Promise.all(allPromises);
      const imageResponse = includeImages && responses.length > queries.length ? responses.pop() : null;
      
      const webResults = responses
        .flatMap((res) => Array.isArray(res.items) ? res.items : [])
        .map((item) => ({
          type: 'web',
          link: item.link,
          title: item.title,
          snippet: item.snippet,
        }))
        .filter((item) => item.link && !item.link.includes('youtube.com'))
        .slice(0, 5);

      const imageResults = imageResponse && Array.isArray(imageResponse.items)
        ? imageResponse.items.slice(0, imageCount).map((item) => ({
            type: 'image',
            link: item.link,
            title: item.title,
            snippet: item.snippet || item.image?.contextLink,
            thumbnail: item.image?.thumbnailLink,
          }))
        : [];

      const allResults = [...webResults, ...imageResults];
      log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Google CSE returned ${webResults.length} web + ${imageResults.length} image results.`);
      return allResults;
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
    const webPromises = queries.map((q) => 
      getJson({ q, api_key: config.serpApiKey, hl: 'id', gl: 'id' })
    );
    
    const allPromises = [...webPromises];
    if (includeImages && queries.length > 0) {
      const imagePromise = getJson({ 
        q: queries[0], 
        api_key: config.serpApiKey, 
        tbm: 'isch',
        hl: 'id', 
        gl: 'id',
        num: imageCount
      });
      allPromises.push(imagePromise);
    }

    const responses = await Promise.all(allPromises);
    const imageResponse = includeImages && responses.length > queries.length ? responses.pop() : null;
    
    const webResults = responses
      .flatMap((res) => Array.isArray(res.organic_results) ? res.organic_results : [])
      .map((item) => ({
        type: 'web',
        link: item.link,
        title: item.title,
        snippet: item.snippet,
      }))
      .filter((item) => item.link && !item.link.includes('youtube.com'))
      .slice(0, 5);

    const imageResults = imageResponse && Array.isArray(imageResponse.images_results)
      ? imageResponse.images_results.slice(0, imageCount).map((item) => ({
          type: 'image',
          link: item.original,
          title: item.title,
          snippet: item.source,
          thumbnail: item.thumbnail,
        }))
      : [];

    const allResults = [...webResults, ...imageResults];
    log(logHelper, 'WEB_SEARCH', 'performWebSearch', `SerpAPI returned ${webResults.length} web + ${imageResults.length} image results.`);
    return allResults;
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
