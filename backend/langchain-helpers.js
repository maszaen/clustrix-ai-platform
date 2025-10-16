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
  if (!thinkMode) return;

  const hints = {
    'openrouter': {
      'deepseek/deepseek-r1-distill-llama-70b': true,
      'deepseek/deepseek-r1': true,
    },
    'cerebras': {
      'qwen-3-235b-a22b-thinking-2507': true,
    }
  };

  if (hints[provider]?.[model]) {
    bodyObj.reasoning = true;
  }
}

module.exports = {
  getBaseUrl,
  getApiKey,
  joinEndpoint,
  applyThinkingHints
};