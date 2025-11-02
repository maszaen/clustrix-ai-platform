/**
 * Clustrix AI - Application State Manager
 * Centralized state management for renderer
 * 
 * Phase 2: Extracted from renderer.js global variables
 * Created: 2025-11-03
 */

/**
 * Core application state object
 * Contains all global state previously scattered in renderer.js
 */
export const AppState = {
  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================
  sessions: [],
  current: null,
  loadedSessionCount: 0,
  loadedChatPageCount: 0,
  sessionDrafts: new Map(),
  dirtySessionIds: new Set(),
  justSentMessage: false,
  
  // ==========================================
  // UI STATE - Selection Modes
  // ==========================================
  isChatsSelectMode: false,
  selectedChatIds: new Set(),
  isProjectsSelectMode: false,
  selectedProjectIds: new Set(),
  
  // ==========================================
  // PROJECT MANAGEMENT
  // ==========================================
  currentProject: null,
  projectsData: [],
  loadedProjectSessionCount: 0,
  projectMessageStagedFiles: [],
  previousWebSearchState: null,
  
  // ==========================================
  // FILE MANAGEMENT
  // ==========================================
  welcomeScreenStagedFiles: [],
  uploadedFileIds: [], // Track uploaded files per session
  
  // ==========================================
  // DISPLAY STATE
  // ==========================================
  collapsed: false,
  
  // ==========================================
  // SEARCH STATE
  // ==========================================
  isAdvancedSearch: false,
  searchStatusQueue: [],
  isProcessingQueue: false,
  
  // ==========================================
  // CODE ARTIFACTS
  // ==========================================
  codeArtifacts: [],
  
  // ==========================================
  // MODALS & DIALOGS
  // ==========================================
  confirmationModal: null,
  confirmationTitleEl: null,
  confirmationMessageEl: null,
  confirmationConfirmBtn: null,
  confirmationCancelBtn: null,
  confirmationCloseBtn: null,
  confirmationModalOptions: null,
  isConfirmationProcessing: false,
  
  // ==========================================
  // MARKDOWN & WORKERS
  // ==========================================
  markdownWorker: null,
  workerMessageId: 0,
  workerPromises: new Map(),
  mermaidInitialized: false,
  
  // ==========================================
  // MISC
  // ==========================================
  saveScheduled: false,
  projectsDocumentListener: null,
  
  // ==========================================
  // SETTINGS
  // ==========================================
  settings: {
    persona: {
      name: "",
      work: "",
      prefs: ""
    },
    theme: "light", // "light" | "dark"
    streamThrottling: "auto", // "auto" | "low" | "high"
    language: "autodetect"
  }
};

/**
 * Initialize application state with optional initial values
 * @param {Object} initialValues - Optional initial state values
 * @returns {Object} Initialized app state
 */
export function initializeAppState(initialValues = {}) {
  const state = structuredClone(AppState);
  Object.assign(state, initialValues);
  return state;
}

/**
 * Session State Accessors
 */
export const SessionState = {
  /**
   * Get all sessions
   * @returns {Array} Sessions array
   */
  getSessions() {
    return AppState.sessions;
  },
  
  /**
   * Get current session
   * @returns {Object|null} Current session or null
   */
  getCurrent() {
    return AppState.current;
  },
  
  /**
   * Set current session
   * @param {Object} session - Session object to set as current
   */
  setCurrent(session) {
    AppState.current = session;
    AppState.justSentMessage = false;
  },
  
  /**
   * Add session to sessions array
   * @param {Object} session - Session to add
   */
  addSession(session) {
    if (!AppState.sessions.find(s => s.id === session.id)) {
      AppState.sessions.push(session);
    }
  },
  
  /**
   * Update session
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   */
  updateSession(sessionId, updates) {
    const session = AppState.sessions.find(s => s.id === sessionId);
    if (session) {
      Object.assign(session, updates);
      AppState.dirtySessionIds.add(sessionId);
    }
  },
  
  /**
   * Mark session as dirty (needs save)
   * @param {string} sessionId - Session ID
   */
  markDirty(sessionId) {
    AppState.dirtySessionIds.add(sessionId);
  },
  
  /**
   * Get dirty sessions
   * @returns {Set} Set of dirty session IDs
   */
  getDirtySessions() {
    return AppState.dirtySessionIds;
  },
  
  /**
   * Clear dirty sessions
   */
  clearDirty() {
    AppState.dirtySessionIds.clear();
  }
};

/**
 * UI State Accessors
 */
export const UIState = {
  /**
   * Toggle selection mode
   * @param {string} type - "chats" | "projects"
   */
  toggleSelectMode(type) {
    if (type === 'chats') {
      AppState.isChatsSelectMode = !AppState.isChatsSelectMode;
      if (!AppState.isChatsSelectMode) {
        AppState.selectedChatIds.clear();
      }
    } else if (type === 'projects') {
      AppState.isProjectsSelectMode = !AppState.isProjectsSelectMode;
      if (!AppState.isProjectsSelectMode) {
        AppState.selectedProjectIds.clear();
      }
    }
  },
  
  /**
   * Check if in selection mode
   * @param {string} type - "chats" | "projects"
   * @returns {boolean}
   */
  isSelectMode(type) {
    return type === 'chats' ? AppState.isChatsSelectMode : AppState.isProjectsSelectMode;
  },
  
  /**
   * Toggle selection of item
   * @param {string} id - Item ID
   * @param {string} type - "chats" | "projects"
   */
  toggleSelect(id, type) {
    const selectedSet = type === 'chats' ? AppState.selectedChatIds : AppState.selectedProjectIds;
    if (selectedSet.has(id)) {
      selectedSet.delete(id);
    } else {
      selectedSet.add(id);
    }
  },
  
  /**
   * Get selected items
   * @param {string} type - "chats" | "projects"
   * @returns {Set}
   */
  getSelected(type) {
    return type === 'chats' ? AppState.selectedChatIds : AppState.selectedProjectIds;
  },
  
  /**
   * Clear selections
   * @param {string} type - "chats" | "projects"
   */
  clearSelected(type) {
    if (type === 'chats') {
      AppState.selectedChatIds.clear();
    } else if (type === 'projects') {
      AppState.selectedProjectIds.clear();
    } else {
      AppState.selectedChatIds.clear();
      AppState.selectedProjectIds.clear();
    }
  }
};

/**
 * Project State Accessors
 */
export const ProjectState = {
  /**
   * Get current project
   * @returns {Object|null}
   */
  getCurrent() {
    return AppState.currentProject;
  },
  
  /**
   * Set current project
   * @param {Object} project - Project object
   */
  setCurrent(project) {
    AppState.currentProject = project;
  },
  
  /**
   * Get all projects
   * @returns {Array}
   */
  getAll() {
    return AppState.projectsData;
  },
  
  /**
   * Update project
   * @param {string} projectId - Project ID
   * @param {Object} updates - Fields to update
   */
  update(projectId, updates) {
    const project = AppState.projectsData.find(p => p.id === projectId);
    if (project) {
      Object.assign(project, updates);
    }
  }
};

/**
 * Search State Accessors
 */
export const SearchState = {
  /**
   * Toggle advanced search mode
   */
  toggleAdvancedSearch() {
    AppState.isAdvancedSearch = !AppState.isAdvancedSearch;
  },
  
  /**
   * Check if in advanced search mode
   * @returns {boolean}
   */
  isAdvanced() {
    return AppState.isAdvancedSearch;
  },
  
  /**
   * Add status to queue
   * @param {Object} status - Search status object
   */
  addStatus(status) {
    AppState.searchStatusQueue.push(status);
  },
  
  /**
   * Dequeue status
   * @returns {Object|null}
   */
  dequeueStatus() {
    return AppState.searchStatusQueue.shift() || null;
  },
  
  /**
   * Check if queue is processing
   * @returns {boolean}
   */
  isProcessing() {
    return AppState.isProcessingQueue;
  },
  
  /**
   * Set processing status
   * @param {boolean} processing
   */
  setProcessing(processing) {
    AppState.isProcessingQueue = processing;
  }
};

/**
 * Draft State Accessors
 */
export const DraftState = {
  /**
   * Get draft for session
   * @param {string} sessionId
   * @returns {string}
   */
  getDraft(sessionId) {
    return AppState.sessionDrafts.get(sessionId) || '';
  },
  
  /**
   * Set draft for session
   * @param {string} sessionId
   * @param {string} content
   */
  setDraft(sessionId, content) {
    AppState.sessionDrafts.set(sessionId, content);
  },
  
  /**
   * Clear draft for session
   * @param {string} sessionId
   */
  clearDraft(sessionId) {
    AppState.sessionDrafts.delete(sessionId);
  }
};

/**
 * Settings State Accessors
 */
export const SettingsState = {
  /**
   * Get all settings
   * @returns {Object}
   */
  getAll() {
    return AppState.settings;
  },
  
  /**
   * Get specific setting
   * @param {string} key - Setting key path (e.g., "persona.name", "theme")
   * @returns {*}
   */
  get(key) {
    const keys = key.split('.');
    let value = AppState.settings;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  },
  
  /**
   * Set specific setting
   * @param {string} key - Setting key path
   * @param {*} value - Value to set
   */
  set(key, value) {
    const keys = key.split('.');
    let target = AppState.settings;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
  },
  
  /**
   * Update all settings
   * @param {Object} settings
   */
  update(settings) {
    Object.assign(AppState.settings, settings);
  }
};

/**
 * Export state namespace for bulk access
 */
export const State = {
  AppState,
  SessionState,
  UIState,
  ProjectState,
  SearchState,
  DraftState,
  SettingsState,
  initializeAppState
};

export default State;
