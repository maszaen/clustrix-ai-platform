const { logWithContext } = require('../../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const usageStatsCache = new Map();

function log(context, level, func, message, details = {}) {
  logWithContext(context, func, message, details);
}

function normalizeTimestamp(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const num = Number(input);
  if (!Number.isFinite(num)) {
    return null;
  }
  if (num > 1e15) {
    return Math.floor(num / 1000);
  }
  if (num < 1e12) {
    return Math.round(num * 1000);
  }
  return Math.round(num);
}

function formatDateKey(timestamp) {
  const normalized = normalizeTimestamp(timestamp);
  if (normalized === null) {
    return null;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value, fallbackDate) {
  if (!value || typeof value !== 'string') {
    return new Date(fallbackDate.getTime());
  }
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return new Date(fallbackDate.getTime());
  }
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallbackDate.getTime());
  }
  return parsed;
}

function toEndOfDay(date) {
  const end = new Date(date.getTime());
  end.setHours(23, 59, 59, 999);
  return end;
}

function normalizeTokens(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return Math.round(num);
}

function getCacheKey(startTs, endTs, provider) {
  return `${startTs}:${endTs}:${provider || 'ALL'}`;
}

function getCachedResult(key) {
  const cached = usageStatsCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    usageStatsCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCachedResult(key, payload) {
  usageStatsCache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function collectRange(filters = {}) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = toEndOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const startDate = filters.startDate
    ? parseDateInput(filters.startDate, defaultStart)
    : defaultStart;
  const endDate = filters.endDate
    ? toEndOfDay(parseDateInput(filters.endDate, defaultEnd))
    : defaultEnd;

  let startTs = startDate.getTime();
  let endTs = endDate.getTime();

  if (!Number.isFinite(startTs)) {
    startTs = defaultStart.getTime();
  }
  if (!Number.isFinite(endTs)) {
    endTs = defaultEnd.getTime();
  }

  if (startTs > endTs) {
    const tmp = startTs;
    startTs = endTs;
    endTs = tmp;
  }

  return {
    startTs,
    endTs,
    startIso: new Date(startTs).toISOString(),
    endIso: new Date(endTs).toISOString(),
  };
}

function computeSummary(dailyTotals, providerTotals, modelTotals, totalTokens, dayCount) {
  let topProvider = null;
  let topProviderTokens = 0;
  for (const [provider, tokens] of providerTotals.entries()) {
    if (tokens > topProviderTokens) {
      topProviderTokens = tokens;
      topProvider = provider;
    }
  }

  let topModel = null;
  let topModelTokens = 0;
  for (const [model, tokens] of modelTotals.entries()) {
    if (tokens > topModelTokens) {
      topModelTokens = tokens;
      topModel = model;
    }
  }

  const averageDailyTokens = dayCount > 0 ? totalTokens / dayCount : 0;

  return {
    totalTokens,
    averageDailyTokens,
    mostUsedProvider: topProvider ? { name: topProvider, tokens: topProviderTokens } : null,
    mostUsedModel: topModel ? { name: topModel, tokens: topModelTokens } : null,
  };
}

function buildEntries(dailyMap) {
  const sortedDates = Array.from(dailyMap.keys()).sort();
  const entries = [];
  for (const date of sortedDates) {
    const providerMap = dailyMap.get(date);
    const providers = Array.from(providerMap.keys()).sort((a, b) => a.localeCompare(b));
    for (const provider of providers) {
      const modelMap = providerMap.get(provider);
      const models = Array.from(modelMap.keys()).sort((a, b) => a.localeCompare(b));
      for (const model of models) {
        entries.push({
          date,
          provider,
          model,
          tokens: modelMap.get(model),
        });
      }
    }
  }
  return entries;
}

/**
 * Query usage statistics for the provided range.
 * @param {import('./database-manager')} dbManager - Database manager instance.
 * @param {Object} [filters] - Filter options.
 * @param {string} [filters.startDate] - ISO date (YYYY-MM-DD) for start of range.
 * @param {string} [filters.endDate] - ISO date (YYYY-MM-DD) for end of range.
 * @param {string} [filters.provider] - Provider name filter.
 * @returns {Promise<Object>} Aggregated usage data.
 */
async function queryUsageStatistics(dbManager, filters = {}) {
  if (!dbManager || !dbManager.db) {
    throw new Error('Database manager not available');
  }

  const { startTs, endTs, startIso, endIso } = collectRange(filters);
  const providerFilter = filters.provider ? String(filters.provider) : null;
  const cacheKey = getCacheKey(startTs, endTs, providerFilter);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  // Debug logging
  log('USAGE_STATS', 1, 'queryUsageStatistics', 'Query range', {
    startTs,
    endTs,
    startIso,
    endIso,
    startDate: new Date(startTs).toISOString(),
    endDate: new Date(endTs).toISOString(),
    filters
  });

  const params = [startTs, endTs];
  let baseQuery = `
    SELECT created_at, provider, model_id, metadata
    FROM messages
    WHERE deleted = 0 AND created_at BETWEEN ? AND ?
  `;
  if (providerFilter) {
    baseQuery += ' AND provider = ?';
    params.push(providerFilter);
  }
  baseQuery += ' ORDER BY created_at ASC';

  const providerStmt = dbManager.db.prepare(`
    SELECT DISTINCT provider
    FROM messages
    WHERE deleted = 0 AND created_at BETWEEN ? AND ?
  `);
  const providerRows = providerStmt.all(startTs, endTs);
  const providerSet = new Set();
  for (const row of providerRows) {
    providerSet.add(row.provider || 'Unknown');
  }

  const stmt = dbManager.db.prepare(baseQuery);
  const rows = stmt.all(...params);

  // Debug: Check actual metadata structure from sample messages
  const sampleMetadataStmt = dbManager.db.prepare(`
    SELECT created_at, provider, model_id, metadata 
    FROM messages 
    WHERE deleted = 0 AND metadata IS NOT NULL AND metadata != ''
    ORDER BY created_at DESC 
    LIMIT 3
  `);
  const sampleRows = sampleMetadataStmt.all();
  log('USAGE_STATS', 1, 'queryUsageStatistics', 'Sample metadata from database', {
    samples: sampleRows.map(r => {
      let parsed = null;
      try {
        parsed = JSON.parse(r.metadata);
      } catch (e) {
        parsed = 'PARSE_ERROR';
      }
      return {
        created_at: r.created_at,
        date: new Date(normalizeTimestamp(r.created_at)).toISOString(),
        provider: r.provider,
        model_id: r.model_id,
        metadata: parsed
      };
    })
  });

  // Debug: Check ALL messages in database for comparison
  const totalCountStmt = dbManager.db.prepare(`
    SELECT COUNT(*) as total, MIN(created_at) as oldest, MAX(created_at) as newest
    FROM messages 
    WHERE deleted = 0
  `);
  const totalCount = totalCountStmt.get();
  
  const allMessagesStmt = dbManager.db.prepare(`
    SELECT created_at, provider, model_id 
    FROM messages 
    WHERE deleted = 0 
    ORDER BY created_at ASC
    LIMIT 10
  `);
  const oldestMessages = allMessagesStmt.all();
  
  const newestStmt = dbManager.db.prepare(`
    SELECT created_at, provider, model_id 
    FROM messages 
    WHERE deleted = 0 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  const newestMessages = newestStmt.all();
  
  log('USAGE_STATS', 1, 'queryUsageStatistics', 'Database statistics', {
    totalMessages: totalCount.total,
    oldestTimestamp: totalCount.oldest,
    oldestDate: new Date(normalizeTimestamp(totalCount.oldest)).toISOString(),
    newestTimestamp: totalCount.newest,
    newestDate: new Date(normalizeTimestamp(totalCount.newest)).toISOString(),
    oldest10: oldestMessages.map(m => ({
      created_at: m.created_at,
      date: new Date(normalizeTimestamp(m.created_at)).toISOString(),
      provider: m.provider
    })),
    newest10: newestMessages.map(m => ({
      created_at: m.created_at,
      date: new Date(normalizeTimestamp(m.created_at)).toISOString(),
      provider: m.provider
    })),
    queryStartTs: startTs,
    queryEndTs: endTs
  });

  // Debug: Show query results
  log('USAGE_STATS', 1, 'queryUsageStatistics', 'Query returned messages', {
    rowCount: rows.length,
    sampleTimestamps: rows.slice(0, 5).map(r => ({
      created_at: r.created_at,
      normalized: normalizeTimestamp(r.created_at),
      date: new Date(normalizeTimestamp(r.created_at)).toISOString(),
      provider: r.provider,
      hasMetadata: !!r.metadata
    }))
  });

  const dailyMap = new Map();
  const dailyTotals = new Map();
  const providerTotals = new Map();
  const modelTotals = new Map();
  let totalTokens = 0;
  let skippedCount = 0;
  let skippedSamples = [];

  for (const row of rows) {
    const createdAt = normalizeTimestamp(row.created_at);
    const dateKey = formatDateKey(createdAt);
    if (!dateKey) continue;

    let metadata = {};
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : {};
    } catch (error) {
      metadata = {};
    }

    const usage = metadata?.usage || {};
    const tokens = normalizeTokens(
      usage.total_tokens ?? 
      usage.totalTokenCount ?? 
      usage.totalTokens ?? 
      usage.total ??
      // Fallback: calculate from prompt + completion if total not available
      ((usage.prompt_tokens || usage.promptTokenCount || 0) + 
       (usage.completion_tokens || usage.candidatesTokenCount || 0))
    );
    
    // Debug: Log token parsing
    if (totalTokens === 0 && tokens > 0) {
      log('USAGE_STATS', 1, 'queryUsageStatistics', 'First message with tokens', {
        dateKey,
        createdAt,
        provider: row.provider,
        tokens,
        usage
      });
    }
    
    if (tokens <= 0) {
      skippedCount++;
      if (skippedSamples.length < 5) {
        skippedSamples.push({
          dateKey,
          created_at: row.created_at,
          provider: row.provider,
          hasMetadata: !!row.metadata,
          usage: usage
        });
      }
      continue;
    }

    const provider = (row.provider || metadata.provider || 'Unknown').trim() || 'Unknown';
    const model = (row.model_id || metadata.model || metadata.modelLabel || 'Unknown').trim() || 'Unknown';

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, new Map());
    }
    const providerMap = dailyMap.get(dateKey);
    if (!providerMap.has(provider)) {
      providerMap.set(provider, new Map());
    }
    const modelMap = providerMap.get(provider);
    modelMap.set(model, (modelMap.get(model) || 0) + tokens);

    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + tokens);
    providerTotals.set(provider, (providerTotals.get(provider) || 0) + tokens);
    modelTotals.set(model, (modelTotals.get(model) || 0) + tokens);
    providerSet.add(provider);
    totalTokens += tokens;
  }

  // Log skipped messages
  if (skippedCount > 0) {
    log('USAGE_STATS', 2, 'queryUsageStatistics', 'Skipped messages without usage data', {
      skippedCount,
      processedCount: rows.length - skippedCount,
      skippedSamples
    });
  }

  const dayCount = Math.max(1, Math.floor((endTs - startTs) / DAY_MS) + 1);
  const summary = computeSummary(dailyTotals, providerTotals, modelTotals, totalTokens, dayCount);
  const entries = buildEntries(dailyMap);

  const payload = {
    range: { start: startIso, end: endIso },
    entries,
    providers: Array.from(providerSet).sort((a, b) => a.localeCompare(b)),
    summary,
    dailyTotals: Object.fromEntries(Array.from(dailyTotals.entries()).sort()),
  };

  setCachedResult(cacheKey, payload);
  return payload;
}

/**
 * Clear cached usage statistics results.
 */
function invalidateUsageStatisticsCache() {
  usageStatsCache.clear();
}

module.exports = {
  queryUsageStatistics,
  invalidateUsageStatisticsCache,
};
