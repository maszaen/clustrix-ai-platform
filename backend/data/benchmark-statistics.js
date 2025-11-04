const { logWithContext } = require('../../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const benchmarkStatsCache = new Map();

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

function normalizeSpeed(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return num;
}

function getCacheKey(startTs, endTs, provider) {
  return `${startTs}:${endTs}:${provider || 'ALL'}`;
}

function getCachedResult(key) {
  const cached = benchmarkStatsCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    benchmarkStatsCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCachedResult(key, payload) {
  benchmarkStatsCache.set(key, {
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
    : new Date(defaultStart.getTime());
  const endDate = filters.endDate
    ? toEndOfDay(parseDateInput(filters.endDate, defaultEnd))
    : new Date(defaultEnd.getTime());

  const startTs = startDate.getTime();
  const endTs = endDate.getTime();

  return {
    startTs,
    endTs,
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}

/**
 * Calculate statistics (avg, min, max, median) from an array of speeds
 */
function calculateStats(speeds) {
  if (speeds.length === 0) {
    return { avg: 0, min: 0, max: 0, median: 0, count: 0 };
  }

  const sorted = [...speeds].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  let median;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    median = sorted[mid];
  }

  return {
    avg: Math.round(avg * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    median: Math.round(median * 100) / 100,
    count: sorted.length,
  };
}

/**
 * Build entries array for chart rendering
 */
function buildEntries(dailyMap) {
  const entries = [];
  for (const [date, providerMap] of dailyMap.entries()) {
    for (const [provider, modelMap] of providerMap.entries()) {
      for (const [model, speeds] of modelMap.entries()) {
        const stats = calculateStats(speeds);
        entries.push({
          date,
          provider,
          model,
          ...stats,
        });
      }
    }
  }
  return entries;
}

/**
 * Compute summary statistics
 */
function computeSummary(dailyStats, providerStats, modelStats, totalMessageCount) {
  // Calculate overall average speed
  const allSpeeds = [];
  for (const stats of dailyStats.values()) {
    allSpeeds.push(...stats);
  }
  const overallStats = calculateStats(allSpeeds);

  // Find fastest and slowest models
  let fastestModel = { name: 'N/A', speed: 0 };
  let slowestModel = { name: 'N/A', speed: Infinity };

  for (const [model, speeds] of modelStats.entries()) {
    const stats = calculateStats(speeds);
    if (stats.avg > fastestModel.speed && stats.count > 0) {
      fastestModel = { name: model, speed: stats.avg, count: stats.count };
    }
    if (stats.avg < slowestModel.speed && stats.count > 0) {
      slowestModel = { name: model, speed: stats.avg, count: stats.count };
    }
  }

  // Find most used provider (by message count)
  let mostUsedProvider = { name: 'N/A', count: 0 };
  for (const [provider, speeds] of providerStats.entries()) {
    if (speeds.length > mostUsedProvider.count) {
      mostUsedProvider = { name: provider, count: speeds.length };
    }
  }

  return {
    averageSpeed: overallStats.avg,
    medianSpeed: overallStats.median,
    minSpeed: overallStats.min,
    maxSpeed: overallStats.max,
    totalMessages: totalMessageCount,
    fastestModel: {
      name: fastestModel.name,
      speed: fastestModel.speed,
      count: fastestModel.count || 0,
    },
    slowestModel: slowestModel.speed === Infinity ? { name: 'N/A', speed: 0, count: 0 } : {
      name: slowestModel.name,
      speed: slowestModel.speed,
      count: slowestModel.count || 0,
    },
    mostUsedProvider: {
      name: mostUsedProvider.name,
      count: mostUsedProvider.count,
    },
  };
}

/**
 * Query benchmark statistics from the database
 */
async function queryBenchmarkStatistics(dbManager, filters = {}) {
  if (!dbManager || !dbManager.db) {
    throw new Error('Database manager not available');
  }

  const { startTs, endTs, startIso, endIso } = collectRange(filters);
  const providerFilter = filters.provider ? String(filters.provider) : null;
  const modelFilter = filters.model ? String(filters.model) : null;
  const cacheKey = getCacheKey(startTs, endTs, providerFilter);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  const params = [startTs, endTs];
  let baseQuery = `
    SELECT created_at, provider, model_id, metadata
    FROM messages
    WHERE deleted = 0 AND role = 'assistant' AND created_at BETWEEN ? AND ?
  `;
  if (providerFilter) {
    baseQuery += ' AND provider = ?';
    params.push(providerFilter);
  }
  baseQuery += ' ORDER BY created_at ASC';

  const providerStmt = dbManager.db.prepare(`
    SELECT DISTINCT provider
    FROM messages
    WHERE deleted = 0 AND role = 'assistant' AND created_at BETWEEN ? AND ?
  `);
  const providerRows = providerStmt.all(startTs, endTs);
  const providerSet = new Set();
  for (const row of providerRows) {
    providerSet.add(row.provider || 'Unknown');
  }

  const stmt = dbManager.db.prepare(baseQuery);
  const rows = stmt.all(...params);

  const dailyMap = new Map(); // dateKey -> provider -> model -> [speeds]
  const dailyStats = new Map(); // dateKey -> [speeds]
  const providerStats = new Map(); // provider -> [speeds]
  const modelStats = new Map(); // model -> [speeds]
  const modelSet = new Set();
  const modelToProvider = new Map();
  let totalMessageCount = 0;
  let skippedCount = 0;

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
    const tokenSpeed = normalizeSpeed(usage.token_speed);

    // Skip messages without token speed data
    if (tokenSpeed <= 0) {
      skippedCount++;
      continue;
    }

    const provider = (row.provider || metadata.provider || 'Unknown').trim() || 'Unknown';
    const model = (row.model_id || metadata.model || metadata.modelLabel || 'Unknown').trim() || 'Unknown';

    // Skip if model filter is set and doesn't match
    if (modelFilter && model !== modelFilter) {
      continue;
    }

    // Build daily map for chart entries
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, new Map());
    }
    const providerMap = dailyMap.get(dateKey);
    if (!providerMap.has(provider)) {
      providerMap.set(provider, new Map());
    }
    const modelMap = providerMap.get(provider);
    if (!modelMap.has(model)) {
      modelMap.set(model, []);
    }
    modelMap.get(model).push(tokenSpeed);

    // Collect stats for summary
    if (!dailyStats.has(dateKey)) {
      dailyStats.set(dateKey, []);
    }
    dailyStats.get(dateKey).push(tokenSpeed);

    if (!providerStats.has(provider)) {
      providerStats.set(provider, []);
    }
    providerStats.get(provider).push(tokenSpeed);

    if (!modelStats.has(model)) {
      modelStats.set(model, []);
    }
    modelStats.get(model).push(tokenSpeed);

    providerSet.add(provider);
    modelSet.add(model);

    // Track model-to-provider mapping
    if (!modelToProvider.has(model)) {
      modelToProvider.set(model, provider);
    }

    totalMessageCount++;
  }

  const summary = computeSummary(dailyStats, providerStats, modelStats, totalMessageCount);
  const entries = buildEntries(dailyMap);

  // Calculate daily averages for the chart
  const dailyAverages = {};
  for (const [dateKey, speeds] of dailyStats.entries()) {
    const stats = calculateStats(speeds);
    dailyAverages[dateKey] = stats.avg;
  }

  const payload = {
    range: { start: startIso, end: endIso },
    entries,
    providers: Array.from(providerSet).sort((a, b) => a.localeCompare(b)),
    models: Array.from(modelSet).sort((a, b) => a.localeCompare(b)),
    modelToProvider: Object.fromEntries(modelToProvider),
    summary,
    dailyAverages: Object.fromEntries(Object.entries(dailyAverages).sort()),
    skippedCount, // Messages without speed data
  };

  setCachedResult(cacheKey, payload);
  return payload;
}

/**
 * Clear cached benchmark statistics results.
 */
function invalidateBenchmarkStatisticsCache() {
  benchmarkStatsCache.clear();
}

module.exports = {
  queryBenchmarkStatistics,
  invalidateBenchmarkStatisticsCache,
};
