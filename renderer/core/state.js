'use strict';

/**
 * Central store for renderer globals. Phase 2 copies the mutable state from
 * `renderer/renderer.js` without modifying the original file so subsequent
 * phases can progressively replace direct global mutations with explicit
 * accessors.
 */

const stateFactories = Object.freeze({
  state: () => ({
    sessions: [],
    settings: {
      persona: { name: '', work: '', prefs: '' },
      theme: 'light',
      streamThrottling: 'auto',
      language: 'autodetect',
    },
  }),
  welcomeScreenStagedFiles: () => [],
  projectMessageStagedFiles: () => [],
  current: () => null,
  collapsed: () => false,
  loadedSessionCount: () => 0,
  loadedChatPageCount: () => 0,
  loadedProjectSessionCount: () => 0,
  isAdvancedSearch: () => false,
  onlineResumeTimer: () => null,
  searchStatusQueue: () => [],
  isProcessingQueue: () => false,
  sessionDrafts: () => new Map(),
  projectsDocumentListener: () => null,
  codeArtifacts: () => [],
  isChatsSelectMode: () => false,
  selectedChatIds: () => new Set(),
  isProjectsSelectMode: () => false,
  selectedProjectIds: () => new Set(),
  justSentMessage: () => false,
  currentProject: () => null,
  projectsData: () => [],
  mermaidInitialized: () => false,
  previousWebSearchState: () => null,
  confirmationModal: () => null,
  confirmationTitleEl: () => null,
  confirmationMessageEl: () => null,
  confirmationConfirmBtn: () => null,
  confirmationCancelBtn: () => null,
  confirmationCloseBtn: () => null,
  confirmationModalOptions: () => null,
  isConfirmationProcessing: () => false,
  saveScheduled: () => false,
  markdownWorker: () => null,
  workerMessageId: () => 0,
  currentPageState: () => 'welcome',
  artifactsListenersAdded: () => false,
  _cachedScroller: () => null,
  isUserScrolledUp: () => false,
  lastUserScrollTime: () => 0,
  autoScrollEnabled: () => true,
  scrollDetectionCooldown: () => false,
  cooldownTimeout: () => null,
  lastContentHeight: () => 0,
  debouncedScrollTimeout: () => null,
  debouncedAIScrollTimeout: () => null,
  lastAIScrollTime: () => 0,
  consecutiveScrollSkips: () => 0,
  userHasScrolledUp: () => false,
  isStreamingActive: () => false,
  currentResponseSpacer: () => null,
  aiMessageHeightData: () => ({
    targetHeight: 0,
    aiMessageElement: null,
    naturalHeight: 0,
    isPreAllocated: false,
    observer: null,
  }),
  markdownRendererInstance: () => null,
  searchOverlay: () => null,
  searchMatches: () => [],
  currentMatchIndex: () => -1,
  searchInput: () => null,
  searchResults: () => null,
  searchDebounceTimer: () => null,
  currentSearchId: () => 0,
  isNavigatingHistory: () => false,
  dirtySessionIds: () => new Set(),
  sessionCache: () => new Map(),
  hoverStates: () => new WeakMap(),
  activeHoverElements: () => new Set(),
  workerPromises: () => new Map(),
  pendingWebSearchData: () => new Map(),
  THINKING_TIMER: () => new WeakMap(),
});

const store = {};
for (const [key, factory] of Object.entries(stateFactories)) {
  store[key] = factory();
}

const STATE_KEYS = Object.freeze(Object.keys(stateFactories));

function assertKey(key) {
  if (!stateFactories[key]) {
    throw new Error(`Unknown renderer state key: ${key}`);
  }
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.slice();
  if (value instanceof Map) return new Map(value);
  if (value instanceof Set) return new Set(value);
  if (value && value.constructor === Object) return { ...value };
  return value;
}

function getStore() {
  return store;
}

function getValue(key) {
  assertKey(key);
  return store[key];
}

function setValue(key, value) {
  assertKey(key);
  store[key] = value;
  return store[key];
}

function updateValue(key, updater) {
  assertKey(key);
  const current = store[key];
  const next = updater(current);
  if (typeof next !== 'undefined') {
    store[key] = next;
  }
  return store[key];
}

function resetKey(key) {
  assertKey(key);
  store[key] = stateFactories[key]();
  return store[key];
}

function resetAll() {
  for (const [key, factory] of Object.entries(stateFactories)) {
    store[key] = factory();
  }
  return store;
}

function snapshot() {
  const result = {};
  for (const key of STATE_KEYS) {
    result[key] = cloneValue(store[key]);
  }
  return result;
}

module.exports = {
  STATE_KEYS,
  getStore,
  getValue,
  setValue,
  updateValue,
  resetKey,
  resetAll,
  snapshot,
  stateFactories,
};
