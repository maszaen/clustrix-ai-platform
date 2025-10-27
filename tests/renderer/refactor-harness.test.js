'use strict';

const fs = require('fs');
const path = require('path');

describe('renderer refactor harness', () => {
  beforeEach(() => {
    jest.resetModules();
    delete global.document;
  });

  afterAll(() => {
    delete global.document;
  });

  test('module template exposes lifecycle contract', () => {
    const templatePath = path.join(__dirname, '..', '..', 'renderer', 'module-template.js');
    const { createModule } = require(templatePath);
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const moduleApi = createModule({ logger, config: { sample: true } });

    expect(moduleApi).toHaveProperty('init');
    expect(moduleApi).toHaveProperty('destroy');
    expect(typeof moduleApi.init).toBe('function');
    expect(typeof moduleApi.destroy).toBe('function');

    moduleApi.init();
    moduleApi.destroy();

    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  test('dependency map is generated for renderer globals', () => {
    const dependencyMapPath = path.join(__dirname, '..', '..', 'renderer', 'dependency-map.md');
    const contents = fs.readFileSync(dependencyMapPath, 'utf8');

    expect(contents).toContain('# Renderer Global Dependency Map');
    expect(contents).toContain('Total mutable globals');
    expect(contents).toContain('## Detailed Listing');
  });

  test('dom utils provide selectors, esc, and caching', () => {
    const domUtilsPath = path.join(__dirname, '..', '..', 'renderer', 'utils', 'dom-utils.js');

    const mockChatLog = { id: 'chat-log' };
    const mockList = [{}, {}];
    global.document = {
      querySelector: jest.fn((selector) => (selector === '#chat-log' ? mockChatLog : null)),
      querySelectorAll: jest.fn(() => mockList),
    };

    const { $, $$, esc, domCache } = require(domUtilsPath);

    domCache.invalidate();

    expect($('#chat-log')).toBe(mockChatLog);
    expect($$('.anything')).toBe(mockList);
    expect(esc(`"A&B'<tag>`)).toBe('&quot;A&amp;B&#39;&lt;tag&gt;');

    const cached = domCache.get('#chat-log');
    const cachedAgain = domCache.get('#chat-log');
    expect(cached).toBe(mockChatLog);
    expect(cachedAgain).toBe(mockChatLog);
  });

  test('formatters expose relative time, message formatting, and ISO helper', () => {
    const formattersPath = path.join(__dirname, '..', '..', 'renderer', 'utils', 'formatters.js');
    const { formatRelativeTime, formatUserMessage, nowISO } = require(formattersPath);

    const iso = nowISO();
    expect(typeof iso).toBe('string');
    expect(new Date(iso).toString()).not.toBe('Invalid Date');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toContain('hour');

    const formatted = formatUserMessage('Hello **bold** _italic_');
    expect(formatted).toContain('<strong>bold</strong>');
    expect(formatted).toContain('<em>italic</em>');
  });

  test('timing utils debounce and throttle functions', () => {
    const timingUtilsPath = path.join(__dirname, '..', '..', 'renderer', 'utils', 'timing-utils.js');
    const { debounce, throttle } = require(timingUtilsPath);

    jest.useFakeTimers();
    try {
      const debouncedSpy = jest.fn();
      const throttledSpy = jest.fn();

      const debounced = debounce(debouncedSpy, 200);
      const throttled = throttle(throttledSpy, 200);

      debounced();
      debounced();
      jest.advanceTimersByTime(199);
      expect(debouncedSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(debouncedSpy).toHaveBeenCalledTimes(1);

      throttled();
      throttled();
      jest.advanceTimersByTime(200);
      expect(throttledSpy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('validation utils cover escaping and extension helpers', () => {
    const validationPath = path.join(__dirname, '..', '..', 'renderer', 'utils', 'validation.js');
    const { escapeHtml, getExtension, toExt } = require(validationPath);

    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(getExtension('file.test.js')).toBe('JS');
    expect(toExt('Archive.TAR.GZ')).toBe('gz');
  });

  test('logger exposes createLogger and log levels', () => {
    const loggerPath = path.join(__dirname, '..', '..', 'renderer', 'utils', 'logger.js');
    const { createLogger, LOG_LEVELS } = require(loggerPath);

    expect(LOG_LEVELS).toHaveProperty('debug', 1);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = createLogger('TEST');
    logger.debug('ctx', 'message');
    logger.warn('ctx', 'warn message', { foo: 'bar' });

    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('core constants snapshot', () => {
    const constantsPath = path.join(__dirname, '..', '..', 'renderer', 'core', 'constants.js');
    const constants = require(constantsPath);

    expect(constants.SESSIONS_PER_PAGE).toBe(70);
    expect(constants.MARKDOWN_TEST_SESSION_TYPE).toBe('markdown-test');
    expect(constants.EXT_GROUPS.code.has('js')).toBe(true);
    expect(typeof constants.ICONS.code).toBe('string');
  });

  test('state module exposes getters, setters, and reset operations', () => {
    const statePath = path.join(__dirname, '..', '..', 'renderer', 'core', 'state.js');
    jest.resetModules();
    const state = require(statePath);

    const defaults = state.snapshot();

    expect(defaults.state.sessions).toHaveLength(0);
    expect(defaults.current).toBeNull();
    expect(defaults.selectedChatIds instanceof Set).toBe(true);

    state.setValue('collapsed', true);
    expect(state.getValue('collapsed')).toBe(true);

    state.updateValue('welcomeScreenStagedFiles', (files) => {
      files.push('example.txt');
    });
    expect(state.getValue('welcomeScreenStagedFiles')).toContain('example.txt');

    state.resetKey('welcomeScreenStagedFiles');
    expect(state.getValue('welcomeScreenStagedFiles')).toHaveLength(0);

    state.setValue('current', { id: 'abc123', name: 'Test Session' });
    expect(state.getValue('current').id).toBe('abc123');

    state.resetAll();
    expect(state.getValue('collapsed')).toBe(false);
    expect(state.getValue('current')).toBeNull();
  });

  test('cache manager caches, evicts, and reports stats', () => {
    jest.resetModules();
    const statePath = path.join(__dirname, '..', '..', 'renderer', 'core', 'state.js');
    const cacheManagerPath = path.join(__dirname, '..', '..', 'renderer', 'managers', 'cache-manager.js');

    const state = require(statePath);
    state.resetAll();

    const { createCacheManager } = require(cacheManagerPath);
    const logger = { debug: jest.fn() };

    const manager = createCacheManager({ logger, maxCachedSessions: 2, cacheExpiryMs: 1000 });

    manager.cacheSession('a', '<p>A</p>', 10);
    expect(manager.getCachedSession('a').scrollPosition).toBe(10);

    manager.cacheSession('b', '<p>B</p>');
    manager.cacheSession('c', '<p>C</p>'); // should evict 'a'

    expect(manager.getCachedSession('a')).toBeNull();
    expect(manager.getCachedSession('b')).not.toBeNull();
    expect(manager.getCacheStats().size).toBe(2);

    expect(manager.invalidateSessionCache('b')).toBe(true);
    expect(manager.getCachedSession('b')).toBeNull();

    manager.clearSessionCache();
    expect(manager.getCacheStats().size).toBe(0);
  });

  test('cache manager expires stale entries and preloads sessions', () => {
    jest.resetModules();
    const statePath = path.join(__dirname, '..', '..', 'renderer', 'core', 'state.js');
    const cacheManagerPath = path.join(__dirname, '..', '..', 'renderer', 'managers', 'cache-manager.js');

    const state = require(statePath);
    state.resetAll();

    const { createCacheManager } = require(cacheManagerPath);
    const logger = { debug: jest.fn() };

    let currentTime = 1000;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    const manager = createCacheManager({ logger, maxCachedSessions: 3, cacheExpiryMs: 500 });

    manager.cacheSession('exp', '<p>Expire</p>');
    currentTime += 600;
    expect(manager.getCachedSession('exp')).toBeNull();

    const appState = state.getValue('state');
    appState.sessions = [
      { id: 's1', created_at: '2024-01-01T00:00:00Z', messages: [{ id: 1 }] },
      { id: 's2', created_at: '2024-01-02T00:00:00Z', messages: [{ id: 2 }] },
    ];

    jest.useFakeTimers();
    try {
      const timeoutSpy = jest.spyOn(global, 'setTimeout');
      manager.preloadFrequentSessions();
      expect(timeoutSpy).toHaveBeenCalled();
      timeoutSpy.mockRestore();
    } finally {
      jest.useRealTimers();
      dateSpy.mockRestore();
    }
  });

  test('api service proxies window api bridges when available', async () => {
    jest.resetModules();
    const apiServicePath = path.join(__dirname, '..', '..', 'renderer', 'services', 'api-service.js');
    const { createApiService } = require(apiServicePath);

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const streamController = { cancel: jest.fn() };
    const streamMock = jest.fn((messages, model, options, callback) => {
      callback('chunk-1');
      return streamController;
    });

    const windowAlias = {
      api: {
        sessions: {
          load: jest.fn().mockResolvedValue({ sessions: [], settings: {} }),
          save: jest.fn().mockResolvedValue(undefined),
        },
        projects: {
          load: jest.fn().mockResolvedValue([{ id: 'p1' }]),
          save: jest.fn().mockResolvedValue(true),
        },
        artifacts: {
          load: jest.fn().mockResolvedValue([{ id: 'a1' }]),
          save: jest.fn().mockResolvedValue(true),
        },
        models: {
          load: jest.fn().mockResolvedValue({}),
          save: jest.fn().mockResolvedValue(true),
        },
        files: {
          openDialogAndRead: jest.fn().mockResolvedValue('file-data'),
        },
        chat: {
          stream: streamMock,
          titleSuggest: jest.fn().mockResolvedValue('New Title'),
        },
        logging: {
          write: jest.fn(),
        },
        window: {
          minimize: jest.fn(),
          maximize: jest.fn(),
          close: jest.fn(),
        },
        htmlPreview: {
          create: jest.fn().mockResolvedValue({ previewId: 'p' }),
          delete: jest.fn().mockResolvedValue(true),
        },
        app: {
          restart: jest.fn(),
          getProfilePhoto: jest.fn().mockResolvedValue('photo'),
          getDefaultProfilePhoto: jest.fn().mockResolvedValue('default-photo'),
        },
        sync: {
          getConfig: jest.fn().mockResolvedValue({ mode: 'cloud' }),
          startOAuth: jest.fn().mockResolvedValue({ success: true }),
          logout: jest.fn().mockResolvedValue({ success: true }),
          syncNow: jest.fn().mockResolvedValue({ success: true }),
          backupNow: jest.fn().mockResolvedValue({ success: true }),
          recordActionHistory: jest.fn(),
          getActionHistory: jest.fn().mockResolvedValue([{ id: 1 }]),
          switchMode: jest.fn().mockResolvedValue({ success: true }),
          resolveConflicts: jest.fn().mockResolvedValue({ success: true }),
        },
        on: jest.fn(),
        off: jest.fn(),
      },
    };

    const service = createApiService({ windowAlias, logger, debugMode: false });

    expect(await service.sessions.load()).toEqual({ sessions: [], settings: {} });
    await service.sessions.save({ sessions: [], settings: {} });
    expect(windowAlias.api.sessions.save).toHaveBeenCalled();

    expect(await service.projects.load()).toEqual([{ id: 'p1' }]);
    await service.projects.save([{ id: 'p2' }]);
    expect(windowAlias.api.projects.save).toHaveBeenCalled();

    expect(await service.artifacts.load()).toEqual([{ id: 'a1' }]);
    await service.artifacts.save([{ id: 'a2' }]);
    expect(windowAlias.api.artifacts.save).toHaveBeenCalled();

    expect(await service.models.load()).toEqual({});
    await service.models.save({ some: 'config' });
    expect(windowAlias.api.models.save).toHaveBeenCalled();

    expect(await service.files.openDialogAndRead()).toBe('file-data');
    expect(await service.chat.titleSuggest('prompt', 'model', {})).toBe('New Title');

    const handler = jest.fn();
    const controller = service.chat.stream([], 'model', {}, handler);
    expect(controller).toBe(streamController);
    expect(handler).toHaveBeenCalledWith('chunk-1');

    service.logging.write({ message: 'log' });
    expect(windowAlias.api.logging.write).toHaveBeenCalled();

    service.window.minimize();
    service.window.maximize();
    service.window.close();
    expect(windowAlias.api.window.minimize).toHaveBeenCalled();
    expect(windowAlias.api.window.maximize).toHaveBeenCalled();
    expect(windowAlias.api.window.close).toHaveBeenCalled();

    expect(await service.htmlPreview.create('<html/>')).toEqual({ previewId: 'p' });
    await service.htmlPreview.delete('p');
    expect(windowAlias.api.htmlPreview.delete).toHaveBeenCalledWith('p');

    await service.app.restart();
    await service.app.getProfilePhoto();
    await service.app.getDefaultProfilePhoto();
    expect(windowAlias.api.app.restart).toHaveBeenCalled();
    expect(windowAlias.api.app.getProfilePhoto).toHaveBeenCalled();
    expect(windowAlias.api.app.getDefaultProfilePhoto).toHaveBeenCalled();

    await service.sync.getConfig();
    await service.sync.startOAuth();
    await service.sync.logout({ deleteCloudData: true });
    await service.sync.syncNow();
    await service.sync.backupNow();
    await service.sync.recordActionHistory('sync', 'success');
    await service.sync.getActionHistory();
    await service.sync.switchMode({ mode: 'offline' });
    await service.sync.resolveConflicts([]);
    expect(windowAlias.api.sync.getConfig).toHaveBeenCalled();
    expect(windowAlias.api.sync.recordActionHistory).toHaveBeenCalledWith('sync', 'success', undefined);

    service.events.on('channel', handler);
    expect(windowAlias.api.on).toHaveBeenCalled();
    service.events.off('channel', handler);
    expect(windowAlias.api.off).toHaveBeenCalled();

    expect(service.isAvailable()).toBe(true);
  });

  test('api service handles debug mode fallbacks', async () => {
    jest.resetModules();
    const apiServicePath = path.join(__dirname, '..', '..', 'renderer', 'services', 'api-service.js');
    const { createApiService } = require(apiServicePath);

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const setItem = jest.fn();
    const windowAlias = {
      localStorage: {
        setItem,
      },
    };

    const service = createApiService({ windowAlias, logger, debugMode: true });

    expect(await service.sessions.load()).toBeNull();
    await service.sessions.save({ foo: 'bar' });
    expect(setItem).toHaveBeenCalledWith('clustrix-data', JSON.stringify({ foo: 'bar' }));

    expect(await service.artifacts.load()).toEqual([]);
    expect(await service.projects.load()).toEqual([]);
    expect(await service.models.load()).toBeNull();
    expect(service.isAvailable()).toBe(false);
  });

  test('model service manages configs and active selection', async () => {
    jest.resetModules();
    const statePath = path.join(__dirname, '..', '..', 'renderer', 'core', 'state.js');
    const modelServicePath = path.join(__dirname, '..', '..', 'renderer', 'services', 'model-service.js');
    const state = require(statePath);
    state.resetAll();

    const memoryStorage = {
      _data: {},
      getItem(key) {
        return this._data[key] ?? null;
      },
      setItem(key, value) {
        this._data[key] = value;
      },
    };

    const api = {
      models: {
        load: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
      },
    };

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const { createModelService } = require(modelServicePath);
    const service = createModelService({
      api,
      windowAlias: { localStorage: memoryStorage },
      logger,
      debugMode: false,
    });

    const conf = await service.loadModelsConf();
    expect(conf.providers.openrouter).toBeDefined();

    service.addModel('groq', 'test-model');
    const snapshot = service.snapshot();
    expect(
      snapshot.providers.groq.models.some((m) => (m.id || m) === 'test-model'),
    ).toBe(true);

    await service.persistModels(snapshot);
    expect(api.models.save).toHaveBeenCalled();

    service.setActiveModel({ platform: 'groq', model: 'test-model', label: 'Groq Test' });
    const active = service.getActiveChatConfig();
    expect(active.provider).toBe('groq');
    expect(active.model).toBe('test-model');
    expect(service.getActiveLabel()).toBe('Groq Test');

    service.removeModel('groq', 'test-model');
    const afterRemoval = service.snapshot();
    expect(
      afterRemoval.providers.groq.models.some((m) => (m.id || m) === 'test-model'),
    ).toBe(false);
  });

  test('model service respects debug mode storage fallback', async () => {
    jest.resetModules();
    const statePath = path.join(__dirname, '..', '..', 'renderer', 'core', 'state.js');
    const modelServicePath = path.join(__dirname, '..', '..', 'renderer', 'services', 'model-service.js');
    const state = require(statePath);
    state.resetAll();

    const memoryStorage = {
      _data: {},
      getItem(key) {
        return this._data[key] ?? null;
      },
      setItem(key, value) {
        this._data[key] = value;
      },
    };

    const { createModelService } = require(modelServicePath);
    const service = createModelService({
      windowAlias: { localStorage: memoryStorage },
      debugMode: true,
    });

    const loaded = await service.loadModelsConf();
    expect(loaded.providers.openrouter).toBeDefined();

    const config = service.getActiveChatConfig();
    expect(typeof config.model).toBe('string');

    service.setActiveModel({ platform: 'gemini', model: 'gemini-1.5-flash' });
    const newConfig = service.getActiveChatConfig();
    expect(newConfig.provider).toBe('gemini');
    expect(memoryStorage.getItem('models-conf')).toContain('gemini-1.5-flash');
  });

  test('markdown renderer falls back when worker unavailable', async () => {
    jest.resetModules();
    const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'markdown', 'markdown-renderer.js');
    const { createMarkdownRenderer, splitMarkdownForStreaming } = require(rendererPath);

    const fallbackRenderer = jest.fn((src) => `HTML:${src}`);
    const workerManager = {
      processMarkdown: jest.fn().mockResolvedValue(null),
      dispose: jest.fn(),
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const renderer = createMarkdownRenderer({
      fallbackRenderer,
      workerManager,
      logger,
    });

    const simple = await renderer.render('Hello world', {});
    expect(simple).toBe('HTML:Hello world');
    expect(fallbackRenderer).toHaveBeenCalledWith('Hello world', {});

    workerManager.processMarkdown.mockResolvedValue('worker-html');
    const heavy = await renderer.render('```code```'.repeat(10), {});
    expect(heavy).toBe('worker-html');
    expect(workerManager.processMarkdown).toHaveBeenCalled();

    renderer.dispose();
    expect(workerManager.dispose).toHaveBeenCalled();

    expect(splitMarkdownForStreaming('Hi there')).toEqual(['Hi', ' ', 'there']);
  });

  test('markdown test helpers build scenarios', () => {
    const testPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'markdown', 'markdown-test.js');
    const {
      buildMarkdownTestScenario,
      DEFAULT_MARKDOWN_TEST_TEMPLATE,
      MARKDOWN_TEST_SESSION_TYPE,
      isMarkdownTestSession,
    } = require(testPath);

    expect(buildMarkdownTestScenario('')).toEqual(DEFAULT_MARKDOWN_TEST_TEMPLATE);
    const scenario = buildMarkdownTestScenario('Sample');
    expect(scenario.response).toBe('Sample');

    expect(isMarkdownTestSession({ type: MARKDOWN_TEST_SESSION_TYPE })).toBe(true);
    expect(isMarkdownTestSession({})).toBe(false);
  });

  test('thinking UI manager updates session and DOM state', async () => {
    jest.useFakeTimers();
    class FakeElement {
      constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.innerHTML = '';
        this.textContent = '';
        this.attributes = {};
        this.style = {};
        this.className = '';
      }
      appendChild(node) {
        this.children.push(node);
        return node;
      }
      append(...nodes) {
        nodes.forEach((node) => this.appendChild(node));
      }
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
      getAttribute(name) {
        return this.attributes[name];
      }
    }

    global.document = {
      createElement: (tag) => new FakeElement(tag),
      createElementNS: (_ns, tag) => new FakeElement(tag),
    };

    const thinkingPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'messages', 'thinking-ui.js');
    const {
      createThinkingUIManager,
      cleanLeadingWhitespace,
      renderThinkingText,
    } = require(thinkingPath);

    expect(cleanLeadingWhitespace('\u200B  hello')).toBe('hello');
    expect(renderThinkingText('**bold**')).toContain('<strong>bold</strong>');

    const onSave = jest.fn();
    const markdownRenderer = {
      renderSync: jest.fn((src) => `<p>${src}</p>`),
    };
    const manager = createThinkingUIManager({ markdownRenderer, onSave });

    const classSet = new Set(['expanded']);
    const classList = {
      add: (cls) => classSet.add(cls),
      remove: (cls) => classSet.delete(cls),
      contains: (cls) => classSet.has(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classSet.has(cls)) classSet.delete(cls);
          else classSet.add(cls);
        } else if (force) classSet.add(cls);
        else classSet.delete(cls);
      },
    };

    const body = {
      classList,
      scrollTop: 0,
      clientHeight: 100,
      scrollHeight: 100,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const toggle = {
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      getAttribute(name) {
        return this.attrs[name];
      },
    };
    toggle.setAttribute('aria-expanded', 'true');

    const thinkingUpdate = {
      innerHTML: '',
      children: [],
      appendChild(node) {
        this.children.push(node);
      },
    };
    const text = { innerHTML: '' };
    const aiNode = {
      _thinkingReady: true,
      _thinkingEl: {
        wrap: {},
        toggle,
        body,
        thinkingUpdate,
        text,
        toggleContent: { innerHTML: '' },
        userScrolled: () => false,
      },
    };

    const session = {};
    await manager.appendThinking(aiNode, 'chunk', session, 0);
    jest.advanceTimersByTime(250);
    expect(onSave).toHaveBeenCalled();
    expect(session._x_think[0].text).toBe('chunk');
    expect(text.innerHTML).toContain('chunk');

    await manager.appendThinkingUpdate(aiNode, { title: 'Step', content: 'Details' }, session, 0);
    expect(thinkingUpdate.children.length).toBeGreaterThan(0);

    manager.finalizeThinkingUI(aiNode, 1.23);
    expect(aiNode._thinkingEl.toggleContent.innerHTML).toContain('1.2');

    jest.useRealTimers();
    delete global.document;
  });

  test('message renderer produces user and AI message markup', async () => {
    const messageRendererPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'messages', 'message-renderer.js');
    const { createMessageRenderer } = require(messageRendererPath);

    const markdownRenderer = {
      render: jest.fn().mockResolvedValue('<p>AI content</p>'),
      renderSync: jest.fn().mockReturnValue('<p>AI content</p>'),
    };
    const thinkingManager = {
      renderThinkingText: jest.fn().mockReturnValue('<p>thinking</p>'),
      renderWithExistingFormatter: jest.fn(),
    };

    const formatUserMessage = (content) => `<strong>${content}</strong>`;
    const getFileIcon = () => '<div class="file-icon"></div>';

    const renderer = createMessageRenderer({
      formatUserMessage,
      markdownRenderer,
      thinkingManager,
      getFileIcon,
    });

    const userResult = await renderer.renderMessage({
      role: 'user',
      content: 'Hello',
      metadata: {
        files: [{ name: 'report.pdf' }],
      },
    });
    expect(userResult.html).toContain('<strong>Hello</strong>');
    expect(userResult.html).toContain('report.pdf');

    const aiResult = await renderer.renderMessage({
      role: 'ai',
      content: 'AI reply',
      final: true,
      metadata: { thinking: 'thoughts' },
    });
    expect(aiResult.html).toContain('AI content');
    expect(thinkingManager.renderThinkingText).toHaveBeenCalledWith('thoughts');
    expect(markdownRenderer.render).toHaveBeenCalledWith('AI reply', { isStreaming: false });
  });

  test('page renderers expose render and teardown hooks', () => {
    const welcomePath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'pages', 'welcome-page.js');
    const chatsPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'pages', 'chats-page.js');
    const projectsPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'pages', 'projects-page.js');
    const artifactsPath = path.join(__dirname, '..', '..', 'renderer', 'rendering', 'pages', 'artifacts-page.js');

    const { createWelcomePageRenderer } = require(welcomePath);
    const { createChatsPageRenderer } = require(chatsPath);
    const { createProjectsPageRenderer } = require(projectsPath);
    const { createArtifactsPageRenderer } = require(artifactsPath);

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const elementFactory = () => ({
      dataset: {},
    });

    const welcomeElement = elementFactory();
    const chatsElement = elementFactory();
    const projectsElement = elementFactory();
    const artifactsElement = elementFactory();

    const welcome = createWelcomePageRenderer({
      select: () => welcomeElement,
      logger,
    });
    welcome.render({ welcomeScreenStagedFiles: [1, 2] });
    welcome.teardown();
    expect(welcomeElement.dataset.stagedFiles).toBe('2');

    const chats = createChatsPageRenderer({
      select: () => chatsElement,
      selectAll: () => [{}, {}],
      logger,
    });
    chats.render({ sessions: [{}, {}], selectedChatIds: new Set(['a']) });
    chats.teardown();
    expect(chatsElement.dataset.renderedChats).toBe('2');

    const projects = createProjectsPageRenderer({
      select: () => projectsElement,
      logger,
    });
    projects.render({
      projectsData: [{}, {}],
      isProjectsSelectMode: true,
      selectedProjectIds: new Set(['p']),
    });
    expect(projectsElement.dataset.projectCount).toBe('2');

    const artifacts = createArtifactsPageRenderer({
      select: () => artifactsElement,
      logger,
    });
    artifacts.render({ codeArtifacts: [{}, {}, {}] });
    expect(artifactsElement.dataset.artifactCount).toBe('3');
  });

  test('session handlers create and delete sessions', async () => {
    const sessionHandlersPath = path.join(__dirname, '..', '..', 'renderer', 'handlers', 'session-handlers.js');
    const { createSessionHandlers } = require(sessionHandlersPath);

    const state = {
      sessions: [],
      settings: { models: {} },
    };
    let current = null;
    const cache = { invalidateCache: jest.fn() };
    const save = jest.fn().mockResolvedValue(undefined);
    const renderSessions = jest.fn();
    const showWelcome = jest.fn();

    const handlers = createSessionHandlers({
      getState: () => state,
      getCurrent: () => current,
      setCurrent: (session) => {
        current = session;
      },
      save,
      invalidateCache: cache.invalidateCache,
      showWelcomeScreen: showWelcome,
      renderSessions,
      getActiveChatConfig: () => ({
        provider: 'openrouter',
        model: 'demo-model',
      }),
      getModelMeta: () => ({ label: 'Demo Model' }),
      generateId: () => 'session-1',
      now: () => '2024-01-01T00:00:00Z',
    });

    const session = await handlers.createSession([['user', 'hi'], ['ai', 'initial', {}]], {});
    expect(state.sessions[0]).toBe(session);
    expect(session.messages.length).toBe(2);
    expect(save).toHaveBeenCalled();

    current = session;
    const placeholder = await handlers.regenerateFromIndex(1, session);
    expect(placeholder[0]).toBe('ai');
    expect(session.messages[session.messages.length - 1][0]).toBe('ai');

    const deleted = await handlers.deleteCurrentSession();
    expect(deleted).toBe(true);
    expect(state.sessions.length).toBe(0);
    expect(showWelcome).toHaveBeenCalled();
  });

  test('message handlers send and regenerate messages', async () => {
    jest.useFakeTimers();
    const messageHandlersPath = path.join(__dirname, '..', '..', 'renderer', 'handlers', 'message-handlers.js');
    const { createMessageHandlers } = require(messageHandlersPath);

    const state = {
      sessions: [],
      settings: { models: {} },
    };
    let current = null;

    const markdownRenderer = {
      render: jest.fn().mockResolvedValue('<p>ai</p>'),
      renderSync: jest.fn().mockReturnValue('<p>ai</p>'),
    };
    const thinkingManager = {};
    const messageRenderer = {
      renderMessage: jest.fn(({ role, content }) => ({
        role,
        html: `<div class="message ${role}">${content}</div>`,
        metadata: {},
      })),
    };

    const appendQueue = [];
    const elementsCreated = [];
    global.document = {
      querySelector: (selector) => {
        if (selector === '#chat-log') {
          return {
            appendChild(node) {
              appendQueue.push(node);
            },
          };
        }
        return null;
      },
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          firstElementChild: null,
          dataset: {},
          style: { cssText: '' },
          _events: {},
          appendChild(child) {
            this.firstElementChild = child;
            child.parentNode = this;
          },
          addEventListener(type, handler) {
            this._events[type] = handler;
          },
          removeEventListener(type) {
            delete this._events[type];
          },
          click() {
            this._events.click?.();
          },
          remove() {
            if (this.parentNode && this.parentNode.removeChild) {
              this.parentNode.removeChild(this);
            }
          },
        };
        Object.defineProperty(el, 'innerHTML', {
          set(value) {
            this.firstElementChild = { innerHTML: value, dataset: {}, style: { cssText: '' } };
          },
          get() {
            return this.firstElementChild?.innerHTML || '';
          },
        });
        elementsCreated.push(el);
        return el;
      },
      head: {
        appendChild: jest.fn(),
      },
    };

    const sessionHandlers = {
      regenerateFromIndex: jest.fn(async () => ['ai', '', {}]),
    };

    const handlers = createMessageHandlers({
      sessionHandlers,
      messageRenderer,
      thinkingManager,
      markdownRenderer,
      getState: () => state,
      getCurrent: () => current,
      setCurrent: (session) => {
        current = session;
      },
      save: jest.fn().mockResolvedValue(undefined),
      cacheSession: jest.fn(),
      invalidateSessionCache: jest.fn(),
      renderUploadedFiles: jest.fn(),
      renderSessions: jest.fn(),
      startStream: jest.fn(),
      buildMessages: () => [],
    });

    state.sessions.push({ id: 's1', messages: [], uploadedFiles: [] });
    current = state.sessions[0];

    const aiNode = await handlers.sendMessage('Hello');
    expect(aiNode).not.toBeNull();
    expect(messageRenderer.renderMessage).toHaveBeenCalled();

    await handlers.regenerate(current.messages.length - 1);
    expect(sessionHandlers.regenerateFromIndex).toHaveBeenCalled();

    delete global.document;
    jest.useRealTimers();
  });

  test('message handlers handle cancelled and incomplete regeneration', async () => {
    const messageHandlersPath = path.join(__dirname, '..', '..', 'renderer', 'handlers', 'message-handlers.js');
    const { createMessageHandlers } = require(messageHandlersPath);

    const state = {
      sessions: [],
      settings: { models: {} },
    };

    const session = {
      id: 's1',
      messages: [
        ['user', 'Hello!', {}],
        ['ai', 'Partial reply', { provider: 'test', model: 'demo', label: 'Demo' }],
      ],
      uploadedFiles: [],
      last_updated: '2024-01-01T00:00:00.000Z',
    };
    let current = session;
    state.sessions.push(session);

    const replacementParent = {
      replaceChild: jest.fn(),
    };
    const messageNode = {
      parentNode: replacementParent,
    };

    const createdNodes = [];
    const appendMessage = jest.fn((role, content, options) => {
      const node = {
        role,
        content,
        options,
        dataset: {},
        parentNode: null,
      };
      createdNodes.push(node);
      return node;
    });

    const startStream = jest.fn();
    const scheduleThinking = jest.fn();

    global.document = {};

    const handlers = createMessageHandlers({
      sessionHandlers: {
        regenerateFromIndex: jest.fn(async (aiIndex, sess) => {
          const placeholder = [
            'ai',
            '',
            { provider: 'test', model: 'demo', label: 'Demo' },
          ];
          sess.messages.push(placeholder);
          return placeholder;
        }),
        getActiveChatConfig: () => ({ provider: 'test', model: 'demo' }),
        getModelMeta: () => ({ label: 'Demo' }),
      },
      appendMessage,
      getState: () => state,
      getCurrent: () => current,
      setCurrent: (next) => {
        current = next;
      },
      save: jest.fn().mockResolvedValue(undefined),
      renderSessions: jest.fn(),
      startStream,
      buildMessages: () => [],
      buildMessagesUpTo: () => [{ role: 'system', content: 'persona' }, { role: 'user', content: 'Hello!' }],
      scheduleThinkingText: scheduleThinking,
      isStreamingInSession: () => false,
      invalidateSessionCache: jest.fn(),
    });

    const cancelledTarget = {
      dataset: { messageIndex: '1' },
      closest: (selector) => (selector === '.message.ai_cancelled' ? messageNode : null),
    };
    await handlers.regenerateCancelled(cancelledTarget);
    expect(appendMessage).toHaveBeenCalled();
    expect(replacementParent.replaceChild).toHaveBeenCalled();
    expect(scheduleThinking).toHaveBeenCalled();
    expect(startStream).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      expect.any(String),
      createdNodes[createdNodes.length - 1],
      1,
      false,
      expect.any(Array),
    );

    session.messages[1] = ['user', 'Hello again', {}];
    const incompleteTarget = {
      dataset: { messageIndex: '1' },
      closest: (selector) => (selector === '.message.ai_incomplete' ? messageNode : null),
    };
    await handlers.regenerateIncomplete(incompleteTarget);
    expect(startStream).toHaveBeenCalledTimes(2);

    delete global.document;
  });

  test('ui helpers manage modals, toasts, sidebar, and scrolling', () => {
    const modalManagerPath = path.join(__dirname, '..', '..', 'renderer', 'ui', 'modals', 'modal-manager.js');
    const toastManagerPath = path.join(__dirname, '..', '..', 'renderer', 'ui', 'toasts.js');
    const sidebarPath = path.join(__dirname, '..', '..', 'renderer', 'ui', 'sidebar.js');
    const smartScrollPath = path.join(__dirname, '..', '..', 'renderer', 'ui', 'scrolling', 'smart-scroll.js');

    const { createModalManager } = require(modalManagerPath);
    const { createToastManager } = require(toastManagerPath);
    const { createSidebarController } = require(sidebarPath);
    const { createSmartScroll } = require(smartScrollPath);

    const createdElements = {};
    global.document = {
      querySelector: (selector) => createdElements[selector] || null,
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          classList: {
            classes: new Set(),
            add(cls) {
              this.classes.add(cls);
            },
            remove(cls) {
              this.classes.delete(cls);
            },
            contains(cls) {
              return this.classes.has(cls);
            },
          },
          appendChild(child) {
            this.child = child;
            child.parentNode = this;
          },
          dataset: {},
          textContent: '',
          innerHTML: '',
          parentNode: null,
          style: { cssText: '' },
          _events: {},
          remove() {
            if (this.parentNode && this.parentNode.removeChild) {
              this.parentNode.removeChild(this);
            }
          },
          addEventListener(type, handler) {
            this._events[type] = handler;
          },
          removeEventListener(type) {
            delete this._events[type];
          },
          click() {
            this._events.click?.();
          },
        };
        return el;
      },
      head: {
        appendChild: jest.fn(),
      },
    };

    const confirmModal = {
      id: 'confirm-modal',
      classList: {
        classes: new Set(),
        add(cls) {
          this.classes.add(cls);
        },
        remove(cls) {
          this.classes.delete(cls);
        },
        contains(cls) {
          return this.classes.has(cls);
        },
      },
      querySelector(selector) {
        return this[selector];
      },
    };
    confirmModal['#confirm-title'] = { textContent: '' };
    confirmModal['#confirm-message'] = { textContent: '' };
    confirmModal['#confirm-ok'] = {
      addEventListener(type, handler) {
        if (type === 'click') this._handler = handler;
      },
      removeEventListener() {},
      click() {
        this._handler?.();
      },
    };
    confirmModal['#confirm-cancel'] = {
      addEventListener(type, handler) {
        if (type === 'click') this._handler = handler;
      },
      removeEventListener() {},
      click() {
        this._handler?.();
      },
    };
    confirmModal['.modal-overlay'] = {
      addEventListener(type, handler) {
        if (type === 'click') this._handler = handler;
      },
      removeEventListener() {},
      click() {
        this._handler?.();
      },
    };

    const toastContainer = {
      children: [],
      appendChild(node) {
        this.child = node;
        node.parentNode = this;
        this.children.push(node);
      },
      removeChild(node) {
        if (this.child === node) this.child = null;
        this.children = this.children.filter((child) => child !== node);
      },
      remove() {
        this.child = null;
        this.children = [];
      },
    };

    const appContainer = {
      classList: {
        classes: new Set(),
        toggle(cls, force) {
          if (force === undefined) {
            if (this.classes.has(cls)) this.classes.delete(cls);
            else this.classes.add(cls);
          } else if (force) {
            this.classes.add(cls);
          } else {
            this.classes.delete(cls);
          }
        },
        contains(cls) {
          return this.classes.has(cls);
        },
      },
    };

    const scroller = {
      scrollTop: 0,
      scrollHeight: 100,
      dataset: {},
    };

    createdElements['#confirm-modal'] = confirmModal;
    createdElements['#toast-container'] = toastContainer;
    createdElements['#app'] = appContainer;
    createdElements['.chat-log-container'] = scroller;

    const modalManager = createModalManager({ select: (selector) => createdElements[selector] });
    let confirmed = false;
    modalManager.showConfirmation({
      title: 'Delete',
      message: 'Confirm deletion?',
      onConfirm: () => {
        confirmed = true;
      },
    });
    confirmModal['#confirm-ok'].click();
    expect(confirmed).toBe(true);

    const toastManager = createToastManager({
      select: (selector) => createdElements[selector],
      setTimeoutFn: (fn) => fn(),
    });
    const toast = toastManager.showToast('Hello', 'success', 0);
    expect(toast.className).toContain('toast-success');

    const sidebar = createSidebarController({
      select: (selector) => createdElements[selector],
    });
    const collapsed = sidebar.toggle();
    expect(collapsed).toBe(true);
    expect(appContainer.classList.contains('sidebar-collapsed')).toBe(true);

    const smartScroll = createSmartScroll({
      select: (selector) => createdElements[selector],
    });
    smartScroll.markUserScrolled(true);
    smartScroll.scrollToBottom({ force: false });
    expect(scroller.scrollTop).toBe(0);
    smartScroll.markUserScrolled(false);
    smartScroll.scrollToBottom({ force: true });
    expect(scroller.scrollTop).toBe(scroller.scrollHeight);

    delete global.document;
  });
});
