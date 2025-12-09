export const DEFAULT_PROVIDERS_LIST = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'xai', name: 'xAI (Grok)' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'zhipu', name: 'Zhipu AI' },
  { id: 'bigmodel', name: 'BigModel' },
  { id: 'perplexity', name: 'Perplexity' },
  { id: 'megallm', name: 'MegaLLM' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'mistral', name: 'Mistral AI' },
  { id: 'cerebras', name: 'Cerebras' },
  { id: 'groq', name: 'Groq' },
];
export const DEFAULT_MODELS = [
  { provider: 'zhipu', model_id: 'glm-4.6v', label: 'GLM-4.6V (Vision, SOTA, Open)', is_default: true },
  { provider: 'zhipu', model_id: 'glm-4.6v-flash', label: 'GLM-4.6V Flash (Vision, Fast)', is_default: true },

  { provider: 'zhipu', model_id: 'glm-4.5v', label: 'GLM-4.5V (Vision Reasoning)', is_default: true },
  { provider: 'zhipu', model_id: 'glm-4.5-flash', label: 'GLM-4.5 Flash (Free, 128K)', is_default: true },

  { provider: 'zhipu', model_id: 'glm-4-plus', label: 'GLM-4 Plus (High-end)', is_default: true },
  { provider: 'zhipu', model_id: 'glm-4-air-250414', label: 'GLM-4 Air 250414 (Base)', is_default: true },
  { provider: 'zhipu', model_id: 'glm-4-airx', label: 'GLM-4 AirX (High Speed)', is_default: true },
  { provider: 'zhipu', model_id: 'glm-4-flashx-250414', label: 'GLM-4 FlashX 250414 (Turbo, Paid)', is_default: true },
  { provider: 'zhipu', model_id: 'glm-4-flash-250414', label: 'GLM-4 Flash 250414 (Free Legacy)', is_default: true },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.6',
    label: 'GLM-4.6 (Flagship, 200K context)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.5',
    label: 'GLM-4.5 (High-end text)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.5-x',
    label: 'GLM-4.5-X (Fast / turbo)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.5-air',
    label: 'GLM-4.5-Air (Cost-effective)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.5-airx',
    label: 'GLM-4.5-AirX (Cost-effective turbo)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.5-flash',
    label: 'GLM-4.5-Flash (FREE, 128K ctx)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4-plus',
    label: 'GLM-4-Plus (High-performance)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4-air-250414',
    label: 'GLM-4-Air-250414 (Base, 128K)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4-airx',
    label: 'GLM-4-AirX (High-speed)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4-long',
    label: 'GLM-4-Long (1M context)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4-flashx-250414',
    label: 'GLM-4-FlashX-250414 (High-speed, low cost)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4-flash-250414',
    label: 'GLM-4-Flash-250414 (FREE, 128K)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.6v',
    label: 'GLM-4.6V (Flagship vision reasoning, 128K ctx)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.6v-flash',
    label: 'GLM-4.6V-Flash (FREE vision reasoning)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.5v',
    label: 'GLM-4.5V (Vision reasoning, 64K ctx)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.1v-thinking-flashx',
    label: 'GLM-4.1V-Thinking-FlashX (Lite vision reasoning)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4v-plus-0111',
    label: 'GLM-4V-Plus-0111 (Vision understanding)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4.1v-thinking-flash',
    label: 'GLM-4.1V-Thinking-Flash (FREE lite vision)',
    is_default: true,
  },

  {
    provider: 'bigmodel',
    model_id: 'glm-4v-flash',
    label: 'GLM-4V-Flash (FREE vision understanding)',
    is_default: true,
  },

  { provider: 'openai', model_id: 'gpt-5.1', label: 'GPT-5.1 (Frontier)', is_default: true },
  { provider: 'openai', model_id: 'gpt-5-mini', label: 'GPT-5 Mini (Fast/Cost-Efficient)', is_default: true },
  { provider: 'openai', model_id: 'gpt-5-nano', label: 'GPT-5 Nano (Ultra Cheap)', is_default: true },
  { provider: 'openai', model_id: 'gpt-5-pro', label: 'GPT-5 Pro (Enterprise)', is_default: true },

  { provider: 'openai', model_id: 'gpt-4.1', label: 'GPT-4.1 (Legacy Frontier)', is_default: true },
  { provider: 'openai', model_id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (Legacy Fast)', is_default: true },
  { provider: 'openai', model_id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (Legacy Cheap)', is_default: true },

  { provider: 'openai', model_id: 'gpt-4o', label: 'GPT-4o (Multimodal Legacy)', is_default: true },

  { provider: 'openai', model_id: 'o4-mini', label: 'o4-mini (Efficient Reasoning)', is_default: true },
  { provider: 'openai', model_id: 'o3', label: 'o3 (Advanced Reasoning)', is_default: true },
  { provider: 'openai', model_id: 'o3-mini', label: 'o3-mini (Cheaper Reasoning)', is_default: true },

  { provider: 'anthropic', model_id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', is_default: true },
  { provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', is_default: true },
  { provider: 'anthropic', model_id: 'claude-opus-4-5', label: 'Claude Opus 4.5', is_default: true },

  { provider: 'anthropic', model_id: 'claude-sonnet-4', label: 'Claude Sonnet 4', is_default: true },
  { provider: 'anthropic', model_id: 'claude-opus-4', label: 'Claude Opus 4', is_default: true },
  { provider: 'anthropic', model_id: 'claude-opus-4.1', label: 'Claude Opus 4.1', is_default: true },
  { provider: 'anthropic', model_id: 'claude-sonnet-3.7', label: 'Claude Sonnet 3.7 (Deprecated)', is_default: true },
  { provider: 'anthropic', model_id: 'claude-haiku-3.5', label: 'Claude Haiku 3.5', is_default: true },
  { provider: 'anthropic', model_id: 'claude-opus-3', label: 'Claude Opus 3 (Deprecated)', is_default: true },
  { provider: 'anthropic', model_id: 'claude-haiku-3', label: 'Claude Haiku 3 (Legacy)', is_default: true },

  { provider: 'anthropic', model_id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Legacy Snapshot)', is_default: true },

  { provider: 'google', model_id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', is_default: true },

  { provider: 'google', model_id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', is_default: true },
  { provider: 'google', model_id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', is_default: true },
  { provider: 'google', model_id: 'gemini-2.5-flash-preview-09-2025', label: 'Gemini 2.5 Flash (Preview 09-2025)', is_default: true },
  { provider: 'google', model_id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', is_default: true },
  { provider: 'google', model_id: 'gemini-2.5-flash-lite-preview-09-2025', label: 'Gemini 2.5 Flash-Lite (Preview)', is_default: true },

  { provider: 'google', model_id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', is_default: true },

  { provider: 'google', model_id: 'gemini-2.5-computer-use-preview-10-2025', label: 'Gemini 2.5 Computer Use (Preview)', is_default: true },
  { provider: 'google', model_id: 'gemini-robotics-er-1.5-preview', label: 'Gemini Robotics-ER 1.5 (Preview)', is_default: true },

  { provider: 'perplexity', model_id: 'sonar-deep-research', label: 'Sonar Deep Research', is_default: true },
  { provider: 'perplexity', model_id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', is_default: true },
  { provider: 'perplexity', model_id: 'sonar-reasoning', label: 'Sonar Reasoning', is_default: true },
  { provider: 'perplexity', model_id: 'sonar-pro', label: 'Sonar Pro', is_default: true },
  { provider: 'perplexity', model_id: 'sonar', label: 'Sonar', is_default: true },

  { provider: 'xai', model_id: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast (Reasoning)', is_default: true },
  { provider: 'xai', model_id: 'grok-4-fast-reasoning', label: 'Grok 4 Fast (Reasoning)', is_default: true },
  { provider: 'xai', model_id: 'grok-4', label: 'Grok 4 (Full Frontier)', is_default: true },

  { provider: 'xai', model_id: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast (Non-Reasoning)', is_default: true },
  { provider: 'xai', model_id: 'grok-4-fast-non-reasoning', label: 'Grok 4 Fast (Non-Reasoning)', is_default: true },

  { provider: 'xai', model_id: 'grok-3-mini', label: 'Grok 3 Mini', is_default: true },
  { provider: 'xai', model_id: 'grok-3', label: 'Grok 3', is_default: true },

  { provider: 'xai', model_id: 'grok-code-fast-1', label: 'Grok Code Fast 1 (Coding)', is_default: true },

  { provider: 'xai', model_id: 'grok-2-vision-1212', label: 'Grok 2 Vision 1212 (Vision→Text)', is_default: true },

  { provider: 'deepseek', model_id: 'deepseek-reasoner', label: 'DeepSeek R1 Reasoner (API: deepseek-reasoner)', is_default: true },
  { provider: 'deepseek', model_id: 'deepseek-chat', label: 'DeepSeek Chat (V3 family)', is_default: true },

  { provider: 'mistral', model_id: 'mistral-large-latest', label: 'Mistral Large (latest)', is_default: true },
  { provider: 'mistral', model_id: 'pixtral-large-latest', label: 'Pixtral Large (Vision)', is_default: true },
  { provider: 'mistral', model_id: 'ministral-8b-latest', label: 'Ministral 8B (Small)', is_default: true },

  { provider: 'cerebras', model_id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (Cerebras)', is_default: true },

  { provider: 'groq', model_id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq Versatile)', is_default: true },

  { provider: 'openrouter', model_id: 'arcee-ai/trinity-mini', label: 'Trinity Mini (Free, 26B MoE)', is_default: true },

  { provider: 'megallm', model_id: 'gpt-5.1', label: 'GPT-5.1 (via MegaLLM proxy)', is_default: true },
]; 