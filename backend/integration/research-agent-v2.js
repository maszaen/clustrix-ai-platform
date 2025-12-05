// ===================================================================
// RESEARCH AGENT V2 - Unified Entry Point
// ===================================================================
//
// Routes to appropriate agent based on model/provider:
// - Claude models → research-agent-claude.js
// - OpenAI/GPT models → research-agent-openai.js
// - Gemini models → research-agent-gemini.js
//
// Drop-in replacement for reasoning-action-agent.js
//
// ===================================================================

const { processResearchRequest: processOpenAI } = require('./research-agent-openai');
const { processResearchRequest: processClaude } = require('./research-agent-claude');
const { processResearchRequest: processGemini } = require('./research-agent-gemini');
const { log: appLog } = require('../../utils/logger');

function log(level, fn, msg, details = {}) {
  appLog('RESEARCH-V2', level, fn, msg, details);
  console.log(`[RESEARCH-V2] ${fn}: ${msg}`, details);
}

/**
 * Detect provider from model name or explicit provider
 */
function detectProvider(model, provider) {
  log(1, 'detectProvider', 'Detecting', { model, provider });
  
  // Check model name first (more reliable)
  if (model) {
    const m = model.toLowerCase();
    if (m.includes('claude')) return 'claude';
    if (m.includes('gemini')) return 'gemini';
    // GPT, o1, o3, deepseek, etc all use OpenAI-compatible API
  }
  
  // Check explicit provider
  if (provider) {
    const p = provider.toLowerCase();
    if (p.includes('claude') || p.includes('anthropic')) return 'claude';
    if (p.includes('gemini') || p.includes('google')) return 'gemini';
    // openai, openrouter, deepseek, etc all use OpenAI-compatible API
  }
  
  // Default to OpenAI (most compatible - works with OpenRouter, Deepseek, etc)
  return 'openai';
}

/**
 * Main entry point - routes to appropriate agent
 */
async function processWithResearchAgent(userQuery, sessionId, options = {}) {
  const {
    model,
    apiKey,
    provider,
    baseUrl,
    searchApiConfig,
    progressCallback,
    files = [],
    shouldCancel
  } = options;
  
  const detectedProvider = detectProvider(model, provider);
  
  log(1, 'processWithResearchAgent', 'Routing request', {
    sessionId,
    model,
    provider: detectedProvider,
    filesCount: files.length,
    hasSearchConfig: !!searchApiConfig,
    searchProvider: searchApiConfig?.provider || 'none'
  });
  
  const commonParams = {
    sessionId,
    userQuery,
    baseUrl,
    apiKey,
    model,
    files,
    searchApiConfig,
    progressCallback,
    shouldCancel
  };
  
  try {
    let result;
    
    switch (detectedProvider) {
      case 'claude':
        result = await processClaude(commonParams);
        break;
        
      case 'gemini':
        result = await processGemini(commonParams);
        break;
        
      case 'openai':
      default:
        result = await processOpenAI(commonParams);
        break;
    }
    
    log(1, 'processWithResearchAgent', 'Complete', {
      provider: detectedProvider,
      responseLength: result.response?.length || 0
    });
    
    return {
      text: result.response,
      response: result.response,
      usageBreakdown: result.usageBreakdown || []
    };
    
  } catch (error) {
    log(3, 'processWithResearchAgent', 'Error', { error: error.message });
    throw error;
  }
}

/**
 * Drop-in replacement for ReasoningActionAgent
 * Matches exact interface used by langchain-service.js
 */
class ResearchAgentV2 {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.sessionState = new Map();
  }
  
  /**
   * Initialize session with files and model config
   * Called by langchain-service before processWithReasoningAction
   */
  initializeSession(sessionId, files, modelInfo = {}) {
    log(1, 'initializeSession', `Session ${sessionId}`, {
      filesCount: files?.length || 0,
      model: modelInfo.model,
      provider: modelInfo.provider,
      hasSearchConfig: !!modelInfo.searchApiConfig,
      searchProvider: modelInfo.searchApiConfig?.provider || 'none',
      hasSerpKey: !!modelInfo.searchApiConfig?.serpApiKey,
      hasGoogleKey: !!modelInfo.searchApiConfig?.googleApiKey
    });
    
    this.sessionState.set(sessionId, {
      files: files || [],
      modelInfo,
      initialized: true
    });
    
    return {
      supportsWebSearch: !!modelInfo.searchApiConfig,
      supportsFileSearch: (files?.length || 0) > 0
    };
  }
  
  /**
   * Main processing method - matches ReasoningActionAgent interface
   */
  async processWithReasoningAction(userQuery, sessionId, existingMessages = [], progressCallback = null, systemPrompt = null, language = 'autodetect') {
    const state = this.sessionState.get(sessionId) || {};
    const modelInfo = state.modelInfo || {};
    
    log(1, 'processWithReasoningAction', 'Starting', {
      sessionId,
      model: modelInfo.model,
      filesCount: state.files?.length || 0
    });
    
    try {
      const result = await processWithResearchAgent(userQuery, sessionId, {
        model: modelInfo.model,
        apiKey: modelInfo.apiKey,
        provider: modelInfo.provider,
        baseUrl: modelInfo.baseUrl,
        searchApiConfig: modelInfo.searchApiConfig,
        progressCallback,
        files: state.files || [],
        shouldCancel: null
      });
      
      // Return format matching ReasoningActionAgent
      return {
        response: result.response || result.text,
        actionsExecuted: 0, // Native tool calling doesn't track this the same way
        searchResults: [],
        reasoning: '',
        usageBreakdown: result.usageBreakdown || []
      };
      
    } catch (error) {
      log(3, 'processWithReasoningAction', 'Error', { error: error.message });
      throw error;
    }
  }
}

module.exports = {
  processWithResearchAgent,
  ResearchAgentV2
};
