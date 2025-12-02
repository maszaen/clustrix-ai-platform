// Helper functions for main.js to support LangChain integration

function getBaseUrl(provider, payload) {
  return (payload.baseUrl || '') ||
    (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    provider === 'groq'      ? 'https://api.groq.com/openai/v1' :
    provider === 'gemini'    ? 'https://generativelanguage.googleapis.com/v1beta' :
    provider === 'zhipu'       ? 'https://api.z.ai/api/paas/v4/' :
    provider === 'bigmodel'  ? 'https://open.bigmodel.cn/api/paas/v4' :
    provider === 'cerebras'  ? 'https://api.cerebras.ai/v1/' :
                                (process.env.BASE_URL || 'https://api.z.ai/api/paas/v4/'));
}

function getApiKey(provider, payload) {
  return (payload.apiKey || '') ||
    (provider === 'openrouter' ? (process.env.OPENROUTER_API_KEY || '') :
    provider === 'groq'      ? (process.env.GROQ_API_KEY || '') :
    provider === 'gemini'    ? (process.env.GEMINI_API_KEY || '') :
    provider === 'zhipu'       ? (process.env.Z_API_KEY || '') :
    provider === 'bigmodel'  ? (process.env.BIGMODEL_API_KEY || '') :
    provider === 'cerebras'  ? (process.env.CEREBRAS_API_KEY || '') :
                                (process.env.Z_API_KEY || process.env.OPENAI_API_KEY || ''));
}

function joinEndpoint(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const s = String(path || '').replace(/^\/+/, '');
  return b + '/' + s;
}

function applyThinkingHints({ provider, model, bodyObj, thinkMode }) {
  if (!thinkMode || thinkMode === 'disabled') return;

  const modelLower = (model || '').toLowerCase();
  const providerLower = (provider || '').toLowerCase();

  // DeepSeek R1 models - use reasoning_effort parameter
  if (modelLower.includes('deepseek-r1') || modelLower.includes('deepseek/deepseek-r1')) {
    bodyObj.reasoning_effort = thinkMode === 'extended' ? 'high' : 'medium';
    return;
  }

  // OpenAI o1/o3 models - use reasoning_effort
  if (modelLower.includes('o1') || modelLower.includes('o3')) {
    bodyObj.reasoning_effort = thinkMode === 'extended' ? 'high' : 'medium';
    return;
  }

  // Claude models - use extended thinking (Anthropic-specific)
  if (modelLower.includes('claude') && providerLower === 'anthropic') {
    // Claude uses different API format, handled separately
    return;
  }

  // Qwen thinking models
  if (modelLower.includes('qwen') && modelLower.includes('thinking')) {
    bodyObj.enable_thinking = true;
    if (thinkMode === 'extended') {
      bodyObj.thinking_budget = 32768;
    }
    return;
  }

  // GLM models with reasoning
  if (modelLower.includes('glm') && (providerLower === 'zhipu' || providerLower === 'bigmodel')) {
    // GLM uses reasoning_content in response, no special request param needed
    return;
  }

  // Generic reasoning flag for OpenRouter models
  if (providerLower === 'openrouter') {
    const reasoningModels = [
      'deepseek/deepseek-r1',
      'deepseek/deepseek-r1-distill',
      'qwen/qwen-3-235b',
      'anthropic/claude-3.5-sonnet',
    ];
    
    if (reasoningModels.some(m => modelLower.includes(m.split('/')[1]))) {
      bodyObj.reasoning = true;
    }
  }

  // Cerebras thinking models
  if (providerLower === 'cerebras' && modelLower.includes('thinking')) {
    bodyObj.reasoning = true;
  }
}

function isPerplexityModel(modelConfig) {
  if (!modelConfig) return false;
  
  const baseUrl = (modelConfig.baseUrl || '').toLowerCase();
  const provider = (modelConfig.provider || '').toLowerCase();
  
  return baseUrl.includes('perplexity.ai') || provider === 'perplexity';
}

module.exports = {
  getBaseUrl,
  getApiKey,
  joinEndpoint,
  applyThinkingHints,
  isPerplexityModel
};