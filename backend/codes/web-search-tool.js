// ===================================================================
// WEB SEARCH TOOL - Shared helper for code agents
// ===================================================================
//
// Provides web search capability for OpenAI, Claude, and Gemini agents.
// Uses existing performWebSearch and scrapeUrls from backend/search/web-search.js
//
// Input: queries array (min 2, max 6)
// Output: Formatted search results with scraped content
//   - Top 3 super relevant: 50% length (~1000 chars each)
//   - Others: max 2000 chars total
//
// ===================================================================

const path = require('path');
const fs = require('fs');
const { performWebSearch, scrapeUrls } = require('../search/web-search');
const { log: appLog } = require('../../utils/logger');

// Get electron app safely (may not be available in all contexts)
let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (e) {
  // Not in electron context
}

function webSearchLog(level, fn, message, details = {}) {
  try {
    appLog('WEB-SEARCH-TOOL', level, fn, message, details);
  } catch (error) {
    console.error('[WEB-SEARCH-TOOL]', message, details, error?.message);
  }
}

/**
 * Load search API config from database settings
 * @param {Object} db - Database manager instance
 */
function loadSearchConfigFromDb(db) {
  try {
    if (!db || typeof db.getSetting !== 'function') {
      webSearchLog(2, 'loadSearchConfigFromDb', 'No database instance provided');
      return null;
    }

    const provider = db.getSetting('searchApiProvider');
    const serpApiKey = db.getSetting('serpApiKey');
    const googleApiKey = db.getSetting('googleApiKey');
    const googleCseId = db.getSetting('googleCseId');

    if (serpApiKey || googleApiKey) {
      const config = {
        provider: provider || (serpApiKey ? 'serpapi' : 'google'),
        serpApiKey: serpApiKey || '',
        googleApiKey: googleApiKey || '',
        googleCseId: googleCseId || ''
      };
      
      webSearchLog(1, 'loadSearchConfigFromDb', 'Search config loaded from database', {
        provider: config.provider,
        hasSerpKey: !!config.serpApiKey,
        hasGoogleKey: !!config.googleApiKey
      });
      
      return config;
    }

    webSearchLog(2, 'loadSearchConfigFromDb', 'No search API keys found in database settings');
    return null;
  } catch (error) {
    webSearchLog(3, 'loadSearchConfigFromDb', 'Failed to load search config from database', { error: error.message });
    return null;
  }
}

/**
 * Execute web search tool
 * @param {Object} input - Tool input
 * @param {string[]} input.queries - Array of search queries (min 2, max 6)
 * @param {Object} db - Database manager instance for loading config
 * @param {Object} searchConfig - Optional search config override
 * @returns {Promise<{success: boolean, output: string}>}
 */
async function executeWebSearch(input, db = null, searchConfig = null) {
  const { queries } = input;

  // Validate queries
  if (!Array.isArray(queries) || queries.length < 2) {
    return {
      success: false,
      output: 'Error: queries must be an array with at least 2 items'
    };
  }

  if (queries.length > 6) {
    return {
      success: false,
      output: 'Error: queries array cannot exceed 6 items'
    };
  }

  // Load config: prefer passed config, then try database
  const config = searchConfig || loadSearchConfigFromDb(db);
  if (!config || (!config.serpApiKey && !config.googleApiKey)) {
    return {
      success: false,
      output: 'Error: No search API configured. Please configure SerpAPI or Google Custom Search API in settings.'
    };
  }

  webSearchLog(1, 'executeWebSearch', 'Starting web search', { 
    queriesCount: queries.length,
    provider: config.provider || 'serpapi'
  });

  try {
    // Perform web search
    const searchResults = await performWebSearch(
      queries,
      config,
      (ctx, fn, msg, details) => webSearchLog(1, fn, msg, details),
      { includeImages: false, resultCount: 10 }
    );

    if (!searchResults || searchResults.length === 0) {
      return {
        success: true,
        output: 'No search results found for the given queries.'
      };
    }

    webSearchLog(1, 'executeWebSearch', 'Search completed', { 
      resultsCount: searchResults.length 
    });

    // Get URLs to scrape (only web results, not images)
    const webResults = searchResults.filter(r => r.type === 'web');
    const urlsToScrape = webResults.slice(0, 6).map(r => r.link);

    // Scrape content from URLs
    const scrapedContents = await scrapeUrls(
      urlsToScrape,
      (ctx, fn, msg, details) => webSearchLog(1, fn, msg, details),
      6
    );

    // Format output with relevance-based truncation
    const output = formatSearchOutput(webResults, scrapedContents);

    webSearchLog(1, 'executeWebSearch', 'Web search completed successfully', {
      resultsFormatted: webResults.length
    });

    return {
      success: true,
      output
    };
  } catch (error) {
    webSearchLog(3, 'executeWebSearch', 'Web search failed', { error: error.message });
    return {
      success: false,
      output: `Web search error: ${error.message}`
    };
  }
}

/**
 * Format search results with scraped content
 * - Top 3 results: 50% length (~1000 chars each)
 * - Remaining results: max 2000 chars total
 */
function formatSearchOutput(webResults, scrapedContents) {
  const lines = ['## Web Search Results\n'];
  
  const TOP_RESULTS_COUNT = 3;
  const TOP_RESULT_MAX_CHARS = 1000; // 50% of ~2000 typical scrape
  const OTHER_RESULTS_TOTAL_CHARS = 2000;
  
  let otherCharsUsed = 0;

  for (let i = 0; i < webResults.length; i++) {
    const result = webResults[i];
    const scrapedContent = scrapedContents[i] || '';
    
    lines.push(`### ${i + 1}. ${result.title || 'Untitled'}`);
    lines.push(`URL: ${result.link}`);
    
    if (result.snippet) {
      lines.push(`Summary: ${result.snippet}`);
    }

    // Add scraped content with relevance-based truncation
    if (scrapedContent) {
      let contentToAdd = '';
      
      if (i < TOP_RESULTS_COUNT) {
        // Top 3 results: 50% length (max 1000 chars)
        contentToAdd = scrapedContent.substring(0, TOP_RESULT_MAX_CHARS);
        if (scrapedContent.length > TOP_RESULT_MAX_CHARS) {
          contentToAdd += '... [truncated]';
        }
      } else {
        // Other results: share 2000 chars total
        const remainingChars = OTHER_RESULTS_TOTAL_CHARS - otherCharsUsed;
        if (remainingChars > 100) {
          const charsForThis = Math.min(remainingChars, 400); // Max 400 per other result
          contentToAdd = scrapedContent.substring(0, charsForThis);
          otherCharsUsed += contentToAdd.length;
          if (scrapedContent.length > charsForThis) {
            contentToAdd += '... [truncated]';
          }
        }
      }

      if (contentToAdd) {
        lines.push(`\nContent:\n${contentToAdd}`);
      }
    }

    lines.push(''); // Empty line between results
  }

  return lines.join('\n');
}

// Tool definition for OpenAI format
const WEB_SEARCH_TOOL_OPENAI = {
  type: "function",
  function: {
    name: "web_search",
    description: `Search the web for current information. Use this when you need up-to-date information that may not be in your training data, or when the user asks about recent events, current prices, latest versions, etc.

USAGE:
- Provide 2-6 search queries for comprehensive results
- Queries should be specific and varied to cover different aspects
- Results include scraped web content for detailed information

EXAMPLE:
queries: ["latest Node.js version 2024", "Node.js 22 new features"]`,
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 6,
          description: "Array of search queries (minimum 2, maximum 6). Use varied queries for better coverage."
        },
        commentary: {
          type: "string",
          description: "Brief explanation of why you're searching (e.g., 'Looking up latest React version')"
        }
      },
      required: ["queries"]
    }
  }
};

// Tool definition for Claude format
const WEB_SEARCH_TOOL_CLAUDE = {
  name: "web_search",
  description: `Search the web for current information. Use this when you need up-to-date information that may not be in your training data, or when the user asks about recent events, current prices, latest versions, etc.

USAGE:
- Provide 2-6 search queries for comprehensive results
- Queries should be specific and varied to cover different aspects
- Results include scraped web content for detailed information

EXAMPLE:
queries: ["latest Node.js version 2024", "Node.js 22 new features"]`,
  input_schema: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 6,
        description: "Array of search queries (minimum 2, maximum 6). Use varied queries for better coverage."
      },
      commentary: {
        type: "string",
        description: "Brief explanation of why you're searching (e.g., 'Looking up latest React version')"
      }
    },
    required: ["queries"]
  }
};

// Tool definition for Gemini format
const WEB_SEARCH_TOOL_GEMINI = {
  name: "web_search",
  description: `Search the web for current information. Use this when you need up-to-date information that may not be in your training data, or when the user asks about recent events, current prices, latest versions, etc.

USAGE:
- Provide 2-6 search queries for comprehensive results
- Queries should be specific and varied to cover different aspects
- Results include scraped web content for detailed information

EXAMPLE:
queries: ["latest Node.js version 2024", "Node.js 22 new features"]`,
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 6,
        description: "Array of search queries (minimum 2, maximum 6). Use varied queries for better coverage."
      },
      commentary: {
        type: "string",
        description: "Brief explanation of why you're searching (e.g., 'Looking up latest React version')"
      }
    },
    required: ["queries"]
  }
};

module.exports = {
  executeWebSearch,
  loadSearchConfigFromDb,
  WEB_SEARCH_TOOL_OPENAI,
  WEB_SEARCH_TOOL_CLAUDE,
  WEB_SEARCH_TOOL_GEMINI
};
