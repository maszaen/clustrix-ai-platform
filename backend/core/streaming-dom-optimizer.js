/**
 * Streaming DOM Optimizer
 * 
 * Prevents DOM node accumulation during long streaming responses by implementing
 * aggressive cleanup strategies and memory-efficient reconciliation.
 * 
 * @module backend/core/streaming-dom-optimizer
 */

const { log } = require('../../utils/logger');

/**
 * Configuration for DOM optimization thresholds
 */
const DOM_OPTIMIZATION_CONFIG = {
  // Maximum DOM nodes before forcing full cleanup
  MAX_DOM_NODES: 50000,
  
  // Maximum incremental updates before requiring full re-render
  MAX_INCREMENTAL_UPDATES: 25,
  
  // Content length threshold to switch from incremental to full render
  CONTENT_LENGTH_THRESHOLD: 8000,
  
  // Node budget per incremental update
  MAX_NODE_BUDGET_PER_UPDATE: 800,
  
  // Force cleanup every N updates
  FORCE_CLEANUP_INTERVAL: 15,
  
  // Token threshold for aggressive cleanup
  TOKEN_THRESHOLD_FOR_CLEANUP: 5000,
};

/**
 * Track DOM metrics for a streaming session
 */
class StreamingDOMMetrics {
  constructor() {
    this.incrementalUpdateCount = 0;
    this.totalNodesCreated = 0;
    this.lastCleanupAt = 0;
    this.currentNodeCount = 0;
    this.contentLength = 0;
    this.lastFullRenderAt = 0;
    this.fullRenderCount = 0;
  }

  reset() {
    this.incrementalUpdateCount = 0;
    this.lastCleanupAt = 0;
    this.lastFullRenderAt = 0;
  }

  incrementUpdate() {
    this.incrementalUpdateCount++;
  }

  recordFullRender(nodeCount) {
    this.fullRenderCount++;
    this.lastFullRenderAt = Date.now();
    this.currentNodeCount = nodeCount;
    this.incrementalUpdateCount = 0;
  }

  shouldForceFullRender() {
    // Force full render if too many incremental updates
    if (this.incrementalUpdateCount >= DOM_OPTIMIZATION_CONFIG.MAX_INCREMENTAL_UPDATES) {
      return true;
    }

    // Force full render if content is too long
    if (this.contentLength > DOM_OPTIMIZATION_CONFIG.CONTENT_LENGTH_THRESHOLD) {
      return true;
    }

    // Force full render periodically for cleanup
    if (this.incrementalUpdateCount > 0 && 
        this.incrementalUpdateCount % DOM_OPTIMIZATION_CONFIG.FORCE_CLEANUP_INTERVAL === 0) {
      return true;
    }

    // Force full render if DOM nodes exceed threshold
    if (this.currentNodeCount > DOM_OPTIMIZATION_CONFIG.MAX_DOM_NODES) {
      return true;
    }

    return false;
  }

  shouldUseIncrementalUpdate(contentGrowth) {
    // Don't use incremental if this would be the first update
    if (this.incrementalUpdateCount === 0) {
      return false;
    }

    // Don't use incremental if content growth is large
    if (contentGrowth > 500) {
      return false;
    }

    // Don't use incremental if we've done too many already
    if (this.incrementalUpdateCount >= DOM_OPTIMIZATION_CONFIG.MAX_INCREMENTAL_UPDATES) {
      return false;
    }

    return true;
  }
}

/**
 * Global metrics storage (keyed by streamId)
 */
const streamMetrics = new Map();

/**
 * Get or create metrics for a stream
 * @param {string} streamId - Stream identifier
 * @returns {StreamingDOMMetrics}
 */
function getStreamMetrics(streamId) {
  if (!streamMetrics.has(streamId)) {
    streamMetrics.set(streamId, new StreamingDOMMetrics());
  }
  return streamMetrics.get(streamId);
}

/**
 * Clean up metrics for a completed stream
 * @param {string} streamId - Stream identifier
 */
function cleanupStreamMetrics(streamId) {
  streamMetrics.delete(streamId);
}

/**
 * Determine optimal rendering strategy for current content
 * @param {string} streamId - Stream identifier
 * @param {number} contentLength - Current content length
 * @param {number} previousLength - Previous content length
 * @param {boolean} isComplete - Whether streaming is complete
 * @returns {object} - Rendering strategy decision
 */
function determineRenderingStrategy(streamId, contentLength, previousLength, isComplete) {
  const metrics = getStreamMetrics(streamId);
  metrics.contentLength = contentLength;
  
  const contentGrowth = contentLength - previousLength;
  
  // Always use full render for completion
  if (isComplete) {
    return {
      strategy: 'full',
      reason: 'streaming_complete',
      forceCleanup: true,
    };
  }

  // Check if we should force full render based on metrics
  if (metrics.shouldForceFullRender()) {
    return {
      strategy: 'full',
      reason: 'metrics_threshold_exceeded',
      forceCleanup: true,
    };
  }

  // Check if incremental update is viable
  if (metrics.shouldUseIncrementalUpdate(contentGrowth)) {
    return {
      strategy: 'incremental',
      reason: 'small_content_growth',
      forceCleanup: false,
    };
  }

  // Default to full render
  return {
    strategy: 'full',
    reason: 'default_strategy',
    forceCleanup: metrics.incrementalUpdateCount > 10,
  };
}

/**
 * Record a rendering operation
 * @param {string} streamId - Stream identifier
 * @param {string} strategy - 'incremental' or 'full'
 * @param {number} nodeCount - Current node count
 */
function recordRenderOperation(streamId, strategy, nodeCount) {
  const metrics = getStreamMetrics(streamId);
  metrics.currentNodeCount = nodeCount;

  if (strategy === 'incremental') {
    metrics.incrementUpdate();
  } else if (strategy === 'full') {
    metrics.recordFullRender(nodeCount);
  }
}

/**
 * Get optimization recommendations for current stream state
 * @param {string} streamId - Stream identifier
 * @returns {object} - Optimization recommendations
 */
function getOptimizationRecommendations(streamId) {
  const metrics = getStreamMetrics(streamId);
  
  const recommendations = {
    useWorker: metrics.contentLength > 8000,
    throttleMs: Math.min(100, Math.max(16, metrics.incrementalUpdateCount * 5)),
    skipNonEssentialUpdates: metrics.currentNodeCount > DOM_OPTIMIZATION_CONFIG.MAX_DOM_NODES * 0.8,
    deferEnhancements: metrics.incrementalUpdateCount > 5,
  };

  return recommendations;
}

module.exports = {
  DOM_OPTIMIZATION_CONFIG,
  StreamingDOMMetrics,
  getStreamMetrics,
  cleanupStreamMetrics,
  determineRenderingStrategy,
  recordRenderOperation,
  getOptimizationRecommendations,
};
