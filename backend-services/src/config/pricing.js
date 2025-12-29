/**
 * Model Pricing Configuration
 * 
 * Prices are in USD per 1M tokens
 * Based on official pricing as of December 2025
 */

// Pricing per million tokens (input/output)
const MODEL_PRICING = {
  // ========== Google Gemini ==========
  'gemini-3-pro-preview': { input: 1.25, output: 5.00 },
  'gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-flash-lite': { input: 0.02, output: 0.10 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },

  // ========== OpenAI ==========
  'gpt-5.1': { input: 15.00, output: 60.00 },
  'gpt-5-mini': { input: 3.00, output: 12.00 },
  'gpt-5-nano': { input: 0.50, output: 2.00 },
  'gpt-5-pro': { input: 30.00, output: 120.00 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'o4-mini': { input: 1.10, output: 4.40 },
  'o3': { input: 10.00, output: 40.00 },
  'o3-mini': { input: 1.10, output: 4.40 },

  // ========== Anthropic ==========
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  'claude-opus-4-5': { input: 15.00, output: 75.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-opus-4': { input: 15.00, output: 75.00 },
  'claude-opus-4.1': { input: 15.00, output: 75.00 },
  'claude-sonnet-3.7': { input: 3.00, output: 15.00 },
  'claude-haiku-3.5': { input: 0.80, output: 4.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },

  // ========== xAI Grok ==========
  'grok-4-1-fast-reasoning': { input: 3.00, output: 15.00 },
  'grok-4-fast-reasoning': { input: 3.00, output: 15.00 },
  'grok-4': { input: 3.00, output: 15.00 },
  'grok-3-mini': { input: 0.30, output: 0.50 },
  'grok-3': { input: 3.00, output: 15.00 },
  'grok-2-vision-1212': { input: 2.00, output: 10.00 },

  // ========== DeepSeek ==========
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'deepseek-chat': { input: 0.27, output: 1.10 },

  // ========== Mistral ==========
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'pixtral-large-latest': { input: 2.00, output: 6.00 },
  'ministral-8b-latest': { input: 0.10, output: 0.10 },

  // ========== Perplexity ==========
  'sonar-deep-research': { input: 2.00, output: 8.00 },
  'sonar-reasoning-pro': { input: 2.00, output: 8.00 },
  'sonar-reasoning': { input: 1.00, output: 5.00 },
  'sonar-pro': { input: 3.00, output: 15.00 },
  'sonar': { input: 1.00, output: 1.00 },

  // ========== Zhipu / BigModel (Free Tier) ==========
  'glm-4.6v': { input: 0.00, output: 0.00 },
  'glm-4.6v-flash': { input: 0.00, output: 0.00 },
  'glm-4.5v': { input: 0.00, output: 0.00 },
  'glm-4.5-flash': { input: 0.00, output: 0.00 },
  'glm-4-plus': { input: 0.00, output: 0.00 },
  'glm-4-air-250414': { input: 0.00, output: 0.00 },
  'glm-4-airx': { input: 0.00, output: 0.00 },
  'glm-4-flashx-250414': { input: 0.00, output: 0.00 },
  'glm-4-flash-250414': { input: 0.00, output: 0.00 },

  // ========== Cerebras (Fast) ==========
  'meta-llama/llama-3.3-70b-instruct': { input: 0.00, output: 0.00 },
  'gpt-oss-120b': { input: 0.00, output: 0.00 },
  'zai-glm-4.6': { input: 0.00, output: 0.00 },
  'qwen-3-235b-a22b-instruct-2507': { input: 0.00, output: 0.00 },

  // ========== Groq (Fast) ==========
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },

  // ========== OpenRouter ==========
  'arcee-ai/trinity-mini': { input: 0.00, output: 0.00 },

  // ========== MegaLLM (Proxy - same as underlying models) ==========
  'megallm/gpt-5.1': { input: 15.00, output: 60.00 },
  'megallm/claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'megallm/claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'megallm/claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
  'megallm/claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'megallm/gpt-4.1': { input: 2.00, output: 8.00 },
  'megallm/gpt-5-mini': { input: 3.00, output: 12.00 },
  'megallm/gpt-5': { input: 10.00, output: 40.00 },
  'megallm/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'megallm/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'megallm/gpt-4o': { input: 2.50, output: 10.00 },
  'megallm/openai-gpt-oss-120b': { input: 0.00, output: 0.00 },
  'megallm/grok-4.1-fast-reasoning': { input: 3.00, output: 15.00 },
  'megallm/grok-4.1-fast-non-reasoning': { input: 3.00, output: 15.00 },
  'megallm/moonshotai/kimi-k2-instruct-0905': { input: 1.00, output: 4.00 },
  'megallm/qwen/qwen3-next-80b-a3b-instruct': { input: 0.50, output: 2.00 },
  'megallm/alibaba-qwen3-32b': { input: 0.20, output: 0.80 },
  'megallm/qwen3-coder-480b-a35b-instruct': { input: 1.00, output: 4.00 },
  'megallm/gemini-2.5-pro': { input: 1.25, output: 5.00 },

  // ========== BigModel ==========
  'bigmodel/glm-4.6': { input: 0.00, output: 0.00 },
  'bigmodel/glm-4.5': { input: 0.00, output: 0.00 },
  'bigmodel/glm-4.5-flash': { input: 0.00, output: 0.00 },
  'bigmodel/glm-4.6v': { input: 0.00, output: 0.00 },
  'bigmodel/glm-4.6v-flash': { input: 0.00, output: 0.00 },
};

/**
 * Calculate cost from token usage
 * @param {string} modelId - Model ID
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {number|null} - Cost in USD or null if pricing not found
 */
function calculateCost(modelId, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return null;
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Get pricing for a model
 * @param {string} modelId - Model ID
 * @returns {Object|null} - { input, output } pricing per 1M tokens
 */
function getModelPricing(modelId) {
  return MODEL_PRICING[modelId] || null;
}

module.exports = {
  MODEL_PRICING,
  calculateCost,
  getModelPricing,
};
