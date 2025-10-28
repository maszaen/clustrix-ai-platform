/**
 * Global State Module
 * Extracted from renderer.js - 99% exact code
 * Loaded via script tag, exports to global window object
 * 
 * Contains all global state variables used throughout the application
 */

(function() {
  'use strict';

  // Main application state
  const state = {
    sessions: [],
    settings: { 
      persona: { name: "", work: "", prefs: "" }, 
      theme: "light",
      streamThrottling: "auto",
      language: "autodetect"
    },
  };

  // File staging for welcome screen and project messages
  let welcomeScreenStagedFiles = [];
  let projectMessageStagedFiles = [];

  // Current session/project tracking
  let current = null;
  let currentProject = null;

  // UI state
  let collapsed = false;

  // Pagination/loading state
  let loadedSessionCount = 0;
  let loadedChatPageCount = 0;
  let loadedProjectSessionCount = 0;

  // Search state
  let isAdvancedSearch = false;
  let searchStatusQueue = [];
  let isProcessingQueue = false;

  // Network state
  let onlineResumeTimer = null;

  // Data collections
  let sessionDrafts = new Map();
  let codeArtifacts = [];
  let projectsData = [];

  // Selection mode state
  let isChatsSelectMode = false;
  let selectedChatIds = new Set();
  let isProjectsSelectMode = false;
  let selectedProjectIds = new Set();

  // Listener tracking
  let projectsDocumentListener = null;
  let artifactsListenersAdded = false;

  // Message flow control
  let justSentMessage = false;

  // Feature initialization flags
  let mermaidInitialized = false;

  // State backup for navigation
  let previousWebSearchState = null;

  // Modal state
  let confirmationModal = null;
  let confirmationTitleEl = null;
  let confirmationMessageEl = null;
  let confirmationConfirmBtn = null;
  let confirmationCancelBtn = null;
  let confirmationCloseBtn = null;
  let confirmationModalOptions = null;
  let isConfirmationProcessing = false;

  // Save/sync state
  let saveScheduled = false;

  // Markdown worker state
  let markdownWorker = null;
  let workerMessageId = 0;

  // Page state
  let currentPageState = "welcome";

  // Scroll detection state
  let _cachedScroller = null;
  let isUserScrolledUp = false;
  let lastUserScrollTime = 0;
  let autoScrollEnabled = true;
  let scrollDetectionCooldown = false;
  let cooldownTimeout = null;
  let lastContentHeight = 0;
  let debouncedScrollTimeout = null;
  let debouncedAIScrollTimeout = null;
  let lastAIScrollTime = 0;
  let consecutiveScrollSkips = 0;
  let userHasScrolledUp = false;
  let isStreamingActive = false;

  // Export to global window object (mutable exports)
  window.globalState = {
    // Main state
    state,
    
    // File staging
    get welcomeScreenStagedFiles() { return welcomeScreenStagedFiles; },
    set welcomeScreenStagedFiles(val) { welcomeScreenStagedFiles = val; },
    
    get projectMessageStagedFiles() { return projectMessageStagedFiles; },
    set projectMessageStagedFiles(val) { projectMessageStagedFiles = val; },
    
    // Current tracking
    get current() { return current; },
    set current(val) { current = val; },
    
    get currentProject() { return currentProject; },
    set currentProject(val) { currentProject = val; },
    
    // UI state
    get collapsed() { return collapsed; },
    set collapsed(val) { collapsed = val; },
    
    // Pagination
    get loadedSessionCount() { return loadedSessionCount; },
    set loadedSessionCount(val) { loadedSessionCount = val; },
    
    get loadedChatPageCount() { return loadedChatPageCount; },
    set loadedChatPageCount(val) { loadedChatPageCount = val; },
    
    get loadedProjectSessionCount() { return loadedProjectSessionCount; },
    set loadedProjectSessionCount(val) { loadedProjectSessionCount = val; },
    
    // Search
    get isAdvancedSearch() { return isAdvancedSearch; },
    set isAdvancedSearch(val) { isAdvancedSearch = val; },
    
    get searchStatusQueue() { return searchStatusQueue; },
    set searchStatusQueue(val) { searchStatusQueue = val; },
    
    get isProcessingQueue() { return isProcessingQueue; },
    set isProcessingQueue(val) { isProcessingQueue = val; },
    
    // Network
    get onlineResumeTimer() { return onlineResumeTimer; },
    set onlineResumeTimer(val) { onlineResumeTimer = val; },
    
    // Data collections
    get sessionDrafts() { return sessionDrafts; },
    set sessionDrafts(val) { sessionDrafts = val; },
    
    get codeArtifacts() { return codeArtifacts; },
    set codeArtifacts(val) { codeArtifacts = val; },
    
    get projectsData() { return projectsData; },
    set projectsData(val) { projectsData = val; },
    
    // Selection mode
    get isChatsSelectMode() { return isChatsSelectMode; },
    set isChatsSelectMode(val) { isChatsSelectMode = val; },
    
    get selectedChatIds() { return selectedChatIds; },
    set selectedChatIds(val) { selectedChatIds = val; },
    
    get isProjectsSelectMode() { return isProjectsSelectMode; },
    set isProjectsSelectMode(val) { isProjectsSelectMode = val; },
    
    get selectedProjectIds() { return selectedProjectIds; },
    set selectedProjectIds(val) { selectedProjectIds = val; },
    
    // Listeners
    get projectsDocumentListener() { return projectsDocumentListener; },
    set projectsDocumentListener(val) { projectsDocumentListener = val; },
    
    get artifactsListenersAdded() { return artifactsListenersAdded; },
    set artifactsListenersAdded(val) { artifactsListenersAdded = val; },
    
    // Message flow
    get justSentMessage() { return justSentMessage; },
    set justSentMessage(val) { justSentMessage = val; },
    
    // Feature flags
    get mermaidInitialized() { return mermaidInitialized; },
    set mermaidInitialized(val) { mermaidInitialized = val; },
    
    // State backup
    get previousWebSearchState() { return previousWebSearchState; },
    set previousWebSearchState(val) { previousWebSearchState = val; },
    
    // Modal state
    get confirmationModal() { return confirmationModal; },
    set confirmationModal(val) { confirmationModal = val; },
    
    get confirmationTitleEl() { return confirmationTitleEl; },
    set confirmationTitleEl(val) { confirmationTitleEl = val; },
    
    get confirmationMessageEl() { return confirmationMessageEl; },
    set confirmationMessageEl(val) { confirmationMessageEl = val; },
    
    get confirmationConfirmBtn() { return confirmationConfirmBtn; },
    set confirmationConfirmBtn(val) { confirmationConfirmBtn = val; },
    
    get confirmationCancelBtn() { return confirmationCancelBtn; },
    set confirmationCancelBtn(val) { confirmationCancelBtn = val; },
    
    get confirmationCloseBtn() { return confirmationCloseBtn; },
    set confirmationCloseBtn(val) { confirmationCloseBtn = val; },
    
    get confirmationModalOptions() { return confirmationModalOptions; },
    set confirmationModalOptions(val) { confirmationModalOptions = val; },
    
    get isConfirmationProcessing() { return isConfirmationProcessing; },
    set isConfirmationProcessing(val) { isConfirmationProcessing = val; },
    
    // Save state
    get saveScheduled() { return saveScheduled; },
    set saveScheduled(val) { saveScheduled = val; },
    
    // Markdown worker
    get markdownWorker() { return markdownWorker; },
    set markdownWorker(val) { markdownWorker = val; },
    
    get workerMessageId() { return workerMessageId; },
    set workerMessageId(val) { workerMessageId = val; },
    
    // Page state
    get currentPageState() { return currentPageState; },
    set currentPageState(val) { currentPageState = val; },
    
    // Scroll state
    get _cachedScroller() { return _cachedScroller; },
    set _cachedScroller(val) { _cachedScroller = val; },
    
    get isUserScrolledUp() { return isUserScrolledUp; },
    set isUserScrolledUp(val) { isUserScrolledUp = val; },
    
    get lastUserScrollTime() { return lastUserScrollTime; },
    set lastUserScrollTime(val) { lastUserScrollTime = val; },
    
    get autoScrollEnabled() { return autoScrollEnabled; },
    set autoScrollEnabled(val) { autoScrollEnabled = val; },
    
    get scrollDetectionCooldown() { return scrollDetectionCooldown; },
    set scrollDetectionCooldown(val) { scrollDetectionCooldown = val; },
    
    get cooldownTimeout() { return cooldownTimeout; },
    set cooldownTimeout(val) { cooldownTimeout = val; },
    
    get lastContentHeight() { return lastContentHeight; },
    set lastContentHeight(val) { lastContentHeight = val; },
    
    get debouncedScrollTimeout() { return debouncedScrollTimeout; },
    set debouncedScrollTimeout(val) { debouncedScrollTimeout = val; },
    
    get debouncedAIScrollTimeout() { return debouncedAIScrollTimeout; },
    set debouncedAIScrollTimeout(val) { debouncedAIScrollTimeout = val; },
    
    get lastAIScrollTime() { return lastAIScrollTime; },
    set lastAIScrollTime(val) { lastAIScrollTime = val; },
    
    get consecutiveScrollSkips() { return consecutiveScrollSkips; },
    set consecutiveScrollSkips(val) { consecutiveScrollSkips = val; },
    
    get userHasScrolledUp() { return userHasScrolledUp; },
    set userHasScrolledUp(val) { userHasScrolledUp = val; },
    
    get isStreamingActive() { return isStreamingActive; },
    set isStreamingActive(val) { isStreamingActive = val; }
  };
})();
