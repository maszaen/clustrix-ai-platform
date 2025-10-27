'use strict';

const { createLogger } = require('../utils/logger');
const { DEBUG_MODE } = require('../core/constants');
const { getValue } = require('../core/state');

const STORAGE_KEY = 'models-conf';

const DEFAULT_OPENROUTER_HEADERS = Object.freeze({
  'HTTP-Referer': 'https://clustrix.local',
  'X-Title': 'Clustrix Desktop',
});

function resolveWindow(windowAlias) {
  if (windowAlias) return windowAlias;
  if (typeof window !== 'undefined') return window;
  return {};
}

function getStorage(hostWindow) {
  const storage = hostWindow.localStorage;
  if (
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function'
  ) {
    return storage;
  }

  const memory = new Map();
  return {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, value);
    },
  };
}

function getSettings() {
  const root = getValue('state');
  root.settings = root.settings || {};
  return root.settings;
}

function ensureModelsConfig(defaultFactory) {
  const settings = getSettings();
  if (!settings.models) {
    settings.models = defaultFactory();
  }
  return settings.models;
}

function normalizeProviderModels(models) {
  if (!Array.isArray(models)) return [];
  return models
    .map((model) => (typeof model === 'string' ? { id: model } : model))
    .filter(Boolean);
}

function defaultBaseUrlFor(providerId) {
  switch (providerId) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'zhipu':
      return 'https://api.z.ai/api/paas/v4/';
    case 'bigmodel':
      return 'https://open.bigmodel.cn/api/paas/v4';
    case 'cerebras':
      return 'https://api.cerebras.ai/v1';
    default:
      return 'https://api.z.ai/api/paas/v4/';
  }
}

function defaultModels() {
  return {
    active: {
      platform: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1:free',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
    },
    providers: {
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        models: [
          'deepseek/deepseek-chat-v3.1:free',
          'meta-llama/llama-3.1-8b-instruct',
          'mistralai/mistral-7b-instruct',
          'deepseek/deepseek-chat',
          'openai/gpt-oss-120b:free',
          'openai/gpt-oss-20b:free',
          'meta-llama/llama-4-maverick:free',
          'microsoft/mai-ds-r1:free',
          'google/gemini-2.0-flash-exp:free',
          'qwen/qwen3-coder:free',
          'qwen/qwen3-14b:free',
          'qwen/qwen-2.5-coder-32b-instruct:free',
          'openrouter/sonoma-sky-alpha',
        ],
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: '',
        models: [
          'llama3-8b-8192',
          'mixtral-8x7b-32768',
          'gemma2-9b-it',
          'openai/gpt-oss-120b',
        ],
      },
      gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
      },
      zhipu: {
        baseUrl: 'https://api.z.ai/api/paas/v4/',
        apiKey: '',
        models: ['glm-4.5-flash'],
      },
      bigmodel: {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: '',
        models: [
          'glm-4-plus',
          'glm-4-0520',
          'glm-4',
          'glm-4-air',
          'glm-4-airx',
          'glm-4-flash',
        ],
      },
      cerebras: {
        baseUrl: 'https://api.cerebras.ai/v1',
        apiKey: '',
        models: [
          'gpt-oss-120b',
          'qwen-3-coder-480b',
          'qwen-3-235b-a22b-thinking-2507',
          'llama-3.3-70b',
        ],
      },
    },
  };
}

function getProvider(settings, providerId) {
  const conf = settings.models;
  if (!conf.providers) conf.providers = {};
  conf.providers[providerId] = conf.providers[providerId] || {
    baseUrl: defaultBaseUrlFor(providerId),
    apiKey: '',
    models: [],
  };
  conf.providers[providerId].models = normalizeProviderModels(
    conf.providers[providerId].models,
  );
  return conf.providers[providerId];
}

function getModelMeta(conf, platform, modelId) {
  const list = normalizeProviderModels(
    conf?.providers?.[platform]?.models || [],
  );
  const found = list.find((model) => (model.id || model) === modelId);
  if (found) return found;
  if (typeof modelId === 'string') {
    return { id: modelId, label: modelId, note: '' };
  }
  return { id: '', label: '', note: '' };
}

function resolveLabelForActive(conf) {
  const active = conf?.active || {};
  if (!active.platform || !active.model) return null;
  if (active.label && active.label.trim()) return active.label.trim();
  const meta = getModelMeta(conf, active.platform, active.model);
  return meta.label || active.model || null;
}

function buildChatConfig(conf) {
  const active = conf?.active || {};
  const providerId = active.platform || 'zhipu';
  const provider = conf?.providers?.[providerId] || {};
  return {
    provider: providerId,
    model: active.model || 'glm-4.5-flash',
    baseUrl:
      active.baseUrl ||
      provider.baseUrl ||
      defaultBaseUrlFor(providerId),
    apiKey: active.apiKey || provider.apiKey || '',
    headers:
      provider.headers ||
      (providerId === 'openrouter' ? DEFAULT_OPENROUTER_HEADERS : {}),
  };
}

function buildTitleGeneratorConfig(conf) {
  const tg = conf?.titleGenerator || { useDefault: true };
  if (tg.useDefault || !tg.model) {
    return buildChatConfig(conf);
  }

  const active = conf?.active || {};
  const providerId = active.platform || 'zhipu';
  const provider = conf?.providers?.[providerId] || {};
  return {
    provider: providerId,
    model: tg.model,
    baseUrl:
      active.baseUrl ||
      provider.baseUrl ||
      defaultBaseUrlFor(providerId),
    apiKey: active.apiKey || provider.apiKey || '',
    headers:
      provider.headers ||
      (providerId === 'openrouter' ? DEFAULT_OPENROUTER_HEADERS : {}),
  };
}

function createModelService(opts = {}) {
  const {
    api,
    windowAlias,
    logger = createLogger('MODELS'),
    debugMode = DEBUG_MODE,
    storageKey = STORAGE_KEY,
  } = opts;

  const hostWindow = resolveWindow(windowAlias);
  const storage = getStorage(hostWindow);

  function getConfig() {
    return ensureModelsConfig(defaultModels);
  }

  function snapshot() {
    const conf = getConfig();
    return JSON.parse(JSON.stringify(conf));
  }

  async function persistModels(conf) {
    const config = ensureModelsConfig(defaultModels);
    config.active = conf.active || config.active;
    config.providers = conf.providers || config.providers;
    config.titleGenerator = conf.titleGenerator || config.titleGenerator;

    storage.setItem(storageKey, JSON.stringify(config));

    if (!debugMode && api?.models?.save) {
      try {
        await api.models.save(config);
      } catch (error) {
        logger.error('persist', 'Failed to save models', {
          error: error.message,
        });
      }
    }

    return snapshot();
  }

  async function loadModelsConf() {
    const settings = getSettings();
    let conf = null;

    if (debugMode) {
      const raw = storage.getItem(storageKey);
      if (raw) {
        try {
          conf = JSON.parse(raw);
        } catch (error) {
          logger.warn('load', 'Failed parsing local models-conf', {
            error: error.message,
          });
        }
      }
    } else if (api?.models?.load) {
      try {
        conf = await api.models.load();
      } catch (error) {
        logger.warn('load', 'Failed loading models from API', {
          error: error.message,
        });
      }
    }

    if (!conf) {
      conf = defaultModels();
    }

    conf.providers = conf.providers || {};
    for (const providerId of Object.keys(conf.providers)) {
      conf.providers[providerId].models = normalizeProviderModels(
        conf.providers[providerId].models,
      );
    }

    settings.models = conf;
    storage.setItem(storageKey, JSON.stringify(conf));
    return snapshot();
  }

  function setActiveModel({ platform, model, label, baseUrl, apiKey }) {
    const conf = getConfig();
    const providerId = platform || conf.active?.platform || 'openrouter';
    const provider = getProvider(getSettings(), providerId);

    conf.active = {
      platform: providerId,
      model: model || conf.active?.model || provider.models?.[0]?.id || '',
      baseUrl: baseUrl || provider.baseUrl || defaultBaseUrlFor(providerId),
      apiKey: apiKey || provider.apiKey || '',
      label: label || conf.active?.label || '',
    };

    storage.setItem(storageKey, JSON.stringify(conf));
    return snapshot();
  }

  function upsertProvider(providerId, updates = {}) {
    if (!providerId) throw new Error('providerId is required');
    const settings = getSettings();
    const provider = getProvider(settings, providerId);
    Object.assign(provider, updates);
    provider.models = normalizeProviderModels(provider.models);
    storage.setItem(storageKey, JSON.stringify(settings.models));
    return snapshot();
  }

  function removeProvider(providerId) {
    if (!providerId) return snapshot();
    const conf = getConfig();
    if (conf.providers) {
      delete conf.providers[providerId];
    }
    if (conf.active?.platform === providerId) {
      conf.active = {
        platform: 'openrouter',
        model: 'deepseek/deepseek-chat-v3.1:free',
        baseUrl: defaultBaseUrlFor('openrouter'),
        apiKey: '',
      };
    }
    storage.setItem(storageKey, JSON.stringify(conf));
    return snapshot();
  }

  function addModel(providerId, model) {
    if (!providerId || !model) throw new Error('providerId and model required');
    const provider = getProvider(getSettings(), providerId);
    const normalized = normalizeProviderModels(provider.models);
    const entry = typeof model === 'string' ? { id: model } : model;
    const exists = normalized.some(
      (item) => (item.id || item) === (entry.id || entry),
    );
    if (!exists) {
      normalized.push(entry);
      provider.models = normalized;
      storage.setItem(storageKey, JSON.stringify(getConfig()));
    }
    return snapshot();
  }

  function removeModel(providerId, modelId) {
    if (!providerId || !modelId) return snapshot();
    const provider = getProvider(getSettings(), providerId);
    provider.models = normalizeProviderModels(provider.models).filter(
      (item) => (item.id || item) !== modelId,
    );
    storage.setItem(storageKey, JSON.stringify(getConfig()));
    return snapshot();
  }

  function getActiveChatConfig() {
    return buildChatConfig(getConfig());
  }

  function getTitleGenConfig() {
    return buildTitleGeneratorConfig(getConfig());
  }

  function getActiveLabel() {
    return resolveLabelForActive(getConfig());
  }

  function reset() {
    const conf = defaultModels();
    const settings = getSettings();
    settings.models = conf;
    storage.setItem(storageKey, JSON.stringify(conf));
    return snapshot();
  }

  return {
    debugMode,
    getConfig,
    snapshot,
    persistModels,
    loadModelsConf,
    setActiveModel,
    upsertProvider,
    removeProvider,
    addModel,
    removeModel,
    getActiveChatConfig,
    getTitleGenConfig,
    getActiveLabel,
    getModelMeta: (platform, modelId) =>
      getModelMeta(getConfig(), platform, modelId),
    normalizeProviderModels,
    defaultBaseUrlFor,
    defaultModels,
    reset,
  };
}

module.exports = {
  createModelService,
  defaultModels,
  defaultBaseUrlFor,
  normalizeProviderModels,
};
