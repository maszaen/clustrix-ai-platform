
const fs = require('fs');
const path = require('path');

/**
 * Models Configuration for Clustrix Cloud
 * 
 * Complete model definitions matching mobile app's providers.js
 * Each model has:
 * - provider: Provider ID
 * - name: Display name
 * - envKey: Which env var holds the API key
 * - enabled: Toggle availability (even if API key exists)
 */

// Provider base URLs
const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  gemini: 'https://generativelanguage.googleapis.com/v1beta', // alias
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
  perplexity: 'https://api.perplexity.ai',
  megallm: 'https://api.megallm.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
};

// Provider display names
const PROVIDER_NAMES = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI (Grok)',
  openrouter: 'OpenRouter',
  zhipu: 'Zhipu AI',
  bigmodel: 'BigModel',
  perplexity: 'Perplexity',
  megallm: 'MegaLLM',
  deepseek: 'DeepSeek',
  mistral: 'Mistral AI',
  cerebras: 'Cerebras',
  groq: 'Groq',
};

// Full model definitions - matches mobile providers.js
// enabled: true means show if API key exists, false means always hide
const ALL_MODELS = {
  // ========== Zhipu AI ==========
  'glm-4.6v': { provider: 'zhipu', name: 'GLM-4.6V (Vision, SOTA)', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4.6v-flash': { provider: 'zhipu', name: 'GLM-4.6V Flash (Vision)', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4.5v': { provider: 'zhipu', name: 'GLM-4.5V (Vision Reasoning)', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4.5-flash': { provider: 'zhipu', name: 'GLM-4.5 Flash (Free)', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4-plus': { provider: 'zhipu', name: 'GLM-4 Plus', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4-air-250414': { provider: 'zhipu', name: 'GLM-4 Air', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4-airx': { provider: 'zhipu', name: 'GLM-4 AirX', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4-flashx-250414': { provider: 'zhipu', name: 'GLM-4 FlashX', envKey: 'ZHIPU_API_KEY', enabled: true },
  'glm-4-flash-250414': { provider: 'zhipu', name: 'GLM-4 Flash (Free)', envKey: 'ZHIPU_API_KEY', enabled: true },

  // ========== BigModel ==========
  'bigmodel/glm-4.6': { provider: 'bigmodel', name: 'GLM-4.6 (200K)', envKey: 'BIGMODEL_API_KEY', enabled: true },
  'bigmodel/glm-4.5': { provider: 'bigmodel', name: 'GLM-4.5', envKey: 'BIGMODEL_API_KEY', enabled: true },
  'bigmodel/glm-4.5-flash': { provider: 'bigmodel', name: 'GLM-4.5 Flash (FREE)', envKey: 'BIGMODEL_API_KEY', enabled: true },
  'bigmodel/glm-4.6v': { provider: 'bigmodel', name: 'GLM-4.6V (Vision)', envKey: 'BIGMODEL_API_KEY', enabled: true },
  'bigmodel/glm-4.6v-flash': { provider: 'bigmodel', name: 'GLM-4.6V Flash (FREE)', envKey: 'BIGMODEL_API_KEY', enabled: true },

  // ========== OpenAI ==========
  'gpt-5.1': { provider: 'openai', name: 'GPT-5.1 (Frontier)', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-5-mini': { provider: 'openai', name: 'GPT-5 Mini', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-5-nano': { provider: 'openai', name: 'GPT-5 Nano', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-5-pro': { provider: 'openai', name: 'GPT-5 Pro', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-4.1': { provider: 'openai', name: 'GPT-4.1', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-4.1-mini': { provider: 'openai', name: 'GPT-4.1 Mini', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-4.1-nano': { provider: 'openai', name: 'GPT-4.1 Nano', envKey: 'OPENAI_API_KEY', enabled: true },
  'gpt-4o': { provider: 'openai', name: 'GPT-4o (Multimodal)', envKey: 'OPENAI_API_KEY', enabled: true },
  'o4-mini': { provider: 'openai', name: 'o4-mini (Reasoning)', envKey: 'OPENAI_API_KEY', enabled: true },
  'o3': { provider: 'openai', name: 'o3 (Advanced Reasoning)', envKey: 'OPENAI_API_KEY', enabled: true },
  'o3-mini': { provider: 'openai', name: 'o3-mini', envKey: 'OPENAI_API_KEY', enabled: true },

  // ========== Anthropic ==========
  'claude-sonnet-4-5': { provider: 'anthropic', name: 'Claude Sonnet 4.5', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-haiku-4-5': { provider: 'anthropic', name: 'Claude Haiku 4.5', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-opus-4-5': { provider: 'anthropic', name: 'Claude Opus 4.5', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-sonnet-4': { provider: 'anthropic', name: 'Claude Sonnet 4', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-opus-4': { provider: 'anthropic', name: 'Claude Opus 4', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-opus-4.1': { provider: 'anthropic', name: 'Claude Opus 4.1', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-sonnet-3.7': { provider: 'anthropic', name: 'Claude Sonnet 3.7', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-haiku-3.5': { provider: 'anthropic', name: 'Claude Haiku 3.5', envKey: 'ANTHROPIC_API_KEY', enabled: true },
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', name: 'Claude 3.5 Sonnet (Legacy)', envKey: 'ANTHROPIC_API_KEY', enabled: true },

  // ========== Google Gemini ==========
  'gemini-3-pro-preview': { provider: 'google', name: 'Gemini 3 Pro (Preview)', envKey: 'GEMINI_API_KEY', enabled: true },
  'gemini-2.5-pro': { provider: 'google', name: 'Gemini 2.5 Pro', envKey: 'GEMINI_API_KEY', enabled: true },
  'gemini-2.5-flash': { provider: 'google', name: 'Gemini 2.5 Flash', envKey: 'GEMINI_API_KEY', enabled: true },
  'gemini-2.5-flash-lite': { provider: 'google', name: 'Gemini 2.5 Flash-Lite', envKey: 'GEMINI_API_KEY', enabled: true },
  'gemini-2.0-flash': { provider: 'google', name: 'Gemini 2.0 Flash', envKey: 'GEMINI_API_KEY', enabled: true },

  // ========== Perplexity ==========
  'sonar-deep-research': { provider: 'perplexity', name: 'Sonar Deep Research', envKey: 'PERPLEXITY_API_KEY', enabled: true },
  'sonar-reasoning-pro': { provider: 'perplexity', name: 'Sonar Reasoning Pro', envKey: 'PERPLEXITY_API_KEY', enabled: true },
  'sonar-reasoning': { provider: 'perplexity', name: 'Sonar Reasoning', envKey: 'PERPLEXITY_API_KEY', enabled: true },
  'sonar-pro': { provider: 'perplexity', name: 'Sonar Pro', envKey: 'PERPLEXITY_API_KEY', enabled: true },
  'sonar': { provider: 'perplexity', name: 'Sonar', envKey: 'PERPLEXITY_API_KEY', enabled: true },

  // ========== xAI Grok ==========
  'grok-4-1-fast-reasoning': { provider: 'xai', name: 'Grok 4.1 Fast (Reasoning)', envKey: 'XAI_API_KEY', enabled: true },
  'grok-4-fast-reasoning': { provider: 'xai', name: 'Grok 4 Fast (Reasoning)', envKey: 'XAI_API_KEY', enabled: true },
  'grok-4': { provider: 'xai', name: 'Grok 4', envKey: 'XAI_API_KEY', enabled: true },
  'grok-3-mini': { provider: 'xai', name: 'Grok 3 Mini', envKey: 'XAI_API_KEY', enabled: true },
  'grok-3': { provider: 'xai', name: 'Grok 3', envKey: 'XAI_API_KEY', enabled: true },
  'grok-2-vision-1212': { provider: 'xai', name: 'Grok 2 Vision', envKey: 'XAI_API_KEY', enabled: true },

  // ========== DeepSeek ==========
  'deepseek-reasoner': { provider: 'deepseek', name: 'DeepSeek R1 Reasoner', envKey: 'DEEPSEEK_API_KEY', enabled: true },
  'deepseek-chat': { provider: 'deepseek', name: 'DeepSeek Chat (V3)', envKey: 'DEEPSEEK_API_KEY', enabled: true },

  // ========== Mistral ==========
  'mistral-large-latest': { provider: 'mistral', name: 'Mistral Large', envKey: 'MISTRAL_API_KEY', enabled: true },
  'pixtral-large-latest': { provider: 'mistral', name: 'Pixtral Large (Vision)', envKey: 'MISTRAL_API_KEY', enabled: true },
  'ministral-8b-latest': { provider: 'mistral', name: 'Ministral 8B', envKey: 'MISTRAL_API_KEY', enabled: true },

  // ========== Cerebras ==========
  'meta-llama/llama-3.3-70b-instruct': { provider: 'cerebras', name: 'Llama 3.3 70B (Cerebras)', envKey: 'CEREBRAS_API_KEY', enabled: true },
  'gpt-oss-120b': { provider: 'cerebras', name: 'GPT OSS 120B', envKey: 'CEREBRAS_API_KEY', enabled: true },
  'zai-glm-4.6': { provider: 'cerebras', name: 'GLM 4.6', envKey: 'CEREBRAS_API_KEY', enabled: true },
  'qwen-3-235b-a22b-instruct-2507': { provider: 'cerebras', name: 'Qwen 3 235b A22b Instruct', envKey: 'CEREBRAS_API_KEY', enabled: true },

  // ========== Groq ==========
  'llama-3.3-70b-versatile': { provider: 'groq', name: 'Llama 3.3 70B (Groq)', envKey: 'GROQ_API_KEY', enabled: true },

  // ========== OpenRouter ==========
  'arcee-ai/trinity-mini': { provider: 'openrouter', name: 'Trinity Mini (Free)', envKey: 'OPENROUTER_API_KEY', enabled: true },

  // ========== MegaLLM ==========
  'megallm/gpt-5.1': { provider: 'megallm', name: 'GPT-5.1 (MegaLLM)', envKey: 'MEGALLM_API_KEY', enabled: true },
};

// ==== PERSISTENCE LOGIC ====
const SETTINGS_FILE = path.join(__dirname, '../../model-settings.json');

// Load settings on init
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    for (const [id, enabled] of Object.entries(settings)) {
      if (ALL_MODELS[id]) ALL_MODELS[id].enabled = enabled;
    }
  }
} catch (e) { console.error('Failed to load model settings', e); }

function saveSettings() {
  try {
    const settings = {};
    for (const [id, config] of Object.entries(ALL_MODELS)) {
      settings[id] = config.enabled;
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) { console.error('Failed to save model settings', e); }
}

/**
 * Get available models based on:
 * 1. API key exists
 * 2. Model is enabled
 */
function getAvailableModels() {
  const available = [];
  
  for (const [modelId, config] of Object.entries(ALL_MODELS)) {
    // Check if enabled AND API key exists
    if (config.enabled && process.env[config.envKey]) {
      available.push({
        id: modelId,
        name: config.name,
        provider: config.provider,
      });
    }
  }
  
  return available;
}

/**
 * Get model config with API key (for internal use)
 */
function getModelConfig(modelId) {
  const config = ALL_MODELS[modelId];
  if (!config) return null;
  if (!config.enabled) return null;
  
  const apiKey = process.env[config.envKey];
  if (!apiKey) return null;
  
  return {
    ...config,
    modelId,
    apiKey,
    baseUrl: PROVIDER_URLS[config.provider],
  };
}

/**
 * Get all providers with at least one available model
 */
function getAvailableProviders() {
  const providers = new Map();
  
  for (const config of Object.values(ALL_MODELS)) {
    if (config.enabled && process.env[config.envKey]) {
      if (!providers.has(config.provider)) {
        providers.set(config.provider, {
          id: config.provider,
          name: PROVIDER_NAMES[config.provider] || config.provider,
        });
      }
    }
  }
  
  return Array.from(providers.values());
}

/**
 * Get all models with their status (for admin panel)
 */
function getAllModelsStatus() {
  return Object.entries(ALL_MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    provider: config.provider,
    envKey: config.envKey,
    enabled: config.enabled,
    hasApiKey: !!process.env[config.envKey],
    available: config.enabled && !!process.env[config.envKey],
  }));
}

/**
 * Toggle model enabled status (for admin)
 */
function setModelEnabled(modelId, enabled) {
  console.log(`[Config] Request to toggle model: '${modelId}' to ${enabled} (Type: ${typeof enabled})`);
  
  if (ALL_MODELS[modelId]) {
    ALL_MODELS[modelId].enabled = enabled;
    console.log(`[Config] Model ${modelId} status updated to ${enabled} in memory.`);
    
    try {
      saveSettings(); 
      console.log(`[Config] Settings saved to file.`);
    } catch(e) {
      console.error(`[Config] Error saving settings:`, e);
    }
    
    return true;
  }
  
  console.warn(`[Config] Model '${modelId}' not found in ALL_MODELS.`);
  return false;
}

/**
 * Toggle all models for a specific provider
 */
function setProviderEnabled(providerId, enabled) {
  console.log(`[Config] Request to toggle provider: '${providerId}' to ${enabled}`);
  let changed = false;

  for (const [id, config] of Object.entries(ALL_MODELS)) {
    if (config.provider === providerId) {
      if (ALL_MODELS[id].enabled !== enabled) {
        ALL_MODELS[id].enabled = enabled;
        changed = true;
      }
    }
  }

  if (changed) {
    try {
      saveSettings();
      console.log(`[Config] Provider update saved to file.`);
      return true;
    } catch(e) {
      console.error(`[Config] Error saving settings:`, e);
    }
  }
  return changed;
}

module.exports = {
  ALL_MODELS,
  PROVIDER_URLS,
  PROVIDER_NAMES,
  getAvailableModels,
  getModelConfig,
  getAvailableProviders,
  getAllModelsStatus,
  setModelEnabled,
  setProviderEnabled,
};
