const sessionStore = window.sessionStore;
if (!sessionStore) {
  throw new Error(
    "sessionStore module is not loaded. Ensure state/sessionStore.js is included before renderer.js.",
  );
}

const {
  state,
  sessionDrafts,
  dirtySessionIds,
  setSaveScheduled,
  markSessionDirty: trackDirtySession,
  clearDirtySessions,
} = sessionStore;

const projectsStore = window.projectsStore;
if (!projectsStore) {
  throw new Error(
    "projectsStore module is not loaded. Ensure state/projectsStore.js is included before renderer.js.",
  );
}

const {
  state: projectsState,
  selectedProjectIds,
  getProjects,
  setProjects,
  getCurrentProject,
  setCurrentProject,
  getProjectMessageFiles,
  addProjectMessageFiles,
  clearProjectMessageFiles,
  isSelectMode: getProjectsSelectMode,
  setSelectMode: setProjectsSelectMode,
  getLoadedProjectSessionCount,
  setLoadedProjectSessionCount,
  getDocumentListener: getProjectsDocumentListener,
  setDocumentListener: setProjectsDocumentListener,
} = projectsStore;

Object.defineProperties(window, {
  currentProject: {
    get: getCurrentProject,
    set: setCurrentProject,
    configurable: true,
  },
  projectMessageStagedFiles: {
    get: getProjectMessageFiles,
    set: (files) => {
      clearProjectMessageFiles();
      if (Array.isArray(files) && files.length > 0) {
        addProjectMessageFiles(files);
      }
    },
    configurable: true,
  },
  isProjectsSelectMode: {
    get: getProjectsSelectMode,
    set: setProjectsSelectMode,
    configurable: true,
  },
  projectsData: {
    get: getProjects,
    set: setProjects,
    configurable: true,
  },
  loadedProjectSessionCount: {
    get: getLoadedProjectSessionCount,
    set: setLoadedProjectSessionCount,
    configurable: true,
  },
  projectsDocumentListener: {
    get: getProjectsDocumentListener,
    set: setProjectsDocumentListener,
    configurable: true,
  },
});

const SESSIONS_PER_PAGE = 70;

let welcomeScreenStagedFiles = [];
let current = null;
let collapsed = false;
let loadedSessionCount = 0;
let isAdvancedSearch = false;
let onlineResumeTimer = null;
let searchStatusQueue = [];
let isProcessingQueue = false;
let codeArtifacts = [];
let justSentMessage = false;
let mermaidInitialized = false;
let previousWebSearchState = null; // Track websearch state before entering project
let confirmationModal = null;
let confirmationTitleEl = null;
let confirmationMessageEl = null;
let confirmationConfirmBtn = null;
let confirmationCancelBtn = null;
let confirmationCloseBtn = null;
let confirmationModalOptions = null;
let isConfirmationProcessing = false;

const sessionCacheModule = window.sessionCacheService;
if (!sessionCacheModule) {
  throw new Error("sessionCacheService module is not loaded. Ensure services/sessionCache.js is included before renderer.js.");
}

const {
  setLogger: setSessionCacheLogger,
  getCachedSession,
  cacheSession,
  invalidateSessionCache,
  clearSessionCache,
  isSessionCached,
  getCacheSize,
  getCacheStats,
} = sessionCacheModule;

const messageComposerModule = window.messageComposer;
if (!messageComposerModule) {
  throw new Error(
    "messageComposer module is not loaded. Ensure services/messageComposer.js is included before renderer.js.",
  );
}

messageComposerModule.configure({
  getActiveSession: () => current,
  getActiveProject: () => getCurrentProject(),
  logger: log,
});

const {
  buildMessagesForProject,
  buildResumeMessagesFromSession,
} = messageComposerModule;

async function save() {
  try {
    // PERFORMANCE: Incremental save - check if we have dirty sessions
    let dataToSave;
    const shouldUseIncremental = dirtySessionIds.size > 0 && 
                                  dirtySessionIds.size < state.sessions.length &&
                                  !DEBUG_MODE; // Full save in debug mode for simplicity
    
    if (shouldUseIncremental) {
      // INCREMENTAL: Only save dirty sessions + settings
      const dirtySessions = state.sessions.filter(s => dirtySessionIds.has(s.id));
      dataToSave = { 
        sessions: dirtySessions, 
        settings: state.settings,
        isIncremental: true,
        dirtyIds: Array.from(dirtySessionIds)
      };
      log("SAVE", 1, "save", `Incremental save: ${dirtySessions.length}/${state.sessions.length} sessions`, {
        dirtyIds: Array.from(dirtySessionIds)
      });
    } else {
      // FULL SAVE: Save all sessions (fallback or initial save)
      dataToSave = { sessions: state.sessions, settings: state.settings };
      log("SAVE", 1, "save", `Full save: ${state.sessions.length} sessions`);
    }
    
    if (DEBUG_MODE) {
      // In debug mode, always do full save to localStorage
      localStorage.setItem("clustrix-data", JSON.stringify({ 
        sessions: state.sessions, 
        settings: state.settings 
      }));
    } else {
      await window.api.sessions.save(dataToSave);
    }
    
    // Clear dirty tracking after successful save
    clearDirtySessions();
    
    log("APP", 2, "save", "Data saved successfully", {
      wasIncremental: shouldUseIncremental
    });
    
    // Auto-cache current session after save for consistency
    if (current && current.id) {
      const chatLog = domCache.getChatLog();
      if (chatLog && chatLog.innerHTML.trim()) {
        const scroller = getChatScroller();
        const scrollPos = scroller ? scroller.scrollTop : 0;
        cacheSession(current.id, chatLog.innerHTML, scrollPos, current._lazyState);
        log("CACHE", 1, "save", "Auto-cached current session after save");
      }
    }
    
    
    function deleteSession(sessionToDelete) {
      if (!sessionToDelete) return;
      log("SESSION", 2, "deleteSession", "Deleting session", {
        sessionName: sessionToDelete.name,
        createdAt: sessionToDelete.created_at,
      });
      
      // Invalidate cache untuk session yang dihapus
      if (sessionToDelete.id) {
        invalidateSessionCache(sessionToDelete.id);
      }
      
      state.sessions = state.sessions.filter((s) => s !== sessionToDelete);
      if (current === sessionToDelete) showWelcomeScreen();
      else renderSessions();
      clearDirtyTracking(); // Force full save untuk ensure backend dapat update yang benar
      save();
    }
    
    function showConfirmationModal(options = {}, legacyMessage, legacyOnConfirm) {
      let normalizedOptions = options;
    
      // Support legacy signature: showConfirmationModal(title, message, onConfirm)
      if (
        typeof options !== "object" ||
        options === null ||
        Array.isArray(options)
      ) {
        let legacyTitle = options != null ? String(options) : "Confirm";
        let legacyConfirm = legacyOnConfirm;
        let legacyMsg = legacyMessage;
    
        // Allow omission of message (title, onConfirm)
        if (typeof legacyMessage === "function" && legacyOnConfirm === undefined) {
          legacyConfirm = legacyMessage;
          legacyMsg = undefined;
        }
    
        normalizedOptions = {
          title: legacyTitle,
          message:
            legacyMsg !== undefined && legacyMsg !== null
              ? String(legacyMsg)
              : "Are you sure?",
          onConfirm: typeof legacyConfirm === "function" ? legacyConfirm : null,
          __isLegacy: true,
        };
      }
    
      if (!confirmationModal) {
        initConfirmationModal();
        if (!confirmationModal) return;
      }
    
      const { __isLegacy: isLegacyCall = false, ...modalOptions } = normalizedOptions || {};
      const {
        title = "Confirm",
        message = "Are you sure?",
        confirmText = "Confirm",
        cancelText = "Cancel",
        confirmLoadingText = "Processing...",
        confirmVariant = "danger",
        closeOnSuccess = true,
        lockWhileProcessing = false,
        onConfirm = null,
        onError = null,
        showErrorToast = true,
      } = modalOptions;
    
      confirmationModalOptions = {
        closeOnSuccess,
        lockWhileProcessing,
        confirmText,
        confirmLoadingText,
        onConfirm,
        onError,
        showErrorToast,
      };
    
      isConfirmationProcessing = false;
      confirmationModal.classList.remove('processing');
    
      if (confirmationTitleEl) {
        confirmationTitleEl.textContent = title;
      }
    
      if (confirmationMessageEl) {
        if (isLegacyCall) {
          confirmationMessageEl.textContent = message;
        } else {
          confirmationMessageEl.innerHTML = message;
        }
      }
    
      if (confirmationCancelBtn) {
        confirmationCancelBtn.textContent = cancelText;
        confirmationCancelBtn.disabled = false;
      }
    
      if (confirmationCloseBtn) {
        confirmationCloseBtn.disabled = false;
      }
    
      if (confirmationConfirmBtn) {
        confirmationConfirmBtn.disabled = false;
        confirmationConfirmBtn.className = confirmVariant === 'danger' ? 'danger-btn' : 'primary-btn';
        confirmationConfirmBtn.innerHTML = confirmText;
    
        confirmationConfirmBtn.onclick = async () => {
          if (isConfirmationProcessing) return;
    
          isConfirmationProcessing = true;
          const spinner = `
            <svg class="btn-spinner" style="animation: spin 1s linear infinite;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          `;
          confirmationConfirmBtn.innerHTML = `${spinner}<span>${confirmLoadingText}</span>`;
          confirmationConfirmBtn.disabled = true;
    
          if (lockWhileProcessing) {
            if (confirmationCancelBtn) confirmationCancelBtn.disabled = true;
            if (confirmationCloseBtn) confirmationCloseBtn.disabled = true;
            confirmationModal.classList.add('processing');
          }
    
          try {
            if (typeof onConfirm === 'function') {
              await onConfirm();
            }
    
            if (closeOnSuccess) {
              closeModalWithAnimation(confirmationModal);
            }
          } catch (err) {
            log('UI', 3, 'showConfirmationModal', 'Confirmation action failed', { error: err?.message || err });
            isConfirmationProcessing = false;
    
            if (lockWhileProcessing) {
              if (confirmationCancelBtn) confirmationCancelBtn.disabled = false;
              if (confirmationCloseBtn) confirmationCloseBtn.disabled = false;
              confirmationModal.classList.remove('processing');
            }
    
            if (confirmationConfirmBtn) {
              confirmationConfirmBtn.disabled = false;
              confirmationConfirmBtn.innerHTML = confirmText;
            }
    
            if (typeof onError === 'function') {
              onError(err);
            } else if (showErrorToast && err?.message) {
              showToast(err.message, 'error');
            }
    
            return;
          }
        };
      }
    
      openModalWithAnimation(confirmationModal);
    }
    
    function setCurrent(s) {
      if (current === s) {
        return;
      }
    
      const switchStartTime = performance.now();
      
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }
    
      // Handle websearch state when switching between regular and project sessions
      const currentIsProject = current && current.type === 'project';
      const nextIsProject = s && s.type === 'project';
      
      if (!currentIsProject && nextIsProject) {
        // Switching TO project session: save websearch state and disable
        previousWebSearchState = state.settings.webSearchEnabled;
        log('WEBSEARCH', 2, 'toggle', 'Entering project session - saving and disabling websearch', { 
          previousState: previousWebSearchState,
          projectSession: s?.name 
        });
        if (state.settings.webSearchEnabled) {
          state.settings.webSearchEnabled = false;
          const webSearchSwitch = document.getElementById('web-search-switch');
          if (webSearchSwitch) webSearchSwitch.checked = false;
          log('WEBSEARCH', 2, 'toggle', 'WebSearch disabled for project session', { 
            newState: false 
          });
        }
        
      } else if (currentIsProject && !nextIsProject) {
        // Switching FROM project session: restore previous websearch state
        if (previousWebSearchState !== null) {
          log('WEBSEARCH', 2, 'toggle', 'Leaving project session - restoring websearch', { 
            restoreState: previousWebSearchState,
            regularSession: s?.name 
          });
          state.settings.webSearchEnabled = previousWebSearchState;
          const webSearchSwitch = document.getElementById('web-search-switch');
          if (webSearchSwitch) webSearchSwitch.checked = previousWebSearchState;
          previousWebSearchState = null;
          log('WEBSEARCH', 2, 'toggle', 'WebSearch state restored', { 
            newState: state.settings.webSearchEnabled 
          });
        }
      }
    
      // Save current session scroll position and cache rendered content
      if (current && current.id) {
        const msgInput = $("#msg");
        if (msgInput) {
          saveDraftForSession(current.id, msgInput.value);
        }
        
        // Cache current session before switching ONLY if not streaming in this session
        // If streaming, the finalize will handle caching when stream completes
        const isStreamingInCurrentSession = streamManager.isStreamingInSession(current);
        if (!isStreamingInCurrentSession) {
          const chatLog = $("#chat-log");
          if (chatLog && chatLog.innerHTML.trim()) {
            const scroller = getChatScroller();
            const scrollPos = scroller ? scroller.scrollTop : 0;
            cacheSession(current.id, chatLog.innerHTML, scrollPos, current._lazyState);
            log("CACHE", 1, "setCurrent", "Cached session before switch (not streaming)");
          }
        } else {
          // Invalidate cache if streaming - let finalize handle caching when complete
          invalidateSessionCache(current.id);
          log("CACHE", 1, "setCurrent", "Invalidated cache for streaming session before switch");
        }
      }
      
      // Set session switching flag for optimized rendering and disable smooth scrolling
      window._isSessionSwitching = true;
      document.body.classList.add('session-switching');
      current = s;
    
      if (current && current.id) {
        savePageState("chat", current.id);
        
        // Push to page history for back/forward navigation
        if (typeof pushPageHistory === 'function') {
          pushPageHistory({ page: 'chat', sessionId: current.id });
        }
        
        log(
          "SessionState",
          0,
          "setCurrent",
          `Session set as current and saved: ${current.name || "Untitled"} (${current.id})`,
        );
      }
    
      if (current) {
        ensureTokenFields(current);
      }
    
      const msgInput = $("#msg");
      if (msgInput) {
        const draft =
          justSentMessage || !current || !current.id
            ? ""
            : loadDraftForSession(current.id);
        msgInput.value = draft;
    
        const shell = msgInput.closest(".ta-shell");
        if (shell && shell._scrollbarInstance) {
          shell._scrollbarInstance.updateLayout();
        } else {
          msgInput.style.height = "auto";
          msgInput.style.height = `${Math.min(msgInput.scrollHeight, 350)}px`;
        }
      }
    
      const chatArea = document.querySelector(".chat-area");
      const projectDetailView = document.querySelector(".project-detail-view");
      chatArea.classList.remove("welcome-active");
      chatArea.classList.remove("chats-active");
      chatArea.classList.remove("artifacts-active");
      chatArea.classList.remove("projects-active");
      projectDetailView.classList.remove("active");
    
      document.getElementById("chats-btn")?.classList.remove("active");
      document.getElementById("artifact-btn")?.classList.remove("active");
      document.getElementById("projects-btn")?.classList.remove("active");
    
      const welcomeScreen = document.getElementById("welcome-screen");
      if (welcomeScreen) welcomeScreen.style.display = "";
    
      const chatLogContainer = document.querySelector(".chat-log-container");
      if (chatLogContainer && !chatLogContainer.querySelector("#chat-log")) {
        chatLogContainer.innerHTML = `
          <div id="chat-log"></div>
        `;
      }
    
      if (current) {
        current._lazyState = null;
        const scroller = getChatScroller();
        if (scroller) {
          scroller._lazyListenerAdded = false;
        }
        window._isLazyLoading = false;
      }
    
      renderHistory();
      renderUploadedFiles();
      for (const streamId in streamManager.activeStreams) {
        const stream = streamManager.activeStreams[streamId];
        if (stream.session === s) {
          const newNode = $(
            `#chat-log .message[data-index="${stream.messageIndex}"]`,
          );
          if (newNode) {
            stream.aiNode = newNode;
            hydrateThinkingIfAnyAsync(newNode, current, stream.messageIndex);
            const contentDiv = newNode.querySelector(".message-text");
            if (contentDiv) {
              // If stream has accumulated content but wasn't rendered (due to switch before synthesis)
              // Trigger rendering now that element is available
              if (stream.fullResponse && stream.fullResponse.trim() !== "") {
                md(stream.fullResponse, { 
                  isStreaming: true,
                  isSessionSwitch: window._isSessionSwitching === true 
                }).then(html => {
                  contentDiv.innerHTML = html;
                  if (contentDiv.querySelector("pre code"))
                    highlightAllUnder(contentDiv);
                  renderMathInElement(contentDiv);
                }).catch(err => {
                  console.warn('Markdown rendering error in stream restore:', err);
                  contentDiv.innerHTML = mdFallback(stream.fullResponse);
                  if (contentDiv.querySelector("pre code"))
                    highlightAllUnder(contentDiv);
                  renderMathInElement(contentDiv);
                });
              } else if (!stream.fullResponse || stream.fullResponse.trim() === "") {
                // No full response yet (still in planning/synthesis phase), show thinking
                contentDiv.innerHTML = getThinkingMarkup();
                scheduleThinkingText(newNode);
              }
              // Don't scroll here - already handled by renderHistory
            }
          }
        }
      }
      $("#clustrix-logo").innerHTML = ``;
    
      renderSessions();
      updateChatHeader({ animate: false });
      updateInputState();
      
      // Auto focus message input with delay to prevent UI error
      setTimeout(() => {
        const msgInput = document.getElementById('msg');
        if (msgInput) msgInput.focus();
      }, 500);
      
      // Clear session switching flag after rendering is complete
      setTimeout(() => {
        window._isSessionSwitching = false;
        document.body.classList.remove('session-switching');
        
        // Log performance metrics
        const switchEndTime = performance.now();
        const totalSwitchTime = switchEndTime - switchStartTime;
        
        log("SESSION", 1, "setCurrent", "Session switch performance", {
          totalTime: `${totalSwitchTime.toFixed(2)}ms`,
          wasFromCache: !!getCachedSession(current.id),
          cacheSize: sessionCache.size
        });
      }, 100);
      
      log("SESSION", 2, "setCurrent", "Successfully switch session", {
        newCurrentSession: current.name,
      });
    }
  } catch (e) {
    console.error("Save failed:", e);
    log("APP", 4, "save", "Failed to save data.", { error: e });
  }
  
  // Refresh the session list after saving
  renderSessions();
}

function renderSessions() {
  const ul = $("#session-list");
  if (!ul) return;

  // Get display settings with defaults
  const showProjects = state.settings.showProjects !== undefined ? state.settings.showProjects : false;
  const showStarred = state.settings.showStarred !== undefined ? state.settings.showStarred : true;

  // Note: sidebar search has been removed, no filtering in sidebar anymore
  const filterValue = "";

  if (renderSessions._lastFilter !== filterValue) {
    loadedSessionCount = SESSIONS_PER_PAGE;
    renderSessions._lastFilter = filterValue;
  }

  let sessions = Array.isArray(state.sessions) ? state.sessions.slice() : [];

  sessions.sort((a, b) => {
    // Only prioritize starred sessions if showStarred is enabled
    if (showStarred) {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
    }

    // Then sort by last_updated (newest first)
    const da = new Date(a?.last_updated || a?.created_at || 0).getTime();
    const db = new Date(b?.last_updated || b?.created_at || 0).getTime();
    return db - da;
  });

  if (filterValue) {
    sessions = sessions.filter((s) => {
      const nameMatch = (s.name || "").toLowerCase().includes(filterValue);
      if (!isAdvancedSearch || !s.messages) return nameMatch;
      const contentMatch = s.messages.some((m) =>
        (m?.[1] || "").toLowerCase().includes(filterValue),
      );
      return nameMatch || contentMatch;
    });
  }

  const total = sessions.length;
  const pageSize = SESSIONS_PER_PAGE;
  const limit = Math.min(
    loadedSessionCount > 0 ? loadedSessionCount : pageSize,
    total,
  );
  const pageItems = sessions.slice(0, limit);

  ul.innerHTML = "";

  // Separate favorites, projects, and regular sessions
  const favorites = showStarred ? pageItems.filter((s) => s.isFavorite) : [];
  const showingStarred = state.settings.showStarred;
  const projectSessions = showProjects ? pageItems.filter((s) => !s.isFavorite && s.projectId) : [];
  const regularSessions = pageItems.filter(
    (s) => (!s.isFavorite || !showStarred) && (!s.projectId || !showProjects),
  );

  // Group project sessions by project
  const projectGroups = {};
  for (const session of projectSessions) {
    if (!projectGroups[session.projectId]) {
      projectGroups[session.projectId] = [];
    }
    projectGroups[session.projectId].push(session);
  }

  // Render favorites first (above all date separators)
  if (favorites.length > 0 && favorites) {
    const favoritesHeader = document.createElement("h3");
    favoritesHeader.className = "date-separator";
    favoritesHeader.textContent = "Starred";
    ul.appendChild(favoritesHeader);

    for (const s of favorites) {
      const li = createSessionListItem(s);
      ul.appendChild(li);
    }
  }

  // Render project groups (only if showProjects is enabled)
  if (showProjects) {
    for (const projectId in projectGroups) {
      const project = getProjects().find(p => p.id === projectId);
      if (!project) continue;

      const projectSessionsList = projectGroups[projectId];
      const maxSessions = 5;
      const sessionsToShow = projectSessionsList.slice(0, maxSessions);
      const hasMore = projectSessionsList.length > maxSessions;

      // Project header yang bisa diklik untuk show more
      const projectHeader = document.createElement("h3");
      projectHeader.className = "date-separator project-header";
      
      // Tambah class clickable kalau ada more sessions
      if (hasMore) {
        projectHeader.classList.add("project-show-more", "clickable");
        projectHeader.style.cursor = "pointer";
      }
      
      projectHeader.dataset.projectId = projectId;
      projectHeader.innerHTML = `
        <span class="project-name">${escapeHtml(project.name || "Unnamed Project")}</span>
        <span class="project-count">(${projectSessionsList.length})</span>
        ${hasMore ? `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="show-more-icon">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        ` : ''}
      `;
      
      // Tambah tooltip kalau clickable
      if (hasMore) {
        projectHeader.title = `Click to view all ${projectSessionsList.length} sessions in ${project.name || "this project"}`;
      }
      
      if (hasMore) {
        projectHeader.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("Project header clicked for show more", projectId);
          const project = getProjects().find(p => p.id === projectId);
          console.log("Found project:", project);
          
          if (project) {
            if (currentProject && currentProject.id === projectId) {
              return; // Don't execute anything
            }
            else if (currentProject) {
              closeMobileSidebar();
            }
          }
        });
      }
      
      ul.appendChild(projectHeader);

      for (const s of sessionsToShow) {
        const li = createSessionListItem(s);
        ul.appendChild(li);
      }
    }
  }

  // Render regular sessions
  if (regularSessions.length > 0) {
    // Add date separator if we have favorites or projects before
    if ((favorites.length > 0 && showStarred) || (showProjects && Object.keys(projectGroups).length > 0)) {
      const recentHeader = document.createElement("h3");
      recentHeader.className = "date-separator";
      recentHeader.textContent = "Recent";
      ul.appendChild(recentHeader);
    }

    for (const s of regularSessions) {
      const li = createSessionListItem(s);
      ul.appendChild(li);
    }
  }

  // Show "Load More" button if there are more sessions
  if (limit < total) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = `Load ${Math.min(pageSize, total - limit)} More Sessions`;
    loadMoreBtn.onclick = () => {
      loadedSessionCount += pageSize;
      renderSessions();
    };
    ul.appendChild(loadMoreBtn);
  }

  // Update active session state
  updateActiveSessionState(current);
}

const chatsControllerModule = window.chatsController;
if (!chatsControllerModule) {
  throw new Error(
    "chatsController module is not loaded. Ensure pages/chatsController.js is included before renderer.js.",
  );
}

const chatsController = chatsControllerModule.init({
  state,
  save,
  renderSessions,
  setCurrent,
  getCurrent: () => current,
  showConfirmationModal,
  deleteSession,
  markSessionDirty,
  clearDirtyTracking,
  renderHistory,
  renderUploadedFiles,
  savePageState,
  restoreNormalView,
  showProjectDetailView,
  getProjectsData: () => getProjects(),
  log,
  escapeHtml,
  esc,
  formatRelativeTime,
  SESSIONS_PER_PAGE,
  showRecentChats: null,
});

const {
  renderChatsPage: renderChatsPageImpl,
  setupChatsPageListeners: setupChatsPageListenersImpl,
  toggleFavorite: toggleFavoriteImpl,
  startRename: startRenameImpl,
  startSidebarRename: startSidebarRenameImpl,
  createSessionListItem: createSessionListItemImpl,
  filterChats: filterChatsImpl,
  resetSelectionState: resetChatSelectionState,
  setSelectMode: setChatSelectMode,
  isSelectMode: isChatSelectMode,
  getSelectedChatIds,
  getLoadedChatPageCount,
  setLoadedChatPageCount,
} = chatsController;

const projectsControllerModule = window.projectsController;
if (!projectsControllerModule) {
  throw new Error(
    "projectsController module is not loaded. Ensure pages/projectsController.js is included before renderer.js.",
  );
}

const projectsController = projectsControllerModule.init({
  state,
  projectsStore,
  selectedProjectIds,
  formatRelativeTime,
  escapeHtml,
  esc,
  log,
  getExtension,
  renderSessions,
  updateInputState,
  savePageState,
  pushPageHistory,
  renderHistory,
  renderUploadedFiles,
  showConfirmationModal,
  deleteSession,
  setCurrent,
  getCurrentSession: () => current,
  setCurrentSessionValue: (value) => {
    current = value;
  },
  createNewSession,
  clearLog,
  addMessage,
  createResponseSpacer,
  expandSpacer,
  generateAndSetTitle,
  save,
  scheduleThinkingText,
  buildMessagesForProject,
  startStream,
  getActiveChatConfig,
  getModelMeta,
  generateSessionId,
  nowISO,
  saveDraftDebounced,
  loadDraftForSession,
  filesUploadDark,
  filesUploadLight,
  openModalWithAnimation,
  closeModalWithAnimation,
});

const {
  showProjectsPage: showProjectsPageImpl,
  showProjectsListView: showProjectsListViewImpl,
  showProjectDetailView: showProjectDetailViewImpl,
  renderProjectsPage: renderProjectsPageImpl,
  createProjectListItem: createProjectListItemImpl,
  renderProjectSessions: renderProjectSessionsImpl,
  renderProjectInstructions: renderProjectInstructionsImpl,
  renderProjectFiles: renderProjectFilesImpl,
  setupProjectsPageListeners: setupProjectsPageListenersImpl,
  showCreateProjectModal: showCreateProjectModalImpl,
  createNewProject: createNewProjectImpl,
  saveProjectsData: saveProjectsDataImpl,
  loadProjectsData: loadProjectsDataImpl,
  toggleProjectFavorite: toggleProjectFavoriteImpl,
  updateProjectStarButton: updateProjectStarButtonImpl,
  handleProjectSend: handleProjectSendImpl,
  handleProjectFileUpload: handleProjectFileUploadImpl,
  deleteProjectFile: deleteProjectFileImpl,
  viewProjectFile: viewProjectFileImpl,
  startProjectRename: startProjectRenameImpl,
  startProjectDetailRename: startProjectDetailRenameImpl,
  showDeleteProjectConfirmation: showDeleteProjectConfirmationImpl,
  deleteProject: deleteProjectImpl,
  addInstruction: addInstructionImpl,
  viewInstruction: viewInstructionImpl,
  updateInstruction: updateInstructionImpl,
  deleteInstruction: deleteInstructionImpl,
  renderProjectMessageFiles: renderProjectMessageFilesImpl,
  setupTextareaProjectResize: setupTextareaProjectResizeImpl,
} = projectsController;

// CLEAR CACHE ON PAGE LOAD/REFRESH to prevent stale data
window.addEventListener("DOMContentLoaded", () => {
  clearSessionCache();
  log("CACHE", 1, "clearCache", "Session cache cleared on page load");
});

// Hover State Preservation System for Streaming
const hoverStates = new WeakMap();
const activeHoverElements = new Set();

// Intelligent cache preloading for frequently accessed sessions
function preloadFrequentSessions() {
  if (!state.sessions || state.sessions.length === 0) return;
  
  // Find most recently accessed sessions
  const recentSessions = state.sessions
    .filter(s => s.messages && s.messages.length > 0)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 3); // Top 3 most recent
  
  recentSessions.forEach((session, index) => {
    if (!isSessionCached(session.id)) {
      // Preload with slight delay to avoid blocking UI
      setTimeout(() => {
        log('CACHE', 1, 'preloadFrequentSessions', 'Background preloading session', { 
          sessionId: session.id,
          messageCount: session.messages.length 
        });
        // Could implement background rendering here if needed
      }, index * 100);
    }
  });
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getExtension(filename) {
  return filename.split(".").pop().toUpperCase();
}

function toExt(input) {
  if (!input) return "";
  const s = String(input).trim();
  const last = s.includes(".") ? s.split(".").pop() : s;
  return last.toLowerCase();
}

function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  
  // Convert to different time units
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffYears > 0) {
    return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
  } else if (diffMonths > 0) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  } else if (diffWeeks > 0) {
    return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
  } else if (diffDays > 0) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  } else if (diffHours > 0) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  } else if (diffMinutes > 0) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  } else {
    return "Just now";
  }
}

function getFileIcon(nameOrExt) {
  let ext = toExt(nameOrExt.replace(/^\./, ""));
  let group = "unknown";

  if (ext === "json") {
    group = "json";
  } else if (EXT_GROUPS.spreadsheet.has(ext)) group = "spreadsheet";
  else if (EXT_GROUPS.terminal.has(ext)) group = "terminal";
  else if (EXT_GROUPS.text.has(ext)) group = "text";
  else if (EXT_GROUPS.code.has(ext)) group = "code";

  const html = ICONS[group].replace(
    '<div class="file-icon"',
    `<div class="file-icon" data-ext="${ext}" aria-label="${ext.toUpperCase()} file"`,
  );
  return html;
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// PERFORMANCE: DOM Query Cache - cache frequently accessed elements
const domCache = {
  _cache: new Map(),
  get(selector) {
    if (!this._cache.has(selector)) {
      const element = document.querySelector(selector);
      if (element) {
        this._cache.set(selector, element);
      }
      return element;
    }
    return this._cache.get(selector);
  },
  invalidate(selector) {
    if (selector) {
      this._cache.delete(selector);
    } else {
      this._cache.clear();
    }
  },
  // Helper methods for common queries
  getChatLog() { return this.get("#chat-log"); },
  getMsg() { return this.get("#msg"); },
  getMsgCentral() { return this.get("#msg-central"); }
};

const THINKING_TIMER = new WeakMap();
const DEBUG_MODE = typeof window.api === "undefined";

// Markdown Worker Management
let markdownWorker = null;
let workerMessageId = 0;
const workerPromises = new Map();

function shouldNormalizeParagraphLists(html) {
  if (typeof html !== 'string' || !html) return false;
  if (html.includes('p-has-li')) return true;
  return /<\/p>\s*<(?:ul|ol)(?=\b|>)/i.test(html);
}

function normalizeParagraphListHtml(html) {
  if (!shouldNormalizeParagraphLists(html)) {
    return html || '';
  }
  if (typeof addPHasListClass !== 'function' || typeof document === 'undefined') {
    return html || '';
  }
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html || '';
    addPHasListClass(tempDiv);
    return tempDiv.innerHTML;
  } catch (err) {
    log('MARKDOWN', 2, 'normalizeParagraphListHtml', 'Failed to normalize paragraph/list spacing', { error: err.message });
    return html || '';
  }
}

function initMarkdownWorker() {
  if (markdownWorker) return;
  
  try {
    markdownWorker = new Worker('./core/md.worker.js');
    
    markdownWorker.onmessage = function(event) {
      const { type, html, streamId, messageId } = event.data || {};
      
      if (messageId && workerPromises.has(messageId)) {
        const { resolve } = workerPromises.get(messageId);
        workerPromises.delete(messageId);
        const normalizedHtml = normalizeParagraphListHtml(html || '');
        resolve(normalizedHtml);
      }
    };
    
    markdownWorker.onerror = function(error) {
      markdownWorker = null;
    };
    
    markdownWorker.onmessageerror = function(error) {
      markdownWorker = null;
    };
    
    log('WORKER', 1, 'initMarkdownWorker', 'Markdown worker initialized successfully');
  } catch (error) {
    log('WORKER', 3, 'initMarkdownWorker', 'Failed to initialize markdown worker', { error: error.message });
    markdownWorker = null;
  }
}

const DEBUG_MARKDOWN = false;
const LOGGING = true;

const MARKDOWN_TEST_SESSION_TYPE = "markdown-test";
const MARKDOWN_TEST_TITLE = "Markdown Test Session";
const MARKDOWN_TEST_PROMPT = "[MARKDOWN TEST]";
const MARKDOWN_TEST_MODEL_INFO = Object.freeze({
  provider: "local",
  model: "markdown-test",
  label: "Markdown Test",
});

// function ensureMarkdownItAlias() {
//   if (!window.MarkdownIt && window.markdownit) {
//     window.MarkdownIt = window.markdownit;
//   }
// }

// ensureMarkdownItAlias();

const DEFAULT_MARKDOWN_TEST_TEMPLATE = Object.freeze({
  think:
    "Tidak ada isi form. Tampilkan contoh markdown bawaan agar renderer dapat diperiksa.",
  response: `## Markdown Showcase

Berikut contoh elemen markdown umum:

- **Teks tebal** dan _teks miring_
- Daftar bernomor:
  1. Langkah pertama
  2. Langkah kedua dengan tautan [Clustrix](https://example.com)
- Kutipan blok untuk catatan penting.

> Markdown membantu menjaga struktur jawaban.

### Potongan kode

\`\`\`js
function greet(name) {
  return \`Halo, \${name}!\`;
}
console.log(greet("Markdown Test"));
\`\`\`

| Komponen | Status |
| --- | --- |
| Heading | ✅ |
| List | ✅ |
| Code block | ✅ |

Tambahkan juga rumus inline seperti $E = mc^2$ dan teks akhir yang ringkas.
`,
});

function buildMarkdownTestScenario(rawInput) {
  const text = typeof rawInput === "string" ? rawInput.replace(/\r\n/g, "\n") : "";
  const trimmed = text.trim();

  if (!trimmed) {
    return DEFAULT_MARKDOWN_TEST_TEMPLATE;
  }

  return {
    think:
      "Salin isi form ke balasan markdown agar mudah diverifikasi secara lokal tanpa request eksternal.",
    response: text,
  };
}

function isMarkdownTestSession(session) {
  return (
    !!session &&
    (session.type === MARKDOWN_TEST_SESSION_TYPE || session.isMarkdownTest === true)
  );
}

function splitMarkdownForStreaming(text) {
  if (!text) return [];
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

function updateMarkdownControls() {
  const welcomeBtn = document.getElementById("markdown-test-welcome");
  if (welcomeBtn) {
    welcomeBtn.style.display = DEBUG_MARKDOWN ? "" : "none";
  }

  const chatBtn = document.getElementById("markdown-test-chat");
  const sendBtn = document.getElementById("send");

  if (!DEBUG_MARKDOWN) {
    if (chatBtn) chatBtn.style.display = "none";
    if (sendBtn) sendBtn.style.display = "";
    return;
  }

  const shouldShowMarkdownControls = isMarkdownTestSession(current);

  if (chatBtn) {
    chatBtn.style.display = shouldShowMarkdownControls ? "" : "none";
  }
  if (sendBtn) {
    sendBtn.style.display = shouldShowMarkdownControls ? "none" : "";
  }
}

async function startMarkdownTestFromWelcome() {
  if (!DEBUG_MARKDOWN) return;

  const input = $("#msg-central");
  const originalText = input ? input.value : "";
  if (input) {
    input.value = "";
    try {
      saveDraftDebounced.cancel();
    } catch {}
    sessionDrafts.delete("welcome-screen");
    saveDraftForSession("welcome-screen", "");
    const shell = input.closest(".ta-shell");
    if (shell && shell.__taScroll) {
      shell.__taScroll.updateLayout(true);
    } else {
      input.style.height = "auto";
    }
  }

  welcomeScreenStagedFiles = [];
  renderWelcomeScreenFiles();

  const session = await createNewSession([], { type: MARKDOWN_TEST_SESSION_TYPE });
  session.name = MARKDOWN_TEST_TITLE;
  session.type = MARKDOWN_TEST_SESSION_TYPE;
  session.isMarkdownTest = true;
  session.last_updated = nowISO();

  await save();

  setCurrent(session);
  updateMarkdownControls();
  runMarkdownTestTurn(session, originalText);
}

function runMarkdownTestTurn(session = current, rawInput) {
  if (!DEBUG_MARKDOWN) return;
  const activeSession = session || current;
  if (!isMarkdownTestSession(activeSession)) return;
  if (streamManager.isStreamingInSession(activeSession)) return;

  window._isLazyLoading = false;
  isUserScrolledUp = false;
  autoScrollEnabled = true;
  scrollDetectionCooldown = false;
  clearTimeout(cooldownTimeout);

  if (!Array.isArray(activeSession.uploadedFiles)) {
    activeSession.uploadedFiles = [];
  }

  activeSession.last_updated = nowISO();

  let composerValue = typeof rawInput === "string" ? rawInput : undefined;

  const input = $("#msg");
  if (composerValue === undefined && activeSession === current && input) {
    composerValue = input.value;
  }

  if (input) {
    input.value = "";
    const shell = input.closest(".ta-shell");
    if (shell && shell._scrollbarInstance) {
      shell._scrollbarInstance.updateLayout();
    } else {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 350)}px`;
    }
  }

  try {
    saveDraftDebounced.cancel();
  } catch {}
  if (activeSession.id) {
    sessionDrafts.delete(activeSession.id);
    saveDraftForSession(activeSession.id, "");
  }

  justSentMessage = true;
  setTimeout(() => {
    justSentMessage = false;
  }, 1000);

  const userIndex = activeSession.messages.length;
  activeSession.messages.push(["user", MARKDOWN_TEST_PROMPT]);

  addMessage("user", MARKDOWN_TEST_PROMPT, {
    final: true,
    index: userIndex,
  });

  const modelInfo = { ...MARKDOWN_TEST_MODEL_INFO };
  activeSession.messages.push(["ai", "", modelInfo]);

  const aiMessageIndex = activeSession.messages.length - 1;
  const aiNode = addMessage("ai", "", {
    final: false,
    index: aiMessageIndex,
    metadata: modelInfo,
  });
  aiNode.dataset.index = String(aiMessageIndex);

  createResponseSpacer();
  setTimeout(() => {
    expandSpacer();
  }, 50);

  scheduleThinkingText(aiNode);

  const scenario = buildMarkdownTestScenario(
    typeof composerValue === "string" ? composerValue : "",
  );
  streamMarkdownTestResponse(activeSession, aiNode, aiMessageIndex, scenario);

  renderSessions();
  updateChatHeader();
  try {
    save();
  } catch {}
}

function streamMarkdownTestResponse(session, aiNode, aiMessageIndex, scenario) {
  if (!DEBUG_MARKDOWN) return;
  const streamId = `${session.id}-${aiMessageIndex}-markdown-${Date.now()}`;
  const handler = createStreamHandler(streamId, MARKDOWN_TEST_PROMPT, false);

  let thinkTimer = null;
  let streamTimer = null;
  let finished = false;

  const clearTimers = () => {
    if (thinkTimer) {
      clearTimeout(thinkTimer);
      thinkTimer = null;
    }
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
  };

  const controller = {
    cancel: () => {
      if (finished) return;
      finished = true;
      clearTimers();
      handler({ error: "Markdown test cancelled" });
    },
  };

  streamManager.startStream(streamId, {
    controller,
    aiNode,
    session,
    messageIndex: aiMessageIndex,
    messages: [],
    contextPrompt: MARKDOWN_TEST_PROMPT,
    fullResponse: "",
    startedAt: Date.now(),
    thinkStartTime: Date.now(),
  });

  const beginStreaming = () => {
    const active = streamManager.activeStreams[streamId];
    if (!active) return;

    // Fire and forget for async thinking update
    appendThinking(aiNode, scenario.think, session, aiMessageIndex).catch(console.error);
    const thinkDuration = Math.max(
      (Date.now() - (active.thinkStartTime || active.startedAt || Date.now())) / 1000,
      0.1,
    );
    session._x_think = session._x_think || {};
    session._x_think[aiMessageIndex] = {
      text: scenario.think,
      duration: thinkDuration,
    };
    finalizeThinkingUI(aiNode, thinkDuration, MARKDOWN_TEST_MODEL_INFO);

    const tokens = splitMarkdownForStreaming(scenario.response);
    let idx = 0;

    streamTimer = setInterval(() => {
      const currentState = streamManager.activeStreams[streamId];
      if (!currentState) {
        clearTimers();
        return;
      }

      if (idx < tokens.length) {
        handler(tokens[idx]);
        idx += 1;
      } else {
        clearTimers();
        finished = true;
        handler(null);
      }
    }, 24);
  };

  thinkTimer = setTimeout(beginStreaming, 120);
}

function getFilesForDisplay(session, context = 'form') {
  if (!session || !session.uploadedFiles) return [];

  return session.uploadedFiles;
}

function getFilesForMessage(session, messageType = 'conversation') {
  if (!session || !session.uploadedFiles) return [];

  return session.uploadedFiles;
}


function getFilesForAI(session) {
  if (!session || !session.uploadedFiles) return [];
  return session.uploadedFiles;
}


function analyzeFileVisibility(session) {
  if (!session) return { error: 'No session provided' };

  const allFiles = session.uploadedFiles || [];
  const isProjectSession = session.type === 'project' || session.isProject;

  return {
    sessionType: isProjectSession ? 'project' : 'regular',
    totalFiles: allFiles.length,
    projectFiles: 0, 
    userFiles: allFiles.length, 
    formDisplay: getFilesForDisplay(session, 'form').length,
    messageDisplay: getFilesForDisplay(session, 'message').length,
    aiProcessing: getFilesForAI(session).length,
    visibility: {
      form: 'all-files',
      message: 'all-files',
      ai: 'all-files'
    }
  };
}

let currentPageState = "welcome";

function savePageState(pageState, sessionId = null) {
  try {
    localStorage.setItem("clustrix-current-page", pageState);

    if (sessionId) {
      localStorage.setItem("clustrix-current-session", sessionId);
    } else if (pageState !== "chat") {
      localStorage.removeItem("clustrix-current-session");
    }

    if (!state.settings) state.settings = {};
    state.settings.currentPage = pageState;
    if (sessionId) {
      state.settings.currentSession = sessionId;
    } else if (pageState !== "chat") {
      delete state.settings.currentSession;
    }

    save();

  } catch (error) {
    log("PageState", 2, "savePageState", "Failed to save page state", {
      error: error.message,
    });
  }
}

function loadPageState() {
  try {
    const preloadedSettings = window.__PRELOADED_SETTINGS__;
    if (preloadedSettings && preloadedSettings.currentPage) {
      currentPageState = preloadedSettings.currentPage;
      return preloadedSettings.currentPage;
    }

    let savedPage = localStorage.getItem("clustrix-current-page");

    if (!savedPage && state.settings && state.settings.currentPage) {
      savedPage = state.settings.currentPage;
    }

    const validPages = ["welcome", "chats", "artifacts", "chat", "projects"];
    if (savedPage && validPages.includes(savedPage)) {
      currentPageState = savedPage;

      if (savedPage === "chat") {
        const savedSessionId =
          localStorage.getItem("clustrix-current-session") ||
          (state.settings && state.settings.currentSession);

        if (savedSessionId) {
          const session = state.sessions.find((s) => s.id === savedSessionId);
          if (session) {
            setCurrent(session);
          }
        }
      }

      log("PageState", 0, "loadPageState", `Page state loaded: ${savedPage}`);
      return savedPage;
    } else {
      currentPageState = "welcome";
      return "welcome";
    }
  } catch (error) {
    log("PageState", 2, "loadPageState", "Failed to load page state", {
      error: error.message,
    });
    currentPageState = "welcome";
    return "welcome";
  }
}

function restoreLastActivePage() {
  const lastPage = loadPageState();

  switch (lastPage) {
    case "chats":
      showChatsPage();
      break;
    case "artifacts":
      showArtifactsPage();
      break;
    case "chat":
      try {
        const preloadedSettings = window.__PRELOADED_SETTINGS__;
        const savedSessionId =
          preloadedSettings?.currentSession ||
          localStorage.getItem("clustrix-current-session") ||
          (state.settings && state.settings.currentSession);

        let sessionToRestore = null;

        if (savedSessionId && state.sessions && state.sessions.length > 0) {
          sessionToRestore = state.sessions.find(
            (s) => s.id === savedSessionId,
          );
        }

        if (!sessionToRestore && state.sessions && state.sessions.length > 0) {
          sessionToRestore = state.sessions[0];
        }

        if (sessionToRestore) {
          setCurrent(sessionToRestore);
          restoreNormalView();
        } else {
          showWelcomeScreen();
        }
      } catch (error) {
        log(
          "PageState",
          2,
          "restoreLastActivePage",
          "Error restoring chat session",
          { error: error.message },
        );
        showWelcomeScreen();
      }
      break;
    case "projects":
      showProjectsPage();
      break;
    case "welcome":
    default:
      showWelcomeScreen();
      break;
  }
}
const streamManager = {
  activeStreams: {},
  byKey: {},

  makeKey(session, messageIndex) {
    return `${session.id}:${messageIndex}`;
  },

  stopAllForKey(key) {
    const oldId = this.byKey[key];
    if (oldId && this.activeStreams[oldId]) {
      this.activeStreams[oldId].controller?.cancel?.();
      delete this.activeStreams[oldId];
    }
    delete this.byKey[key];
  },

  gcZombies() {
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];

      const wrongNode =
        s?.aiNode &&
        s.aiNode.dataset?.streamId &&
        s.aiNode.dataset.streamId !== id;
      if (wrongNode) {
        try {
          s.controller?.cancel?.();
        } catch {}
        delete this.activeStreams[id];
        continue;
      }

      const offscreen = !s?.aiNode || !document.contains(s.aiNode);
      if (offscreen) {
        s.offscreen = true;
        continue;
      }
    }
  },

  markAwaitingResume() {
    this.gcZombies();
    const now = Date.now();
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];
      s.awaitingResume = true;
      if (!s.lastActivity) s.lastActivity = now;
    }
  },

  kickSoftResume(reason = "online") {
    this.gcZombies();

    const now = Date.now();
    const STALE_MS = 6000;
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];

      if (s.isResuming) continue;

      if (s.sawEnd || s.endSeen) continue;

      const stale = now - (s.lastActivity || s.startedAt || 0);
      const shouldResume = s.awaitingResume || stale > STALE_MS;

      if (!shouldResume) continue;

      s.isResuming = true;

      try {
        if (typeof s.autoResume === "function") {
          s.autoResume(reason);
        } else {
          const msgs =
            s.messages ||
            buildResumeMessagesFromSession(
              s.session,
              s.messageIndex,
              s.fullResponse,
            );
          startStream(
            s.session,
            s.contextPrompt ?? null,
            s.aiNode,
            s.messageIndex,
            false,
            msgs,
          );
        }
      } catch (err) {
        log("STREAM", 3, "kickSoftResume", "Gagal soft resume", {
          streamId: id,
          error: err.message,
        });
      } finally {
        s.isResuming = false;
        s.awaitingResume = false;
      }
    }

    updateInputState?.();
  },

  startStream(streamId, data) {
    const key = this.makeKey(data.session, data.messageIndex);
    this.stopAllForKey(key);
    this.gcZombies();
    this.activeStreams[streamId] = { ...data, fullResponse: "" };
    this.byKey[key] = streamId;
    updateInputState();
  },

  stopStream(streamId) {
    this.gcZombies();
    log("STREAM", 1, "stopStream", "Attempting to stop stream", { streamId });
    log("STREAM", 0, "stopStream", "Active streams before stopping", {
      activeStreams: Object.keys(this.activeStreams),
    });

    if (this.activeStreams[streamId]) {
      this.activeStreams[streamId].controller?.cancel();
      const { [streamId]: _, ...rest } = this.activeStreams;
      this.activeStreams = rest;
      log(
        "STREAM",
        2,
        "stopStream",
        "Stream stopped and removed from active list",
        { streamId },
      );

      collapseSpacer();
    } else {
      log("STREAM", 3, "stopStream", "Failed to stop stream: ID not found", {
        streamId,
      });
    }

    for (const k in this.byKey)
      if (this.byKey[k] === streamId) delete this.byKey[k];
    log("STREAM", 0, "stopStream", "Active streams after stopping", {
      activeStreams: Object.keys(this.activeStreams),
    });
    updateInputState();
  },

  isStreaming() {
    return Object.keys(this.activeStreams).length > 0;
  },

  isStreamingInSession(session) {
    if (!session) return false;
    for (const streamId in this.activeStreams) {
      if (this.activeStreams[streamId].session === session) {
        return true;
      }
    }
    return false;
  },

  shutdownGracefully() {
    if (!this.isStreaming()) return;
    for (const streamId in this.activeStreams) {
      const stream = this.activeStreams[streamId];
      stream.controller?.cancel();
    }
    this.activeStreams = {};
    save();
    updateInputState();
  },
};

function openQuickModelSwitch(event, screen) {
  const modelBtn = $(`#btn-model-switch-${screen}`);
  const modal = $("#quick-model-switch-modal");
  const card = $("#quick-model-switch-card");
  const body = $("#quick-model-switch-body");
  const conf = state.settings.models;
  const activeProv = conf.active.platform;

  const models = normalizeProviderModels(
    conf.providers[activeProv]?.models || [],
  );
  body.innerHTML = "";

  models.forEach((model) => {
    const btn = document.createElement("button");
    btn.className = "quick-model-item";
    btn.textContent = model.label || model.id;
    if (model.id === conf.active.model) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", async () => {
      conf.active.model = model.id;
      const p = modelBtn.querySelector("p");
      if (p) p.textContent = model.label || model.id;
      await persistModels(conf);
      closeModalWithAnimation(modal);
    });
    body.appendChild(btn);
  });

  const triggerBtn = event.currentTarget;
  const rect = triggerBtn.getBoundingClientRect();
  const onWelcomePage = !current;

  if (onWelcomePage) {
    card.style.top = `${rect.bottom + 8}px`;
    card.style.bottom = "auto";
  } else {
    card.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    card.style.top = "auto";
  }
  card.style.right = `${window.innerWidth - rect.right}px`;
  card.style.left = "auto";

  const close = () => closeModalWithAnimation(modal);
  modal.querySelector(".modal-overlay").onclick = close;
  openModalWithAnimation(modal);
}

function renderWelcomeScreenFiles() {
  const container = $("#welcome-file-upload-container");
  if (!container) return;

  container.innerHTML = "";
  welcomeScreenStagedFiles.forEach((file, index) => {
    const pill = document.createElement("div");
    pill.className = "file-pill";
    pill.innerHTML = `<span>${esc(file.name)}</span><button class="remove-file-btn" data-index="${index}">&times;</button>`;
    pill.querySelector(".remove-file-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      welcomeScreenStagedFiles.splice(index, 1);
      renderWelcomeScreenFiles();
    });
    container.appendChild(pill);
  });
}

function renderUploadedFiles() {
  if (!current) return;
  const container = $("#active-chat-file-upload-container");
  if (!container) return;

  // 🎭 Use the new file display orchestrator for form context
  const filesToShow = getFilesForDisplay(current, 'form');
  const currentFiles = current.uploadedFiles || [];
  
  // 📊 Log visibility analysis for debugging
  const visibilityAnalysis = analyzeFileVisibility(current);
  if (visibilityAnalysis.formDisplay > 0 || visibilityAnalysis.totalFiles > 0) {
    log("RENDERER", 1, "renderUploadedFiles", 
      `File visibility: ${visibilityAnalysis.formDisplay}/${visibilityAnalysis.totalFiles} shown in form`, 
      visibilityAnalysis);
  }

  const existingPills = Array.from(container.querySelectorAll(".file-pill"));
  const existingFileMap = new Map();

  existingPills.forEach((pill) => {
    const span = pill.querySelector("span");
    if (span) {
      existingFileMap.set(span.textContent, pill);
    }
  });

  container.innerHTML = "";

  filesToShow.forEach((file, index) => {
    // 🔍 Find the actual index in the original array for removal
    const actualIndex = currentFiles.indexOf(file);
    
    let pill = existingFileMap.get(file.name);

    if (pill) {
      pill.classList.add("no-animate");
    } else {
      pill = document.createElement("div");
      pill.className = "file-pill";
    }

    pill.innerHTML = `<span>${esc(file.name)}</span><button class="remove-file-btn" data-index="${actualIndex}">&times;</button>`;
    pill.querySelector(".remove-file-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      current.uploadedFiles.splice(actualIndex, 1);
      renderUploadedFiles();
      save();
    });

    container.appendChild(pill);
  });
}

function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).slice(2, 9);
  return `${timestamp}-${randomStr}`;
}

function toggleGoogleCseInput() {
  const provider = $("#search-api-provider").value;
  const keyLabel = $("#search-api-key-label");
  const keyInput = $("#search-api-key");
  const cseGroup = $("#google-cse-id-group");

  if (provider === "google") {
    keyLabel.textContent = "Google Cloud API Key";
    keyInput.placeholder = "Your Google Cloud API key...";
    keyInput.value = state.settings.googleApiKey || "";
    $("#google-cse-id").value = state.settings.googleCseId || "";
    cseGroup.classList.remove("hidden");
  } else {
    keyLabel.textContent = "SerpApi API Key";
    keyInput.placeholder = "Your SerpAPI private key...";
    keyInput.value = state.settings.serpApiKey || "";
    cseGroup.classList.add("hidden");
  }
  log(
    "UI_SEARCH_API",
    2,
    "toggleGoogleCseInput",
    `UI updated for provider: ${provider}`,
  );
}

/**
 * Toggle image group expand/collapse
 */
function toggleImageGroup(headerElement) {
  const group = headerElement.closest('.md-image-group');
  if (!group) return;
  
  const isCollapsed = group.getAttribute('data-collapsed') === 'true';
  const content = group.querySelector('.md-image-group-content');
  
  if (!content) return;
  
  if (isCollapsed) {
    // EXPAND: collapsed → expanded
    // Step 1: Set to current collapsed height (230px)
    const currentHeight = content.offsetHeight;
    content.style.maxHeight = currentHeight + 'px';
    
    // Step 2: Change state (this will show hidden images)
    group.setAttribute('data-collapsed', 'false');
    
    // Step 3: Get full content height after showing all images
    const targetHeight = content.scrollHeight;
    
    // Step 4: Force reflow
    content.offsetHeight;
    
    // Step 5: Animate to target height in next frame
    requestAnimationFrame(() => {
      content.style.maxHeight = targetHeight + 'px';
    });
  } else {
    // COLLAPSE: expanded → collapsed
    // Step 1: Set to current expanded height
    const currentHeight = content.scrollHeight;
    content.style.maxHeight = currentHeight + 'px';
    
    // Step 2: Force reflow
    content.offsetHeight;
    
    // Step 3: Animate to collapsed height in next frame
    requestAnimationFrame(() => {
      content.style.maxHeight = '230px';
      
      // Step 4: Update state after animation completes
      setTimeout(() => {
        group.setAttribute('data-collapsed', 'true');
      }, 400);
    });
  }
}

// Make toggleImageGroup available globally
window.toggleImageGroup = toggleImageGroup;

/**
 * Download image from URL (bypass CSP by using canvas)
 */
async function downloadImage(imageUrl) {
  try {
    log('IMAGE_DOWNLOAD', 1, 'downloadImage', 'Starting image download', { url: imageUrl });
    
    // Find existing img element with this src (already loaded, bypass CSP)
    const imgElement = document.querySelector(`img.md-image[src="${imageUrl}"]`);
    
    if (!imgElement) {
      throw new Error('Image element not found in DOM');
    }
    
    // Create canvas to convert image to blob
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match image
    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;
    
    // Draw image to canvas
    try {
      ctx.drawImage(imgElement, 0, 0);
    } catch (drawError) {
      // If CORS issue, try direct download fallback
      log('IMAGE_DOWNLOAD', 2, 'downloadImage', 'Canvas draw failed, trying direct download', { error: drawError.message });
      
      // Fallback: Just create link with image URL
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = extractFilename(imageUrl);
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      log('IMAGE_DOWNLOAD', 1, 'downloadImage', 'Direct download triggered');
      return;
    }
    
    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to convert canvas to blob');
      }
      
      // Extract filename from URL or generate one
      const filename = extractFilename(imageUrl);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        log('IMAGE_DOWNLOAD', 1, 'downloadImage', 'Image downloaded successfully', { filename });
      }, 100);
      
    }, 'image/png');
    
  } catch (error) {
    log('IMAGE_DOWNLOAD', 3, 'downloadImage', 'Failed to download image', { error: error.message, url: imageUrl });
    showToast(`Failed to download image: ${error.message}`, 'error');
  }
}

function extractFilename(imageUrl) {
  let filename = 'image';
  try {
    const urlObj = new URL(imageUrl);
    const pathname = urlObj.pathname;
    const filenameMatch = pathname.match(/([^/]+?)(\?.*)?$/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].split('!')[0]; // Remove query-like suffixes (e.g., !w700wp)
    }
  } catch (e) {
    // If URL parsing fails, use timestamp
    filename = `image-${Date.now()}`;
  }
  
  // Ensure filename has extension
  if (!filename.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
    filename += '.png'; // default to png since we're using canvas
  }
  
  return filename;
}

window.downloadImage = downloadImage;

/**
 * Handle broken images - replace with placeholder (GLOBAL)
 */
function setupGlobalImageErrorHandler() {
  document.addEventListener('error', function(e) {
    if (e.target.classList && e.target.classList.contains('md-image')) {
      if (!e.target.dataset.errorHandled) {
        e.target.dataset.errorHandled = 'true';
        e.target.src = '../public/images/default-placeholder.png';
      }
    }
  }, true); // Use capture phase
}

// Setup event delegation for image download buttons
document.addEventListener('click', function(e) {
  const downloadBtn = e.target.closest('.md-image-download');
  if (downloadBtn) {
    e.preventDefault();
    e.stopPropagation();
    const imageUrl = downloadBtn.getAttribute('data-image-url');
    if (imageUrl) {
      downloadImage(imageUrl);
    }
  }
});

// Wrap existing .md-image elements with download button
function wrapImagesWithDownloadButton() {
  const images = document.querySelectorAll('.md-image:not(.wrapped)');
  images.forEach(img => {
    // Skip if already wrapped
    if (img.parentElement && img.parentElement.classList.contains('md-image-wrapper')) {
      img.classList.add('wrapped');
      return;
    }
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'md-image-wrapper';
    
    // Create download button
    const button = document.createElement('button');
    button.className = 'md-image-download';
    button.setAttribute('data-image-url', img.src);
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    
    // Wrap image
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    wrapper.appendChild(button);
    img.classList.add('wrapped');
  });
}

// Run on DOM changes using MutationObserver
const imageObserver = new MutationObserver((mutations) => {
  let shouldWrap = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) { // Element node
          if (node.classList && node.classList.contains('md-image')) {
            shouldWrap = true;
            break;
          }
          if (node.querySelectorAll && node.querySelectorAll('.md-image').length > 0) {
            shouldWrap = true;
            break;
          }
        }
      }
    }
  }
  if (shouldWrap) {
    wrapImagesWithDownloadButton();
  }
});

// Start observing
const chatLog = document.querySelector('#chat-log');
if (chatLog) {
  imageObserver.observe(chatLog, { childList: true, subtree: true });
}

// Initial wrap for existing images
wrapImagesWithDownloadButton();

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupGlobalImageErrorHandler);
} else {
  setupGlobalImageErrorHandler();
}

/**
 * Format research agent action to human-readable text
 */
function formatResearchAction(actionType, actionParams, actionReason) {
  let description = '';
  const params = actionParams || {};
  
  // Convert technical action type to human-readable
  switch (actionType) {
    case 'analyzeFileStructure':
      description = params.fileName 
        ? `Analyzing file structure of \`${params.fileName}\``
        : 'Analyzing file structure';
      break;
    
    case 'searchPattern':
      if (params.pattern && params.files && params.files[0]) {
        description = `Searching for \`${params.pattern}\` in ${params.files[0]}`;
      } else if (params.pattern) {
        description = `Searching for pattern \`${params.pattern}\``;
      } else {
        description = 'Searching file content';
      }
      break;
    
    case 'searchFunctions':
      description = params.functionName
        ? `Searching for function \`${params.functionName}\``
        : 'Searching for function definitions';
      break;
    
    case 'searchCSS':
      description = params.selector
        ? `Searching for CSS selector \`${params.selector}\``
        : 'Searching for CSS styles';
      break;
    
    case 'searchHTML':
      description = params.element
        ? `Searching for HTML element \`<${params.element}>\``
        : 'Searching for HTML elements';
      break;
    
    case 'searchImports':
      description = params.moduleName
        ? `Searching for imports of \`${params.moduleName}\``
        : 'Searching for import statements';
      break;
    
    case 'webSearch':
      description = params.query
        ? `Searching web for \`${params.query}\``
        : 'Searching web information';
      break;
    
    case 'fetchWebPage':
      description = params.url
        ? `Fetching content from ${params.url}`
        : 'Fetching web page content';
      break;
    
    default:
      // Generic fallback: convert camelCase to readable
    description = actionType.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    description = description.charAt(0).toUpperCase() + description.slice(1);
  }
  
  return { description, reason: actionReason || '' };
}

async function processSearchStatusQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  log("UI_SEARCH", 1, "processSearchStatusQueue", "Starting queue V3.", {
    queue_length: searchStatusQueue.length,
  });

  const streamKey = Object.keys(streamManager.activeStreams)[0];
  const s = streamManager.activeStreams[streamKey];

  if (!s || !s.aiNode) {
    log(
      "UI_SEARCH",
      3,
      "processSearchStatusQueue",
      "Queue processing stopped: No active stream or aiNode found.",
    );
    isProcessingQueue = false;
    return;
  }

  const aiNode = s.aiNode;
  const sess = s.session;
  const messageIndex = s.messageIndex;
  
  ensureThinkingUI(aiNode);
  const thinkEl = aiNode._thinkingEl;

  if (!thinkEl) {
    log(
      "UI_SEARCH",
      4,
      "processSearchStatusQueue",
      "FATAL: ensureThinkingUI failed to create _thinkingEl.",
      { aiNode },
    );
    isProcessingQueue = false;
    return;
  }
  
  let pageCount = 0; // Track page count for toggle text

  while (searchStatusQueue.length > 0) {
    const status = searchStatusQueue.shift();
    log(
      "UI_SEARCH",
      2,
      "processSearchStatusQueue",
      `Processing step: ${status.step}`,
    );

    switch (status.step) {
      case "DECIDED":
        // Check if this is project session (has reasoning but no search_queries)
        const isProjectSession = !status.data.search_queries || status.data.search_queries.length === 0;
        
        if (isProjectSession) {
          // Project session analysis
          thinkEl.toggle.querySelector(".thinking-toggle-content span").textContent =
            `Planning analysis approach...`;
          if (!thinkEl.body.classList.contains("expanded")) {
            thinkEl.toggle.click();
          }

          const reasoning = status.data.reasoning || "Analyzing project structure and determining optimal analysis approach...";
          const userFriendlyReasoning = reasoning.length > 200 ? 
            reasoning.substring(0, 200) + "..." : 
            reasoning;
          
          // Save to database via appendThinkingUpdate
          await appendThinkingUpdate(aiNode, {
            title: "Planning Analysis",
            content: userFriendlyReasoning
          }, sess, messageIndex);
        } else {
          // Web search session
          thinkEl.toggle.querySelector(".thinking-toggle-content span").textContent =
            `Searching for "${status.data.summary_key}"...`;
          if (!thinkEl.body.classList.contains("expanded")) {
            thinkEl.toggle.click();
          }

          // Save reasoning
          await appendThinkingUpdate(aiNode, {
            title: "Reasoning",
            content: status.data.reasoning
          }, sess, messageIndex);
          
          // Save keywords as list
          const keywordsList = status.data.search_queries
            .map((q, i) => `${i + 1}. ${q}`)
            .join('\n');
          
          await appendThinkingUpdate(aiNode, {
            title: "Keywords",
            content: keywordsList
          }, sess, messageIndex);
        }
        break;

      case "FOUND_URLS":
        const isProjectFiles = status.data && status.data.some && status.data.some(item => item.link && item.link.startsWith('file://'));
        
        pageCount = status.data.length || 0; // Store page count
        
        if (isProjectFiles) {
          const filesText = status.data.map((r) => r.title).join(", ");
          await appendThinkingUpdate(aiNode, {
            title: "Analyzing files",
            content: filesText
          }, sess, messageIndex);
        } else {
          const urlsList = status.data
            .map((item, i) => `${i + 1}. ${item.link}`)
            .join('\n');
          
          await appendThinkingUpdate(aiNode, {
            title: "Found urls",
            content: urlsList
          }, sess, messageIndex);
        }
        break;

      case "SCRAPING":
        // Show scraping status
        const scrapingCount = status.data.count || 0;
        
        await appendThinkingUpdate(aiNode, {
          title: "Reading web pages",
          content: `Scraping ${scrapingCount} web pages to gather information...`
        }, sess, messageIndex);
        
        // Update toggle to show scraping
        const toggleScraping = thinkEl.toggle.querySelector(".thinking-toggle-content");
        if (toggleScraping) {
          toggleScraping.innerHTML = `
            <div class="web-search-indicator searching" style="display: flex; align-items: center; gap: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chromium-icon lucide-chromium"><path d="M10.88 21.94 15.46 14"/><path d="M21.17 8H12"/><path d="M3.95 6.06 8.54 14"/><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              <span class="status-text">Reading ${scrapingCount} web pages...</span>
            </div>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
          `;
        }
        break;

      case "ACTION_EXECUTING":
        // Format action to human-readable
        const { description, reason } = formatResearchAction(
          status.data.actionType,
          status.data.actionParams,
          status.data.actionReason
        );
        
        // Use description as title, reason as content (no "ACTION" prefix)
        await appendThinkingUpdate(aiNode, {
          title: description,
          content: reason || 'To search deeper and more focused'
        }, sess, messageIndex);
        break;

      case "ACTION_RESULTS":
        // Skip - results are implicitly shown in thinking updates
        break;

      case "SEARCH_FAILED":
        // Notify user that search API failed
        const failureReason = status.data.reason || 'Search API failed';
        const provider = status.data.provider || 'Search API';
        
        await appendThinkingUpdate(aiNode, {
          title: "Search failed",
          content: `**Provider:** ${provider}\n\n**Reason:** ${failureReason}\n\n*Continue without web search...*`
        }, sess, messageIndex);
        
        // Update toggle to show failure
        const toggleFailed = thinkEl.toggle.querySelector(".thinking-toggle-content");
        if (toggleFailed) {
          toggleFailed.innerHTML = `
            <div class="web-search-indicator" style="display: flex; align-items: center; gap: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span class="status-text">Search failed - continuing without web results</span>
            </div>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
          `;
        }
        break;

      case "PROCESSING":
        const isProjectProcessing = searchStatusQueue.some(s => s.step === 'FOUND_URLS' && 
          s.data && s.data.some && s.data.some(item => item.link && item.link.startsWith('file://')));
        
        const toggleContent = thinkEl.toggle.querySelector(".thinking-toggle-content");
        if (toggleContent) {
          // Use pageCount if available, otherwise use status.data.count
          const count = pageCount || status.data.count || 0;
          const statusText = isProjectProcessing 
            ? `Analyzing ${count} search results & synthesizing answer...`
            : `Read ${count} web pages`;
          
          toggleContent.innerHTML = `
            <div class="web-search-indicator searching" style="display: flex; align-items: center; gap: 6px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chromium-icon lucide-chromium"><path d="M10.88 21.94 15.46 14"/><path d="M21.17 8H12"/><path d="M3.95 6.06 8.54 14"/><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              <span class="status-text">${statusText}</span>
            </div>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
          `;
        }
        await new Promise((r) => setTimeout(r, 1000));
        break;
    }
    scrollToBottom({ force: true });
  }

  isProcessingQueue = false;
  log("UI_SEARCH", 1, "processSearchStatusQueue", "Queue V3 finished.");
}

function nowISO() {
  return new Date().toISOString();
}

function newSessionName() {
  const d = new Date();
  return `Untitled chat ${d.toTimeString().slice(0, 5)}`;
}

function formatUserMessage(content) {
  if (!content) return "";
  let html = content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  // Only support bold and italic formatting for user messages
  html = html
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.*?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");

  return html.replace(/\n/g, "<br/>");
}

async function typewriterEffectChunked(
  element,
  text,
  totalDuration,
  chunkSize = 20,
) {
  log(
    "UI_EFFECT",
    1,
    "typewriterEffectChunked",
    "Starting typewriter effect.",
    { text_length: text.length, duration_ms: totalDuration },
  );

  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }

  if (chunks.length === 0) return;

  const delay = totalDuration / chunks.length;
  let pauseCount = 0;
  const maxPauses = 3;

  for (const chunk of chunks) {
    // PERFORMANCE: Use DOM manipulation instead of innerHTML += to avoid re-parsing
    const processedChunk = chunk.replaceAll("\n", "<br>");
    
    // Create a temporary container to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedChunk;
    
    // Append all nodes from temp container
    while (tempDiv.firstChild) {
      element.appendChild(tempDiv.firstChild);
    }
    
    scrollToBottom({ force: true });
    await new Promise((r) => setTimeout(r, delay));

    if (pauseCount < maxPauses && Math.random() < 0.15) {
      await new Promise((r) => setTimeout(r, 100));
      pauseCount++;
    }
  }
  log("UI_EFFECT", 2, "typewriterEffectChunked", "Typewriter effect finished.");
}

function esc(s) {
  if (!s) return "";
  return s
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureThinkingUI(aiNode) {
  if (aiNode._thinkingReady) return;
  
  // CRITICAL: Check if thinking-wrap already exists in DOM (from cache restore)
  const content = aiNode.querySelector(".message-content") || aiNode;
  const existingWrap = content.querySelector('.thinking-wrap');
  
  if (existingWrap) {
    // Rehydrate existing thinking UI instead of creating duplicate
    aiNode._thinkingReady = true;
    
    const toggle = existingWrap.querySelector('.thinking-toggle');
    const body = existingWrap.querySelector('.thinking-body');
    const thinkingUpdate = existingWrap.querySelector('.thinking-update');
    const text = existingWrap.querySelector('.thinking-text');
    const toggleContent = toggle?.querySelector('.thinking-toggle-content');
    
    // Re-attach event listener to toggle (was lost during cache restore)
    if (toggle && body) {
      // Clone to remove old listeners
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);
      
      newToggle.addEventListener("click", () => {
        const ex = newToggle.getAttribute("aria-expanded") === "true";
        newToggle.setAttribute("aria-expanded", ex ? "false" : "true");
        body.classList.toggle("expanded", !ex);
      });
      
      // Re-attach scroll detection
      let thinkingUserScrolled = false;
      body.addEventListener('scroll', () => {
        if (!body.classList.contains('expanded')) return;
        
        const isAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 10;
        if (!isAtBottom) {
          thinkingUserScrolled = true;
        } else if (thinkingUserScrolled) {
          thinkingUserScrolled = false;
        }
      });
      
      aiNode._thinkingEl = { 
        wrap: existingWrap, 
        toggle: newToggle, 
        body, 
        thinkingUpdate,
        text, 
        toggleContent: newToggle.querySelector('.thinking-toggle-content'), 
        userScrolled: () => thinkingUserScrolled 
      };
    }
    
    log('THINKING', 1, 'ensureThinkingUI', 'Rehydrated existing thinking-wrap from cache', {});
    return;
  }
  
  // No existing wrap found, create new one
  aiNode._thinkingReady = true;

  const wrap = document.createElement("div");
  wrap.className = "thinking-wrap";

  const toggle = document.createElement("button");
  toggle.className = "thinking-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `
    <div class="thinking-toggle-content">
      <span>Thinking</span>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "thinking-body";
  
  const thinkingUpdate = document.createElement("div");
  thinkingUpdate.className = "thinking-update";
  
  const text = document.createElement("div");
  text.className = "thinking-text";
  
  body.appendChild(thinkingUpdate);
  body.appendChild(text);

  toggle.addEventListener("click", () => {
    const ex = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", ex ? "false" : "true");
    body.classList.toggle("expanded", !ex);
  });

  wrap.appendChild(toggle);
  wrap.appendChild(body);

  // Add user scroll detection for thinking body
  let thinkingUserScrolled = false;
  const scrollListener = () => {
    if (!body.classList.contains('expanded')) return;
    
    const isAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 10;
    if (!isAtBottom) {
      thinkingUserScrolled = true;
    } else if (thinkingUserScrolled) {
      thinkingUserScrolled = false;
    }
  };
  body.addEventListener('scroll', scrollListener);

  content.prepend(wrap);

  const toggleContent = toggle.querySelector(".thinking-toggle-content");
  aiNode._thinkingEl = { 
    wrap, 
    toggle, 
    body, 
    thinkingUpdate, 
    text, 
    toggleContent, 
    userScrolled: () => thinkingUserScrolled,
    // PERFORMANCE: Store listener references for cleanup
    _listeners: [
      { element: body, type: 'scroll', listener: scrollListener }
    ]
  };
  
  // PERFORMANCE: Cleanup function to remove event listeners
  aiNode.cleanupThinkingUI = () => {
    if (aiNode._thinkingEl && aiNode._thinkingEl._listeners) {
      aiNode._thinkingEl._listeners.forEach(({ element, type, listener }) => {
        element.removeEventListener(type, listener);
      });
      aiNode._thinkingEl._listeners = [];
    }
  };
  
  log('THINKING', 1, 'ensureThinkingUI', 'Created new thinking-wrap', {});
}

// Anda bisa menyederhanakan fungsi ini
async function appendThinking(aiNode, chunk, session, messageIndex) {
  if (!chunk || !aiNode || !session || messageIndex == null) return;
  
  ensureThinkingUI(aiNode);
  
  // Update session data first
  session._x_think = session._x_think || {};
  const existing = session._x_think[messageIndex];
  if (typeof existing === 'object' && existing.text) {
    // Append to existing object
    session._x_think[messageIndex] = {
      ...existing,
      text: existing.text + chunk
    };
  } else {
    // Create new object or convert string to object
    const currentText = typeof existing === 'string' ? existing : '';
    session._x_think[messageIndex] = {
      text: currentText + chunk,
      duration: 0 // Will be updated later
    };
  }
  
  // Then update UI with the complete data
  await updateThinkingUI(aiNode, chunk, session, messageIndex);
  
  saveThinkingDebounced();
}

// New function to handle structured thinking updates from backend
async function appendThinkingUpdate(aiNode, updateData, session, messageIndex) {
  if (!updateData || !aiNode || !session || messageIndex == null) return;
  
  ensureThinkingUI(aiNode);
  
  // Structure: { title, content }
  const title = updateData.title || 'Update';
  const content = updateData.content || '';
  
  // Store in session
  session._x_think_updates = session._x_think_updates || {};
  if (!session._x_think_updates[messageIndex]) {
    session._x_think_updates[messageIndex] = [];
  }
  session._x_think_updates[messageIndex].push({ 
    title, 
    content, 
    timestamp: Date.now() 
  });
  
  // Update UI
  await updateThinkingUpdateUI(aiNode, session, messageIndex);
  
  saveThinkingDebounced();
}

// New function to update the thinking-update UI element
async function updateThinkingUpdateUI(aiNode, session, messageIndex) {
  const el = aiNode._thinkingEl;
  if (!el || !el.thinkingUpdate) return;
  
  if (!el.body.classList.contains('expanded')) {
    el.body.classList.add('expanded');
    el.toggle.setAttribute('aria-expanded', 'true');
  }
  
  const updates = session._x_think_updates?.[messageIndex] || [];
  
  // Get existing items to avoid re-rendering
  const existingItems = el.thinkingUpdate.querySelectorAll('.thinking-update-item');
  const startIndex = existingItems.length;
  
  // Only render new updates
  for (let i = startIndex; i < updates.length; i++) {
    const update = updates[i];
    
    const updateItem = document.createElement('div');
    updateItem.className = 'thinking-update-item';
    
    // Title - fade in
    const titleDiv = document.createElement('div');
    titleDiv.className = 'thinking-update-title';
    titleDiv.textContent = update.title;
    titleDiv.style.opacity = '0';
    updateItem.appendChild(titleDiv);
    
    // Content - will be typed
    const contentDiv = document.createElement('div');
    contentDiv.className = 'thinking-update-content';
    updateItem.appendChild(contentDiv);
    
    el.thinkingUpdate.appendChild(updateItem);
    
    // Fade in title
    await new Promise(resolve => setTimeout(resolve, 10));
    titleDiv.style.transition = 'opacity 0.3s ease';
    titleDiv.style.opacity = '1';
    
    // Typewriter effect for content
    const hasMarkdown = /```|`[^`]+`|\*\*|\*|__|_|\[.+\]\(.+\)|^[\s]*[-*+]\s|^[\s]*\d+\.\s/m.test(update.content);
    
    if (hasMarkdown) {
      // Format markdown then fade in
      const formattedHtml = await customMarkdownFormat(update.content);
      contentDiv.style.opacity = '0';
      contentDiv.innerHTML = formattedHtml;
      await new Promise(resolve => setTimeout(resolve, 30));
      contentDiv.style.transition = 'opacity 0.25s ease';
      contentDiv.style.opacity = '1';
    } else {
      // Plain text typewriter using chunks
      await typewriterEffectChunked(contentDiv, update.content, 500, 10);
    }
  }
  
  scrollThinkingToBottom(el);
}

function cleanLeadingWhitespace(text) {
  // log('CLEAN_WS', 2, 'cleanLeadingWhitespace', text)
  if (!text || typeof text !== "string") return "";
  return text.replace(
    /^[\s\u200B\u200C\u200D\u2060\ufeff\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/,
    "",
  );
}

// Autoscroll function specifically for thinking-body during streaming
// DISABLED - No auto-scroll for thinking body, same as main chat
function scrollThinkingToBottom(thinkingElement) {
    if (!thinkingElement) return;
  
  const thinkingBody = thinkingElement.body;
  if (!thinkingBody) return;
  
  // Only autoscroll if thinking body is expanded
  if (!thinkingBody.classList.contains('expanded')) return;
  
  // Multiple attempts to ensure scroll works during streaming
  const attemptScroll = () => {
    const scrollContainer = thinkingBody;
    const scrollTop = scrollContainer.scrollTop;
    const clientHeight = scrollContainer.clientHeight;
    const scrollHeight = scrollContainer.scrollHeight;
  
    const needsScroll = scrollHeight > clientHeight;
    const userHasScrolledUp = thinkingElement.userScrolled && thinkingElement.userScrolled();
    
    // Simple: always scroll to bottom if content overflows and user hasn't manually scrolled up
    if (needsScroll && !userHasScrolledUp) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      
      // Verify the scroll worked
      setTimeout(() => {
        const newScrollTop = scrollContainer.scrollTop;
      }, 10);
    }
  };

  attemptScroll();
  setTimeout(attemptScroll, 50);
  setTimeout(attemptScroll, 100);

  return;
}

async function updateThinkingUI(aiNode, content, session, messageIndex) {
  const el = aiNode._thinkingEl;
  if (!el) return;

  if (!el.body.classList.contains('expanded')) {
    el.body.classList.add('expanded');
    el.toggle.setAttribute('aria-expanded', 'true');
  }
  
  // PERFORMANCE: Track last rendered length to enable incremental updates
  if (!el._lastRenderedLength) {
    el._lastRenderedLength = 0;
  }
  
  // Get full thinking text
  let fullThinkText = "";
  if (session && session._x_think && session._x_think[messageIndex]) {
    const thinkData = session._x_think[messageIndex];
    fullThinkText = (typeof thinkData === "object" ? thinkData.text : thinkData) || "";
  } else {
    fullThinkText = content || "";
  }
  
  // PERFORMANCE: Smart rendering strategy for thinking-text
  // Markdown parsing needs full context, so we do smart thresholding
  const newContent = fullThinkText.substring(el._lastRenderedLength);
  
  if (newContent.length > 0) {
    const isInitialLoad = el._lastRenderedLength === 0;
    const isMajorUpdate = fullThinkText.length < el._lastRenderedLength;
    const isSmallIncrement = newContent.length < 100; // Small streaming chunks
    
    // STRATEGY: For streaming (small increments), always full re-render
    // This prevents markdown parsing issues where each chunk creates separate <p> blocks
    const shouldFullRender = isInitialLoad || isMajorUpdate || isSmallIncrement;
    
    if (shouldFullRender) {
      // Full render - necessary for proper markdown context
      if (window.mdThinking) {
        el.text.innerHTML = window.mdThinking(fullThinkText);
      } else {
        const formattedHtml = await customMarkdownFormat(fullThinkText);
        el.text.innerHTML = formattedHtml;
      }
    } else {
      // INCREMENTAL: Only for large batch updates (e.g., lazy loading)
      // This path rarely executes but is kept for edge cases
      if (window.mdThinking) {
        const formattedNewContent = window.mdThinking(newContent);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedNewContent;
        while (tempDiv.firstChild) {
          el.text.appendChild(tempDiv.firstChild);
        }
      } else {
        const formattedNewContent = await customMarkdownFormat(newContent);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedNewContent;
        while (tempDiv.firstChild) {
          el.text.appendChild(tempDiv.firstChild);
        }
      }
    }
    
    el._lastRenderedLength = fullThinkText.length;
    scrollThinkingToBottom(el);
  }
}

async function customMarkdownFormat(raw) {
  if (raw == null) return "";
  const cleaned = cleanLeadingWhitespace(String(raw));
  
  // Use the enhanced custom formatter from local_modules/custom-formatter/md.js
  if (typeof md === 'function') {
    try {
      const result = md(cleaned);
      let finalResult;
      
      // Check if it's a Promise
      if (result && typeof result.then === 'function') {
        finalResult = await result;
      } else {
        finalResult = result;
      }
      
      // Clean up invisible/selectable content for thinking-text
      finalResult = cleanInvisibleContent(finalResult);
      
      return finalResult;
    } catch (error) {
      console.warn('Custom formatter error:', error);
      return renderWithExistingFormatter(raw);
    }
  }
  
  // Fallback to basic formatting if custom formatter not available
  return renderWithExistingFormatter(raw);
}

function cleanInvisibleContent(html) {
  if (!html) return html;
  
  // First pass: clean the HTML string directly
  let cleanedHtml = html
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
    .replace(/\u00A0/g, ' ') // Replace non-breaking spaces with regular spaces
    .replace(/\s+(\r?\n|\r)\s*/g, '') // Remove whitespace around line breaks
    .replace(/(\r?\n|\r)+/g, '\n') // Normalize line breaks
    .trim();
  
  // Create a temporary div to process the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;
  
  // Remove empty elements and whitespace-only text nodes
  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_ALL,
    {
      acceptNode: function(node) {
        // Remove empty elements (except br, hr, img)
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          if (!['br', 'hr', 'img', 'input'].includes(tagName) && 
              !node.textContent.trim() && 
              node.children.length === 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        // Remove text nodes that are only whitespace
        else if (node.nodeType === Node.TEXT_NODE) {
          if (/^\s*$/.test(node.nodeValue)) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  const nodesToRemove = [];
  let node;
  while (node = walker.nextNode()) {
    nodesToRemove.push(node);
  }
  
  // Remove the problematic nodes
  nodesToRemove.forEach(node => {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  });
  
  // Final cleanup: normalize the resulting HTML
  let finalHtml = tempDiv.innerHTML
    .replace(/>\s+</g, (match) => {
      // Keep whitespace around <br> tags to preserve line breaks
      if (tempDiv.innerHTML.includes('<br>')) {
        return match; // Don't remove whitespace if there are <br> tags
      }
      return '><'; // Otherwise remove whitespace between tags
    })
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
  
  return finalHtml;
}

// Debug function to analyze thinking-text content
function debugThinkingTextContent(element) {
  if (!element) return;
  
  console.log('=== Thinking Text Debug ===');
  console.log('HTML:', element.innerHTML);
  console.log('Text Content:', JSON.stringify(element.textContent));
  console.log('Child Nodes:', element.childNodes.length);
  
  element.childNodes.forEach((node, index) => {
    console.log(`Node ${index}:`, {
      type: node.nodeType,
      nodeName: node.nodeName,
      nodeValue: JSON.stringify(node.nodeValue),
      textContent: JSON.stringify(node.textContent)
    });
  });
  
  // Check for invisible characters
  const text = element.textContent || '';
  const invisibleChars = text.match(/[\u200B-\u200D\uFEFF\u00A0]/g);
  if (invisibleChars) {
    console.log('Invisible characters found:', invisibleChars);
  }
}

function renderThinkingText(raw) {
  if (raw == null) return "";
  const cleaned = cleanLeadingWhitespace(String(raw));
  
  // For thinking text, we want more natural line break handling
  // Single line breaks become <br>, double line breaks become paragraph breaks
  const escapeHtml = (str) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };
  
  // Handle basic markdown formatting while preserving natural line breaks
  let formatted = escapeHtml(cleaned);
  
  // Handle bold and italic
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Handle inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Handle line breaks: single \n becomes <br>, double \n\n becomes paragraph break
  formatted = formatted.replace(/\n\n+/g, '</p><p>');
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Wrap in paragraph tags
  formatted = '<p>' + formatted + '</p>';
  
  // Clean up empty paragraphs
  formatted = formatted.replace(/<p>\s*<\/p>/g, '');
  formatted = formatted.replace(/<p><\/p>/g, '');
  
  return formatted;
}

function renderWithExistingFormatter(raw) {
  if (raw == null) return "";
  const cleaned = cleanLeadingWhitespace(String(raw));
  const escapeHtml = (str) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };
  return escapeHtml(cleaned).replace(/\r?\n/g, "<br/>");
}

const saveThinkingDebounced = (() => {
  let t = null;
  return () => {
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        save();
      } catch {}
    }, 200);
  };
})();

// Draft management functions
function saveDraftForSession(sessionId, content) {
  if (!sessionId) return;
  if (content && content.trim()) {
    sessionDrafts.set(sessionId, content);
  } else {
    sessionDrafts.delete(sessionId);
  }
  try {
    const draftsObj = Object.fromEntries(sessionDrafts);
    localStorage.setItem("session-drafts", JSON.stringify(draftsObj));
  } catch (e) {
    log("DRAFTS", 3, "saveDraftForSession", "Failed to save draft", {
      sessionId,
      error: e.message,
    });
  }
}

function loadDraftForSession(sessionId) {
  if (!sessionId) return "";
  const draft = sessionDrafts.get(sessionId) || "";
  return draft;
}

function loadAllDrafts() {
  try {
    const stored = localStorage.getItem("session-drafts");
    if (stored) {
      const draftsObj = JSON.parse(stored);
      sessionDrafts.clear();
      for (const [sessionId, content] of Object.entries(draftsObj)) {
        if (content && content.trim()) {
          sessionDrafts.set(sessionId, content);
        }
      }
    }
  } catch (e) {
    log("DRAFTS", 3, "loadDraftForSession", "Failed to load drafts", {
      error: e.message,
    });
    sessionDrafts.clear();
  }
}

// General debounce utility
function debounce(fn, delay) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

const saveDraftDebounced = (() => {
  let timer = null;
  return Object.assign((sessionId, content) => {
    clearTimeout(timer);
    timer = setTimeout(() => saveDraftForSession(sessionId, content), 1000);
  }, {
    cancel: () => clearTimeout(timer)
  });
})();

// Temporary storage for web search data until message is finalized
const pendingWebSearchData = new Map();

function storePendingWebSearchData(sessionId, pageCount) {
  pendingWebSearchData.set(sessionId, { pageCount, timestamp: Date.now() });
  console.log("Stored pending web search data:", { sessionId, pageCount });
}

function getAndClearPendingWebSearchData(sessionId) {
  const data = pendingWebSearchData.get(sessionId);
  if (data) {
    pendingWebSearchData.delete(sessionId);
    console.log("Retrieved and cleared pending web search data:", { sessionId, pageCount: data.pageCount });
    return data.pageCount;
  }
  return null;
}

// Clean up old pending data (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of pendingWebSearchData.entries()) {
    if (now - data.timestamp > 5 * 60 * 1000) {
      pendingWebSearchData.delete(sessionId);
      console.log("Cleaned up old pending web search data for session:", sessionId);
    }
  }
}, 60 * 1000);

// Artifacts management functions
function saveCodeArtifact(
  title,
  code,
  language,
  sessionId = null,
  messageIndex = null,
) {
  log("ARTIFACT", 2, "saveCodeArtifact", "Saving artifact", {
    title,
    language,
    sessionId,
    messageIndex,
    hasCurrent: !!current,
    currentId: current?.id,
  });

  const artifact = {
    id: Date.now().toString(),
    title: title || `Untitled ${language || "Code"}`,
    code: code,
    language: language || "text",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    isFavorite: false, // Add favorite status
    // Add origin tracking for "View in Chat" feature
    sessionId: sessionId,
    messageIndex: messageIndex,
  };

  codeArtifacts.unshift(artifact); // Add to beginning for latest first

  // Save to file-based storage via IPC
  saveArtifactsToFile();

  return artifact;
}

// Helper function to create syntax highlighted code HTML
function createHighlightedCode(code, language) {
  // Map common language names to Highlight.js language identifiers
  const languageMap = {
    javascript: "javascript",
    js: "javascript",
    typescript: "typescript",
    ts: "typescript",
    python: "python",
    py: "python",
    java: "java",
    c: "c",
    cpp: "cpp",
    "c++": "cpp",
    csharp: "csharp",
    "c#": "csharp",
    php: "php",
    ruby: "ruby",
    go: "go",
    rust: "rust",
    swift: "swift",
    kotlin: "kotlin",
    scala: "scala",
    html: "xml",
    markup: "xml",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    markdown: "markdown",
    md: "markdown",
    bash: "bash",
    shell: "bash",
    sh: "bash",
    sql: "sql",
    text: "plaintext",
    plain: "plaintext",
    plaintext: "plaintext",
    mermaid: "mermaid"
  };

  const requestedLanguage = language?.toLowerCase();
  const highlightLanguage = languageMap[requestedLanguage] || "plaintext";
  const escapedCode = escapeHtml(code);

  // Create the highlighted HTML structure
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = `<pre class="hljs"><code class="hljs language-${highlightLanguage}">${escapedCode}</code></pre>`;

  // Apply syntax highlighting
  const codeElement = tempDiv.querySelector("pre code");
  if (codeElement && window.hljs && typeof window.hljs.highlightElement === "function") {
    try {
      window.hljs.highlightElement(codeElement);
    } catch (error) {
      // console.error("Highlight.js failed to highlight code:", error); // Disabled HLJS logs
    }
  }

  return tempDiv.innerHTML;
}

function highlightAllUnder(container) {
  if (!container || !window.hljs || typeof window.hljs.highlightElement !== "function") {
    return;
  }

  const codeBlocks = container.querySelectorAll("pre code");
  codeBlocks.forEach((codeBlock) => {
    if (!codeBlock.classList.contains("hljs")) {
      codeBlock.classList.add("hljs");
    }
    const parentPre = codeBlock.closest("pre");
    if (parentPre && !parentPre.classList.contains("hljs")) {
      parentPre.classList.add("hljs");
    }

    try {
      window.hljs.highlightElement(codeBlock);
    } catch (error) {
      // console.error("Highlight.js failed to highlight code:", error); // Disabled HLJS logs
    }
  });
}

async function loadAllArtifacts() {
  try {
    // Try to load from file-based storage first
    if (window.api && window.api.artifacts) {
      const fileArtifacts = await window.api.artifacts.load();
      if (fileArtifacts && fileArtifacts.length > 0) {
        // Ensure file artifacts have all required properties
        codeArtifacts = fileArtifacts.map((artifact) => ({
          ...artifact,
          isFavorite: artifact.isFavorite || false, // Add isFavorite if missing
        }));
        return codeArtifacts;
      }
    }

    // Fallback: migrate from localStorage if exists
    const stored = localStorage.getItem("code-artifacts");
    if (stored) {
      const legacyArtifacts = JSON.parse(stored);
      if (legacyArtifacts.length > 0) {
        // Migrate to file-based storage
        codeArtifacts = legacyArtifacts.map((artifact) => ({
          ...artifact,
          isFavorite: artifact.isFavorite || false,
          sessionId: artifact.sessionId || null, // Keep existing sessionId if present
          messageIndex: artifact.messageIndex || null,
        }));

        await saveArtifactsToFile();

        localStorage.removeItem("code-artifacts");
        return codeArtifacts;
      }
    }

    codeArtifacts = [];
    return codeArtifacts;
  } catch (e) {
    log("ARTIFACTS", 3, "loadArtifactsFromFile", "Failed to load artifacts", {
      error: e.message,
    });
    codeArtifacts = [];
    return codeArtifacts;
  }
}

async function saveArtifactsToFile() {
  try {
    log("ARTIFACTS", 2, "saveArtifactsToFile", "Saving artifacts", {
      count: codeArtifacts.length,
      hasApi: !!window.api?.artifacts,
      sample: codeArtifacts.slice(0, 2).map(a => ({ id: a.id, sessionId: a.sessionId, title: a.title })),
    });
    if (window.api && window.api.artifacts) {
      await window.api.artifacts.save(codeArtifacts);
    } else {
      localStorage.setItem("code-artifacts", JSON.stringify(codeArtifacts));
    }
  } catch (e) {
    log("ARTIFACTS", 3, "saveArtifactsToFile", "Failed to save artifacts", {
      error: e.message,
    });
  }
}

function deleteArtifact(artifactId) {
  codeArtifacts = codeArtifacts.filter((a) => a.id !== artifactId);
  saveArtifactsToFile();
}

function toggleArtifactFavorite(artifactId) {
  const artifact = codeArtifacts.find((a) => a.id === artifactId);
  if (artifact) {
    artifact.isFavorite = !artifact.isFavorite;
    artifact.updated_at = new Date().toISOString();
    saveArtifactsToFile();
    renderArtifactsPage(); 
  }
}

function finalizeThinkingUI(aiNode, duration, metadataOverride = null) {
  if (!aiNode) return;
  const el = aiNode._thinkingEl;
  if (!el || !el.toggle) return;

  const metadata =
    metadataOverride ||
    aiNode._messageMetadata ||
    (aiNode.dataset?.webSearchPages
      ? { webSearchPages: Number(aiNode.dataset.webSearchPages) }
      : {});

  const pageCount = Number(metadata?.webSearchPages) || 0;
  if (pageCount > 0) {
    updateThinkingToggleForWebSearch(aiNode, pageCount);
    return;
  }

  const textSpan =
    el.toggleContent?.querySelector?.("span") || el.toggle.querySelector("span");
  if (textSpan) {
    textSpan.innerHTML = `Thought for ${duration.toFixed(1)}s`;
  }
}

function log(context, level, contextFunc, message, details = {}) {
  if (!LOGGING) return;

  const USE_CONSOLE_INFO = false;
  const config = {
    0: { label: "TRACE", color: "#d95bffff", out: "log", detailOut: "log" },
    1: { label: "DEBUG", color: "#e1e1e1ff", out: "log", detailOut: "log" },
    2: {
      label: "INFO",
      color: "#56aee9ff",
      out: USE_CONSOLE_INFO ? "info" : "log",
      detailOut: USE_CONSOLE_INFO ? "info" : "log",
    },
    3: { label: "WARN", color: "#ecff73ff", out: "warn", detailOut: "warn" },
    4: { label: "ERROR", color: "#fa2626ff", out: "error", detailOut: "error" },
  };

  const { label, color, out, detailOut } = config[level] || {
    label: "LOG",
    color: "#95a5a6",
    out: "log",
    detailOut: "log",
  };

  const date = new Date();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const milliseconds = date.getMilliseconds().toString().padStart(3, "0");
  const time = `${hours}:${minutes}:${seconds}.${milliseconds}`;
  const shortTime = `${minutes}:${seconds}.${milliseconds}`;

  const hasDetails = details && Object.keys(details).length > 0;

  const baseSignature = `${context}:${level}:${contextFunc}:${message}`;
  const dataSignature = hasDetails
    ? JSON.stringify(details, Object.keys(details).sort())
    : "";
  const fullSignature = `${baseSignature}:${dataSignature}`;

  if (!window._logState) {
    window._logState = {
      lastSignature: null,
      lastDataSignature: null,
      lastDetails: null,
      sequenceCount: 0,
    };
  }

  const state = window._logState;
  const isSameBase = baseSignature === state.lastSignature;
  const isSameData = dataSignature === state.lastDataSignature;
  const isCompleteMatch = isSameBase && isSameData;

  if (isCompleteMatch) {
    state.sequenceCount++;
    const minimalMessage = `%c${state.sequenceCount}. [${shortTime}] ${contextFunc}().`;
    const minimalStyle = `color: ${color}; font-weight: normal; opacity: 0.7;`;

    console[out](minimalMessage, minimalStyle);
  } else if (isSameBase && !isSameData && hasDetails) {
    state.sequenceCount++;

    const changeMessage = `%c${state.sequenceCount}. [${shortTime}] ${contextFunc}().`;
    const changeStyle = `color: ${color}; font-weight: normal;`;

    const changedDetails = getChangedDetails(details, state.lastDetails || {});
    state.lastDetails = { ...details };
    state.lastDataSignature = dataSignature;

    if (Object.keys(changedDetails).length > 0) {
      if (level === 0) {
        console.groupCollapsed(changeMessage, changeStyle);
        printKV(console.log, color, changedDetails);
        console.trace("Stack trace:");
        console.groupEnd();
      } else {
        console.groupCollapsed(changeMessage, changeStyle);
        printKV(console[detailOut], color, changedDetails);
        console.groupEnd();
      }
    } else {
      console[out](changeMessage, `${changeStyle}; opacity: 0.7;`);
    }
  } else if (isSameBase && !hasDetails) {
    state.sequenceCount++;
    const ultraMinimal = `%c${state.sequenceCount}. [${shortTime}]`;
    const ultraStyle = `color: ${color}; font-weight: normal; opacity: 0.5;`;

    console[out](ultraMinimal, ultraStyle);
  } else {
    state.lastSignature = baseSignature;
    state.lastDataSignature = dataSignature;
    state.lastDetails = hasDetails ? { ...details } : null;
    state.sequenceCount = 0;

    const fullMessage = `%c(${String(context).toUpperCase()} ${label}) [${time}] ${contextFunc}(). ${message}`;
    const fullStyle = `color: ${color}; font-weight: bold;`;

    if (level === 5) {
      console.log(`${contextFunc}, ${message}`);
    } else if (level === 0) {
      console.groupCollapsed(fullMessage, fullStyle);
      if (hasDetails) printKV(console.log, color);
      console.trace("Stack trace:");
      console.groupEnd();
    } else if (hasDetails) {
      console.groupCollapsed(fullMessage, fullStyle);
      printKV(console[detailOut], color);
      console.groupEnd();
    } else {
      console[out](fullMessage, fullStyle);
    }
  }

  function printKV(printer, logColor, detailsToPrint = details) {
    Object.entries(detailsToPrint).forEach(([key, value]) => {
      let displayValue = value;
      if (typeof value === 'string' && value.length > 1000) {
        displayValue = value.substring(0, 1000) + '... (truncated)';
      } else if (typeof value === 'object' && value !== null) {
        try {
          const stringified = JSON.stringify(value);
          if (stringified.length > 1000) {
            displayValue = '[Large Object - truncated]';
          } else {
            displayValue = value;
          }
        } catch (e) {
          displayValue = '[Object - cannot stringify]';
        }
      }
      printer(`%c${key}:`, `color: ${logColor}; font-weight: bold;`, displayValue);
    });
  }

  function getChangedDetails(current, previous) {
    const changed = {};
    for (const [key, value] of Object.entries(current)) {
      if (previous[key] !== value) {
        changed[key] = value;
      }
    }
    return changed;
  }

  try {
    const logEntry = {
      timestamp: time,
      context: String(context).toUpperCase(),
      levelLabel: label,
      func: contextFunc,
      message: message,
      details: details,
      sequence: state.sequenceCount,
      isRepeated: isCompleteMatch || (isSameBase && !hasDetails),
    };

    if (
      window.api &&
      window.api.logging &&
      typeof window.api.logging.write === "function"
    ) {
      window.api.logging.write(logEntry);
    } else {
      if (!window._logQueue) window._logQueue = [];
      window._logQueue.push(logEntry);

      setTimeout(() => {
        if (
          window.api &&
          window.api.logging &&
          window._logQueue &&
          window._logQueue.length > 0
        ) {
          window._logQueue.forEach((entry) => {
            try {
              window.api.logging.write(entry);
            } catch (e) {
              console.warn("Failed to send queued log:", e);
            }
          });
          window._logQueue = [];
        }
      }, 1000);
    }
  } catch (error) {
    console.warn("Failed to send log to backend:", error);
  }
}

setSessionCacheLogger(log);

function ensureTokenFields(session) {
  if (!session) return;
  if (typeof session.tokens_used !== "number") session.tokens_used = 0;
  if (
    !session.tokens_by_message ||
    typeof session.tokens_by_message !== "object"
  ) {
    session.tokens_by_message = {};
  }
  if (!Array.isArray(session.uploadedFiles)) {
    session.uploadedFiles = [];
  }
}

function updateTokensUI(session) {
  try {
    if (session === current) {
      updateChatHeader();
    }
  } catch {}
}

function bumpToken(session, messageIndex) {
  if (!session) return;
  ensureTokenFields(session);
  session.tokens_used += 1;
  if (typeof messageIndex === "number") {
    session.tokens_by_message[messageIndex] =
      (session.tokens_by_message[messageIndex] || 0) + 1;
  }
  updateTokensUI(session);
  try {
    if (typeof save === "function" && session.tokens_used % 25 === 0) save();
  } catch {}
}

function normalizeProviderModels(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((m) => (typeof m === "string" ? { id: m } : m))
    .filter(Boolean);
}

async function persistModels(conf) {
  state.settings.models = conf;
  localStorage.setItem("models-conf", JSON.stringify(conf));

  try {
    if (!DEBUG_MODE) {
      await window.api?.models?.save?.(conf);
    }
  } catch (err) {
    log("MODELS", 4, "persistModels", "Gagal menyimpan models", {
      error: err.message,
    });
  }

  updateModelHeader?.();
}

function openModelMgmt() {
  renderMgmtProviders();
  openModalWithAnimation($("#model-mgmt-modal"));
  $("#mgmt-back").style.visibility = "hidden";
}

function closeModelMgmt() {
  closeModalWithAnimation($("#model-mgmt-modal"));
}

$("#mgmt-close").addEventListener("click", closeModelMgmt);
$("#mgmt-close").textContent = "Close";
$("#close-mgmt").addEventListener("click", closeModelMgmt);
$("#model-mgmt-modal .modal-overlay").addEventListener("click", closeModelMgmt);

function renderMgmtProviders() {
  const conf = state.settings.models || defaultModels();
  const body = $("#mgmt-body");
  $("#mgmt-title").textContent = "Model Management";
  $("#mgmt-back").style.visibility = "hidden";
  $("#mgmt-close").textContent = "Close";

  const provs = conf.providers || {};
  const items = Object.keys(provs).sort();

  body.innerHTML = `
    <div class="form-group no-padding">
      <div id="prov-list" class="prov-list">
        <button id="add-prov" class="add-item" style="width:100%;justify-content:center">
            <span style="display:flex;align-items:center;gap:10px;text-transform:capitalize;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
              Add new provider
            </span>
            <span class="help-text" style="color: var(--fg-muted)"></span>
          </button>
        ${items
          .map(
            (p) => `
          <button class="modal-menu-item" data-prov="${p}" style="width:100%;justify-content:space-between">
            <span class="mm-prov-title" style="display:flex;align-items:center;gap:10px;text-transform:capitalize;">
              ${p}
            </span>
            <span class="help-text" style="color: var(--fg-muted)">${(provs[p].models || []).length} models</span>
          </button>
        `,
          )
          .join("")}
          
      </div>
    </div>
  `;

  body.querySelectorAll("#prov-list .modal-menu-item").forEach((btn) => {
    btn.addEventListener("click", () => renderMgmtProvider(btn.dataset.prov));
  });

  $("#add-prov").onclick = () =>
    openMiniModal({
      title: "Add Provider",
      fields: [
        { id: "prov-id", label: "Provider ID", placeholder: "mis. openrouter" },
        { id: "prov-base", label: "Base URL", placeholder: "https://..." },
        { id: "prov-key", label: "API Key", placeholder: "..." },
      ],
      onSave: (vals) => {
        const id = vals["prov-id"].trim();
        if (!id) return;
        const conf2 = state.settings.models || defaultModels();
        if (!conf2.providers) conf2.providers = {};
        conf2.providers[id] = conf2.providers[id] || {
          baseUrl: "",
          apiKey: "",
          models: [],
        };
        if (vals["prov-base"].trim())
          conf2.providers[id].baseUrl = vals["prov-base"].trim();
        if (vals["prov-key"].trim())
          conf2.providers[id].apiKey = vals["prov-key"].trim();
        persistModels(conf2);
        populateTitleModelOptions?.(id);
        renderMgmtProviders();
      },
    });
}

function renderMgmtProvider(pkey) {
  const conf = state.settings.models || defaultModels();
  const prov = conf.providers?.[pkey] || {
    baseUrl: "",
    apiKey: "",
    models: [],
  };
  const list = normalizeProviderModels(prov.models);

  $("#mgmt-title").textContent = pkey;
  $("#mgmt-back").style.visibility = "visible";
  $("#mgmt-back").onclick = renderMgmtProviders;
  $("#mgmt-close").textContent = "Close";

  const body = $("#mgmt-body");
  body.innerHTML = `
    <div style="padding: 8px 16px; border-bottom: 1px solid var(--border)">
      <div class="form-group">
        <label>API Key</label>
        <input type="text" id="prov-api" value="${prov.apiKey || ""}">
      </div>
      <div class="form-group">
        <label>Base URL</label>
        <input type="text" id="prov-base" value="${prov.baseUrl || ""}">
      </div>
      <button style="display:flex; margin-left: auto;" id="save-prov" class="primary-btn">Save provider</button>
    </div>

    <div class="form-group">
      <div style="display: flex; gap: 8px; padding-left: 16px; padding-top: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border);" class="row-center">
        <label class="no-padding-left">Models</label>
        <svg id="add-model" style="margin-bottom: 8px; cursor: pointer;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
      </div>
      <div id="model-list" style="max-height: 400px; overflow: auto;">
        ${list
          .map(
            (m) => `
          <div class="menu-item no-padding mgmt-list" data-mid="${m.id}" style="width:100%; justify-content:space-between; padding: 8px 16px !important; border-radius: none !important;">
            <span class="mm-prov-title">${m.label || m.id}</span>
            <button class="icon-btn danger" data-del="${m.id}" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>    
  `;

  $("#save-prov").onclick = () => {
    const base = $("#prov-base").value.trim();
    const key = $("#prov-api").value.trim();
    const conf2 = state.settings.models || defaultModels();
    conf2.providers[pkey] = conf2.providers[pkey] || {
      baseUrl: "",
      apiKey: "",
      models: [],
    };
    conf2.providers[pkey].baseUrl = base;
    conf2.providers[pkey].apiKey = key;
    persistModels(conf2);
  };

  body.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mid = btn.dataset.del;
      const conf2 = state.settings.models || defaultModels();
      const arr = normalizeProviderModels(
        conf2.providers?.[pkey]?.models || [],
      );
      conf2.providers[pkey].models = arr.filter((x) => x.id !== mid);
      if (conf2.active?.platform === pkey && conf2.active?.model === mid) {
        conf2.active = {
          platform: pkey,
          model: arr.find((x) => x.id !== mid)?.id || "",
        };
      }
      persistModels(conf2);
      renderMgmtProvider(pkey);
      populateTitleModelOptions?.(pkey);
    });
  });

  body.querySelectorAll("#model-list .menu-item").forEach((it) => {
    it.addEventListener("click", (e) => {
      if (e.target.closest("[data-del]")) return;
      renderMgmtModel(pkey, it.dataset.mid);
    });
  });

  $("#add-model").onclick = () =>
    openMiniModal({
      title: `Add Model to ${pkey}`,
      fields: [
        {
          id: "mod-id",
          label: "Model ID",
          placeholder: "mis. deepseek/deepseek-chat-v3.1:free",
        },
        {
          id: "mod-label",
          label: "Label (optional)",
          placeholder: "mis. Deepseek v3.1",
        },
      ],
      onSave: (vals) => {
        const id = vals["mod-id"].trim();
        if (!id) return;
        const label = vals["mod-label"].trim();
        const conf2 = state.settings.models || defaultModels();
        const arr = normalizeProviderModels(
          conf2.providers?.[pkey]?.models || [],
        );
        if (!arr.find((x) => x.id === id)) arr.unshift({ id, label });
        conf2.providers[pkey].models = arr;
        persistModels(conf2);
        renderMgmtProvider(pkey);
        populateTitleModelOptions?.(pkey);
      },
    });
}

function renderMgmtModel(pkey, mid) {
  const conf = state.settings.models || defaultModels();
  const prov = conf.providers?.[pkey] || { models: [] };
  const arr = normalizeProviderModels(prov.models);
  const meta = arr.find((m) => m.id === mid) || { id: mid };

  $("#mgmt-title").textContent = meta.label || meta.id;
  $("#mgmt-back").style.visibility = "visible";
  $("#mgmt-back").onclick = () => renderMgmtProvider(pkey);
  $("#mgmt-close").textContent = "Save and Close";

  const body = $("#mgmt-body");
  body.innerHTML = `
  <div class="form-group">
  <label>Model ID</label>
      <input type="text" id="mm-id" value="${meta.id}">
    </div>
    <div class="form-group">
      <label>Label</label>
      <input type="text" id="mm-label" value="${meta.label || ""}" placeholder="Deepseek v3.1">
    </div>
    <div class="form-group">
      <label>Think capability</label>
      <select id="mm-think">
        <option value="off">Off</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="auto">Auto</option>
      </select>
    </div>
    <div class="form-group">
    <label>Notes</label>
      <textarea id="mm-note" spellcheck="false" autocorrect="off" rows="3" placeholder="Model notes...">${meta.note || ""}</textarea>
    </div>
    <div id="mm-error" class="help-text" style="color: var(--error); display: none; margin-bottom: 16px;"></div>
  `;

  $("#mm-think").value = meta.think || "off";

  $("#mgmt-close").onclick = async (e) => {
    const errorEl = $("#mm-error");
    errorEl.style.display = "none";
    errorEl.textContent = "";

    const newId = $("#mm-id").value.trim();
    const label = $("#mm-label").value.trim();
    const note = $("#mm-note").value.trim();
    const think = $("#mm-think").value;

    if (!newId) {
      errorEl.textContent = "Model ID cannot be empty.";
      errorEl.style.display = "block";
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const conf2 = state.settings.models || defaultModels();
    const arr2 = normalizeProviderModels(conf2.providers?.[pkey]?.models || []);
    const i = arr2.findIndex((m) => m.id === mid);

    if (i >= 0) {
      // If model ID changed, check for duplicates
      if (newId !== mid && arr2.find((m) => m.id === newId)) {
        errorEl.textContent = "Model ID already exists.";
        errorEl.style.display = "block";
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      arr2[i] = { ...arr2[i], id: newId, label, note, think };
    } else {
      // Adding new model
      if (arr2.find((m) => m.id === newId)) {
        errorEl.textContent = "Model ID already exists.";
        errorEl.style.display = "block";
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      arr2.unshift({ id: newId, label, note, think });
    }

    conf2.providers[pkey].models = arr2;

    // Update active model if it was changed
    if (conf2.active?.platform === pkey && conf2.active?.model === mid && newId !== mid) {
      conf2.active.model = newId;
    }

    await persistModels(conf2);

    if (conf2.active?.platform === pkey && (conf2.active?.model === newId || conf2.active?.model === mid)) {
      updateModelHeader?.();
    }

    // Close modal and return to provider model list
    closeModelMgmt();
    renderMgmtProvider(pkey);
    populateTitleModelOptions?.(pkey);
  };
}

function openMiniModal({ title, fields, onSave }) {
  $("#mini-title").textContent = title || "Add";
  const form = fields
    .map(
      (f) => `
    <div class="form-group">
      <label for="${f.id}">${f.label || f.id}</label>
      <input type="text" id="${f.id}" placeholder="${f.placeholder || ""}">
    </div>
  `,
    )
    .join("");
  $("#mini-body").innerHTML = form;

  const close = () => closeModalWithAnimation($("#mini-modal"));
  $("#mini-close").onclick = close;
  $("#mini-cancel").onclick = close;
  $("#mini-modal .modal-overlay").onclick = close;
  $("#mini-save").onclick = () => {
    const vals = {};
    for (const f of fields) vals[f.id] = document.getElementById(f.id).value;
    onSave?.(vals);
    close();
  };

  openModalWithAnimation($("#mini-modal"));
}

function getModelMeta(conf, platform, modelId) {
  const list = normalizeProviderModels(
    conf?.providers?.[platform]?.models || [],
  );
  const found = list.find((m) => (m.id || m) === modelId);
  if (found) return found;
  if (typeof modelId === "string")
    return { id: modelId, label: modelId, note: "" };
  return { id: "", label: "", note: "" };
}

function resolveLabelForActive() {
  const conf = state?.settings?.models;
  if (!conf) return null;
  const act = conf.active || {};
  if (!act.platform || !act.model) return null;

  if (act.label && act.label.trim()) return act.label.trim();

  const meta = getModelMeta(conf, act.platform, act.model);
  return meta.label || act.model || null;
}

function defaultBaseUrlFor(p) {
  if (p === "openrouter") return "https://openrouter.ai/api/v1";
  if (p === "groq") return "https://api.groq.com/openai/v1";
  if (p === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  if (p === "zhipu") return "https://api.z.ai/api/paas/v4/";
  if (p === "bigmodel") return "https://open.bigmodel.cn/api/paas/v4";
  if (p === "cerebras") return "https://api.cerebras.ai/v1";
  return "https://api.z.ai/api/paas/v4/";
}

function defaultModels() {
  return {
    active: {
      platform: "openrouter",
      model: "deepseek/deepseek-chat-v3.1:free",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "",
    },
    providers: {
      openrouter: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "",
        models: [
          "deepseek/deepseek-chat-v3.1:free",
          "meta-llama/llama-3.1-8b-instruct",
          "mistralai/mistral-7b-instruct",
          "deepseek/deepseek-chat",
          "openai/gpt-oss-120b:free",
          "openai/gpt-oss-20b:free",
          "meta-llama/llama-4-maverick:free",
          "microsoft/mai-ds-r1:free",
          "google/gemini-2.0-flash-exp:free",
          "qwen/qwen3-coder:free",
          "qwen/qwen3-14b:free",
          "qwen/qwen-2.5-coder-32b-instruct:free",
          "openrouter/sonoma-sky-alpha",
        ],
      },
      groq: {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "",
        models: [
          "llama3-8b-8192",
          "mixtral-8x7b-32768",
          "gemma2-9b-it",
          "openai/gpt-oss-120b",
        ],
      },
      gemini: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "",
        models: ["gemini-1.5-flash", "gemini-1.5-flash-8b"],
      },
      zhipu: {
        baseUrl: "https://api.z.ai/api/paas/v4/",
        apiKey: "",
        models: ["glm-4.5-flash"],
      },
      bigmodel: {
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKey: "",
        models: ["glm-4-plus", "glm-4-0520", "glm-4", "glm-4-air", "glm-4-airx", "glm-4-flash"],
      },
      cerebras: {
        baseUrl: "https://api.cerebras.ai/v1",
        apiKey: "",
        models: [
          "gpt-oss-120b",
          "qwen-3-coder-480b",
          "qwen-3-235b-a22b-thinking-2507",
          "llama-3.3-70b",
        ],
      },
    },
  };
}

async function loadModelsConf() {
  try {
    const conf = DEBUG_MODE
      ? JSON.parse(localStorage.getItem("models-conf"))
      : await window.api.models.load();

    state.settings.models = conf || defaultModels();

    const provs = state.settings.models.providers || {};
    for (const p of Object.keys(provs)) {
      provs[p].models = normalizeProviderModels(provs[p].models);
    }
  } catch {
    state.settings.models = defaultModels();
  }
  localStorage.setItem("models-conf", JSON.stringify(state.settings.models));
}

function getActiveChatConfig() {
  const m = state?.settings?.models || {};
  const act = m.active || {};
  const platform = act.platform || "zhipu";
  const prov = m.providers?.[platform] || {};
  return {
    provider: platform,
    model: act.model || "glm-4.5-flash",
    baseUrl: act.baseUrl || prov.baseUrl || defaultBaseUrlFor(platform),
    apiKey: act.apiKey || prov.apiKey || "",
    headers:
      prov.headers ||
      (platform === "openrouter"
        ? {
            "HTTP-Referer": "https://clustrix.local",
            "X-Title": "Clustrix Desktop",
          }
        : {}),
  };
}

function getTitleGenConfig() {
  const m = state?.settings?.models || {};
  const tg = m.titleGenerator || { useDefault: true };
  if (tg.useDefault || !tg.model) return getActiveChatConfig();

  const act = m.active || {};
  const platform = act.platform || "zhipu";
  const prov = m.providers?.[platform] || {};
  return {
    provider: platform,
    model: tg.model,
    baseUrl: act.baseUrl || prov.baseUrl || defaultBaseUrlFor(platform),
    apiKey: act.apiKey || prov.apiKey || "",
    headers:
      prov.headers ||
      (platform === "openrouter"
        ? {
            "HTTP-Referer": "https://clustrix.local",
            "X-Title": "Clustrix Desktop",
          }
        : {}),
  };
}

function updateModelHeader() {
  const conf = state?.settings?.models;
  const act = conf?.active || {};
  const label = resolveLabelForActive() || "Default Model";
  const title = `${label}`;
  const prov = `${act.platform || "unknown"}`;

  const titleEl = document.querySelector("#model-title");
  if (titleEl) titleEl.textContent = title;
  if (titleEl) titleEl.title = prov;

  // Fix selector logic to update both welcome and chat model buttons
  const welcomeBtn = $("#btn-model-switch-welcome");
  const chatBtn = $("#btn-model-switch-chat");
  const projectBtn = $("#btn-model-switch-project");

  [welcomeBtn, chatBtn, projectBtn].forEach((modelBtn) => {
    if (modelBtn) {
      const p = modelBtn.querySelector("p");
      if (p) p.textContent = title || "";
    }
  });

  const tokensEl = document.querySelector("#chat-title");
  if (tokensEl && !tokensEl.textContent) tokensEl.title = "";
}

function showWelcomeScreen() {
  current = null;
  welcomeScreenStagedFiles = [];
  renderWelcomeScreenFiles();

  updateMarkdownControls();

  $(".chat-area").classList.remove("chats-active");
  $(".chat-area").classList.remove("artifacts-active");
  $(".chat-area").classList.remove("projects-active");
  $(".chat-area").classList.add("welcome-active");

  // Clear active button states
  document.getElementById("chats-btn")?.classList.remove("active");
  document.getElementById("artifact-btn")?.classList.remove("active");
  document.getElementById("projects-btn")?.classList.remove("active");

  // Save page state
  savePageState("welcome");
  
  // Push to page history for back/forward navigation
  if (typeof pushPageHistory === 'function') {
    pushPageHistory({ page: 'welcome', sessionId: null });
  }

  $("#chat-title").textContent = "New Chat";
  $("#chat-title").title = "New Chat, ask anything";
  $("#clustrix-logo").innerHTML = `
              <div style="--i: 1"></div>
              <div style="--i: 2"></div>
              <div style="--i: 3"></div>
              <div style="--i: 4"></div>
              <div style="--i: 5"></div>
              <div style="--i: 6"></div>
              <div style="--i: 7"></div>
              <div style="--i: 8"></div>
              <div style="--i: 9"></div>
              <div style="--i: 10"></div>
              <div style="--i: 11"></div>
              <div style="--i: 12"></div>
  `;
  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "";

  // Close project detail view if it's open
  const detailView = document.getElementById("project-detail-view");
  if (detailView && detailView.classList.contains("active")) {
    detailView.classList.remove("active");
    detailView.classList.add("closing");
    setTimeout(() => {
      detailView.classList.remove("closing");
      detailView.style.display = "none";
    }, 300);
  }

  // Restore welcome screen draft
  const msgCentral = $("#msg-central");
  if (msgCentral) {
    const welcomeDraft = loadDraftForSession("welcome-screen");
    msgCentral.value = welcomeDraft;
    // Trigger textarea resize if needed
    if (window.textareaCustomScrollbar) {
      const shell = msgCentral.closest(".ta-shell");
      if (shell && shell._scrollbarInstance) {
        shell._scrollbarInstance.updateLayout();
      }
    }
    // Auto focus textarea
    msgCentral.focus();
  }

  renderSessions();
  updateInputState();
  log("UI", 2, "showWelcomeScreen", "Switched to Welcome Screen", {
    currentSession: null,
  });
}

function showChatsPage() {
  current = null;
  resetChatSelectionState();
  setLoadedChatPageCount(0);

  $(".chat-area").classList.remove("welcome-active");
  $(".chat-area").classList.remove("artifacts-active");
  $(".chat-area").classList.remove("projects-active");
  $(".chat-area").classList.add("chats-active");
  document.getElementById("chats-btn")?.classList.add("active");
  document.getElementById("artifact-btn")?.classList.remove("active");
  document.getElementById("projects-btn")?.classList.remove("active");

  // Save page state
  savePageState("chats");
  
  // Push to page history for back/forward navigation
  if (typeof pushPageHistory === 'function') {
    pushPageHistory({ page: 'chats-list' });
  }

  $("#chat-title").textContent = "Your Chat History";
  $("#chat-title").title = "Browse all your conversations";
  $("#clustrix-logo").innerHTML = "";
  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "none";

  // Close project detail view if it's open
  const detailView = document.getElementById("project-detail-view");
  if (detailView && detailView.classList.contains("active")) {
    detailView.classList.remove("active");
    detailView.classList.add("closing");
    setTimeout(() => {
      detailView.classList.remove("closing");
      detailView.style.display = "none";
    }, 300);
  }

  renderChatsPage();
  setupChatsPageListeners();
  renderSessions();
  updateInputState();
  
  // Auto focus search bar
  const searchInput = document.getElementById('chats-search');
  if (searchInput) searchInput.focus();
}

function renderChatsPage() {
  return renderChatsPageImpl();
}

// Toggle favorite status
function toggleFavorite(sessionId) {
  return toggleFavoriteImpl(sessionId);
}

// Start rename process
function startRename(sessionId) {
  return startRenameImpl(sessionId);
}

// Start rename process for sidebar items
function startSidebarRename(sessionId) {
  return startSidebarRenameImpl(sessionId);
}

// Helper function to create session list items for sidebar
function createSessionListItem(s) {
  return createSessionListItemImpl(s);
}

function setupChatsPageListeners() {
  return setupChatsPageListenersImpl();
}

function filterChats(searchTerm) {
  return filterChatsImpl(searchTerm);
}

function restoreNormalView() {
  $(".chat-area").classList.remove("chats-active");
  $(".chat-area").classList.remove("artifacts-active");

  document.getElementById("chats-btn")?.classList.remove("active");
  document.getElementById("artifact-btn")?.classList.remove("active");

  const sessionId = current && current.id ? current.id : null;
  savePageState("chat", sessionId);

  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "";
}

let artifactsListenersAdded = false;

function showArtifactsPage() {
  current = null;

  $(".chat-area").classList.remove("welcome-active");
  $(".chat-area").classList.remove("chats-active");
  $(".chat-area").classList.remove("projects-active");
  $(".chat-area").classList.add("artifacts-active");

  document.getElementById("artifact-btn")?.classList.add("active");
  document.getElementById("chats-btn")?.classList.remove("active");
  document.getElementById("projects-btn")?.classList.remove("active");

  savePageState("artifacts");
  
  // Push to page history for back/forward navigation
  if (typeof pushPageHistory === 'function') {
    pushPageHistory({ page: 'artifacts-list' });
  }

  $("#chat-title").textContent = "Code Artifacts";
  $("#chat-title").title = "Your saved code snippets";
  $("#clustrix-logo").innerHTML = "";

  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "none";

  // Close project detail view if it's open
  const detailView = document.getElementById("project-detail-view");
  if (detailView && detailView.classList.contains("active")) {
    detailView.classList.remove("active");
    detailView.classList.add("closing");
    setTimeout(() => {
      detailView.classList.remove("closing");
      detailView.style.display = "none";
    }, 300);
  }

  renderArtifactsPage();

  if (!artifactsListenersAdded) {
    setupArtifactsPageListeners();
    artifactsListenersAdded = true;
  }

  renderSessions();
  updateInputState();
  
  // Auto focus search bar
  const searchInput = document.getElementById('artifacts-search');
  if (searchInput) searchInput.focus();
  
  log("UI", 2, "showArtifactsPage", "Switched to Artifacts Page");
}

function renderArtifactsPage() {
  const artifactsList = document.getElementById("artifacts-list");
  if (!artifactsList) {
    return;
  }

  if (codeArtifacts.length === 0) {
    artifactsList.innerHTML = `
      <div class="empty-state">
        <p>No code artifacts yet</p>
        <p style="font-size: 14px; margin-top: 8px;">Save code snippets from chat messages to build your collection</p>
      </div>
    `;
    return;
  }

  artifactsList.innerHTML = "";

  // Sort artifacts: starred first, then by creation date (newest first)
  const sortedArtifacts = [...codeArtifacts].sort((a, b) => {
    // First priority: starred items go to top
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;

    // Second priority: within same favorite status, sort by creation date (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  sortedArtifacts.forEach((artifact) => {
    const artifactItem = document.createElement("div");
    artifactItem.className = `artifact-item${artifact.isFavorite ? " starred" : ""}`;
    artifactItem.dataset.artifactId = artifact.id;

    const formattedDate = formatRelativeTime(artifact.created_at);

    const codePreview =
      artifact.code.length > 200
        ? artifact.code.slice(0, 200) + "..."
        : artifact.code;
    const highlightedPreview = createHighlightedCode(
      codePreview,
      artifact.language,
    );

    artifactItem.innerHTML = `
      <div class="artifact-menu-container">
        <button class="artifact-menu-btn" data-artifact-id="${artifact.id}" title="Artifact options">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="19" cy="12" r="2"/>
          </svg>
        </button>
        <div class="artifact-menu-dropdown" data-artifact-id="${artifact.id}">
          <div class="artifact-menu-item" data-action="copy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Copy</span>
          </div>
          <div class="artifact-menu-item" data-action="favorite">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span>${artifact.isFavorite ? "Unstar" : "Star"}</span>
          </div>
          <div class="artifact-menu-item artifact-menu-item-danger" data-action="delete">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 2l-2 2h12l-2-2H6zM4 6v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V6H4zm2 2h8v8H6V8z"/>
            </svg>
            <span>Delete</span>
          </div>
        </div>
      </div>
      <div class="artifact-preview-container">
          <div class="artifact-preview">${highlightedPreview}</div>
      </div>
      <div class="artifact-header">
          <div class="row-gap">
              ${artifact.isFavorite ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star-icon lucide-star"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>' : ""}
            <h3 class="artifact-title">${escapeHtml(artifact.title)}</h3>
            <span class="artifact-language">${escapeHtml(artifact.language)}</span>
          </div>
          <div class="artifact-meta">
              <span class="artifact-date">Saved ${formattedDate}</span>
          </div>
      </div>
      <div class="artifact-actions">
          <button class="artifact-btn copy-artifact-btn" data-artifact-id="${artifact.id}">Copy</button>
          <button class="artifact-btn view-artifact-btn" data-artifact-id="${artifact.id}">View</button>
          <button class="artifact-btn delete-artifact-btn" data-artifact-id="${artifact.id}">Delete</button>
      </div>
    `;

    artifactsList.appendChild(artifactItem);
  });

}

function setupArtifactsPageListeners() {
  // Back button
  const backBtn = document.getElementById("back-to-chat-from-artifacts");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      restoreNormalView();
      showWelcomeScreen();
    });
  }

  // Search functionality
  const searchInput = document.getElementById("artifacts-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterArtifacts(e.target.value);
    });
  }

  // Artifact menu and action handlers
  document.addEventListener("click", (e) => {
    // Handle artifact menu button clicks
    if (e.target.closest(".artifact-menu-btn")) {
      e.stopPropagation();
      const menuContainer = e.target.closest(".artifact-menu-container");
      const menuButton = menuContainer.querySelector(".artifact-menu-btn");
      const dropdown = menuContainer.querySelector(".artifact-menu-dropdown");

      // Close all other persistent-open menus and remove their active states
      document
        .querySelectorAll(".artifact-menu-dropdown.persistent-open")
        .forEach((menu) => {
          if (menu !== dropdown) {
            menu.classList.remove("persistent-open");
            const otherButton =
              menu.parentElement.querySelector(".artifact-menu-btn");
            if (otherButton) otherButton.classList.remove("persistent-active");
          }
        });

      // Toggle current menu's persistent state
      const isPersistentOpen = dropdown.classList.contains("persistent-open");

      if (isPersistentOpen) {
        // Close the menu
        dropdown.classList.remove("persistent-open");
        menuButton.classList.remove("persistent-active");
      } else {
        // Open the menu in persistent state
        dropdown.classList.add("persistent-open");
        menuButton.classList.add("persistent-active");
      }
      return;
    }

    // Handle artifact menu item clicks
    if (e.target.closest(".artifact-menu-item")) {
      e.stopPropagation();
      const menuItem = e.target.closest(".artifact-menu-item");
      const action = menuItem.dataset.action;
      const dropdown = e.target.closest(".artifact-menu-dropdown");
      const artifactId = dropdown.dataset.artifactId;

      // Close menu and remove persistent state
      dropdown.classList.remove("persistent-open");
      const menuButton =
        dropdown.parentElement.querySelector(".artifact-menu-btn");
      if (menuButton) menuButton.classList.remove("persistent-active");

      const artifact = codeArtifacts.find((a) => a.id === artifactId);
      if (!artifact) return;

      if (action === "copy") {
        navigator.clipboard
          .writeText(artifact.code)
          .then(() => {
            // Create temporary feedback element
            const feedback = document.createElement("div");
            feedback.textContent = "Copied!";
            feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--surface);
            color: var(--fg);
            padding: 8px 16px;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
          `;
            document.body.appendChild(feedback);
            setTimeout(() => {
              document.body.removeChild(feedback);
            }, 1000);
          })
          .catch((err) => {
            log("ARTIFACTS", 3, "copyArtifactToClipboard", "Failed to copy", {
              error: err.message,
            });
          });
      } else if (action === "favorite") {
        toggleArtifactFavorite(artifactId);
      } else if (action === "delete") {
        showConfirmationModal(
          "Delete Artifact",
          `Are you sure you want to delete "${artifact.title}"?`,
          () => {
            deleteArtifact(artifactId);
            renderArtifactsPage(); // Refresh the list
          },
        );
      }
      return;
    }

    // Handle artifact item clicks (for viewing)
    if (
      e.target.closest(".artifact-item") &&
      !e.target.closest(".artifact-menu-container")
    ) {
      const artifactItem = e.target.closest(".artifact-item");
      const artifactId = artifactItem.dataset.artifactId;
      const artifact = codeArtifacts.find((a) => a.id === artifactId);
      if (artifact) {
        showArtifactModal(artifact);
      }
      return;
    }

    // Legacy artifact action buttons (fallback for old structure)
    const artifactId = e.target.dataset.artifactId;
    if (!artifactId) return;

    const artifact = codeArtifacts.find((a) => a.id === artifactId);
    if (!artifact) return;

    if (e.target.classList.contains("copy-artifact-btn")) {
      navigator.clipboard
        .writeText(artifact.code)
        .then(() => {
          // Visual feedback for copy
          const btn = e.target;
          const originalText = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = originalText;
          }, 1000);
        })
        .catch((err) => {
          log("ARTIFACTS", 3, "copyToClipboard", "Failed to copy", {
            error: err.message,
          });
        });
    }

    if (e.target.classList.contains("view-artifact-btn")) {
      showArtifactModal(artifact);
    }

    if (e.target.classList.contains("delete-artifact-btn")) {
      showConfirmationModal(
        "Delete Artifact",
        `Are you sure you want to delete "${artifact.title}"?`,
        () => {
          deleteArtifact(artifactId);
          renderArtifactsPage(); // Refresh the list
        },
      );
    }
  });

  // Artifact page hover management (like chats page)
  const artifactsPage = document.getElementById("artifacts-page");
  if (artifactsPage) {
    artifactsPage.addEventListener(
      "mouseenter",
      (e) => {
        if (e.target.closest(".artifact-item")) {
          const artifactItem = e.target.closest(".artifact-item");
          const dropdown = artifactItem.querySelector(
            ".artifact-menu-dropdown.persistent-open",
          );
          const menuButton = artifactItem.querySelector(".artifact-menu-btn");
          if (dropdown && menuButton) {
            menuButton.classList.add("persistent-active");
          }
        }
      },
      true,
    );

    artifactsPage.addEventListener(
      "mouseleave",
      (e) => {
        // Check if we're actually leaving the artifacts page
        const artifactsPageRect = artifactsPage.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        const isLeavingPage =
          mouseX < artifactsPageRect.left ||
          mouseX > artifactsPageRect.right ||
          mouseY < artifactsPageRect.top ||
          mouseY > artifactsPageRect.bottom;

        if (isLeavingPage) {
          const artifactItems =
            artifactsPage.querySelectorAll(".artifact-item");
          artifactItems.forEach((artifactItem) => {
            const dropdown = artifactItem.querySelector(
              ".artifact-menu-dropdown.persistent-open",
            );
            const menuButton = artifactItem.querySelector(".artifact-menu-btn");
            if (dropdown && menuButton) {
              // Only close if not hovering over menu area
              if (
                !menuButton.matches(":hover") &&
                !dropdown.matches(":hover")
              ) {
                dropdown.classList.remove("persistent-open");
                menuButton.classList.remove("persistent-active");
              }
            }
          });
        }
      },
      true,
    );
  }

  // Close artifact menus when clicking outside
  document.addEventListener("click", (e) => {
    // Close account menu dropdown when clicking outside
    if (!e.target.closest(".account-menu-container")) {
      document
        .querySelectorAll(".account-menu-dropdown.persistent-open")
        .forEach((menu) => {
          menu.classList.remove("persistent-open");
          const menuButton =
            menu.parentElement.querySelector(".account-menu-btn");
          if (menuButton) menuButton.classList.remove("persistent-active");
        });
    }

    if (!e.target.closest(".artifact-menu-container")) {
      document
        .querySelectorAll(".artifact-menu-dropdown.persistent-open")
        .forEach((menu) => {
          menu.classList.remove("persistent-open");
          const menuButton =
            menu.parentElement.querySelector(".artifact-menu-btn");
          if (menuButton) menuButton.classList.remove("persistent-active");
        });
    }
  });
}

function filterArtifacts(searchTerm) {
  const artifactItems = document.querySelectorAll(".artifact-item");
  const term = searchTerm.toLowerCase();

  artifactItems.forEach((item) => {
    const title = item
      .querySelector(".artifact-title")
      .textContent.toLowerCase();
    const code = item
      .querySelector(".artifact-preview code")
      .textContent.toLowerCase();
    const language = item
      .querySelector(".artifact-language")
      .textContent.toLowerCase();
    const matches =
      title.includes(term) || code.includes(term) || language.includes(term);
    item.style.display = matches ? "block" : "none";
  });
}

function showArtifactModal(artifact) {
  log("MODAL", 2, "showArtifactModal", "Opening artifact modal", {
    artifactId: artifact.id,
    title: artifact.title,
    sessionId: artifact.sessionId,
    messageIndex: artifact.messageIndex,
    hasSessionId: !!artifact.sessionId,
  });

  const highlightedCode = createHighlightedCode(
    artifact.code,
    artifact.language,
  );

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-card" style="min-width: 50vw; max-width: 90vw; max-height: 90vh;">
      <div class="modal-header">
        <h2>${escapeHtml(artifact.title)}</h2>
        <button class="close-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
        </button>
        </div>
        <div class="modal-body">
        ${highlightedCode}
        <div class="artifact-view-actions"">
          <button class="artifact-btn copy-full-code-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
            Copy All
          </button>
          ${artifact.sessionId ? `<button class="artifact-btn view-in-chat-btn" data-session-id="${artifact.sessionId}" data-message-index="${artifact.messageIndex || ""}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            View in Chat
          </button>` : ""}
        </div>
        
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add smooth fade-in animation
  requestAnimationFrame(() => {
    modal.style.opacity = "0";
    modal.style.animation = "fadeIn 0.3s ease-out forwards";
  });

  // Close modal function with animation
  const closeModal = () => {
    modal.style.animation = "fadeOut 0.2s ease-in forwards";
    setTimeout(() => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    }, 200);
  };

  // Close modal events
  modal.addEventListener("click", (e) => {
    if (
      e.target.classList.contains("modal-overlay") ||
      e.target.classList.contains("close-btn") ||
      e.target.closest(".close-btn")
    ) {
      closeModal();
    }
  });

  // Copy button in modal
  modal.querySelector(".copy-full-code-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(artifact.code).then(() => {
      const btn = modal.querySelector(".copy-full-code-btn");
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="check-icon">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Copied!
      `;
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 1000);
    });
  });

  // View in Chat button in modal
  const viewInChatBtn = modal.querySelector(".view-in-chat-btn");
  if (viewInChatBtn) {
    viewInChatBtn.addEventListener("click", () => {
      const sessionId = viewInChatBtn.getAttribute("data-session-id");
      const messageIndex = parseInt(
        viewInChatBtn.getAttribute("data-message-index"),
      );

      if (!sessionId) {
        console.log("This artifact is not linked to a chat session.");
        return;
      }

      log("UI", 1, "viewInChatBtn", "Navigating to source chat", {
        sessionId,
        messageIndex,
      });

      // Close the modal first
      closeModal();

      // Navigate to chat session
      viewInChatFromArtifact(sessionId, messageIndex, artifact.id);
    });
  }
}

// Cached scroller reference to avoid repeated DOM queries
let _cachedScroller = null;

function getChatScroller() {
  if (!_cachedScroller || !document.contains(_cachedScroller)) {
    _cachedScroller = document.querySelector(".chat-log-container");
  }
  return _cachedScroller;
}

function invalidateScrollerCache() {
  _cachedScroller = null;
}

// Hover State Preservation Functions
function preserveHoverStates(containerElement) {
  if (!containerElement) return;
  
  const preservedStates = [];
  
  // Use activeHoverElements Set to find currently hovered elements
  // :hover pseudo-selector doesn't work with querySelectorAll
  activeHoverElements.forEach(element => {
    // Check if this element is still in the container
    if (containerElement.contains(element)) {
      const codeContent = element.querySelector('pre code')?.textContent || '';
      const language = element.querySelector('.language-name')?.textContent || '';
      const allCodeBlocks = containerElement.querySelectorAll('.code-block-container');
      const elementIndex = Array.from(allCodeBlocks).indexOf(element);
      
      preservedStates.push({
        index: elementIndex,
        identifier: `${language}-${codeContent.substring(0, 50)}`,
        wasHovered: true
      });
    }
  });
  
  // Store in WeakMap for this container
  if (preservedStates.length > 0) {
    hoverStates.set(containerElement, preservedStates);
    log(`preserveHoverStates(). Preserved ${preservedStates.length} hover states`, 'HOVER', 'DEBUG');
  }
}

function restoreHoverStates(containerElement, preservedStates) {
  if (!containerElement || !preservedStates.length) return;
  
  let restoredCount = 0;
  log(`restoreHoverStates(). Attempting to restore ${preservedStates.length} states`, 'HOVER', 'DEBUG');
  
  preservedStates.forEach((state, stateIndex) => {
    if (state.wasHovered) {
      const codeBlocks = containerElement.querySelectorAll('.code-block-container');
      log(`restoreHoverStates(). Found ${codeBlocks.length} code blocks, looking for state: "${state.identifier}"`, 'HOVER', 'DEBUG');
      
      codeBlocks.forEach((block, blockIndex) => {
        const language = block.querySelector('.language-name')?.textContent || '';
        const codeContent = block.querySelector('pre code')?.textContent || '';
        const blockIdentifier = `${language}-${codeContent.substring(0, 50)}`;
        
        // Use both content matching and position-based fallback
        const isMatch = blockIdentifier === state.identifier || 
                       (blockIndex === state.index && language && state.identifier.startsWith(language));
        
        if (isMatch) {
          // Force hover state by adding a persistent class
          block.classList.add('force-hover-state');
          activeHoverElements.add(block);
          restoredCount++;
          
          log(`restoreHoverStates(). MATCHED and restored block ${blockIndex}: "${blockIdentifier}"`, 'HOVER', 'DEBUG');
          
          // Auto-remove the forced hover after a very short time during streaming
          setTimeout(() => {
            if (block.classList.contains('force-hover-state')) {
              block.classList.remove('force-hover-state');
              activeHoverElements.delete(block);
            }
          }, 300); // Very short timeout for streaming scenarios
        } else {
          log(`restoreHoverStates(). NO MATCH block ${blockIndex}: "${blockIdentifier}" vs "${state.identifier}"`, 'HOVER', 'TRACE');
        }
      });
    }
  });
  
  // Always log the result
  log(`restoreHoverStates(). Restored ${restoredCount} out of ${preservedStates.length} hover states`, 'HOVER', 'DEBUG');
}


function setupHoverStateManagement() {
  // Global mouse tracking for better hover state detection
  let lastHoveredCodeBlock = null;
  
  document.addEventListener('mouseover', (e) => {
    const codeBlock = e.target.closest('.code-block-container');
    if (codeBlock) {
      lastHoveredCodeBlock = codeBlock;
      activeHoverElements.add(codeBlock);
    }
  });
  
  document.addEventListener('mouseout', (e) => {
    const codeBlock = e.target.closest('.code-block-container');
    if (codeBlock && !codeBlock.contains(e.relatedTarget)) {
      activeHoverElements.delete(codeBlock);
      lastHoveredCodeBlock = null;
    }
  });
  
  // Store reference for use in streaming updates
  window._lastHoveredCodeBlock = () => lastHoveredCodeBlock;
}

function renderAllMessagesForNavigation(session) {
  log(
    "NAVIGATION",
    1,
    "renderAllMessagesForNavigation",
    "Force loading all messages for navigation",
    {
      totalMessages: session.messages?.length,
    },
  );

  clearLog();
  if (!session || !session.messages) return;

  // Render all messages without lazy loading
  for (let i = 0; i < session.messages.length; i++) {
    const messageData = session.messages[i];
    if (!Array.isArray(messageData)) continue;

    const [role, content, metadata] = messageData;
    const isPlaceholder =
      role === "ai" && content === "" && i === session.messages.length - 1;

    const node = addMessage(role, content, {
      final: !isPlaceholder,
      index: i,
      metadata: metadata || {},
    });

    if (node) {
      node.dataset.index = String(i);
      node.dataset.lazyLoaded = "false";
    }

    if (role === "ai" && !isPlaceholder) {
      hydrateThinkingIfAny(node, session, i);
      renderMathInElement(node);
    }

    // Setup expand/collapse for user messages in navigation
    if (role === "user" && node) {
      // Only setup if not already done
      const expandBtn = node.querySelector(".message-expand-btn");
      if (expandBtn && !expandBtn.dataset.setupComplete) {
        setTimeout(() => setupUserMessageExpandCollapse(node), 0);
      }
    }
  }

  log(
    "NAVIGATION",
    1,
    "renderAllMessagesForNavigation",
    "All messages loaded for navigation",
  );
}

async function findArtifactByCode(codeContent, language) {
  try {
    const artifacts = await loadAllArtifacts();
    return artifacts.find(
      (artifact) =>
        artifact.code === codeContent && artifact.language === language,
    );
  } catch (error) {
    log("ARTIFACTS", 4, "findArtifactByCode", "Error checking artifact", {
      error: error.message,
    });
    return null;
  }
}

function viewInChatFromArtifact(sessionId, messageIndex, artifactId = null) {
  log(
    "NAVIGATION",
    1,
    "viewInChatFromArtifact",
    "Starting navigation to source chat",
    { sessionId, messageIndex, artifactId },
  );

  // Find the session in chat data
  const targetSession = state.sessions.find(
    (session) => session.id === sessionId,
  );
  if (!targetSession) {
    log("NAVIGATION", 4, "viewInChatFromArtifact", "Session not found", {
      sessionId,
    });
    return;
  }

  // Set flag to prevent auto-scroll to bottom
  window._preventAutoScrollToBottom = true;

  // Disable lazy loading for this navigation to ensure all messages are loaded
  const originalLazyState = targetSession._lazyState;
  targetSession._lazyState = null;

  setCurrent(targetSession);
  renderSessions();
  updateChatHeader();

  renderAllMessagesForNavigation(targetSession);

  // Ensure artifact IDs are updated before scrolling
  setTimeout(async () => {
    // Update code blocks with artifact info FIRST
    await updateCodeBlocksWithArtifactInfo();
    
    window._preventAutoScrollToBottom = false;

    if (artifactId) {
      const targetCodeBlock = document.querySelector(
        `[data-artifact-id="${artifactId}"]`
      );

      log("NAVIGATION", 1, "viewInChatFromArtifact", "Searching for artifact code block", {
        artifactId,
        found: !!targetCodeBlock,
        allArtifactElements: document.querySelectorAll('[data-artifact-id]').length
      });

      if (targetCodeBlock) {
        const codeBlockContainer = targetCodeBlock.closest('.code-block-container');
        
        if (codeBlockContainer) {
          // Use scrollIntoView - it works with column-reverse!
          codeBlockContainer.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest"
          });

          const preElement = codeBlockContainer.querySelector('.code-block-header');

          if (preElement) {
            setTimeout(() => {
              const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                  if (entry.isIntersecting) {
                    let breatheCount = 0;
                    const maxBreathes = 3;
                    
                    const breatheAnimation = () => {
                      if (breatheCount >= maxBreathes) return;
                      
                      preElement.style.transition = 'background-color 0.8s ease-in-out';
                      
                      // Breathe in (highlight)
                      preElement.style.backgroundColor = 'var(--border-light)';
                      
                      setTimeout(() => {
                        // Breathe out (fade)
                        preElement.style.backgroundColor = '';
                        breatheCount++;
                        
                        // Schedule next breathe if not finished
                        if (breatheCount < maxBreathes) {
                          setTimeout(breatheAnimation, 600); // Gap between breathes
                        } else {
                          // Clean up after final breathe
                          setTimeout(() => {
                            preElement.style.transition = '';
                          }, 800);
                        }
                      }, 1200); // Hold the highlight
                    };
                    
                    breatheAnimation();
                    observer.disconnect();
                  }
                });
              }, { threshold: 1 });

              observer.observe(preElement);
            }, 1000);
          }

          return;
        }
      }
    }

    const targetCodeBlock = document.querySelector(
        `[data-artifact-id="${artifactId}"]`
      );

    // Fallback: scroll to message if artifactId not found or not provided
    if (messageIndex !== null && messageIndex >= 0 && !targetCodeBlock) {
      const messages = document.querySelectorAll(".message");
      const targetMessage = Array.from(messages).find(
        (msg) =>
          parseInt(msg.getAttribute("data-message-index")) === messageIndex,
      );

      if (targetMessage) {
        log(
          "NAVIGATION",
          2,
          "viewInChatFromArtifact",
          "Found target message, scrolling (column-reverse)",
          { messageIndex },
        );

        // Column-reverse scroll: Use custom scroll logic
        const scroller = getChatScroller();
        if (scroller) {
          // Calculate scroll position for column-reverse
          const containerRect = scroller.getBoundingClientRect();
          const messageRect = targetMessage.getBoundingClientRect();
          
          // In column-reverse: scrollTop increases as we scroll UP
          // We want to center the message in viewport
          const currentScrollTop = scroller.scrollTop;
          const messageBottomOffset = containerRect.bottom - messageRect.bottom;
          const messageTopOffset = containerRect.bottom - messageRect.top;
          const viewportHeight = containerRect.height;
          const messageHeight = messageRect.height;
          
          // Target: center the message
          const targetScrollTop = currentScrollTop + messageBottomOffset - (viewportHeight / 2) + (messageHeight / 2);
          
          // Smooth scroll
          scroller.scrollTo({
            top: targetScrollTop,
            behavior: "smooth"
          });
        }

        // Highlight all code blocks in the message briefly if no specific artifact
        if (!artifactId) {
          const codeBlocks = targetMessage.querySelectorAll(
            ".code-block-container",
          );
          codeBlocks.forEach((block) => {
            block.style.transition = "box-shadow 0.3s ease";
            block.style.boxShadow =
              "0 0 0 2px var(--accent), 0 0 20px var(--accent)";

            setTimeout(() => {
              block.style.boxShadow = "";
            }, 2000);
          });
        }
      } else {
        log(
          "NAVIGATION",
          3,
          "viewInChatFromArtifact",
          "Target message not found",
          { messageIndex, totalMessages: messages.length },
        );
      }
    }
  }, 300); // Increased timeout to allow full rendering

  log("NAVIGATION", 1, "viewInChatFromArtifact", "Navigation completed", {
    sessionId,
    messageIndex,
    artifactId,
  });
}

// ========================================
// PROJECTS PAGE FUNCTIONALITY
// ========================================

// Projects state management
function showProjectsPage() { return showProjectsPageImpl(); }
function showProjectsListView() { return showProjectsListViewImpl(); }
function showProjectDetailView(project) { return showProjectDetailViewImpl(project); }
function renderProjectsPage() { return renderProjectsPageImpl(); }
function createProjectListItem(project) { return createProjectListItemImpl(project); }
function renderProjectSessions(project) { return renderProjectSessionsImpl(project); }
function renderProjectInstructions(project) { return renderProjectInstructionsImpl(project); }
function renderProjectFiles(project) { return renderProjectFilesImpl(project); }
function setupProjectsPageListeners() { return setupProjectsPageListenersImpl(); }
async function showCreateProjectModal() { return showCreateProjectModalImpl(); }
async function createNewProject(name, description = "") { return createNewProjectImpl(name, description); }
async function saveProjectsData() { return saveProjectsDataImpl(); }
async function loadProjectsData() { return loadProjectsDataImpl(); }
async function toggleProjectFavorite(project) { return toggleProjectFavoriteImpl(project); }
function updateProjectStarButton() { return updateProjectStarButtonImpl(); }
async function handleProjectSend() { return handleProjectSendImpl(); }
async function handleProjectFileUpload() { return handleProjectFileUploadImpl(); }
async function deleteProjectFile(index) { return deleteProjectFileImpl(index); }
async function viewProjectFile(index) { return viewProjectFileImpl(index); }
function startProjectRename(project) { return startProjectRenameImpl(project); }
function startProjectDetailRename(project) { return startProjectDetailRenameImpl(project); }
function showDeleteProjectConfirmation(project) { return showDeleteProjectConfirmationImpl(project); }
async function deleteProject(project) { return deleteProjectImpl(project); }
async function addInstruction(title, content) { return addInstructionImpl(title, content); }
async function viewInstruction(index) { return viewInstructionImpl(index); }
async function updateInstruction(index, title, content) { return updateInstructionImpl(index, title, content); }
async function deleteInstruction() { return deleteInstructionImpl(); }
function renderProjectMessageFiles() { return projectsController.renderProjectMessageFiles(); }
function handleSidebarToggle() {
  const toggleBtn = $("#toggle-sidebar");
  const openedBtn = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="shrink-0 group-hover:scale-80 transition scale-100 text-text-300" aria-hidden="true"><path d="M16.5 4C17.3284 4 18 4.67157 18 5.5V14.5C18 15.3284 17.3284 16 16.5 16H3.5C2.67157 16 2 15.3284 2 14.5V5.5C2 4.67157 2.67157 4 3.5 4H16.5ZM7 15H16.5C16.7761 15 17 14.7761 17 14.5V5.5C17 5.22386 16.7761 5 16.5 5H7V15ZM3.5 5C3.22386 5 3 5.22386 3 5.5V14.5C3 14.7761 3.22386 15 3.5 15H6V5H3.5Z"></path></svg>`;
  const closedBtn = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="shrink-0 !opacity-100 !scale-100 opacity-0 scale-75 absolute inset-0 group-hover:scale-100 group-hover:opacity-100 transition-all text-text-200" aria-hidden="true"><path d="M3.5 3C3.77614 3 4 3.22386 4 3.5V16.5L3.99023 16.6006C3.94371 16.8286 3.74171 17 3.5 17C3.25829 17 3.05629 16.8286 3.00977 16.6006L3 16.5V3.5C3 3.22386 3.22386 3 3.5 3ZM11.2471 5.06836C11.4476 4.95058 11.7104 4.98547 11.8721 5.16504C12.0338 5.34471 12.0407 5.60979 11.9023 5.79688L11.835 5.87207L7.80371 9.5H16.5C16.7761 9.5 17 9.72386 17 10C17 10.2761 16.7761 10.5 16.5 10.5H7.80371L11.835 14.1279C12.0402 14.3127 12.0568 14.6297 11.8721 14.835C11.6873 15.0402 11.3703 15.0568 11.165 14.8721L6.16504 10.3721L6.09473 10.2939C6.03333 10.2093 6 10.1063 6 10C6 9.85828 6.05972 9.72275 6.16504 9.62793L11.165 5.12793L11.2471 5.06836Z"></path></svg>`;

  if (window.innerWidth <= 768) {
    const sidebar = $("#sidebar");
    const isOpening = !sidebar.classList.contains("open");

    if (isOpening) {
      // Create or get backdrop
      let backdrop = document.getElementById("mobile-sidebar-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "mobile-sidebar-backdrop";
        backdrop.className = "mobile-sidebar-backdrop";
        document.body.appendChild(backdrop);
      }

      // Show sidebar and backdrop
      sidebar.classList.add("open");
      backdrop.classList.add("active");

      // Add slight delay to content animation
      setTimeout(() => {
        sidebar.classList.add("content-visible");
      }, 100);

      // Setup event handlers
      const closeOnBackdrop = () => closeMobileSidebar();
      const closeOnEscape = (e) => {
        if (e.key === "Escape") closeMobileSidebar();
      };

      backdrop.addEventListener("click", closeOnBackdrop);
      document.addEventListener("keydown", closeOnEscape);

      // Store handlers for cleanup
      sidebar._closeOnBackdrop = closeOnBackdrop;
      sidebar._closeOnEscape = closeOnEscape;
      sidebar._backdrop = backdrop;
    } else {
      closeMobileSidebar();
    }
  } else {
    collapsed = !collapsed;
    const logo = $("#little-icon");

    if (!collapsed) {
      setTimeout(() => {
        logo.style.opacity = "1";
        document.querySelectorAll(".disappearing").forEach((btn) => {
          const span = btn.querySelector("span");
          span.style.opacity = "1";
        });
      }, 0);
      document.querySelectorAll(".disappearing").forEach((btn) => {
        const span = btn.querySelector("span");
        span.style.display = "flex";
      });
      logo.style.display = "flex";
      toggleBtn.innerHTML = closedBtn;
    } else if (collapsed) {
      logo.style.opacity = "0";
      document.querySelectorAll(".disappearing").forEach((btn) => {
        const span = btn.querySelector("span");
        span.style.opacity = "0";
        setTimeout(() => {
          span.style.display = "none";
        }, 0);
      });
      setTimeout(() => {
        logo.style.display = "none";
      }, 0);
      toggleBtn.innerHTML = openedBtn;
    }
    $("#app").classList.toggle("sidebar-collapsed", collapsed);
  }
}

function setupResponsiveHandlers() {
  let isMobile = window.innerWidth <= 768;
  let desktopCollapsedState = collapsed; // Track desktop sidebar state
  
  window.addEventListener("resize", () => {
    const stillMobile = window.innerWidth <= 768;
    
    if (isMobile !== stillMobile) {
      isMobile = stillMobile;
      const sidebar = $("#sidebar");
      const toggleBtn = $("#toggle-sidebar");
      const logo = $("#little-icon");
      
      if (!stillMobile) {
        // Switching to DESKTOP - restore previous desktop state
        log("UI", 2, "setupResponsiveHandlers", "Switch to desktop size");
        
        // Close mobile sidebar properly
        closeMobileSidebar();
        
        // Restore desktop sidebar state
        collapsed = desktopCollapsedState;
        $("#app").classList.toggle("sidebar-collapsed", collapsed);
        
        const openedBtn = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="shrink-0 group-hover:scale-80 transition scale-100 text-text-300" aria-hidden="true"><path d="M16.5 4C17.3284 4 18 4.67157 18 5.5V14.5C18 15.3284 17.3284 16 16.5 16H3.5C2.67157 16 2 15.3284 2 14.5V5.5C2 4.67157 2.67157 4 3.5 4H16.5ZM7 15H16.5C16.7761 15 17 14.7761 17 14.5V5.5C17 5.22386 16.7761 5 16.5 5H7V15ZM3.5 5C3.22386 5 3 5.22386 3 5.5V14.5C3 14.7761 3.22386 15 3.5 15H6V5H3.5Z"></path></svg>`;
        const closedBtn = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="shrink-0 !opacity-100 !scale-100 opacity-0 scale-75 absolute inset-0 group-hover:scale-100 group-hover:opacity-100 transition-all text-text-200" aria-hidden="true"><path d="M3.5 3C3.77614 3 4 3.22386 4 3.5V16.5L3.99023 16.6006C3.94371 16.8286 3.74171 17 3.5 17C3.25829 17 3.05629 16.8286 3.00977 16.6006L3 16.5V3.5C3 3.22386 3.22386 3 3.5 3ZM11.2471 5.06836C11.4476 4.95058 11.7104 4.98547 11.8721 5.16504C12.0338 5.34471 12.0407 5.60979 11.9023 5.79688L11.835 5.87207L7.80371 9.5H16.5C16.7761 9.5 17 9.72386 17 10C17 10.2761 16.7761 10.5 16.5 10.5H7.80371L11.835 14.1279C12.0402 14.3127 12.0568 14.6297 11.8721 14.835C11.6873 15.0402 11.3703 15.0568 11.165 14.8721L6.16504 10.3721L6.09473 10.2939C6.03333 10.2093 6 10.1063 6 10C6 9.85828 6.05972 9.72275 6.16504 9.62793L11.165 5.12793L11.2471 5.06836Z"></path></svg>`;
        
        if (collapsed) {
          // Was collapsed before mobile
          logo.style.display = "none";
          logo.style.opacity = "0";
          document.querySelectorAll(".disappearing").forEach((btn) => {
            const span = btn.querySelector("span");
            span.style.display = "none";
            span.style.opacity = "0";
          });
          toggleBtn.innerHTML = openedBtn;
        } else {
          // Was expanded before mobile
          logo.style.display = "flex";
          setTimeout(() => {
            logo.style.opacity = "1";
          }, 0);
          document.querySelectorAll(".disappearing").forEach((btn) => {
            const span = btn.querySelector("span");
            span.style.display = "flex";
            setTimeout(() => {
              span.style.opacity = "1";
            }, 0);
          });
          toggleBtn.innerHTML = closedBtn;
        }
        
      } else {
        // Switching to MOBILE - save current desktop state
        desktopCollapsedState = collapsed; // Save before switching
        log("UI", 2, "setupResponsiveHandlers", "Switch to mobile size");
        
        // Make sure mobile sidebar starts closed
        sidebar.classList.remove("open", "content-visible");
        $("#app").classList.remove("sidebar-collapsed");
        
        // Reset all elements to visible for mobile (in case desktop was collapsed)
        logo.style.display = "flex";
        logo.style.opacity = "1";
        
        document.querySelectorAll(".disappearing").forEach((btn) => {
          const span = btn.querySelector("span");
          span.style.display = "flex";
          span.style.opacity = "1";
        });
        
        // Remove any existing backdrop
        const backdrop = document.getElementById("mobile-sidebar-backdrop");
        if (backdrop) {
          backdrop.classList.remove("active");
        }
      }
    }
  });
}

function initialModelSwitch() {
  const conf = state?.settings?.models;
  if (!conf?.active?.platform || !conf?.active?.model) {
    return false;
  }

  ["welcome", "chat"].forEach((screen) => {
    const activeProvider = conf.active.platform;
    const models = normalizeProviderModels(
      conf.providers[activeProvider]?.models || [],
    );
    const modelBtn = document.querySelector(`#btn-model-switch-${screen}`);

    models.forEach((model) => {
      if (model.id === conf.active.model) {
        const p = modelBtn?.querySelector("p");
        if (p) p.textContent = model.label || model.id;
      }
    });
  });

  return true;
}

// App Lifecycle
function initWithRetry(maxRetry = 20, interval = 100) {
  let attempt = 0;
  const timer = setInterval(() => {
    if (initialModelSwitch() || attempt >= maxRetry) {
      clearInterval(timer);
    }
    attempt++;
  }, interval);
}

// Search overlay functionality for current session
let searchOverlay = null;
let searchMatches = [];
let currentMatchIndex = -1;
let searchInput = null;
let searchResults = null;
let searchDebounceTimer = null;
const handleSearchPrevClick = () => navigateSearch(-1);
const handleSearchNextClick = () => navigateSearch(1);
const handleSearchCloseClick = () => hideSearchOverlay();

function showSearchOverlay() {
  log("SEARCH", 2, "showSearchOverlay", "Showing search overlay");
  
  if (searchOverlay) {
    searchOverlay.style.display = 'block';
    // Trigger slide down animation
    searchOverlay.classList.remove('sc-slide-out');
    searchOverlay.classList.add('sc-slide-in');
    
    // Always re-query the input element in case DOM was modified
    searchInput = document.getElementById('search-input');
    searchResults = document.getElementById('sc-search-results');
    if (searchInput) {
      // Re-attach event listeners when reusing overlay
      attachSearchEventListeners();
      searchInput.focus();
      if (searchInput.value.trim()) {
        performSearch();
      }
    }
    return;
  }

  // Create search overlay
  searchOverlay = document.createElement('div');
  searchOverlay.id = 'search-overlay';
  searchOverlay.className = 'sc-slide-in';
  searchOverlay.innerHTML = `
    <div class="sc-search-container">
      <svg class="sc-search-icon" viewBox="0 0 24 24" width="16" height="16">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>
      <div class="sc-search-input-wrapper">
        <input type="text" id="search-input" placeholder="Search in current session..." maxlength="100" />
      </div>
      <div class="sc-search-controls">
        <button id="search-prev" class="sc-nav-btn" title="Previous">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button id="search-next" class="sc-nav-btn" title="Next">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <span id="search-results" class="sc-results-count">0/0</span>
        <button id="search-close" class="sc-close-btn" title="Close">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // Add enhanced styles with animations
  const style = document.createElement('style');
  style.textContent = `
    #search-overlay {
      position: fixed;
      top: 51px;
      right: 20px;
      z-index: 10000;
      padding: 2px;
      background: var(--bg-secondary);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08);
      min-width: 320px;
      transform-origin: top right;
      align-items: center;
    }

    /* Slide animations */
    @keyframes sc-slideDown {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes sc-slideUp {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
    }

    #search-overlay.sc-slide-in {
      animation: sc-slideDown 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    #search-overlay.sc-slide-out {
      animation: sc-slideUp 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    }

    #search-overlay .sc-search-container {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      position: relative;
    }

    .sc-search-input-wrapper {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
    }

    .sc-search-icon {
      position: absolute;
      left: 12px;
      color: var(--icon);
      z-index: 1;
      pointer-events: none;
    }

    #search-input {
      flex: 1;
      padding: 8px 12px 8px 40px;
      border: 1.5px solid transparent;
      border-radius: 8px;
      background: var(--bg);
      color: var(--fg);
      font-size: 14px;
      font-weight: 400;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
    }

    #search-input:focus {
      border-color: var(--border-light);
    }

    .sc-search-controls {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .sc-nav-btn, .sc-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--icon);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      min-width: 32px;
      height: 32px;
    }

    .sc-nav-btn:hover, .sc-close-btn:hover {
      color: var(--fg);
      transform: translateY(-1px);
    }

    .sc-nav-btn:active, .sc-close-btn:active {
      transform: translateY(0);
    }

    .sc-close-btn {
      background: transparent;
    }

    .sc-results-count {
      font-size: 12px;
      font-weight: 500;
      color: #6b7280;
      min-width: 45px;
      text-align: center;
      letter-spacing: 0.02em;
    }

    /* Responsive design */
    @media (max-width: 480px) {
      #search-overlay {
        left: 10px;
        right: 10px;
        min-width: unset; 
        max-width: unset;
      }
      
      .sc-search-controls {
        gap: 2px;
      }
      
      .sc-nav-btn, .sc-close-btn {
        min-width: 28px;
        height: 28px;
        padding: 6px;
      }
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(searchOverlay);

  searchInput = document.getElementById('search-input');
  searchResults = document.getElementById('search-results');

  // Attach event listeners for new overlay
  attachSearchEventListeners();

  // Focus input after animation
  setTimeout(() => searchInput.focus(), 100);
}

function attachSearchEventListeners() {
  if (!searchInput) return;

  // Remove existing event listeners to prevent duplicates
  searchInput.removeEventListener('input', handleSearchInput);
  searchInput.removeEventListener('keydown', handleSearchKeydown);

  // Event listeners
  searchInput.addEventListener('input', handleSearchInput);
  searchInput.addEventListener('keydown', handleSearchKeydown);

  const prevButton = document.getElementById('search-prev');
  const nextButton = document.getElementById('search-next');
  const closeButton = document.getElementById('search-close');

  if (prevButton) {
    prevButton.removeEventListener('click', handleSearchPrevClick);
    prevButton.addEventListener('click', handleSearchPrevClick);
  }

  if (nextButton) {
    nextButton.removeEventListener('click', handleSearchNextClick);
    nextButton.addEventListener('click', handleSearchNextClick);
  }

  if (closeButton) {
    closeButton.removeEventListener('click', handleSearchCloseClick);
    closeButton.addEventListener('click', handleSearchCloseClick);
  }
}

function handleSearchInput(e) {
  debouncedPerformSearch();
}

function handleSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      navigateSearch(-1);
    } else {
      navigateSearch(1);
    }
  } else if (e.key === 'Escape') {
    hideSearchOverlay();
  }
}

function debouncedPerformSearch() {
  if (!searchInput) return;
  // Clear existing timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  // Set new timer with 100ms debounce for better responsiveness
  searchDebounceTimer = setTimeout(() => {
    performSearch();
  }, 100);
}

function hideSearchOverlay() {
  if (searchOverlay) {
    searchOverlay.classList.remove('slide-out');
    searchOverlay.classList.add('slide-in');
    clearSearchHighlights();
    
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    setTimeout(() => {
      if (searchOverlay) {
        searchOverlay.style.display = 'none';
      }
    }, 200);
  }
}

// Global search state
let currentSearchId = 0;

function performSearch() {
  if (!searchInput) return;

  const query = searchInput.value.trim().toLowerCase();
  const searchId = ++currentSearchId; // Increment and get new search ID

  if (!query) {
    clearSearchHighlights();
    updateSearchResults(0, 0);
    return;
  }

  const chatContainer = getChatScroller();
  if (!chatContainer) {
    log("SEARCH", 3, "performSearch", "Chat container not found");
    return;
  }

  // Clear previous highlights and merge any split text nodes from earlier searches
  clearSearchHighlights();

  const messageElements = Array.from(chatContainer.querySelectorAll('.message'));
  const maxMatches = 500;
  searchMatches = [];

  for (let messageIndex = 0; messageIndex < messageElements.length; messageIndex++) {
    const messageEl = messageElements[messageIndex];

    try {
      messageEl.normalize();
    } catch (normalizeError) {
      // Ignore normalization issues
    }

    const walker = document.createTreeWalker(
      messageEl,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent || !node.textContent.trim()) continue;

      const text = node.textContent;
      if (text.length > 500000) {
        continue;
      }

      const lowerText = text.toLowerCase();
      let startIndex = 0;
      let index;

      while ((index = lowerText.indexOf(query, startIndex)) !== -1) {
        searchMatches.push({
          node,
          start: index,
          end: index + query.length,
          messageIndex,
        });

        startIndex = index + query.length;

        if (searchMatches.length >= maxMatches) {
          break;
        }
      }

      if (searchMatches.length >= maxMatches) {
        break;
      }
    }

    if (searchMatches.length >= maxMatches) {
      break;
    }
  }

  const safeDetails = {
    query,
    matchCount: searchMatches.length,
    messageCount: messageElements.length,
  };

  if (searchMatches.length === 0) {
    currentMatchIndex = -1;
    updateSearchResults(0, 0);
    return;
  }

  const matchesByNode = new Map();
  searchMatches.forEach((match) => {
    const nodeMatches = matchesByNode.get(match.node) || [];
    nodeMatches.push({ ...match });
    matchesByNode.set(match.node, nodeMatches);
  });

  let highlightedCount = 0;
  for (const [textNode, nodeMatches] of matchesByNode.entries()) {
    if (highlightedCount >= searchMatches.length) break;

    nodeMatches.sort((a, b) => a.start - b.start);

    const remainingCapacity = searchMatches.length - highlightedCount;
    const matchesToHighlight = nodeMatches.slice(0, remainingCapacity);
    const applied = highlightTextNode(textNode, matchesToHighlight, highlightedCount);
    highlightedCount += applied;
  }

  if (highlightedCount === 0) {
    searchMatches = [];
    currentMatchIndex = -1;
    updateSearchResults(0, 0);
    return;
  }

  searchMatches = Array.from({ length: highlightedCount }, (_, i) => i);

  currentMatchIndex = 0;
  updateHighlights();
  scrollToMatch(0);
  updateSearchResults(currentMatchIndex + 1, searchMatches.length);
}

function highlightTextNode(textNode, matches, startIndex = 0) {
  const parent = textNode.parentNode;

  if (!parent || !textNode.isConnected || matches.length === 0) return 0;

  let currentNode = textNode;
  let consumedUntil = 0;
  let applied = 0;
  let nextIndex = startIndex;

  matches.forEach((match) => {
    if (!currentNode || !currentNode.parentNode) {
      consumedUntil = match.end;
      return;
    }

    const startOffset = match.start - consumedUntil;
    const matchLength = match.end - match.start;

    if (startOffset < 0 || matchLength <= 0) {
      consumedUntil = match.end;
      return;
    }

    let matchNode;
    let afterNode;
    try {
      matchNode = currentNode.splitText(startOffset);
      afterNode = matchNode.splitText(matchLength);
    } catch (splitError) {
      console.warn('Failed to split text node for highlighting:', splitError);
      consumedUntil = match.end;
      currentNode = afterNode || currentNode;
      return;
    }

    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'search-text-highlight';
    highlightSpan.dataset.matchIndex = String(nextIndex);

    const matchParent = matchNode.parentNode;
    if (!matchParent) {
      consumedUntil = match.end;
      currentNode = afterNode;
      return;
    }

    matchParent.replaceChild(highlightSpan, matchNode);
    highlightSpan.appendChild(matchNode);

    applied += 1;
    currentNode = afterNode;
    consumedUntil = match.end;
    nextIndex += 1;
  });

  return applied;
}

function clearSearchHighlights() {
  const highlights = document.querySelectorAll('.search-text-highlight');
  if (highlights.length === 0) {
    searchMatches = [];
    currentMatchIndex = -1;
    return;
  }

  const parentsToNormalize = new Set();

  highlights.forEach((highlight) => {
    const parent = highlight.parentNode;
    if (!parent) return;

    try {
      const textNode = document.createTextNode(highlight.textContent || '');
      parent.replaceChild(textNode, highlight);
      parentsToNormalize.add(parent);
    } catch (replaceError) {
      try {
        parent.removeChild(highlight);
      } catch (removeError) {
        // Ignore removal errors
      }
    }
  });

  parentsToNormalize.forEach((parent) => {
    try {
      parent.normalize();
    } catch (normalizeError) {
      // Ignore normalization issues
    }
  });

  searchMatches = [];
  currentMatchIndex = -1;
}

function navigateSearch(direction) {
  if (searchMatches.length === 0) return;

  currentMatchIndex += direction;
  if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;
  if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;

  updateHighlights();
  scrollToMatch(currentMatchIndex);
  updateSearchResults(currentMatchIndex + 1, searchMatches.length);
}

function updateHighlights() {
  document.querySelectorAll('.search-text-highlight').forEach((highlight) => {
    const matchIndex = Number(highlight.dataset.matchIndex);
    if (matchIndex === currentMatchIndex) {
      highlight.className = 'search-text-highlight current-match';
    } else {
      highlight.className = 'search-text-highlight';
    }
  });
}

function scrollToMatch(index) {
  const highlight = document.querySelector(`.search-text-highlight[data-match-index="${index}"]`);
  if (highlight) {
    const chatContainer = getChatScroller();
    if (chatContainer) {
      // Use the same column-reverse scroll logic as renderHistoryLazy
      const containerRect = chatContainer.getBoundingClientRect();
      const highlightRect = highlight.getBoundingClientRect();
      const currentScrollTop = chatContainer.scrollTop;

      // Calculate highlight position relative to container (same as renderHistoryLazy)
      const highlightTopInContainer = highlightRect.top - containerRect.top;

      // Debug logging
      log('SEARCH', 1, 'scrollToMatch', 'Debug values', {
        highlightTopInContainer,
        containerHeight: containerRect.height,
        highlightHeight: highlightRect.height,
        currentScrollTop,
        scrollHeight: chatContainer.scrollHeight,
        highlightRectTop: highlightRect.top,
        containerRectTop: containerRect.top
      });

      // In column-reverse, we need DIRECT scroll position calculation
      // Just like renderHistoryLazy: position at top + offset
      const targetScrollTop = currentScrollTop + highlightTopInContainer - 100; // 100px from top

      log('SEARCH', 1, 'scrollToMatch', 'Target calculation', {
        targetScrollTop,
        calculation: `${currentScrollTop} + ${highlightTopInContainer} - 100`
      });

      // Ensure we don't scroll beyond bounds
      // In column-reverse: scrollTop can be negative (0 = bottom, negative = scrolled up)
      const maxScrollTop = chatContainer.scrollHeight - containerRect.height;
      const minScrollTop = -(maxScrollTop); // Allow negative scroll in column-reverse
      const clampedScrollTop = Math.max(minScrollTop, Math.min(0, targetScrollTop));

      log('SEARCH', 1, 'scrollToMatch', 'Final values', {
        clampedScrollTop,
        maxScrollTop,
        minScrollTop,
        willScroll: clampedScrollTop !== currentScrollTop
      });

      chatContainer.scrollTo({
        top: clampedScrollTop,
        behavior: 'auto'  // Changed from 'smooth' to 'auto' for instant scroll
      });
    }
  }
}

function updateSearchResults(current, total) {
  if (searchResults) {
    searchResults.textContent = total > 0 ? `${current}/${total}` : '0/0';
  }
}

function setupEventListeners() {
  let projectsListenersAdded = false;
  if (!projectsListenersAdded) {
    setupProjectsPageListeners();
    projectsListenersAdded = true;
  }
  document.addEventListener("keydown", (e) => {
    // Handle Ctrl+R for smooth reload
    if (e.ctrlKey && e.key === "r") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      log(
        "UI",
        0,
        "event:keydown-CtrlR",
        "Ctrl+R pressed, triggering smooth reload",
      );
      
      // Save data before reload to prevent data loss
      (async () => {
        try {
          await save?.();
          log("SAVE", 1, "keydown-CtrlR", "Data saved before Ctrl+R reload");
        } catch (err) {
          log("SAVE", 3, "keydown-CtrlR", "Failed to save before reload", { error: err });
        }
        
        // Use setTimeout to ensure save completes first
        setTimeout(() => {
          window.__SMOOTH_RELOAD__();
        }, 50);
      })();
      
      return false;
    }

    // Handle Ctrl+F for search in current chat session
    if (e.ctrlKey && e.key === "f") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      log(
        "UI",
        0,
        "event:keydown-CtrlF",
        "Ctrl+F pressed, triggering search in current session",
      );
      // Show custom search overlay for current session
      showSearchOverlay();
      return false;
    }

    if (e.key === "Escape" || e.key === "Esc") {
      const modalsToClose = [
        "#quick-model-switch-modal",
        "#model-mgmt-modal",
        "#mini-modal",
        "#confirm-modal",
        "#confirmation-modal",
        "#search-api-modal",
        "#models-modal",
        "#settings-modal",
        "#settings-menu",
      ];
      let aModalWasClosed = false;
      modalsToClose.forEach((selector) => {
        const modal = $(selector);
        if (modal && !modal.classList.contains("hidden")) {
          closeModalWithAnimation(modal);
          aModalWasClosed = true;
        }
      });
      if (aModalWasClosed) {
        log(
          "UI",
          1,
          "event:keydown-Escape",
          "Escape key pressed, closing active modals/menus.",
        );
      }
      return;
    }

    if (e.key === "Enter") {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.id === "msg" || activeEl.id === "msg-central")
      ) {
        return;
      }

      if (e.shiftKey) {
        return;
      }

      const modalActions = {
        "#confirm-modal": "#confirm-ok",
        "#confirmation-modal": "#confirmation-confirm-btn",
        "#mini-modal": "#mini-save",
        "#search-api-modal": "#save-search-api",
        "#settings-modal": "#save-settings",
        "#models-modal": "#save-models",
      };

      let modalIsActive = false;
      let actionButton = null;

      for (const modalSelector in modalActions) {
        const modal = $(modalSelector);
        if (modal && !modal.classList.contains("hidden")) {
          modalIsActive = true;
          actionButton = $(modalActions[modalSelector]);
          break;
        }
      }

      if (modalIsActive && actionButton) {
        if (activeEl && activeEl.tagName === "TEXTAREA") {
          return;
        }

        actionButton.click();
        e.preventDefault();
        log(
          "UI",
          1,
          "event:keydown-Enter",
          `Enter key triggered action for an active modal.`,
        );
      }
    }
  });

  const chatArea = $(".chat-area");
  if (chatArea) {
    chatArea.addEventListener("click", (event) => {
      const promptButton = event.target.closest(".pli");
      if (promptButton && !event.defaultPrevented) {
        event.preventDefault();
        const text = promptButton.dataset.text || promptButton.textContent || "";
        handlePromptSuggestionClick(text, promptButton);
        return;
      }

      const saveButton = event.target.closest(".save-code-btn");
      if (saveButton) {
        // console.log("DEBUG: Save button click handled by persistent delegation."); // Removed console.log
        handleSaveButtonClick(event);
      }
    });
  }

  ["welcome", "chat", "project"].forEach((screen) => {
    const searchBtn = $(`#btn-web-search-${screen}`);
    if (searchBtn)
      searchBtn.addEventListener("click", () => {
        state.settings.webSearchEnabled = !state.settings.webSearchEnabled;
        $$('[id^="btn-web-search-"]').forEach((b) =>
          b.classList.toggle("toggled", state.settings.webSearchEnabled),
        );

        // Save to localStorage immediately for instant loading
        localStorage.setItem(
          "clustrix-web-search",
          state.settings.webSearchEnabled.toString(),
        );
        save();

        $("#web-search-switch").checked = state.settings.webSearchEnabled;
      });

    initWithRetry();
    const modelBtn = $(`#btn-model-switch-${screen}`);
    if (modelBtn)
      modelBtn.addEventListener("click", (e) =>
        openQuickModelSwitch(e, screen),
      );
  });

  document.querySelectorAll(".input-container-btn").forEach((btn) => {
    const label = btn.querySelector("p");
    if (!label || !label.textContent.includes("Upload Files")) return;

    btn.addEventListener("click", async () => {
      const context =
        btn.dataset.uploadContext ||
        (btn.closest("#project-detail-view")
          ? "project-message"
          : current
            ? "chat"
            : "welcome");

      log(
        "RENDERER",
        1,
        "upload:click",
        `Upload File button clicked (${context}).`,
      );

      try {
        const fileContents = await window.api.files.openDialogAndRead();
        if (!fileContents || fileContents.length === 0) {
          log(
            "RENDERER",
            1,
            "upload:click",
            `No files selected or dialog canceled (${context}).`,
          );
          return;
        }

        const validFiles = fileContents.filter((f) => !f.error);
        if (validFiles.length === 0) {
          log(
            "RENDERER",
            2,
            "upload:click",
            `All selected files failed to load (${context}).`,
          );
          return;
        }

        if (context === "project-message") {
          const activeProject = getCurrentProject();
          if (!activeProject) {
            log(
              "PROJECTS",
              3,
              "upload:project-message",
              "Cannot attach files without an active project.",
            );
            return;
          }

          addProjectMessageFiles(validFiles);
          renderProjectMessageFiles();

          log(
            "PROJECTS",
            1,
            "upload:project-message",
            `Added ${validFiles.length} file(s) to project message staging area.`,
            {
              projectId: activeProject.id,
              stagedCount: getProjectMessageFiles().length,
            },
          );
          return;
        }

        if (context === "welcome") {
          welcomeScreenStagedFiles.push(...validFiles);
          renderWelcomeScreenFiles();

          log(
            "RENDERER",
            1,
            "upload:welcome",
            `Added ${validFiles.length} file(s) to welcome staging area.`,
            { stagedCount: welcomeScreenStagedFiles.length },
          );
          return;
        }

        if (!current) {
          welcomeScreenStagedFiles.push(...validFiles);
          renderWelcomeScreenFiles();

          log(
            "RENDERER",
            1,
            "upload:welcome-fallback",
            `No active session, staged ${validFiles.length} file(s) for welcome screen.`,
            { stagedCount: welcomeScreenStagedFiles.length },
          );
          return;
        }

        if (!Array.isArray(current.uploadedFiles)) {
          current.uploadedFiles = [];
        }

        current.uploadedFiles.push(...validFiles);
        renderUploadedFiles();

        log(
          "RENDERER",
          1,
          "upload:chat",
          `Added ${validFiles.length} file(s) to active session.`,
          { sessionId: current.id, totalFiles: current.uploadedFiles.length },
        );
      } catch (error) {
        log(
          "RENDERER",
          4,
          "upload:click",
          `Error during file upload process (${context}).`,
          { error },
        );
      }
    });
  });

  $("#project-title-indicator").addEventListener("click", () => {
    const projectId = current.projectId;
    const project = getProjects().find(p => p.id === projectId);
    log("STATE_PROJECT", 2, "Project state information", project)
    showProjectsPage();
    setTimeout(() => {
      showProjectDetailView(project)
    }, 100);
    
  })

  $("#refresh-btn").addEventListener("click", async () => {
    log("UI", 0, "event:refresh-btn", "Refresh button clicked");
    
    // Save data before refresh to prevent data loss
    try {
      await save?.();
      log("SAVE", 1, "refresh-btn", "Data saved before refresh");
    } catch (err) {
      log("SAVE", 3, "refresh-btn", "Failed to save before refresh", { error: err });
    }
    
    window.__SMOOTH_RELOAD__();
  });

  $("#minimize-btn").addEventListener("click", async () => {
    log("UI", 0, "event:minimize-btn", "Minimize button clicked");
    
    // Save data before minimize to prevent data loss
    try {
      await save?.();
      log("SAVE", 1, "minimize-btn", "Data saved before minimize");
    } catch (err) {
      log("SAVE", 3, "minimize-btn", "Failed to save before minimize", { error: err });
    }
    
    window.api?.window.minimize();
  });

  $("#maximize-btn").addEventListener("click", () => {
    log("UI", 0, "event:maximize-btn", "Maximize button clicked");
    window.api?.window.maximize();
  });

  $("#close-btn").addEventListener("click", () => {
    log("UI", 0, "event:close-btn", "Close button clicked");
    window.api?.window.close();
  });

  $("#open-search-api-settings").addEventListener("click", () => {
    log("UI", 2, "event:open-search-api-settings", "Opening Search API modal.");
    $("#search-api-provider").value =
      state.settings.searchApiProvider || "serpapi";
    toggleGoogleCseInput();
    openModalWithAnimation($("#search-api-modal"));
    closeDropdownWithAnimation($("#settings-menu"));

    // Close mobile sidebar when opening search API settings
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }
  });

  $("#search-api-provider").addEventListener("change", toggleGoogleCseInput);

  const closeSearchApiModal = () =>
    closeModalWithAnimation($("#search-api-modal"));
  $("#close-search-api").addEventListener("click", closeSearchApiModal);
  $("#cancel-search-api").addEventListener("click", closeSearchApiModal);
  $("#search-api-modal .modal-overlay").addEventListener(
    "click",
    closeSearchApiModal,
  );

  $("#save-search-api").addEventListener("click", async () => {
    const provider = $("#search-api-provider").value;
    const apiKey = $("#search-api-key").value.trim();
    const cseId = $("#google-cse-id").value.trim();

    state.settings.searchApiProvider = provider;
    if (provider === "google") {
      state.settings.googleApiKey = apiKey;
      state.settings.googleCseId = cseId;
    } else {
      state.settings.serpApiKey = apiKey;
    }

    log("SETTINGS", 2, "event:save-search-api", "Saving Search API settings", {
      provider,
    });
    await save();
    closeSearchApiModal();
  });

  // Accessibility Modal
  $("#open-accessibility-settings").addEventListener("click", () => {
    log("UI", 2, "event:open-accessibility-settings", "Opening Accessibility modal.");
    
    // Load current settings
    $("#theme-slider").checked = localStorage.getItem('clustrix-theme') === 'dark';
    $("#show-projects-toggle").checked = state.settings.showProjectSessions !== false;
    $("#show-starred-toggle").checked = state.settings.showStarredSessions !== false;
    
    openModalWithAnimation($("#accessibility-modal"));
    closeDropdownWithAnimation($("#settings-menu"));

    // Close mobile sidebar when opening accessibility settings
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }
  });

  const closeAccessibilityModal = () =>
    closeModalWithAnimation($("#accessibility-modal"));
  
  $("#close-accessibility-modal").addEventListener("click", closeAccessibilityModal);
  $("#close-accessibility").addEventListener("click", closeAccessibilityModal);
  $("#accessibility-modal .modal-overlay").addEventListener(
    "click",
    closeAccessibilityModal,
  );

  (function wireWelcomeInputs() {
    const msgCentral = $("#msg-central");
    if (msgCentral) {
      const newMsgCentral = msgCentral.cloneNode(true);
      msgCentral.parentNode.replaceChild(newMsgCentral, msgCentral);
      newMsgCentral.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          log(
            "UI",
            0,
            "event:msg-central-keydown",
            "Enter pressed on welcome screen to start chat",
            {
              key: e.key,
              shift: e.shiftKey,
            },
          );
          sendFromWelcome();
        }
      });
    }

    const sendCentral = $("#send-central");
    if (sendCentral) {
      const newSendCentral = sendCentral.cloneNode(true);
      sendCentral.parentNode.replaceChild(newSendCentral, sendCentral);
      newSendCentral.addEventListener("click", () => {
        log(
          "UI",
          0,
          "event:send-central-click",
          "Send button clicked on welcome screen",
        );
        sendFromWelcome();
      });
    }

    const markdownBtn = $("#markdown-test-welcome");
    if (markdownBtn) {
      const newMarkdownBtn = markdownBtn.cloneNode(true);
      markdownBtn.parentNode.replaceChild(newMarkdownBtn, markdownBtn);
      if (DEBUG_MARKDOWN) {
        newMarkdownBtn.style.display = "";
      }
      newMarkdownBtn.addEventListener("click", () => {
        log(
          "UI",
          0,
          "event:markdown-test-welcome",
          "Markdown test button clicked on welcome screen",
        );
        startMarkdownTestFromWelcome();
      });
    }

    updateMarkdownControls();
  })();

  $("#open-model-mgmt").addEventListener("click", () => {
    openModelMgmt();
    closeDropdownWithAnimation($("#settings-menu"));
    closeModalWithAnimation($("#quick-model-switch-modal"));

    // Close mobile sidebar when opening model management
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }
  });

  $("#open-model-switcher").addEventListener("click", () => {
    const modelsConf = state.settings.models || defaultModels();
    const platformEl = $("#platform-select");
    const modelSelEl = $("#model-select");
    const modelIdManualEl = $("#model-id-manual");
    const baseUrlEl = $("#base-url");
    const apiKeyEl = $("#api-key");
    // const labelEl    = $("#model-label"); // form dimatikan
    // const noteEl     = $("#model-note");  // form dimatikan
    const notePrev = $("#model-note-preview");

    // Close mobile sidebar when opening model switcher
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }

    // Populate platform select with available providers
    const providers = Object.keys(modelsConf.providers || {}).sort();
    platformEl.innerHTML = providers
      .map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`)
      .join("");

    $("#extended-thinking").value = modelsConf.active?.thinkMode || "off";

    function applyNotePreview(text) {
      const t = text && String(text).trim() ? String(text).trim() : "—";
      notePrev.textContent = t;
      notePrev.title = t;
    }

    function fillForProvider(p, keepCurrent = false) {
      const prov = modelsConf.providers?.[p] || {
        baseUrl: "",
        apiKey: "",
        models: [],
      };
      const list = normalizeProviderModels(prov.models || []);

      modelSelEl.innerHTML = "";
      if (list.length) {
        for (const m of list) {
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.label || m.id;
          modelSelEl.appendChild(opt);
        }
        // Add manual entry option
        const opt = document.createElement("option");
        opt.value = "__manual__";
        opt.textContent = "+ New model ID";
        modelSelEl.appendChild(opt);
      } else {
        const opt = document.createElement("option");
        opt.value = "__manual__";
        opt.textContent = "+ New model ID";
        modelSelEl.appendChild(opt);
      }

      const act = modelsConf.active || {};
      if (keepCurrent && act.platform === p && act.model) {
        if (list.find(m => m.id === act.model)) {
          modelSelEl.value = act.model;
          modelIdManualEl.style.display = "none";
          modelIdManualEl.value = "";
        } else {
          modelSelEl.value = "__manual__";
          modelIdManualEl.style.display = "block";
          modelIdManualEl.value = act.model;
        }
      } else {
        modelSelEl.selectedIndex = 0;
        modelIdManualEl.style.display = "none";
        modelIdManualEl.value = "";
      }

      baseUrlEl.value = prov.baseUrl || "";
      apiKeyEl.value = prov.apiKey || "";

      const selectedId = modelSelEl.value === "__manual__" ? modelIdManualEl.value : modelSelEl.value;
      const meta = list.find((m) => m.id === selectedId) || {
        id: selectedId,
        label: selectedId,
        note: "",
      };

      // if (labelEl) labelEl.value = meta.label || selectedId; // form dimatikan
      // if (noteEl)  noteEl.value  = meta.note  || '';         // form dimatikan
      applyNotePreview(meta.note);
    }

    const act = modelsConf.active || {};
    platformEl.value = act.platform || "openrouter";
    fillForProvider(platformEl.value, true);
    populateTitleModelOptions(platformEl.value);

    platformEl.onchange = (e) => {
      const p = e.target.value;
      fillForProvider(p, false);
      populateTitleModelOptions(p);
      // Hide manual input when switching platforms
      modelIdManualEl.style.display = "none";
      modelIdManualEl.value = "";
    };

    modelSelEl.onchange = () => {
      const p = platformEl.value;
      const list = normalizeProviderModels(
        modelsConf.providers?.[p]?.models || [],
      );
      
      if (modelSelEl.value === "__manual__") {
        modelIdManualEl.style.display = "block";
        modelIdManualEl.focus();
        applyNotePreview("");
      } else {
        modelIdManualEl.style.display = "none";
        modelIdManualEl.value = "";
        const meta = list.find((m) => m.id === modelSelEl.value) || {
          id: modelSelEl.value,
          label: modelSelEl.value,
          note: "",
        };
        applyNotePreview(meta.note);
      }
    };

    modelIdManualEl.oninput = () => {
      applyNotePreview("");
    };

    // $("#model-note").addEventListener("input", (e) => applyNotePreview(e.target.value)); // form dimatikan

    openModalWithAnimation($("#models-modal"));
    closeDropdownWithAnimation($("#settings-menu"));
    closeModalWithAnimation($("#quick-model-switch-modal"));

    // Hide any previous error messages
    $("#switch-error").style.display = "none";
    $("#switch-error").textContent = "";
  });

  $("#save-models").addEventListener("click", async () => {
    const errorEl = $("#switch-error");
    errorEl.style.display = "none";
    errorEl.textContent = "";

    const platform = $("#platform-select").value;
    const modelSelectValue = $("#model-select").value;
    const modelIdManual = $("#model-id-manual").value.trim();
    const modelId = modelSelectValue === "__manual__" ? modelIdManual : modelSelectValue;
    const baseUrl = $("#base-url").value.trim();
    const apiKey = $("#api-key").value.trim();

    if (modelSelectValue === "__manual__" && !modelId) {
      errorEl.textContent = "* Please enter a model ID.";
      errorEl.style.display = "block";
      return;
    }

    const thinkMode = $("#extended-thinking").value;

    const conf = state.settings.models || defaultModels();
    conf.providers = conf.providers || {};

    if (!conf.providers[platform])
      conf.providers[platform] = { baseUrl: "", apiKey: "", models: [] };

    conf.providers[platform].baseUrl = baseUrl;
    conf.providers[platform].apiKey = apiKey;

    const list = normalizeProviderModels(conf.providers[platform].models || []);
    const idx = list.findIndex((m) => m.id === modelId);

    if (idx >= 0) {
      const existing = list[idx];
      list[idx] = { ...existing, id: modelId };
    } else {
      list.unshift({ id: modelId, label: modelId, note: "" });
    }
    conf.providers[platform].models = list;

    conf.active = { platform, model: modelId, baseUrl, apiKey, thinkMode };

    state.settings.models = conf;
    localStorage.setItem("models-conf", JSON.stringify(conf));
    try {
      if (!DEBUG_MODE) await window.api.models.save(conf);
    } catch {}

    const config = state.settings.models;
    const activeProvider = config.active.platform;
    log("UI", 1, "initialModelSwitch", `Model button updated for ${screen}`, {
      activeProv: activeProvider,
    });

    const modelsState = normalizeProviderModels(
      config.providers[activeProvider]?.models || [],
    );
    const modelBtn = $(`#btn-model-switch-welcome` || `#btn-model-switch-chat` || `#btn-model-switch-project`);
    modelsState.forEach((model) => {
      if (model.id === config.active.model) {
        const p = modelBtn.querySelector("p");
        if (p) p.textContent = model.label || model.id;
      }
    });

    updateModelHeader();
    closeModalWithAnimation($("#models-modal"));
  });

  $("#close-models").addEventListener("click", () =>
    closeModalWithAnimation($("#models-modal")),
  );
  $("#cancel-models").addEventListener("click", () =>
    closeModalWithAnimation($("#models-modal")),
  );
  $("#models-modal .modal-overlay").addEventListener("click", () =>
    closeModalWithAnimation($("#models-modal")),
  );

  $("#reset-models").addEventListener("click", () => {
    showConfirmationModal(
      "Reset Model Configuration",
      "Are you sure you want to reset all model settings to default? This will clear all saved providers and configurations.",
      () => {
        state.settings.models = defaultModels();
        localStorage.setItem(
          "models-conf",
          JSON.stringify(state.settings.models),
        );
        updateModelHeader();
        closeModalWithAnimation($("#models-modal"));
      },
    );
  });

  $("#new-chat").addEventListener("click", () => {
    log("UI", 0, "event:new-chat-click", "New chat button clicked");
    closeModalWithAnimation($("#quick-model-switch-modal"));

    // Close mobile sidebar when creating new chat
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }

    showWelcomeScreen();
  });

  $("#chats-btn").addEventListener("click", () => {
    log("UI", 0, "event:chats-page-click", "Chats page button clicked");

    // Close mobile sidebar when switching to chats page
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }

    showChatsPage();
  });

  $("#projects-btn").addEventListener("click", () => {
    log("UI", 0, "event:projects-page-click", "Projects page button clicked");

    // Close mobile sidebar when switching to projects page
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }

    // If currently in project detail view, use showProjectsListView() for smooth transition
    if (currentProject) {
      showProjectsListView();
    } else {
      showProjectsPage();
    }
  });

  $("#announcement-btn").addEventListener("click", () => {
    log("UI", 0, "event:projects-page-click", "Projects page button clicked");

    // Close mobile sidebar when switching to projects page
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }

    // If currently in project detail view, use showProjectsListView() for smooth transition
    if (currentProject) {
      showProjectsListView();
    } else {
      showProjectsPage();
    }
  });

  function handleSettingsClick(e) {
    e.stopPropagation();
    const settingsMenu = $("#settings-menu");
    const willShow = settingsMenu.classList.contains("hidden");
    log("UI", 0, "event:open-settings-click", "Settings menu toggled", {
      willShow,
    });
    
    if (willShow) {
      openDropdownWithAnimation(settingsMenu);
    } else {
      closeDropdownWithAnimation(settingsMenu);
    }
    
    closeModalWithAnimation($("#quick-model-switch-modal"));

    // Close mobile sidebar when opening customize/settings menu
  }

  function handlePersonaSettingsClick() {
    const { name, work, prefs } = state.settings.persona;
    const showProjects = state.settings.showProjects !== undefined ? state.settings.showProjects : false;
    const showStarred = state.settings.showStarred !== undefined ? state.settings.showStarred : true;
    const streamThrottling = state.settings.streamThrottling || "auto";
    const language = state.settings.language || "autodetect";
    log(
      "UI",
      0,
      "event:open-persona-settings-click",
      "Persona settings modal opened",
      { hasName: !!name, hasWork: !!work, hasPrefs: !!prefs, showProjects, showStarred, streamThrottling, language },
    );
    $("#persona-name").value = name || "";
    $("#persona-work").value = work || "";
    $("#persona-prefs").value = prefs || "";
    $("#show-projects-toggle").checked = showProjects;
    $("#show-starred-toggle").checked = showStarred;
    $("#stream-throttling").value = streamThrottling;
    $("#language-select").value = language;
    openModalWithAnimation($("#settings-modal"));
    closeDropdownWithAnimation($("#settings-menu"));
    closeModalWithAnimation($("#quick-model-switch-modal"));

    // Close mobile sidebar when opening persona settings
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }
  }

  $("#artifact-btn").addEventListener("click", () => {
    log("UI", 0, "event:artifacts-page-click", "Artifacts page button clicked");

    // Close mobile sidebar when switching to artifacts page
    if (window.innerWidth <= 768) {
      closeMobileSidebar();
    }

    showArtifactsPage();
  });

  $("#open-settings").addEventListener("click", handleSettingsClick);

  // Remove existing event listener to prevent duplicates
  $("#open-persona-settings").removeEventListener("click", handlePersonaSettingsClick);
  $("#open-persona-settings").addEventListener("click", handlePersonaSettingsClick);

  // ===== ACCOUNT EVENT HANDLERS =====
  const openAccountBtn = document.getElementById('open-account-settings');
  const closeAccountBtn = document.getElementById('close-account-modal');
  const accountModal = document.getElementById('account-settings-modal');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const internalBtn = document.getElementById('data-source-internal');
  const cloudBtn = document.getElementById('data-source-cloud');

  if (openAccountBtn) {
    openAccountBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      openModalWithAnimation($("#account-settings-modal"));
      closeDropdownWithAnimation($("#settings-menu"));
      await updateAccountModalUI();
      log("UI", 0, "event:open-account-settings", "Account modal opened");
    });
  }

  if (closeAccountBtn) {
    closeAccountBtn.addEventListener('click', () => {
      closeModalWithAnimation($("#account-settings-modal"));
      log("UI", 0, "event:close-account-modal", "Account modal closed");
    });
  }

  if (accountModal) {
    accountModal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        closeModalWithAnimation($("#account-settings-modal"));
      }
    });
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => handleGoogleLogin());
  }

  const closeModalBtn = document.getElementById('account-close-modal-btn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      closeModalWithAnimation($("#account-settings-modal"));
      log("UI", 0, "event:account-close-modal-btn", "Account modal closed via button");
    });
  }

  // ===== ACCOUNT MENU DROPDOWN HANDLERS =====
  const accountMenuBtn = document.getElementById('account-menu-btn');
  const accountMenuDropdown = document.getElementById('account-menu-dropdown');

  if (accountMenuBtn) {
    accountMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Close all other persistent-open menus
      document
        .querySelectorAll(".account-menu-dropdown.persistent-open")
        .forEach((menu) => {
          if (menu !== accountMenuDropdown) {
            menu.classList.remove("persistent-open");
            const otherBtn = menu.parentElement.querySelector(".account-menu-btn");
            if (otherBtn) otherBtn.classList.remove("persistent-active");
          }
        });

      // Toggle current menu's persistent state
      const isPersistentOpen = accountMenuDropdown.classList.contains("persistent-open");

      if (isPersistentOpen) {
        accountMenuDropdown.classList.remove("persistent-open");
        accountMenuBtn.classList.remove("persistent-active");
      } else {
        accountMenuDropdown.classList.add("persistent-open");
        accountMenuBtn.classList.add("persistent-active");
      }
    });
  }

  if (accountMenuDropdown) {
    accountMenuDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuItem = e.target.closest(".account-menu-item");
      if (!menuItem) return;

      const action = menuItem.dataset.action;

      // Close menu
      accountMenuDropdown.classList.remove("persistent-open");
      if (accountMenuBtn) accountMenuBtn.classList.remove("persistent-active");

      // Handle actions
      if (action === "sync-now") {
        handleSyncNow();
      } else if (action === "backup-now") {
        handleBackupNow();
      } else if (action === "logout") {
        handleLogout();
      }
    });
  }

  if (internalBtn) {
    internalBtn.addEventListener('click', () => handleDataSourceSwitch('internal'));
  }

  if (cloudBtn) {
    cloudBtn.addEventListener('click', () => handleDataSourceSwitch('cloud'));
  }

  // ===== LEARN MORE MODAL HANDLERS =====
  const openLearnMoreBtn = document.getElementById('open-learn-more');
  const closeLearnMoreBtn = document.getElementById('close-learn-more-modal');
  const learnMoreModal = document.getElementById('learn-more-modal');
  const learnMoreTabBtns = document.querySelectorAll('.learn-more-tab-btn');

  if (openLearnMoreBtn) {
    openLearnMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModalWithAnimation(learnMoreModal);
      closeDropdownWithAnimation($("#settings-menu"));
      log("UI", 0, "event:open-learn-more", "Learn More modal opened");
    });
  }

  if (closeLearnMoreBtn) {
    closeLearnMoreBtn.addEventListener('click', () => {
      closeModalWithAnimation(learnMoreModal);
      log("UI", 0, "event:close-learn-more-modal", "Learn More modal closed");
    });
  }

  if (learnMoreModal) {
    learnMoreModal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        closeModalWithAnimation(learnMoreModal);
      }
    });
  }

  // Tab switching functionality
  learnMoreTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = btn.dataset.tab;
      
      // Remove active class from all tabs and contents
      learnMoreTabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.learn-more-tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      // Add active class to clicked tab and corresponding content
      btn.classList.add('active');
      const tabContent = document.getElementById(tabName);
      if (tabContent) {
        tabContent.classList.add('active');
        log("UI", 0, "event:learn-more-tab-switch", "Switched to tab", { tab: tabName });
      }
    });
  });

  // ===== AUTH BUTTON HANDLER (Login/Logout) =====
  const authBtn = document.getElementById('auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      // Check if we're in login or logout state
      const loginState = document.getElementById('login-state');
      const logoutState = document.getElementById('logout-state');
      
      if (loginState && !loginState.classList.contains('hidden')) {
        // Login state is visible, so handle login
        // Don't close dropdown - show loading state instead
        await handleSidebarLogin();
      } else if (logoutState && !logoutState.classList.contains('hidden')) {
        // Logout state is visible, so handle logout
        handleLogout();
        closeDropdownWithAnimation($("#settings-menu"));
      }
    });
  }

  // Immediate save for sidebar display toggles
  $("#show-projects-toggle").addEventListener("change", async (e) => {
    const showProjects = e.target.checked;
    log("SETTINGS", 2, "event:show-projects-toggle-change", "Show Projects toggle changed", {
      showProjects,
    });
    state.settings.showProjects = showProjects;
    await save();
    renderSessions(); // Re-render sessions to reflect the new settings
  });

  $("#show-starred-toggle").addEventListener("change", async (e) => {
    const showStarred = e.target.checked;
    log("SETTINGS", 2, "event:show-starred-toggle-change", "Show Starred toggle changed", {
      showStarred,
    });
    state.settings.showStarred = showStarred;
    await save();
    renderSessions(); // Re-render sessions to reflect the new settings
  });

  $("#close-modal").addEventListener("click", () => {
    closeModalWithAnimation($("#settings-modal"));
  });

  $("#close-settings").addEventListener("click", () => {
    closeModalWithAnimation($("#settings-modal"));
  });

  $("#save-settings").addEventListener("click", async () => {
    const persona = {
      name: $("#persona-name").value.trim(),
      work: $("#persona-work").value.trim(),
      prefs: $("#persona-prefs").value.trim(),
    };
    const streamThrottling = $("#stream-throttling").value;
    const language = $("#language-select").value;
    log("SETTINGS", 2, "event:save-settings-click", "Saving persona settings", {
      hasName: !!persona.name,
      hasWork: !!persona.work,
      hasPrefs: !!persona.prefs,
      streamThrottling,
      language,
    });
    state.settings.persona = persona;
    state.settings.streamThrottling = streamThrottling;
    state.settings.language = language;
    await save();
    closeModalWithAnimation($("#settings-modal"));
  });

  $("#delete-all").addEventListener("click", () => {
    log(
      "SETTINGS",
      3,
      "event:delete-all-click",
      "Delete all sessions process initiated",
    );
    showConfirmationModal("Delete All Sessions", "Are you sure?", async () => {
      log(
        "SETTINGS",
        3,
        "confirm:delete-all:accepted",
        "Confirmation to delete all sessions received",
      );
      streamManager.shutdownGracefully();
      state.sessions = [];
      current = null;
      clearDirtyTracking(); // Force full save untuk ensure backend dapat update yang benar
      await save();
      closeModalWithAnimation($("#settings-modal"));
      closeModalWithAnimation($("#quick-model-switch-modal"));
      showWelcomeScreen();
      log(
        "SETTINGS",
        2,
        "delete-all:completed",
        "All sessions have been deleted",
        { sessionsCount: state.sessions.length },
      );
    });
  });

  $("#web-search-switch").addEventListener("change", (e) => {
    log('WEBSEARCH', 2, 'toggle', 'WebSearch switch toggled by user', { 
      oldState: state.settings.webSearchEnabled,
      newState: e.target.checked 
    });
    
    state.settings.webSearchEnabled = e.target.checked;

    localStorage.setItem(
      "clustrix-web-search",
      state.settings.webSearchEnabled.toString(),
    );
    save();

    $$('[id^="btn-web-search-"]').forEach((b) =>
      b.classList.toggle("toggled", state.settings.webSearchEnabled),
    );
    
    log("WEBSEARCH", 2, "toggle", "WebSearch state updated and saved", {
      enabled: e.target.checked,
      savedToLocalStorage: true
    });
    log("SETTINGS", 2, "event:web-search-change", "Web Search Toggled", {
      enabled: e.target.checked,
    });
  });

  $("#theme-slider").addEventListener("change", () => {
    log("UI", 0, "event:theme-slider-change", "Theme toggled");
    toggleTheme();
  });

  $("#settings-modal .modal-overlay").addEventListener("click", () => {
    log(
      "UI",
      0,
      "event:modal-overlay-click",
      "Settings modal hidden via overlay click",
    );
    closeModalWithAnimation($("#settings-modal"));
  });

  $("#msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (DEBUG_MARKDOWN && current && isMarkdownTestSession(current)) {
        e.preventDefault();
        if (!streamManager.isStreamingInSession(current)) {
          runMarkdownTestTurn(current, e.target?.value ?? "");
        }
        return;
      }
      if (streamManager.isStreamingInSession(current)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      send();
    }
  });

  const markdownChatBtn = $("#markdown-test-chat");
  if (markdownChatBtn) {
    markdownChatBtn.addEventListener("click", () => {
      if (!DEBUG_MARKDOWN) return;
      if (!current || !isMarkdownTestSession(current)) return;
      if (streamManager.isStreamingInSession(current)) return;
      log(
        "UI",
        0,
        "event:markdown-test-chat",
        "Markdown test button clicked in chat",
        { sessionId: current.id },
      );
      const composer = $("#msg");
      runMarkdownTestTurn(current, composer ? composer.value : "");
    });
  }

  $("#send").addEventListener("click", async () => {
    const modal = $("#quick-model-switch-modal");
    closeModalWithAnimation(modal);

    if (DEBUG_MARKDOWN && current && isMarkdownTestSession(current)) {
      if (!streamManager.isStreamingInSession(current)) {
        const composer = $("#msg");
        runMarkdownTestTurn(current, composer ? composer.value : "");
      }
      return;
    }

    if (!current) return;

    const isStreaming = streamManager.isStreamingInSession(current);
    if (!isStreaming) {
      send();
      return;
    }

    log("STREAM", 3, "interrupt:click", "User clicked Interrupt button", {
      session: current.name,
    });
    let interrupted = false;
    for (const id in streamManager.activeStreams) {
      const st = streamManager.activeStreams[id];
      if (st.session !== current) continue;

      interrupted = true;
      const { aiNode, session, messageIndex } = st;

      try {
        st.controller?.cancel?.();
      } catch {}
      try {
        streamManager.stopStream(id);
      } catch {}

      const partial = (st.fullResponse || "").trim();
      
      // Get modelInfo from existing message before updating
      const existingMessageData = session.messages[messageIndex];
      const modelInfo = existingMessageData && Array.isArray(existingMessageData)
        ? existingMessageData[2]
        : null;
      
      session.messages[messageIndex] = ["ai", partial, modelInfo];
      
      // Track updated message for incremental save
      if (!session._newMessages) {
        session._newMessages = [];
      }
      session._newMessages.push([messageIndex, ["ai", partial, modelInfo]]);

      const div = aiNode.querySelector(".message-text");
      if (div) {
        // For manual interruption, don't show error message - just render whatever content we have
        const content = partial || ""; // Don't show error for manual interruption
        
        if (content.trim()) {
          md(content).then(html => {
            div.innerHTML = html;
            if (div.querySelector("pre code")) highlightAllUnder(div);
            attachCodeBlockListeners(div);
            renderMathInElement(div);
          }).catch(err => {
            console.warn('Markdown rendering error in interrupt handler:', err);
            div.innerHTML = mdFallback(content);
            if (div.querySelector("pre code")) highlightAllUnder(div);
            attachCodeBlockListeners(div);
            renderMathInElement(div);
          });
        }
      }

      let footer = aiNode.querySelector(".message-footer");
      if (!footer) {
        footer = document.createElement("div");
        footer.className = "message-footer";
        const messageContent = aiNode.querySelector(".message-content");
        if (messageContent) messageContent.appendChild(footer);
        else aiNode.appendChild(footer);
      }
      footer.innerHTML = "";

      const placeholderCard = document.createElement("div");
      placeholderCard.className = "continue-placeholder";

      const hint = document.createElement("span");
      hint.className = "placeholder-hint";
      hint.textContent = "Response interrupted by user";

      const btn = document.createElement("button");
      btn.className = "primary-btn continue-fragment";
      btn.textContent = "Continue";
      btn.disabled = true;
      btn.title = "Continue from interrupted point";

      placeholderCard.appendChild(hint);
      placeholderCard.appendChild(btn);

      setTimeout(() => {
        btn.disabled = false;
      }, 1500);

      btn.addEventListener("click", () => {
        log(
          "STREAM",
          2,
          "continue:interrupted:click",
          "User clicked 'Continue' after manual interruption",
          { session: session.created_at, messageIndex },
        );

        btn.disabled = true;
        footer.innerHTML = "";

        const msgs = buildResumeMessagesFromSession(
          session,
          messageIndex,
          partial,
        );

        startStream(
          session,
          "[System] Continue EXACTLY where the last assistant message stopped. Do NOT repeat previous text or acknowledge this instruction. Just provide the continuation.",
          aiNode,
          messageIndex,
          false,
          msgs,
          partial,
        );
        updateInputState();
      });

      footer.appendChild(placeholderCard);
      break;
    }

    if (interrupted) {
      // Save immediately after interrupt to ensure partial response is persisted
      try {
        await save();
        log("STREAM", 2, "interrupt:save", "Saved session after manual interrupt");
      } catch (err) {
        log("STREAM", 3, "interrupt:save", "Failed to save after interrupt", { error: err.message });
      }
      updateInputState();
    }
  });

  document.addEventListener("click", (event) => {
    const copyBtn = event.target.closest(".copy-code-btn");
    if (copyBtn) {
      const block = copyBtn.closest(".code-block-container");
      const codeEl = block?.querySelector("pre code");
      if (!codeEl) return;

      const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
      const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

      navigator.clipboard
        .writeText(codeEl.textContent)
        .then(() => {
          copyBtn.innerHTML = checkIconSVG;
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.innerHTML = copyIconSVG;
            copyBtn.classList.remove("copied");
          }, 2000);
        })
        .catch((err) => {
          log("UI", 4, "copy-code-btn:click", "Failed to copy code block", {
            error: err,
          });
        });
      return;
    }

    const saveBtn = event.target.closest(".save-code-btn");

    if (saveBtn) {
      const block = saveBtn.closest(".code-block-container");
      const codeEl = block?.querySelector("pre code");
      if (!codeEl) return;

      const code = codeEl.textContent;
      const language = saveBtn.dataset.language || "text";

      let sessionId = null;
      let messageIndex = null;

      const messageEl = saveBtn.closest(".message");
      if (messageEl) {
        const messageIndexAttr = messageEl.getAttribute("data-message-index");
        if (messageIndexAttr) {
          messageIndex = parseInt(messageIndexAttr, 10);
          sessionId = current?.id;
        }
      }

      log("UI", 2, "save-code-btn:click", "Extracted context", {
        hasMessageEl: !!messageEl,
        messageIndexAttr: messageEl?.getAttribute("data-message-index"),
        sessionId,
        messageIndex,
        currentId: current?.id,
      });

      const firstLine = code.split('\n')[0].trim();
      const title = firstLine.length > 50 ? `Code snippet (${language})` : firstLine || `Code snippet (${language})`;

      try {
        const artifact = saveCodeArtifact(title, code, language, sessionId, messageIndex);
        log("UI", 2, "save-code-btn:click", "Code saved to artifacts", {
          artifactId: artifact.id,
          language,
          sessionId,
          messageIndex,
        });

        const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
        const saveIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>`;

        saveBtn.innerHTML = `${checkIconSVG}`;
        saveBtn.classList.add("saved");
        setTimeout(() => {
          saveBtn.innerHTML = `${saveIconSVG}`;
          saveBtn.classList.remove("saved");
        }, 2000);
      } catch (err) {
        log("UI", 4, "save-code-btn:click", "Failed to save code artifact", {
          error: err,
        });
        // Could add error feedback here
      }
    }

    const previewMermaidBtn = event.target.closest(".preview-mermaid-btn");
    if (previewMermaidBtn) {
      const block = previewMermaidBtn.closest(".code-block-container");
      const preEl = block?.querySelector("pre");
      if (!preEl) return;

      // Toggle between code and diagram
      if (preEl.classList.contains("mermaid-preview")) {
        // Switch back to code
        const code = preEl.dataset.originalCode || "";
        const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        preEl.innerHTML = `<code class="language-mermaid">${escapedCode}</code>`;
        preEl.classList.remove("mermaid-preview");
        
        // Remove zoom controls
        const existingControls = block.querySelector('.mermaid-zoom-controls');
        if (existingControls) existingControls.remove();
        
        // Re-apply syntax highlighting
        if (typeof highlightAllUnder === 'function') {
          highlightAllUnder(block);
        }
        
        previewMermaidBtn.title = "Preview diagram";
        previewMermaidBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      } else {
        // Get code from the code element
        const codeEl = preEl.querySelector("code");
        if (!codeEl) return;
        const code = codeEl.textContent;

        // Store original code
        preEl.dataset.originalCode = code;

        // Render diagram
        try {
          const renderMermaid = (mermaidLib) => {
            const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'base';
            
            if (!mermaidInitialized) {
              mermaidLib.initialize({ 
                startOnLoad: false, 
                theme: currentTheme,
                themeVariables: currentTheme === 'dark' ? {
                  // Dark theme colors
                  primaryColor: '#4a90e2',
                  primaryTextColor: '#e4e8ed',
                  primaryBorderColor: '#6ba3ec',
                  lineColor: '#7aa2f7',
                  secondaryColor: '#7c3aed',
                  tertiaryColor: '#10b981',
                  background: '#1f2937',
                  mainBkg: '#374151',
                  secondBkg: '#4b5563',
                  tertiaryBkg: '#6b7280',
                  textColor: '#e4e8ed',
                  border1: '#6b7280',
                  border2: '#9ca3af',
                  arrowheadColor: '#7aa2f7',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  labelBackground: '#374151',
                  nodeBorder: '#6ba3ec',
                  clusterBkg: '#1f2937',
                  clusterBorder: '#6b7280',
                  defaultLinkColor: '#7aa2f7',
                  titleColor: '#e4e8ed',
                  edgeLabelBackground: '#374151',
                  nodeTextColor: '#e4e8ed'
                } : {
                  // Light theme colors
                  primaryColor: '#4a90e2',
                  primaryTextColor: '#1f1f1f',
                  primaryBorderColor: '#2563eb',
                  lineColor: '#2563eb',
                  secondaryColor: '#7c3aed',
                  tertiaryColor: '#10b981',
                  background: '#ffffff',
                  mainBkg: '#e3f2fd',
                  secondBkg: '#f0f4f9',
                  tertiaryBkg: '#f8fafc',
                  textColor: '#1f1f1f',
                  border1: '#cbd5e1',
                  border2: '#94a3b8',
                  arrowheadColor: '#2563eb',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  labelBackground: '#f0f4f9',
                  nodeBorder: '#2563eb',
                  clusterBkg: '#f8fafc',
                  clusterBorder: '#cbd5e1',
                  defaultLinkColor: '#2563eb',
                  titleColor: '#1f1f1f',
                  edgeLabelBackground: '#f0f4f9',
                  nodeTextColor: '#1f1f1f'
                },
                flowchart: {
                  curve: 'basis',
                  padding: 20,
                  nodeSpacing: 50,
                  rankSpacing: 50,
                  diagramPadding: 20,
                  htmlLabels: true
                }
              });
              mermaidInitialized = true;
            }
            
            const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            mermaidLib.render(id, code).then((result) => {
              // Create wrapper for diagram with pan/zoom
              const wrapper = document.createElement('div');
              wrapper.className = 'mermaid-diagram-wrapper';
              wrapper.innerHTML = result.svg;
              
              const svg = wrapper.querySelector('svg');
              if (svg) {
                // Set SVG attributes for better rendering
                svg.setAttribute('width', '100%');
                svg.setAttribute('height', '100%');
                svg.style.maxWidth = '100%';
                svg.style.height = 'auto';
                
                // Initialize pan & zoom state
                let scale = 1;
                let translateX = 0;
                let translateY = 0;
                let isDragging = false;
                let startX = 0;
                let startY = 0;
                
                // Apply initial transform
                const updateTransform = () => {
                  svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                  svg.style.transformOrigin = '0 0'; // Top-left origin for proper zoom to point
                  svg.style.transition = isDragging ? 'none' : 'transform 0.2s ease-out';
                  
                  // Update grid background to follow pan/zoom
                  const gridSize = 20 * scale;
                  wrapper.style.backgroundSize = `${gridSize}px ${gridSize}px`;
                  wrapper.style.backgroundPosition = `${translateX}px ${translateY}px`;
                };
                
                // Zoom to point (mouse position)
                const zoomToPoint = (mouseX, mouseY, zoomIn) => {
                  const oldScale = scale;
                  
                  // Calculate new scale
                  if (zoomIn) {
                    scale = Math.min(scale * 1.2, 5);
                  } else {
                    scale = Math.max(scale / 1.2, 0.5);
                  }
                  
                  // Scale factor change
                  const factor = scale / oldScale;
                  
                  // Adjust pan to zoom towards mouse
                  // Formula: new_pan = mouse - (mouse - old_pan) * factor
                  translateX = mouseX - (mouseX - translateX) * factor;
                  translateY = mouseY - (mouseY - translateY) * factor;
                  
                  updateTransform();
                };
                
                // Zoom controls (zoom to center)
                const zoomIn = () => {
                  const rect = wrapper.getBoundingClientRect();
                  const centerX = rect.width / 2;
                  const centerY = rect.height / 2;
                  zoomToPoint(centerX, centerY, true);
                };
                
                const zoomOut = () => {
                  const rect = wrapper.getBoundingClientRect();
                  const centerX = rect.width / 2;
                  const centerY = rect.height / 2;
                  zoomToPoint(centerX, centerY, false);
                };
                
                const resetZoom = () => {
                  scale = 1;
                  translateX = 0;
                  translateY = 0;
                  updateTransform();
                };
                
                // Mouse wheel zoom (zoom to cursor)
                wrapper.addEventListener('wheel', (e) => {
                  e.preventDefault();
                  
                  // Get mouse position relative to wrapper
                  const rect = wrapper.getBoundingClientRect();
                  const mouseX = e.clientX - rect.left;
                  const mouseY = e.clientY - rect.top;
                  
                  // deltaY < 0 = scroll up = zoom in
                  // deltaY > 0 = scroll down = zoom out
                  const shouldZoomIn = e.deltaY < 0;
                  zoomToPoint(mouseX, mouseY, shouldZoomIn);
                });
                
                // Drag to pan
                wrapper.addEventListener('mousedown', (e) => {
                  // Allow drag from anywhere in wrapper (text has pointer-events: none)
                  // Just make sure we're not clicking on zoom controls
                  if (!e.target.closest('.mermaid-zoom-controls')) {
                    isDragging = true;
                    startX = e.clientX - translateX;
                    startY = e.clientY - translateY;
                    wrapper.style.cursor = 'grabbing';
                    e.preventDefault(); // Prevent text selection
                  }
                });
                
                document.addEventListener('mousemove', (e) => {
                  if (isDragging) {
                    e.preventDefault(); // Prevent text selection during drag
                    translateX = e.clientX - startX;
                    translateY = e.clientY - startY;
                    updateTransform();
                  }
                });
                
                document.addEventListener('mouseup', () => {
                  if (isDragging) {
                    isDragging = false;
                    wrapper.style.cursor = 'grab';
                  }
                });
                
                // Add zoom controls UI
                const controls = document.createElement('div');
                controls.className = 'mermaid-zoom-controls';
                controls.innerHTML = `
                  <button class="mermaid-zoom-btn zoom-in" title="Zoom In">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                  </button>
                  <button class="mermaid-zoom-btn zoom-out" title="Zoom Out">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                  </button>
                  <button class="mermaid-zoom-btn zoom-reset" title="Reset Zoom">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                  </button>
                `;
                
                controls.querySelector('.zoom-in').addEventListener('click', zoomIn);
                controls.querySelector('.zoom-out').addEventListener('click', zoomOut);
                controls.querySelector('.zoom-reset').addEventListener('click', resetZoom);
                
                // Prevent default drag behavior on SVG elements
                wrapper.addEventListener('dragstart', (e) => {
                  e.preventDefault();
                  return false;
                });
                
                preEl.innerHTML = '';
                preEl.appendChild(wrapper);
                preEl.appendChild(controls);
                
                // Initialize grid
                updateTransform();
              } else {
                preEl.innerHTML = result.svg;
              }
              
              preEl.classList.add("mermaid-preview");
              previewMermaidBtn.title = "Show code";
              previewMermaidBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-code-icon lucide-code"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>`;
            }).catch((err) => {
              log("UI", 4, "preview-mermaid-btn:click", "Failed to render mermaid diagram", { error: err });
              const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
              preEl.innerHTML = `<code class="language-mermaid">${escapedCode}</code>`;
            });
          };
          
          if (typeof mermaid !== 'undefined') {
            renderMermaid(mermaid);
          } else {
            // Try dynamic import
            import('../node_modules/mermaid/dist/mermaid.esm.min.mjs').then((mermaidModule) => {
              renderMermaid(mermaidModule.default);
            }).catch((err) => {
              log("UI", 4, "preview-mermaid-btn:click", "Failed to load mermaid", { error: err });
            });
          }
        } catch (err) {
          log("UI", 4, "preview-mermaid-btn:click", "Error rendering mermaid", { error: err });
        }
      }
      return;
    }

    const previewHtmlBtn = event.target.closest(".preview-html-btn");
    if (previewHtmlBtn) {
      const block = previewHtmlBtn.closest(".code-block-container");
      const preEl = block?.querySelector("pre");
      if (!preEl) return;

      // Toggle between code and preview
      if (preEl.classList.contains("html-preview")) {
        // Switch back to code
        const code = preEl.dataset.originalCode || "";
        
        // Clean up temp file
        const iframe = preEl.querySelector('iframe');
        if (iframe && iframe.dataset.previewId) {
          window.api.htmlPreview.delete(iframe.dataset.previewId).catch(err => {
            log("UI", 3, "preview-html-btn:click", "Failed to delete preview file", { error: err });
          });
        }
        
        const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        preEl.innerHTML = `<code class="language-html">${escapedCode}</code>`;
        preEl.classList.remove("html-preview");
        
        // Remove preview marker from block
        block.classList.remove('has-html-preview');
        
        // Re-apply syntax highlighting
        if (typeof highlightAllUnder === 'function') {
          highlightAllUnder(block);
        }
        
        previewHtmlBtn.title = "Preview HTML";
        previewHtmlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      } else {
        // Get code from the code element
        const codeEl = preEl.querySelector("code");
        if (!codeEl) return;
        const originalCode = codeEl.textContent;
        let htmlCode = originalCode;

        const injectIntoHeadOrDocumentStart = (snippet) => {
          if (!snippet || !snippet.trim()) {
            return;
          }

          if (/<\/head>/i.test(htmlCode)) {
            htmlCode = htmlCode.replace(/<\/head>/i, `${snippet}\n</head>`);
          } else if (/<html[^>]*>/i.test(htmlCode)) {
            htmlCode = htmlCode.replace(/<html[^>]*>/i, (match) => `${match}\n${snippet}`);
          } else {
            htmlCode = `${snippet}\n${htmlCode}`;
          }
        };

        const buildPreviewScrollbarStyle = () => {
          const defaults = {
            size: '6px',
            track: 'transparent',
            thumb: '#8181811f',
            thumbHover: '#090909ff',
          };

          const styleBlock = (values) => `
            <style data-preview-scrollbar="true">
              :root {
                --scrollbar-size: ${values.size};
                --scrollbar-track: ${values.track};
                --scrollbar-thumb: ${values.thumb};
                --scrollbar-thumb-hover: ${values.thumbHover};
              }
              html, body {
                height: 100%;
                max-height: 100vh !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                overscroll-behavior: contain;
                
              }
              :where(*) {
                scrollbar-width: thin !important;
                scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track) !important;
              }
              :where(*::-webkit-scrollbar) {
                width: var(--scrollbar-size);
                height: var(--scrollbar-size);
              }
              :where(*::-webkit-scrollbar-track) {
                background: var(--scrollbar-track);
              }
              :where(*::-webkit-scrollbar-thumb) {
                background: var(--scrollbar-thumb);
                border-radius: 999px;
              }
              :where(*::-webkit-scrollbar-thumb:hover) {
                background: var(--scrollbar-thumb-hover);
              }
            </style>
          `;

          try {
            if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function' || !document || !document.documentElement) {
              return styleBlock(defaults);
            }

            const computed = window.getComputedStyle(document.documentElement);
            const resolve = (prop, fallback) => {
              const value = computed.getPropertyValue(prop);
              return (value && value.trim()) || fallback;
            };

            return styleBlock({
              size: resolve('--scrollbar-size', defaults.size),
              track: resolve('--scrollbar-track', defaults.track),
              thumb: resolve('--scrollbar-thumb', defaults.thumb),
              thumbHover: resolve('--scrollbar-thumb-hover', defaults.thumbHover),
            });
          } catch (err) {
            return styleBlock(defaults);
          }
        };

        // Store original code
        preEl.dataset.originalCode = originalCode;
        
        // Inject script to prevent parent window scroll on hash navigation
        const preventScrollScript = `
          <script>
            (function() {
              const scrollRoot = document.scrollingElement || document.documentElement || document.body;
              if (!scrollRoot) {
                return;
              }

              const clamp = (value) => (value < 0 ? 0 : value);
              const currentScrollTop = () => window.pageYOffset || scrollRoot.scrollTop || 0;

              const targetPosition = (element) => {
                const rect = element.getBoundingClientRect();
                return clamp(rect.top + currentScrollTop() - 12);
              };

              const animateScroll = (nextTop) => {
                try {
                  window.scrollTo({ top: nextTop, behavior: 'smooth' });
                } catch (err) {
                  window.scrollTo(0, nextTop);
                }
              };

              const navigateToHash = (hashValue, shouldUpdateHistory) => {
                if (!hashValue || hashValue === '#') {
                  return false;
                }

                const targetId = hashValue.replace(/^#/, '');
                if (!targetId) {
                  return false;
                }

                const destination = document.getElementById(targetId);
                if (!destination) {
                  return false;
                }

                animateScroll(targetPosition(destination));

                if (shouldUpdateHistory && window.history && window.history.replaceState) {
                  window.history.replaceState(null, document.title, '#' + targetId);
                }

                return true;
              };

              document.addEventListener('click', function(event) {
                const anchor = event.target.closest('a[href^="#"]');
                if (!anchor) {
                  return;
                }

                const hashValue = anchor.getAttribute('href');
                const navigated = navigateToHash(hashValue, true);

                // Always swallow default behavior for in-document hashes
                event.preventDefault();
                event.stopPropagation();

                // Ensure focus remains on the clicked anchor without forcing parent scroll
                if (anchor.blur) {
                  anchor.blur();
                }

                if (!navigated && hashValue === '#') {
                  animateScroll(0);
                }
              }, true);

              window.addEventListener('hashchange', function() {
                navigateToHash(window.location.hash, false);
              });

              if (window.location.hash) {
                navigateToHash(window.location.hash, false);
              }
            })();
          </script>
        `;

        // Find the message container to collect CSS and JS from other codeblocks
        const messageEl = block.closest('.message');
        if (messageEl) {
          const allCodeBlocks = messageEl.querySelectorAll('.code-block-container');
          
          let cssCode = '';
          let jsCode = '';
          
          // Collect CSS and JS from other codeblocks in the same message
          allCodeBlocks.forEach(cb => {
            if (cb === block) return; // Skip the HTML block itself
            
            const lang = cb.dataset.language?.toLowerCase();
            const codeElement = cb.querySelector('pre:not(.html-preview):not(.mermaid-preview) code');
            if (!codeElement) return;
            
            if (lang === 'css') {
              cssCode += codeElement.textContent + '\n';
            } else if (lang === 'javascript' || lang === 'js') {
              jsCode += codeElement.textContent + '\n';
            }
          });
          
          // Inject CSS into HTML
          if (cssCode.trim()) {
            const styleTag = `<style>\n${cssCode}</style>\n`;
            injectIntoHeadOrDocumentStart(styleTag);

            log("UI", 1, "preview-html-btn:click", "Injected CSS from separate codeblock", { cssLength: cssCode.length });
          }
          
          // Inject JS into HTML
          if (jsCode.trim()) {
            const scriptTag = `<script>\n${jsCode}\n</script>\n`;
            
            // Try to inject before </body>
            if (/<\/body>/i.test(htmlCode)) {
              htmlCode = htmlCode.replace(/<\/body>/i, `${scriptTag}</body>`);
            } else if (/<\/html>/i.test(htmlCode)) {
              // No </body>, inject before </html>
              htmlCode = htmlCode.replace(/<\/html>/i, `${scriptTag}</html>`);
            } else {
              // Fallback: append to HTML
              htmlCode += '\n' + scriptTag;
            }
            
            log("UI", 1, "preview-html-btn:click", "Injected JS from separate codeblock", { jsLength: jsCode.length });
          }
        }

        const previewScrollbarStyle = buildPreviewScrollbarStyle();
        injectIntoHeadOrDocumentStart(previewScrollbarStyle);

        // Inject scroll prevention script at the end of body
        if (/<\/body>/i.test(htmlCode)) {
          htmlCode = htmlCode.replace(/<\/body>/i, `${preventScrollScript}</body>`);
        } else if (/<\/html>/i.test(htmlCode)) {
          htmlCode = htmlCode.replace(/<\/html>/i, `${preventScrollScript}</html>`);
        } else {
          htmlCode += '\n' + preventScrollScript;
        }

        // Create iframe for preview
        try {
          // Create temp HTML file for proper isolated environment
          window.api.htmlPreview.create(htmlCode).then(({ previewId, filePath }) => {
            const iframe = document.createElement('iframe');
            iframe.className = 'html-preview-iframe';
            // Keep allow-same-origin for full functionality
            // Script injection will prevent parent scroll
            iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
            iframe.src = `file://${filePath}`;
            
            // Store preview ID for cleanup
            iframe.dataset.previewId = previewId;
            


            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'html-preview-wrapper';
            wrapper.appendChild(iframe);

            // Replace code with preview
            preEl.innerHTML = '';
            preEl.appendChild(wrapper);
            preEl.classList.add("html-preview");
            
            // Mark block as having active preview
            block.classList.add('has-html-preview');
            
            previewHtmlBtn.title = "Show code";
            previewHtmlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-code-icon lucide-code"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>`;
          }).catch(err => {
            log("UI", 4, "preview-html-btn:click", "Error creating HTML preview file", { error: err });
            const escapedCode = originalCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            preEl.innerHTML = `<code class="language-html">${escapedCode}</code>`;
          });
        } catch (err) {
          log("UI", 4, "preview-html-btn:click", "Error rendering HTML preview", { error: err });
          const escapedCode = originalCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          preEl.innerHTML = `<code class="language-html">${escapedCode}</code>`;
        }
      }
      return;
    }

    if (!$("#settings-container").contains(event.target)) {
      closeDropdownWithAnimation($("#settings-menu"));
    }

    const regenCancelledTarget = event.target.closest(".regenerate-cancelled");
    if (regenCancelledTarget) {
      const messageIndex = parseInt(
        regenCancelledTarget.dataset.messageIndex,
        10,
      );
      log(
        "UI",
        0,
        "event:regenerate-cancelled-click",
        "Regenerate-cancelled button clicked",
        { messageIndex },
      );
      regenerateFromCancelled(regenCancelledTarget);
    }

    const regenIncompleteTarget = event.target.closest(".regenerate-incomplete");
    if (regenIncompleteTarget) {
      const messageIndex = parseInt(
        regenIncompleteTarget.dataset.messageIndex,
        10,
      );
      log(
        "UI",
        0,
        "event:regenerate-incomplete-click",
        "Regenerate-incomplete button clicked",
        { messageIndex },
      );
      regenerateFromIncomplete(regenIncompleteTarget);
    }
  });
}

function initializeApp() {
  log("APP", 2, "initializeApp", "Initializing application.");

  clearSessionCache();
  log('CACHE', 1, 'initializeApp', 'Session cache cleared on app initialization');

  initializeSmartScroll();
  initColumnReverseScrollDetection(); 
  initScrollToBottomButton(); 

  setTimeout(() => {
    const scroller = getChatScroller();
    if (scroller) {
      const scrollTop = scroller.scrollTop;
      const isNearBottom = scrollTop > -200;
      log('SCROLL', 1, 'initializeApp', `Initial scroll check - scrollTop: ${scrollTop}px, isNearBottom: ${isNearBottom}`);
      if (!isNearBottom) {
        showScrollToBottomButton();
        log('SCROLL', 1, 'initializeApp', 'Scroll button SHOWN on init (scrolled up)');
      } else {
        hideScrollToBottomButton();
        log('SCROLL', 1, 'initializeApp', 'Scroll button HIDDEN on init (near bottom)');
      }
    }
  }, 100);

  if (window.api) {
    window.api.on("chat-update", (payload) => {
      try { console.debug('RENDERER: chat-update received', payload); } catch (e) {}
      const { type, messageIndex, data } = payload;
      const bubbleNode = $(`#chat-log .message[data-message-index="${messageIndex}"]`) || $('#chat-log .message.ai:last-child');

      if (!bubbleNode) {
          console.warn(`chat-update: Could not find message node for index ${messageIndex}`);
          return;
      }

      if (type === "TOKEN_USAGE") {
        const sessionId = payload.sessionId || current?.id;
        const session = state.sessions.find((s) => s.id === sessionId) || current;
        if (!session || typeof messageIndex !== "number" || messageIndex < 0) {
          log("UI", 3, "chat-update:TOKEN_USAGE", "Skipping TOKEN_USAGE - missing session or invalid index", {
            hasSession: !!session,
            messageIndex,
            sessionId
          });
          return;
        }

        log("UI", 2, "chat-update:TOKEN_USAGE", "Processing TOKEN_USAGE update", {
          messageIndex,
          sessionId: session.id,
          data
        });

        ensureTokenFields(session);

        const usageData = data || {};
        const rawPrompt = Number(usageData.prompt_tokens ?? 0);
        const rawCompletion = Number(usageData.completion_tokens ?? 0);
        const rawTotal = Number(usageData.total_tokens ?? 0);

        const promptTokens = Number.isFinite(rawPrompt)
          ? Math.max(0, Math.round(rawPrompt))
          : 0;
        const completionTokens = Number.isFinite(rawCompletion)
          ? Math.max(0, Math.round(rawCompletion))
          : 0;
        let totalTokens = Number.isFinite(rawTotal)
          ? Math.max(0, Math.round(rawTotal))
          : 0;
        if (totalTokens === 0) {
          totalTokens = promptTokens + completionTokens;
        }
        const breakdown = Array.isArray(usageData.breakdown)
          ? usageData.breakdown
          : [];

        const messageEntry = Array.isArray(session.messages)
          ? session.messages[messageIndex]
          : null;
        if (Array.isArray(messageEntry)) {
          const meta =
            messageEntry[2] && typeof messageEntry[2] === "object"
              ? messageEntry[2]
              : {};
          meta.usage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            breakdown,
          };
          messageEntry[2] = meta;
        }

        const previousTokens = session.tokens_by_message?.[messageIndex] || 0;
        session.tokens_by_message[messageIndex] = totalTokens;

        if (typeof session.tokens_used !== "number" || Number.isNaN(session.tokens_used)) {
          session.tokens_used = 0;
        }
        session.tokens_used += totalTokens - previousTokens;
        if (session.tokens_used < 0) {
          session.tokens_used = 0;
        }

        markSessionDirty(session.id);
        if (!session._newMessages) {
          session._newMessages = [];
        }
        session._newMessages.push([messageIndex, session.messages[messageIndex]]);

        updateTokensUI(session);
        debouncedSave();

        if (current && session.id === current.id) {
          const node = bubbleNode;
          if (node) {
            setNodeMetadata(node, session.messages[messageIndex]?.[2] || {});
            renderAiFinalActions(
              node,
              session.messages[messageIndex]?.[1] || "",
              messageIndex,
            );
          }
        }
        return;
      }

      const indicator = bubbleNode.querySelector(".thinking-toggle .web-search-indicator");
      const mainText = bubbleNode.querySelector(".message-text");

      if (type === "SEARCHING") {
        mainText.innerHTML = "";
        const toggleContent = bubbleNode.querySelector(".thinking-toggle-content");
        if (toggleContent) {
          toggleContent.innerHTML = `
            <div class="web-search-indicator searching" style="display: flex; align-items: center; gap: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.54 12a9.5 9.5 0 1 1-9.5-9.5 9.5 9.5 0 0 1 9.5 9.5Z"/><path d="M22 12h-2"/></svg>
              <span class="status-text">Searching for "${data.summarizedQuery}"...</span>
            </div>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
          `;
        }
        scrollToBottom({ fromAI: true });
      } else if (type === "READING_COMPLETE") {
        console.log("READING_COMPLETE received:", { messageIndex, data, payload });
        const toggleContent = bubbleNode.querySelector(".thinking-toggle-content");
        if (toggleContent) {
          toggleContent.innerHTML = `
            <div class="web-search-indicator" style="display: flex; align-items: center; gap: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chromium-icon lucide-chromium"><path d="M10.88 21.94 15.46 14"/><path d="M21.17 8H12"/><path d="M3.95 6.06 8.54 14"/><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              <span class="status-text">Read ${data.pageCount} web pages</span>
            </div>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
          `;
        }
        mainText.innerHTML = getThinkingMarkup();
        scrollToBottom({ fromAI: true });

        const sessionId = payload.sessionId || current?.id;
        if (sessionId) {
          storePendingWebSearchData(sessionId, data.pageCount);
        }
      } else if (type === "REACT_START") {
        mainText.innerHTML = getThinkingMarkup();
        scrollToBottom({ fromAI: true });
      } else if (type === "THINKING") {
        try {
            console.log('[THINKING] Received chat-update THINKING:', { type, data, thinkData: data?.think });
            mainText.innerHTML = getThinkingMarkup();
            const thinkData = data?.think;
            const sessionId = data?.sessionId || payload.sessionId || current?.id;
            const sess = state.sessions.find(s => s.id === sessionId) || current;

            if (thinkData && sess) {
                // Check if it's structured thinking update (has title) or plain text
                if (typeof thinkData === 'object' && thinkData.title) {
                    // Backend thinking update with structure {title, content}
                    console.log('[THINKING] Routing to appendThinkingUpdate (structured):', thinkData);
                    appendThinkingUpdate(bubbleNode, thinkData, sess, messageIndex).catch(console.error);
                } else {
                    // Legacy: Plain text thinking stream
                    const thinkContent = typeof thinkData === 'string' ? thinkData : thinkData?.content || '';
                    console.log('[THINKING] Routing to appendThinking (plain text):', thinkContent);
                    appendThinking(bubbleNode, thinkContent, sess, messageIndex).catch(console.error);
                }
                scrollToBottom({ fromAI: true });
            }
        } catch (e) {
            console.error('Error handling THINKING update:', e);
        }
    }
    });
    window.api.on("search:status", (status) => {
      searchStatusQueue.push(status);
      log(
        "UI_SEARCH",
        1,
        "onSearchStatus",
        `Event '${status.step}' added to queue.`,
        { queue_length: searchStatusQueue.length },
      );
      processSearchStatusQueue();
    });
  }

  setupEventListeners();
  setupMobileSidebar();

  setupTextareaResize();
  setupTextareaCentralResize();
  setupTextareaProjectResize();
  setupResponsiveHandlers();
  window.addEventListener("beforeunload", async (e) => {
    // Save data before unload to prevent data loss
    try {
      await save?.();
      log("SAVE", 1, "beforeunload", "Data saved before page unload");
    } catch (err) {
      log("SAVE", 3, "beforeunload", "Failed to save before unload", { error: err });
    }
    
    streamManager.shutdownGracefully();
    if (markdownWorker) {
      markdownWorker.terminate();
      markdownWorker = null;
    }
  });
  
  initMarkdownWorker();
  
  load();
}

document.addEventListener("DOMContentLoaded", initializeApp);

// ===== TOAST NOTIFICATION (In-app, no native dialogs) =====

function showToast(message, type = 'info', delay = null) {
  // Kalau delay ga di-set, hitung otomatis berdasarkan panjang karakter
  if (delay === null) {
    const charLength = message.length;
    delay = Math.min(Math.max(4000, charLength * 50), 10000);
  }
  
  // Buat container untuk semua toast kalau belum ada
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column-reverse;
      gap: 10px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }
  
  // Buat toast baru
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    padding: 12px 16px;
    background: ${type === 'error' ? '#902424b4' : type === 'success' ? '#0e8a3aa1' : '#1b4d9e9e'};
    color: white;
    border-radius: var(--radius-lg);
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    pointer-events: auto;
    transform: translateY(100px);
    opacity: 0;
    transition: transform 0.3s ease-out, opacity 0.3s ease-out, margin-bottom 0.3s ease-out;
  `;
  
  // Tambahkan CSS animation kalau belum ada
  if (!document.querySelector('#toast-animations')) {
    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
      .toast-notification {
        transition: transform 0.3s ease-out, opacity 0.3s ease-out, margin-bottom 0.3s ease-out, max-height 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Masukkan toast ke container (karena column-reverse, ini akan muncul di bawah)
  container.appendChild(toast);
  
  // Trigger animation slide up
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });
  });
  
  // Auto remove setelah delay dengan smooth collapse
  setTimeout(() => {
    // Ambil tinggi toast sebelum dihapus
    const toastHeight = toast.offsetHeight;
    
    // Animasi keluar: slide down dan fade out
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
    toast.style.maxHeight = toastHeight + 'px';
    
    // Setelah fade out, collapse height-nya
    setTimeout(() => {
      toast.style.maxHeight = '0';
      toast.style.marginBottom = '0';
      toast.style.padding = '0 12px';
      toast.style.overflow = 'hidden';
      
      // Hapus element setelah animasi collapse selesai
      setTimeout(() => {
        toast.remove();
        // Hapus container kalau udah kosong
        if (container.children.length === 0) {
          container.remove();
        }
      }, 300);
    }, 300);
  }, delay);
}

// Add CSS animation if not exists
if (!document.querySelector('style[data-toast-animations]')) {
  const style = document.createElement('style');
  style.setAttribute('data-toast-animations', 'true');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ===== ACCOUNT HANDLER FUNCTIONS (Top-level) =====

async function updateSidebarAccountButton() {
  try {
    const syncConfig = await window.api.sync.getConfig();
    const cloudUser = syncConfig.currentCloudUser;
    const isCloudMode = syncConfig.currentMode === 'cloud';
    
    log('UI', 1, 'updateSidebarAccountButton', 'Sync config received', {
      cloudUser,
      currentCloudUsername: syncConfig.currentCloudUsername,
      profileUrl: syncConfig.profileUrl,
      currentMode: syncConfig.currentMode,
      isCloudMode
    });
    
    const defaultIcon = document.getElementById('default-settings-icon');
    const userProfile = document.getElementById('user-profile-container');
    const displayNameEl = document.getElementById('user-display-name');
    const profileTypeEl = document.getElementById('user-profile-type');
    const profilePic = document.getElementById('user-profile-pic');

    // Set profile type (Cloud or Internal) - based on currentMode setting
    if (profileTypeEl) {
      profileTypeEl.textContent = isCloudMode ? 'Cloud' : 'Internal';
    }
    
    if (cloudUser) {
      // User is logged in to Cloud
      defaultIcon.style.display = 'none';
      userProfile.style.display = 'flex';
      
      // Display GitHub username ONLY (clean, no numbers)
      const displayName = syncConfig.currentCloudUsername || cloudUser.split('@')[0];
      const capitalized = displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase();
      
      log('UI', 1, 'updateSidebarAccountButton', 'Display name resolved', {
        displayName,
        capitalized,
        usedUsername: !!syncConfig.currentCloudUsername,
        usedEmailFallback: !syncConfig.currentCloudUsername
      });
      
      if (displayNameEl) {
        displayNameEl.textContent = capitalized || 'User';
        log('UI', 1, 'updateSidebarAccountButton', 'Display name set', { text: displayNameEl.textContent });
      }
      
      // Set profile picture from local file (downloaded during login)
      if (profilePic) {
        if (syncConfig.profileUrl) {
          // Load profile photo from local file
          window.api.app.getProfilePhoto().then(result => {
            if (result.success && result.dataUrl) {
              profilePic.src = result.dataUrl;
              profilePic.style.display = 'block';
              log('UI', 1, 'updateSidebarAccountButton', 'Profile picture loaded from local file');
            } else {
              profilePic.style.display = 'none';
              log('UI', 2, 'updateSidebarAccountButton', 'No local profile picture found', { error: result.error });
            }
          }).catch(err => {
            profilePic.style.display = 'none';
            log('UI', 2, 'updateSidebarAccountButton', 'Failed to load profile picture', { error: err.message });
          });
        } else {
          profilePic.style.display = 'none';
          log('UI', 2, 'updateSidebarAccountButton', 'No profile picture URL in config');
        }
      }
      
      log('UI', 1, 'updateSidebarAccountButton', 'Sidebar updated with logged-in user profile', { 
        user: cloudUser, 
        username: displayName,
        mode: syncConfig.currentMode,
        hasProfilePic: !!syncConfig.profileUrl
      });
    } else {
      // User is not logged in (Internal/Local mode)
      defaultIcon.style.display = 'none';
      userProfile.style.display = 'flex';
      
      if (displayNameEl) {
        displayNameEl.textContent = 'Not logged in';
        log('UI', 1, 'updateSidebarAccountButton', 'Display name set to "Not logged in"');
      }
      
      // Load default profile image from userData
      if (profilePic) {
        window.api.app.getDefaultProfilePhoto().then(result => {
          if (result.success && result.dataUrl) {
            profilePic.src = result.dataUrl;
            profilePic.style.display = 'block';
            log('UI', 1, 'updateSidebarAccountButton', 'Default profile picture loaded');
          } else {
            profilePic.style.display = 'none';
            log('UI', 2, 'updateSidebarAccountButton', 'Default profile picture not found', { error: result.error });
          }
        }).catch(err => {
          profilePic.style.display = 'none';
          log('UI', 2, 'updateSidebarAccountButton', 'Failed to load default profile picture', { error: err.message });
        });
      }
      
      log('UI', 1, 'updateSidebarAccountButton', 'Sidebar updated with unauthenticated state');
    }
  } catch (e) {
    log('UI', 4, 'updateSidebarAccountButton', 'Failed to update sidebar', { error: e.message, stack: e.stack });
  }
}

async function updateAccountModalUI() {
  try {
    const syncConfig = await window.api.sync.getConfig();
    const cloudUser = syncConfig.currentCloudUser;
    
    log('UI', 1, 'updateAccountModalUI', 'Sync config received', {
      cloudUser,
      currentCloudUsername: syncConfig.currentCloudUsername,
      profileUrl: syncConfig.profileUrl,
      currentMode: syncConfig.currentMode
    });
    
    const notLoggedIn = document.getElementById('account-not-logged-in');
    const loggedIn = document.getElementById('account-logged-in');
    
    if (cloudUser) {
      notLoggedIn.classList.add('hidden');
      loggedIn.classList.remove('hidden');
      
      // Show logout state, hide login state
      const loginState = document.getElementById('login-state');
      const logoutState = document.getElementById('logout-state');
      if (loginState) loginState.classList.add('hidden');
      if (logoutState) logoutState.classList.remove('hidden');
      
      // Show close modal button only when logged in
      const closeModalBtn = document.getElementById('account-close-modal-btn');
      if (closeModalBtn) {
        closeModalBtn.style.display = 'none';
      }
      
      // Display GitHub username ONLY (clean, no numbers) - CAPITALIZE
      const displayName = syncConfig.currentCloudUsername || cloudUser.split('@')[0];
      const capitalized = displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase();
      
      log('UI', 1, 'updateAccountModalUI', 'Display name resolved', {
        displayName,
        usedUsername: !!syncConfig.currentCloudUsername,
        usedEmailFallback: !syncConfig.currentCloudUsername
      });
      
      const emailEl = document.getElementById('account-email');
      const nameEl = document.getElementById('account-name');
      
      // Show last synced time instead of email
      if (emailEl) {
        const lastSynced = syncConfig.lastSyncTime 
          ? new Date(syncConfig.lastSyncTime).toLocaleString() 
          : 'Never synced';
        emailEl.textContent = `Last synced: ${lastSynced}`;
      }
      if (nameEl) nameEl.textContent = capitalized || 'USER';
      
      log('UI', 1, 'updateAccountModalUI', 'DOM updated', {
        emailSet: emailEl?.textContent,
        nameSet: nameEl?.textContent
      });
      
      // Display profile picture from local file
      const profilePic = document.getElementById('account-profile-pic');
      if (profilePic) {
        if (syncConfig.profileUrl) {
          // Load profile photo from local file
          window.api.app.getProfilePhoto().then(result => {
            if (result.success && result.dataUrl) {
              profilePic.src = result.dataUrl;
              profilePic.style.display = 'block';
              log('UI', 1, 'updateAccountModalUI', 'Profile picture loaded from local file');
            } else {
              profilePic.style.display = 'none';
              log('UI', 2, 'updateAccountModalUI', 'No local profile picture found', { error: result.error });
            }
          }).catch(err => {
            profilePic.style.display = 'none';
            log('UI', 2, 'updateAccountModalUI', 'Failed to load profile picture', { error: err.message });
          });
        } else {
          profilePic.style.display = 'none';
          log('UI', 2, 'updateAccountModalUI', 'No profile picture URL in config');
        }
      }
      
      // Update data source buttons
      const isCloudMode = syncConfig.currentMode === 'cloud';
      const internalBtn = document.getElementById('data-source-internal');
      const cloudBtn = document.getElementById('data-source-cloud');
      
      if (isCloudMode) {
        // Cloud mode active
        internalBtn.classList.remove('active');
        internalBtn.disabled = false;
        cloudBtn.classList.add('active');
        cloudBtn.disabled = true; // Disable active button
        document.getElementById('data-source-info').textContent = 'Data loaded from GitHub private repository.';
      } else {
        // Internal mode active
        internalBtn.classList.add('active');
        internalBtn.disabled = true; // Disable active button
        cloudBtn.classList.remove('active');
        cloudBtn.disabled = false;
        document.getElementById('data-source-info').textContent = 'Data is loaded from your device\'s internal storage.';
      }
      
      // Load and display action history
      await loadAndDisplayActionHistory();
      
      log('UI', 1, 'updateAccountModalUI', 'Account modal updated', { user: cloudUser, username: displayName, mode: syncConfig.currentMode });
    } else {
      notLoggedIn.classList.remove('hidden');
      loggedIn.classList.add('hidden');
      
      // Show login state, hide logout state
      const loginState = document.getElementById('login-state');
      const logoutState = document.getElementById('logout-state');
      if (loginState) loginState.classList.remove('hidden');
      if (logoutState) logoutState.classList.add('hidden');
      
      // Hide close modal button when not logged in
      const closeModalBtn = document.getElementById('account-close-modal-btn');
      if (closeModalBtn) {
        closeModalBtn.style.display = 'none';
      }
      
      // Show "Not logged in" profile image in the modal
      const profilePic = document.getElementById('account-profile-pic');
      if (profilePic) {
        window.api.app.getDefaultProfilePhoto().then(result => {
          if (result.success && result.dataUrl) {
            profilePic.src = result.dataUrl;
            profilePic.style.display = 'block';
            log('UI', 1, 'updateAccountModalUI', 'Default profile picture loaded in modal');
          } else {
            profilePic.style.display = 'none';
            log('UI', 2, 'updateAccountModalUI', 'Default profile picture not found', { error: result.error });
          }
        }).catch(err => {
          profilePic.style.display = 'none';
          log('UI', 2, 'updateAccountModalUI', 'Failed to load default profile picture', { error: err.message });
        });
      }
      
      log('UI', 1, 'updateAccountModalUI', 'Account modal reset to "Not logged in" state');
    }
  } catch (e) {
    log('UI', 4, 'updateAccountModalUI', 'Failed to update account modal', { error: e.message, stack: e.stack });
  }
}

async function handleSidebarLogin() {
  const loginState = document.getElementById('login-state');
  const loginIcon = loginState?.querySelector('svg');
  const loginText = loginState?.querySelector('span');
  
  try {
    log('AUTH', 1, 'handleSidebarLogin', 'Starting GitHub OAuth flow from sidebar');
    
    // Save original content
    const originalIconHTML = loginIcon?.outerHTML || '';
    const originalText = loginText?.textContent || 'Log in with GitHub';
    
    // Show loading state in sidebar button
    if (loginIcon) {
      loginIcon.outerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="animation: spin 1s linear infinite;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" fill="none" stroke="currentColor"/>
        </svg>
      `;
    }
    if (loginText) {
      loginText.textContent = 'Redirecting, please wait...';
    }
    
    const result = await window.api.sync.startOAuth?.() || { success: false, error: 'OAuth not available' };
    
    if (result.success) {
      log('AUTH', 1, 'handleSidebarLogin', 'OAuth successful', { email: result.email, username: result.username });
      
      // Check if we need to restart app
      if (result.needsRestart) {
        showToast(`Logged in as ${result.username}. Restarting app...`, 'success');
        
        // Show success icon briefly before restart
        const newLoginIcon = loginState?.querySelector('svg');
        if (newLoginIcon) {
          newLoginIcon.outerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor"/>
            </svg>
          `;
        }
        if (loginText) {
          loginText.textContent = 'Success!';
        }
        
        setTimeout(() => {
          window.api.app.restart();
        }, 1500);
      } else {
        await updateAccountModalUI();
        await updateSidebarAccountButton();
        showToast(`Logged in as ${result.username}`, 'success');
        
        // Close dropdown after successful login
        closeDropdownWithAnimation($("#settings-menu"));
      }
    } else {
      log('AUTH', 4, 'handleSidebarLogin', 'OAuth failed', { error: result.error });
      const errorMsg = result.configured === false 
        ? `GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env`
        : `Login failed: ${result.error || 'Unknown error'}`;
      showToast(errorMsg, 'error');
      
      // Restore original state
      const newLoginIcon = loginState?.querySelector('svg');
      if (newLoginIcon && loginIcon) {
        newLoginIcon.outerHTML = originalIconHTML;
      }
      if (loginText) {
        loginText.textContent = originalText;
      }
    }
  } catch (e) {
    log('AUTH', 4, 'handleSidebarLogin', 'OAuth error', { error: e.message });
    showToast('An error occurred during login: ' + e.message, 'error');
    
    // Restore original state
    const loginStateRestore = document.getElementById('login-state');
    const newLoginIcon = loginStateRestore?.querySelector('svg');
    const newLoginText = loginStateRestore?.querySelector('span');
    
    if (newLoginIcon && loginIcon) {
      newLoginIcon.outerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="currentColor"/>
        </svg>
      `;
    }
    if (newLoginText) {
      newLoginText.textContent = 'Log in with GitHub';
    }
  }
}

async function handleGoogleLogin() {
  const loginBtn = document.getElementById('google-login-btn');
  const btnText = loginBtn?.querySelector('.btn-text');
  const btnSpinner = loginBtn?.querySelector('.btn-spinner');
  const btnIcon = loginBtn?.querySelector('.btn-icon');
  
  try {
    log('AUTH', 1, 'handleGitHubLogin', 'Starting GitHub OAuth flow');
    
    // Show loading state - force inline styles to ensure visibility
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.style.cursor = 'not-allowed';
      loginBtn.style.opacity = '0.7';
    }
    if (btnText) {
      btnText.style.display = 'none';
    }
    if (btnIcon) {
      btnIcon.style.display = 'none';
    }
    if (btnSpinner) {
      btnSpinner.style.display = 'inline-block';
    }
    
    log('AUTH', 1, 'handleGitHubLogin', 'Loading state applied', {
      btnExists: !!loginBtn,
      textExists: !!btnText,
      spinnerExists: !!btnSpinner,
      spinnerDisplay: btnSpinner?.style.display
    });
    
    const result = await window.api.sync.startOAuth?.() || { success: false, error: 'OAuth not available' };
    
    if (result.success) {
      log('AUTH', 1, 'handleGitHubLogin', 'OAuth successful', { email: result.email, username: result.username });
      
      // Check if we need to restart app
      if (result.needsRestart) {
        showToast(`Logged in as ${result.username}. Restarting app...`, 'success');
        setTimeout(() => {
          window.api.app.restart();
        }, 1500);
      } else {
        await updateAccountModalUI();
        await updateSidebarAccountButton();
        showToast(`Logged in as ${result.username}`, 'success');
        
        // Reset button state
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.style.cursor = '';
          loginBtn.style.opacity = '';
        }
        if (btnText) btnText.style.display = 'inline';
        if (btnIcon) btnIcon.style.display = 'inline';
        if (btnSpinner) btnSpinner.style.display = 'none';
      }
    } else {
      log('AUTH', 4, 'handleGitHubLogin', 'OAuth failed', { error: result.error });
      const errorMsg = result.configured === false 
        ? `GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env. Get credentials from github.com/settings/developers`
        : `Login failed: ${result.error || 'Unknown error'}`;
      showToast(errorMsg, 'error');
      
      // Reset button state
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.style.cursor = '';
        loginBtn.style.opacity = '';
      }
      if (btnText) btnText.style.display = 'inline';
      if (btnIcon) btnIcon.style.display = 'inline';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
  } catch (e) {
    log('AUTH', 4, 'handleGitHubLogin', 'OAuth error', { error: e.message });
    showToast('An error occurred during login: ' + e.message, 'error');
    
    // Reset button state
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.style.cursor = '';
      loginBtn.style.opacity = '';
    }
    if (btnText) btnText.style.display = 'inline';
    if (btnIcon) btnIcon.style.display = 'inline';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

function handleLogout() {
  const message = `
  <p>Signing out will:</p>
  <ul style="margin: 8px 0 0 18px; line-height: 1.4;">
  <li>Restart the app immediately and return to internal mode.</li>
  <li>Create an automatic backup to GitHub after restart.</li>
  <li>Delete local cloud data after backup completes.</li>
  </ul>
  <p style="margin-top: 12px;">Continue?</p>
  `;

  showConfirmationModal({
    title: 'Logout from account?',
    message,
    confirmText: 'Logout & Restart',
    cancelText: 'Cancel',
    confirmLoadingText: 'Logging out...',
    confirmVariant: 'danger',
    closeOnSuccess: false,
    lockWhileProcessing: true,
    showErrorToast: false,
    onConfirm: async () => {
      await performLogout();
    }
  });
}

async function performLogout() {
  try {
    log('AUTH', 1, 'handleLogout', 'Logging out');

    // Close dropdown menu
    const accountMenuDropdown = document.getElementById('account-menu-dropdown');
    const accountMenuBtn = document.getElementById('account-menu-btn');
    if (accountMenuDropdown) {
      accountMenuDropdown.classList.remove('persistent-open');
    }
    if (accountMenuBtn) {
      accountMenuBtn.classList.remove('persistent-active');
    }
    
    // Get account name element and save original text
    const accountName = document.getElementById('account-name');
    const originalName = accountName ? accountName.textContent : 'User Name';
    const accountCard = document.querySelector('.user-profile-card');
    
    // Get logout button and show loading state
    const logoutBtn = document.getElementById('account-logout-btn');
    const originalText = logoutBtn ? logoutBtn.textContent : 'Logout';
    
    // Update account name to "Logging out..." with disabled styling
    if (accountName) {
      accountName.textContent = 'Logging out...';
      accountName.style.opacity = '0.6';
      accountName.style.cursor = 'not-allowed';
    }
    
    // Disable profile card interaction
    if (accountCard) {
      accountCard.style.opacity = '0.6';
      accountCard.style.pointerEvents = 'none';
    }
    
    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Logging out...';
      logoutBtn.style.cursor = 'not-allowed';
      logoutBtn.style.opacity = '0.6';
    }

    // NOTE: Automatic backup will be done AFTER restart (faster logout UX)
    // Cloud data will also be deleted after backup completes
    log('AUTH', 1, 'handleLogout', 'Backup and cleanup scheduled for after restart');

    log('AUTH', 1, 'handleLogout', 'Calling logout API');
    const result = await window.api.sync.logout({ deleteCloudData: true });

    if (result.success) {
      log('AUTH', 1, 'handleLogout', 'Logout successful, preparing to restart');
      
      // Show full loading overlay (will cover modal)
      const loadingOverlay = document.getElementById('loading-overlay');
      const loadingText = document.getElementById('loading-text');
      
      if (loadingOverlay && loadingText) {
        loadingText.textContent = 'Logging out...';
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.opacity = '1';
      }
      
      // Update loading text to show restart message after short delay
      setTimeout(() => {
        if (loadingText) {
          loadingText.textContent = 'Restarting app...';
        }
      }, 500);
      
      // Keep loading overlay visible - app will restart automatically
      // Don't close modal - overlay will cover everything
      
    } else {
      log('AUTH', 4, 'handleLogout', 'Logout failed', { error: result.error });
      
      // Restore account name
      if (accountName) {
        accountName.textContent = originalName;
        accountName.style.opacity = '';
        accountName.style.cursor = '';
      }
      
      // Restore profile card
      if (accountCard) {
        accountCard.style.opacity = '';
        accountCard.style.pointerEvents = '';
      }
      
      // Restore button state
      if (logoutBtn) {
        logoutBtn.disabled = false;
        logoutBtn.textContent = originalText;
        logoutBtn.style.cursor = '';
        logoutBtn.style.opacity = '';
      }

      showToast(`Logout failed: ${result.error}`, 'error');
      const logoutError = new Error(result.error || 'Logout failed');
      logoutError.handled = true;
      throw logoutError;
    }
  } catch (e) {
    log('AUTH', 4, 'handleLogout', 'Logout error', { error: e.message });

    // Restore account name
    const accountName = document.getElementById('account-name');
    if (accountName) {
      accountName.textContent = 'User Name';
      accountName.style.opacity = '';
      accountName.style.cursor = '';
    }
    
    // Restore profile card
    const accountCard = document.querySelector('.user-profile-card');
    if (accountCard) {
      accountCard.style.opacity = '';
      accountCard.style.pointerEvents = '';
    }
    
    // Restore button state
    const logoutBtn = document.getElementById('account-logout-btn');
    if (logoutBtn) {
      logoutBtn.disabled = false;
      logoutBtn.textContent = 'Logout';
      logoutBtn.style.cursor = '';
      logoutBtn.style.opacity = '';
    }

    if (!e?.handled) {
      showToast('Logout error: ' + e.message, 'error');
    }
    throw e;
  }
}

async function loadAndDisplayActionHistory() {
  try {
    // Load action history from per-account file
    const result = await window.api.sync.getActionHistory();
    const historyList = result.success ? (result.history || []) : [];
    const section = document.getElementById('action-history-section');
    const container = document.getElementById('action-history-container');
    const emptyMsg = document.getElementById('action-history-empty');
    
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    // If no history, hide the entire section
    if (!historyList || historyList.length === 0) {
      if (section) section.style.display = 'none';
      if (emptyMsg) emptyMsg.style.display = 'none';
      container.style.display = 'none';
      return;
    }
    
    // Show the section if there's history
    if (section) section.style.display = 'block';
    
    // Show last 10 items (most recent first)
    const recentHistory = historyList.slice(-10).reverse();
    
    recentHistory.forEach(item => {
      const itemEl = document.createElement('div');
      const itemClass = `action-history-item action-history-item-${item.type}${item.status === 'failed' ? ' action-history-item-failed' : ''}`;
      itemEl.className = itemClass;
      
      // Use same icons as in account dropdown menu
      let icon = '?';
      if (item.type === 'sync') {
        icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
      } else if (item.type === 'backup') {
        icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
      }
      
      const label = item.type === 'sync' ? 'Sync' : item.type === 'backup' ? 'Backup' : 'Action';
      const status = item.status === 'failed' ? ' (failed)' : '';
      const timestamp = formatRelativeTime(item.timestamp);
      
      itemEl.innerHTML = `
        <div class="action-history-item-icon">${icon}</div>
        <div class="action-history-item-content">
          <div class="action-history-item-label">${label}${status}</div>
          <div class="action-history-item-timestamp">${timestamp}</div>
        </div>
      `;
      
      container.appendChild(itemEl);
    });
    
    if (emptyMsg) emptyMsg.style.display = 'none';
    container.style.display = 'flex';
    
    log('UI', 1, 'loadAndDisplayActionHistory', 'Action history loaded from user file', { count: recentHistory.length });
  } catch (e) {
    log('UI', 4, 'loadAndDisplayActionHistory', 'Failed to load action history', { error: e.message });
  }
}

async function handleSyncNow() {
  try {
    log('SYNC', 1, 'handleSyncNow', 'Sync triggered by user');
    
    showToast('Syncing with GitHub...', 'info');
    
    const result = await window.api.sync.syncNow();
    
    log('SYNC', 1, 'handleSyncNow', 'Sync result received', { 
      success: result.success, 
      error: result.error,
      repository: result.repository
    });
    
    if (result.success) {
      log('SYNC', 1, 'handleSyncNow', 'Sync completed successfully', { repo: result.repository });
      showToast(`Synced from: ${result.repository}`, 'success');
      
      // Record action in history
      await window.api.sync.recordActionHistory('sync', 'success');
      
      // Show full loading overlay and restart (same as data source switch)
      const loadingOverlay = document.getElementById('loading-overlay');
      const loadingText = document.getElementById('loading-text');
      
      if (loadingOverlay && loadingText) {
        loadingText.textContent = 'Loading synced data...';
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.opacity = '1';
      }
      
      // Restart app to reload synced data
      setTimeout(() => {
        if (loadingText) {
          loadingText.textContent = 'Restarting app...';
        }
        
        setTimeout(() => {
          window.api.app.restart();
        }, 500);
      }, 800);
    } else {
      log('SYNC', 4, 'handleSyncNow', 'Sync operation failed', { 
        error: result.error,
        fullResult: result
      });
      showToast(`Sync failed: ${result.error}`, 'error');
      
      // Record action in history as failed
      await window.api.sync.recordActionHistory('sync', 'failed');
      await loadAndDisplayActionHistory();
    }
  } catch (e) {
    log('SYNC', 4, 'handleSyncNow', 'Sync error exception', { 
      error: e.message,
      stack: e.stack
    });
    showToast('Sync error: ' + e.message, 'error');
    
    // Record action in history as failed
    await window.api.sync.recordActionHistory('sync', 'failed');
    await loadAndDisplayActionHistory();
  }
}

async function handleBackupNow() {
  try {
    log('SYNC', 1, 'handleBackupNow', 'Backup triggered by user');
    
    showToast('Backing up to GitHub...', 'info');
    
    const result = await window.api.sync.backupNow();
    
    log('SYNC', 1, 'handleBackupNow', 'Backup result received', { 
      success: result.success, 
      needsConflictResolution: result.needsConflictResolution,
      error: result.error,
      repository: result.repository
    });
    
    // Check if conflicts detected
    if (result.needsConflictResolution && result.conflicts) {
      log('SYNC', 2, 'handleBackupNow', 'Conflicts detected, showing resolution modal', {
        conflictCount: result.conflicts.length
      });
      
      showToast(`${result.conflicts.length} conflict(s) detected`, 'warning');
      await showConflictResolutionModal(result.conflicts);
      return;
    }
    
    if (result.success) {
      log('SYNC', 1, 'handleBackupNow', 'Backup completed successfully', { repo: result.repository });
      showToast(`Backed up to: ${result.repository}`, 'success');
      
      // Record action in history
      await window.api.sync.recordActionHistory('backup', 'success');
      await loadAndDisplayActionHistory();
    } else {
      log('SYNC', 4, 'handleBackupNow', 'Backup operation failed', { 
        error: result.error,
        fullResult: result
      });
      showToast(`Backup failed: ${result.error}`, 'error');
      
      // Record action in history as failed
      await window.api.sync.recordActionHistory('backup', 'failed');
      await loadAndDisplayActionHistory();
    }
  } catch (e) {
    log('SYNC', 4, 'handleBackupNow', 'Backup error exception', { 
      error: e.message,
      stack: e.stack
    });
    showToast('Backup error: ' + e.message, 'error');
    
    // Record action in history as failed
    await window.api.sync.recordActionHistory('backup', 'failed');
    await loadAndDisplayActionHistory();
  }
}

/**
 * Show conflict resolution modal
 * 
 * @param {Array} conflicts - Array of conflict objects
 */
async function showConflictResolutionModal(conflicts) {
  log('SYNC', 1, 'showConflictResolutionModal', 'Displaying conflict modal', {
    conflictCount: conflicts.length
  });
  
  const modal = document.getElementById('sync-conflict-modal');
  if (!modal) {
    log('SYNC', 4, 'showConflictResolutionModal', 'Conflict modal not found in DOM');
    showToast('Conflict modal not available', 'error');
    return;
  }
  
  const resolutions = [];
  let currentConflictIndex = 0;
  
  async function showNextConflict() {
    if (currentConflictIndex >= conflicts.length) {
      // All conflicts resolved, apply and continue backup
      closeModalWithAnimation(modal);
      
      showToast('Applying resolutions...', 'info');
      
      try {
        const result = await window.api.sync.resolveConflicts(resolutions);
        
        if (result.success) {
          log('SYNC', 1, 'showConflictResolutionModal', 'Conflicts resolved and backup completed', {
            conflictsResolved: result.conflictsResolved
          });
          showToast(`Backup completed. ${result.conflictsResolved} conflict(s) resolved`, 'success');
          
          // Record success
          await window.api.sync.recordActionHistory('backup', 'success');
          await loadAndDisplayActionHistory();
        } else {
          log('SYNC', 4, 'showConflictResolutionModal', 'Failed to apply resolutions', {
            error: result.error
          });
          showToast(`Failed to apply resolutions: ${result.error}`, 'error');
          
          // Record failure
          await window.api.sync.recordActionHistory('backup', 'failed');
          await loadAndDisplayActionHistory();
        }
      } catch (err) {
        log('SYNC', 4, 'showConflictResolutionModal', 'Error applying resolutions', {
          error: err.message
        });
        showToast(`Error: ${err.message}`, 'error');
        
        await window.api.sync.recordActionHistory('backup', 'failed');
        await loadAndDisplayActionHistory();
      }
      
      return;
    }
    
    const conflict = conflicts[currentConflictIndex];
    
    // Update modal UI
    const sessionNameEl = document.getElementById('conflict-session-name');
    const counterEl = document.getElementById('conflict-counter');
    const localInfoEl = document.getElementById('conflict-local-info');
    const cloudInfoEl = document.getElementById('conflict-cloud-info');
    const localPreviewEl = document.getElementById('conflict-local-preview');
    const cloudPreviewEl = document.getElementById('conflict-cloud-preview');
    
    if (sessionNameEl) {
      sessionNameEl.textContent = conflict.local.name || 'Unnamed Session';
    }
    
    if (counterEl) {
      counterEl.textContent = `Conflict ${currentConflictIndex + 1} of ${conflicts.length}`;
    }
    
    if (localInfoEl) {
      localInfoEl.innerHTML = `
        <div><strong>Device:</strong> ${conflict.local.device_id?.substring(0, 8) || 'Unknown'}</div>
        <div><strong>Last Modified:</strong> ${new Date(conflict.local.updated_at).toLocaleString()}</div>
        <div><strong>Type:</strong> ${conflict.type}</div>
      `;
    }
    
    if (cloudInfoEl) {
      cloudInfoEl.innerHTML = `
        <div><strong>Device:</strong> ${conflict.cloud.device_id?.substring(0, 8) || 'Unknown'}</div>
        <div><strong>Last Modified:</strong> ${new Date(conflict.cloud.updated_at).toLocaleString()}</div>
        <div><strong>Type:</strong> ${conflict.type}</div>
      `;
    }
    
    if (localPreviewEl) {
      if (conflict.type === 'session') {
        localPreviewEl.textContent = `Session: ${conflict.local.name || 'Unnamed'}\nHash: ${conflict.local.hash?.substring(0, 16)}...`;
      } else {
        localPreviewEl.textContent = `Message: ${conflict.local.content?.substring(0, 100) || 'No content'}...`;
      }
    }
    
    if (cloudPreviewEl) {
      if (conflict.type === 'session') {
        cloudPreviewEl.textContent = `Session: ${conflict.cloud.name || 'Unnamed'}\nHash: ${conflict.cloud.hash?.substring(0, 16)}...`;
      } else {
        cloudPreviewEl.textContent = `Message: ${conflict.cloud.content?.substring(0, 100) || 'No content'}...`;
      }
    }
    
    // Show modal
    openModalWithAnimation(modal);
  }
  
  // Set up button handlers
  const keepLocalBtn = document.getElementById('conflict-keep-local');
  const keepCloudBtn = document.getElementById('conflict-keep-cloud');
  const mergeBothBtn = document.getElementById('conflict-merge-both');
  const closeBtn = document.getElementById('conflict-close');
  
  const handleResolution = (resolution) => {
    const conflict = conflicts[currentConflictIndex];
    resolutions.push({
      conflictId: conflict.id,
      resolution: resolution,
      type: conflict.type
    });
    
    log('SYNC', 2, 'showConflictResolutionModal', 'User chose resolution', {
      conflictId: conflict.id,
      resolution: resolution,
      type: conflict.type
    });
    
    currentConflictIndex++;
    showNextConflict();
  };
  
  keepLocalBtn.onclick = () => handleResolution('local');
  keepCloudBtn.onclick = () => handleResolution('cloud');
  mergeBothBtn.onclick = () => handleResolution('merge');
  closeBtn.onclick = () => {
    // Close without resolving - default to local
    log('SYNC', 2, 'showConflictResolutionModal', 'User closed modal, defaulting to local');
    while (currentConflictIndex < conflicts.length) {
      const conflict = conflicts[currentConflictIndex];
      resolutions.push({
        conflictId: conflict.id,
        resolution: 'local',
        type: conflict.type
      });
      currentConflictIndex++;
    }
    modal.classList.add('hidden');
  };
  
  // Show first conflict
  showNextConflict();
}

async function handleDataSourceSwitch(mode) {
  try {
    const syncConfig = await window.api.sync.getConfig();

    if (syncConfig.currentMode === mode) {
      log('SYNC', 2, 'handleDataSourceSwitch', 'Requested mode is already active', { mode });
      return;
    }

    if (mode === 'cloud' && !syncConfig.currentCloudUser) {
      showToast('Please sign in with GitHub first.', 'error');
      return;
    }

    const modeLabel = mode === 'cloud' ? 'Cloud (GitHub)' : 'Internal';
    const message = mode === 'cloud'
      ? `
      <p>Data will be redirected to <strong>${modeLabel}</strong>.</p>
      <p style="margin-top: 8px;">This process requires an application restart and will synchronize your cloud database.</p>
      `
      : `
      <p>Switching to <strong>${modeLabel}</strong> will:</p>
      <ul style="margin: 8px 0 0 18px; line-height: 1.4;">
      <li>Restart the app immediately to load data from internal storage.</li>
      <li>Create an automatic backup to GitHub after restart.</li>
      </ul>
      <p style="margin-top: 12px;">Continue?</p>
      `;

    showConfirmationModal({
      title: `Switch to ${modeLabel}?`,
      message,
      confirmText: `Switch to ${modeLabel}`,
      cancelText: 'Cancel',
      confirmLoadingText: 'Switching...',
      confirmVariant: 'primary',
      closeOnSuccess: false,
      lockWhileProcessing: true,
      showErrorToast: false,
      onConfirm: async () => {
        await executeDataSourceSwitch(mode);
      }
    });
  } catch (e) {
    log('SYNC', 4, 'handleDataSourceSwitch', 'Failed to open confirmation modal', { error: e.message });
    showToast('Switch error: ' + e.message, 'error');
  }
}

async function executeDataSourceSwitch(mode) {
  try {
    log('SYNC', 1, 'handleDataSourceSwitch', 'Switching data source', { newMode: mode });
    
    const syncConfig = await window.api.sync.getConfig();
    
    // Prevent switching to current mode
    if (syncConfig.currentMode === mode) {
      log('SYNC', 2, 'handleDataSourceSwitch', 'Already in this mode', { currentMode: syncConfig.currentMode });
      return;
    }
    
    // Check if cloud mode requires login
    if (mode === 'cloud' && !syncConfig.currentCloudUser) {
      showToast('Please sign in with GitHub first.', 'error');
      return;
    }
    
    // Get button elements
    const internalBtn = document.getElementById('data-source-internal');
    const cloudBtn = document.getElementById('data-source-cloud');
    if (!internalBtn || !cloudBtn) return;
    
    const targetBtn = mode === 'internal' ? internalBtn : cloudBtn;
    const otherBtn = mode === 'internal' ? cloudBtn : internalBtn;
    
    // FADE ANIMATION: Toggle active classes FIRST (fade in target, fade out other)
    otherBtn.classList.remove('active');
    targetBtn.classList.add('active');
    
    // Small delay to let fade animation start
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Disable both buttons to prevent spam
    internalBtn.disabled = true;
    cloudBtn.disabled = true;
    
    // Add loading state to target button
    const originalHTML = targetBtn.innerHTML;
    targetBtn.classList.add('loading');
    
    // NOTE: Automatic backup will be done AFTER restart when switching from cloud to internal (faster UX)
    if (syncConfig.currentMode === 'cloud' && mode === 'internal' && syncConfig.currentCloudUser) {
      log('SYNC', 1, 'executeDataSourceSwitch', 'Backup scheduled for after restart (cloud -> internal switch)');
    }
    
    targetBtn.innerHTML = `
      <svg style="animation: spin 1s linear infinite; margin-right: 6px; transform-origin: center;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Switching...
    `;
    
    // Call API to switch mode
    const result = await window.api.sync.switchMode({ mode });
    
    if (result.success) {
      log('SYNC', 1, 'handleDataSourceSwitch', 'Mode switched, restarting app', { newMode: mode });
      
      // Show success state
      targetBtn.innerHTML = `
        <svg style="margin-right: 6px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Success!
      `;
      
      // Show full loading overlay
      const loadingOverlay = document.getElementById('loading-overlay');
      const loadingText = document.getElementById('loading-text');
      
      if (loadingOverlay && loadingText) {
        loadingText.textContent = `Switching to ${mode} mode...`;
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.opacity = '1';
      }
      
      // Restart after delay
      setTimeout(() => {
        if (loadingText) {
          loadingText.textContent = 'Restarting app...';
        }
        
        setTimeout(() => {
          window.api.app.restart();
        }, 500);
      }, 800);
      
    } else {
      log('SYNC', 4, 'handleDataSourceSwitch', 'Failed to switch mode', { error: result.error });
      
      // Restore button state
      targetBtn.classList.remove('loading');
      targetBtn.innerHTML = originalHTML;
      
      // Re-enable buttons based on current mode
      if (syncConfig.currentMode === 'internal') {
        if (internalBtn) {
          internalBtn.disabled = true;
          internalBtn.classList.add('active');
        }
        if (cloudBtn) {
          cloudBtn.disabled = false;
          cloudBtn.classList.remove('active');
        }
      } else {
        if (internalBtn) {
          internalBtn.disabled = false;
          internalBtn.classList.remove('active');
        }
        if (cloudBtn) {
          cloudBtn.disabled = true;
          cloudBtn.classList.add('active');
        }
      }

      showToast(`Failed: ${result.error}`, 'error');
      const switchError = new Error(result.error || 'Failed to switch data source');
      switchError.handled = true;
      throw switchError;
    }
  } catch (e) {
    log('SYNC', 4, 'handleDataSourceSwitch', 'Switch error', { error: e.message });
    if (!e?.handled) {
      showToast('Switch error: ' + e.message, 'error');
    }

    // Restore buttons on error
    await updateAccountModalUI();
    throw e;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initConfirmationModal();

  // Load sync config and setup account UI on init
  try {
    const syncConfig = await window.api.sync.getConfig();
    log('INIT', 1, 'DOMContentLoaded', 'Sync config loaded', {
      mode: syncConfig.currentMode,
      cloudUser: syncConfig.currentCloudUser
    });
    
    // Update sidebar and modal on app start
    await updateSidebarAccountButton();
    await updateAccountModalUI();
  } catch (e) {
    log('INIT', 3, 'DOMContentLoaded', 'Failed to load sync config', { error: e.message });
  }

  // TEMPORARILY DISABLED FOR PRODUCTION RELEASE - Custom tooltips are beta and have bugs
  /*
  // Handle custom tooltips for all elements with title attribute
  const tooltipMap = new WeakMap(); // Use WeakMap to avoid memory leaks
  let currentTooltip = null;

  // Function to initialize tooltips for elements with title
  const initializeTooltips = () => {
    const elementsWithTitle = document.querySelectorAll('[title]');
    elementsWithTitle.forEach(element => {
      if (!tooltipMap.has(element)) {
        const originalTitle = element.getAttribute('title');
        tooltipMap.set(element, originalTitle);
        // DON'T remove title attribute - we need it for cloning!
        // Instead, we'll suppress native tooltip via mouseenter handler

        // Attach event listeners directly to the element
        element.addEventListener('mouseenter', handleMouseEnter);
        element.addEventListener('mouseleave', handleMouseLeave);
      }
    });
  };

  const handleMouseEnter = (event) => {
    if (currentTooltip) return; // Prevent multiple tooltips

    const target = event.target;
    const originalTitle = tooltipMap.get(target);
    if (!originalTitle) return;

    // Temporarily remove title to suppress native tooltip
    const titleAttr = target.getAttribute('title');
    if (titleAttr) {
      target.removeAttribute('title');
      // Restore after a brief delay (after native tooltip would have shown)
      setTimeout(() => {
        if (target && document.contains(target)) {
          target.setAttribute('title', titleAttr);
        }
      }, 50);
    }

    // Create tooltip element
    currentTooltip = document.createElement('div');
    currentTooltip.className = 'custom-tooltip'; // Start without 'show' class

    // Create tooltip text span to match CSS structure
    const tooltipText = document.createElement('span');
    tooltipText.className = 'tooltip-text';
    tooltipText.textContent = originalTitle;
    currentTooltip.appendChild(tooltipText);

    document.body.appendChild(currentTooltip);

    // Smart positioning after it's added to DOM
    setTimeout(() => {
      if (currentTooltip) {
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = currentTooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let top = targetRect.bottom + 5; // Default: below element
        let left = targetRect.left; // Default: align start (left)
        let positionClass = 'below'; // Default position
        let alignClass = 'align-start'; // Default alignment

        // Check if tooltip would overflow right side
        if (left + tooltipRect.width > viewportWidth) {
          left = targetRect.right - tooltipRect.width; // Align end (right)
          alignClass = 'align-end';
        }

        // Check if tooltip would overflow bottom
        if (top + tooltipRect.height > viewportHeight) {
          top = targetRect.top - tooltipRect.height - 5; // Move above element
          positionClass = 'above';
        }

        // Ensure tooltip doesn't go off-screen on left
        if (left < 0) {
          left = 0;
          alignClass = 'align-start';
        }

        // Ensure tooltip doesn't go off-screen on top
        if (top < 0) {
          top = targetRect.bottom + 5; // Fall back to below if above also overflows
          positionClass = 'below';
        }

        currentTooltip.className = `custom-tooltip ${positionClass} ${alignClass}`;
        currentTooltip.style.left = `${left}px`;
        currentTooltip.style.top = `${top}px`;

        // Add 'show' class after positioning to trigger animation
        requestAnimationFrame(() => {
          if (currentTooltip) {
            currentTooltip.classList.add('show');
          }
        });
      }
    }, 0);
  };  const handleMouseLeave = (event) => {
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  };

  // Initialize tooltips on load
  initializeTooltips();

  // Expose to window for explicit re-initialization after DOM updates
  window._reinitializeTooltips = initializeTooltips;

  // Also initialize periodically for dynamic content (fallback)
  const periodicInit = setInterval(() => {
    initializeTooltips();
  }, 1000); // Check every second

  // Stop periodic initialization after 30 seconds
  setTimeout(() => {
    clearInterval(periodicInit);
  }, 30000);

  // Re-initialize tooltips when DOM changes (for dynamic content)
  const observer = new MutationObserver((mutations) => {
    let shouldReinitialize = false;
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && (node.hasAttribute('title') || node.querySelector('[title]'))) {
          shouldReinitialize = true;
        }
      });
    });
    if (shouldReinitialize) {
      initializeTooltips();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  */
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.style.display = "none";
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  }, 3000);
});

window.addEventListener("error", (event) => {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
});

// ==================== MODAL HELPER FUNCTIONS ====================

function initConfirmationModal() {
  confirmationModal = document.getElementById('confirmation-modal');
  if (!confirmationModal) {
    log('UI', 3, 'initConfirmationModal', 'Confirmation modal not found in DOM');
    return;
  }

  confirmationTitleEl = document.getElementById('confirmation-title');
  confirmationMessageEl = document.getElementById('confirmation-message');
  confirmationConfirmBtn = document.getElementById('confirmation-confirm-btn');
  confirmationCancelBtn = document.getElementById('confirmation-cancel-btn');
  confirmationCloseBtn = document.getElementById('confirmation-close-btn');

  const overlay = confirmationModal.querySelector('.modal-overlay');

  const handleDismiss = () => {
    if (isConfirmationProcessing && confirmationModalOptions?.lockWhileProcessing) {
      return;
    }
    confirmationModal.classList.remove('processing');
    closeModalWithAnimation(confirmationModal);
  };

  if (overlay) {
    overlay.addEventListener('click', handleDismiss);
  }

  if (confirmationCancelBtn) {
    confirmationCancelBtn.addEventListener('click', handleDismiss);
  }

  if (confirmationCloseBtn) {
    confirmationCloseBtn.addEventListener('click', handleDismiss);
  }
}

/**
 * Close modal with animation
 * @param {HTMLElement|string} modal - Modal element or selector
 * @param {number} duration - Animation duration in ms (default 200)
 */
function closeModalWithAnimation(modal, duration = 200) {
  const modalElement = typeof modal === 'string' ? document.querySelector(modal) : modal;
  if (!modalElement) return;

  // Add closing class to trigger animation
  modalElement.classList.add('closing');

  // After animation completes, add hidden class and remove closing
  setTimeout(() => {
    modalElement.classList.add('hidden');
    modalElement.classList.remove('closing');
  }, duration);
}

/**
 * Open modal with animation
 * @param {HTMLElement|string} modal - Modal element or selector
 */
function openModalWithAnimation(modal) {
  const modalElement = typeof modal === 'string' ? document.querySelector(modal) : modal;
  if (!modalElement) return;

  // Remove hidden and closing classes
  modalElement.classList.remove('hidden', 'closing');
}

/**
 * Close dropdown/card with animation (for non-modal elements like settings-menu)
 * @param {HTMLElement|string} element - Element or selector
 * @param {number} duration - Animation duration in ms (default 200)
 */
function closeDropdownWithAnimation(element, duration = 200) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el || el.classList.contains('hidden')) return;
  
  // Add closing class to trigger animation
  el.classList.add('closing');
  
  // After animation completes, add hidden class and remove closing
  setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('closing');
  }, duration);
}

/**
 * Open dropdown/card with animation
 * @param {HTMLElement|string} element - Element or selector
 */
function openDropdownWithAnimation(element) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) return;
  
  // Remove hidden and closing classes
  el.classList.remove('hidden', 'closing');
}

// ==================== NEW KEYBOARD SHORTCUTS ====================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl + N - New Session
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      const newChatBtn = document.getElementById('new-chat');
      if (newChatBtn) newChatBtn.click();
      return;
    }

    // Ctrl + Tab - Next Session (only in chat session)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      
      // Only work if currently in a chat session
      if (!current || !current.id) return;
      
      const sessions = state.sessions;
      if (sessions.length === 0) return;
      
      const currentIndex = sessions.findIndex(s => s.id === current.id);
      const nextIndex = currentIndex + 1;
      
      // Don't cycle - stop at the last session
      if (nextIndex < sessions.length) {
        setCurrent(sessions[nextIndex]);
      }
      return;
    }

    // Ctrl + Shift + Tab - Previous Session (only in chat session)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      
      // Only work if currently in a chat session
      if (!current || !current.id) return;
      
      const sessions = state.sessions;
      if (sessions.length === 0) return;
      
      const currentIndex = sessions.findIndex(s => s.id === current.id);
      const prevIndex = currentIndex - 1;
      
      // Don't cycle - stop at the first session
      if (prevIndex >= 0) {
        setCurrent(sessions[prevIndex]);
      }
      return;
    }

    // / (Slash) - Focus form or search bar
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      // Check if already focused on input/textarea
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        // Already focused, don't do anything
        return;
      }

      e.preventDefault();

      // Determine current page state
      const chatArea = document.querySelector('.chat-area');
      
      if (chatArea && chatArea.classList.contains('chats-active')) {
        // Chats page - focus search bar
        const searchInput = document.getElementById('chats-search');
        if (searchInput) searchInput.focus();
        
      } else if (chatArea && chatArea.classList.contains('artifacts-active')) {
        // Artifacts page - focus search bar
        const searchInput = document.getElementById('artifacts-search');
        if (searchInput) searchInput.focus();
        
      } else if (chatArea && chatArea.classList.contains('projects-active')) {
        const projectDetailView = document.getElementById('project-detail-view');
        
        if (projectDetailView && projectDetailView.classList.contains('active') && currentProject) {
          // Project detail page - focus message input
          const projectInput = document.getElementById('project-message-input');
          if (projectInput) projectInput.focus();
        } else {
          // Projects list page - focus search bar
          const searchInput = document.getElementById('projects-search');
          if (searchInput) searchInput.focus();
        }
        
      } else if (current && current.id) {
        // Regular chat session - focus message input
        const msgInput = document.getElementById('msg');
        if (msgInput) msgInput.focus();
      }
      
      return;
    }
  });
}

// Initialize keyboard shortcuts on page load
document.addEventListener('DOMContentLoaded', initKeyboardShortcuts);

// ==================== MOUSE BUTTONS NAVIGATION ====================
// Initialize page history localStorage
const PAGE_HISTORY_KEY = 'clustrix_page_history';
let isNavigatingHistory = false; // Flag to prevent recursive pushes

function initPageHistory() {
  // Clear history on page refresh/reload
  localStorage.removeItem(PAGE_HISTORY_KEY);
  
  // Create new history with current page state
  localStorage.setItem(PAGE_HISTORY_KEY, JSON.stringify({
    stack: [getCurrentPageState()],
    index: 0
  }));
}

function getCurrentPageState() {
  // Determine current page based on chat-area classes
  const chatArea = document.querySelector('.chat-area');
  
  if (!chatArea) {
    return { page: 'welcome', sessionId: null };
  }
  
  // Check for list pages (chats, artifacts, projects list)
  if (chatArea.classList.contains('chats-active')) {
    return { page: 'chats-list' };
  } else if (chatArea.classList.contains('artifacts-active')) {
    return { page: 'artifacts-list' };
  } else if (chatArea.classList.contains('projects-active')) {
    // Check if it's project detail or project list
    const projectDetailView = document.getElementById('project-detail-view');
    if (projectDetailView && projectDetailView.classList.contains('active') && currentProject) {
      return { page: 'project-detail', projectId: currentProject.id };
    } else {
      return { page: 'projects-list' };
    }
  } else if (chatArea.classList.contains('welcome-active')) {
    return { page: 'welcome' };
  } else if (current && current.id) {
    // Regular chat session
    return { page: 'chat', sessionId: current.id };
  }
  
  return { page: 'welcome' };
}

function pushPageHistory(pageState) {
  if (isNavigatingHistory) return; // Don't push while navigating history
  
  let history = JSON.parse(localStorage.getItem(PAGE_HISTORY_KEY) || '{"stack":[],"index":0}');
  
  // Remove any forward history if we're not at the end
  history.stack = history.stack.slice(0, history.index + 1);
  
  // Add new state if it's different from current
  const currentState = history.stack[history.index];
  if (JSON.stringify(currentState) !== JSON.stringify(pageState)) {
    history.stack.push(pageState);
    history.index++;
    
    // Limit history size to 50 items
    if (history.stack.length > 50) {
      history.stack.shift();
      history.index--;
    }
    
    localStorage.setItem(PAGE_HISTORY_KEY, JSON.stringify(history));
  }
}

function goBackHistory() {
  // Check if modal is open - close modal instead of navigating
  const openModal = document.querySelector('.modal:not(.hidden)');
  if (openModal) {
    closeModalWithAnimation(openModal);
    return;
  }
  
  let history = JSON.parse(localStorage.getItem(PAGE_HISTORY_KEY) || '{"stack":[],"index":0}');
  if (history.index > 0) {
    history.index--;
    localStorage.setItem(PAGE_HISTORY_KEY, JSON.stringify(history));
    isNavigatingHistory = true;
    navigateToState(history.stack[history.index]);
    setTimeout(() => { isNavigatingHistory = false; }, 100);
  }
}

function goForwardHistory() {
  // Don't do anything if modal is open
  const openModal = document.querySelector('.modal:not(.hidden)');
  if (openModal) {
    return;
  }
  
  let history = JSON.parse(localStorage.getItem(PAGE_HISTORY_KEY) || '{"stack":[],"index":0}');
  if (history.index < history.stack.length - 1) {
    history.index++;
    localStorage.setItem(PAGE_HISTORY_KEY, JSON.stringify(history));
    isNavigatingHistory = true;
    navigateToState(history.stack[history.index]);
    setTimeout(() => { isNavigatingHistory = false; }, 100);
  }
}

function navigateToState(pageState) {
  const { page, sessionId, projectId } = pageState;
  
  switch (page) {
    case 'welcome':
      // Navigate to welcome screen
      if (typeof showWelcomeScreen === 'function') {
        showWelcomeScreen();
      }
      break;
      
    case 'chats-list':
      // Navigate to chats list page
      if (typeof showChatsPage === 'function') {
        showChatsPage();
      }
      break;
      
    case 'artifacts-list':
      // Navigate to artifacts list page
      if (typeof showArtifactsPage === 'function') {
        showArtifactsPage();
      }
      break;
      
    case 'projects-list':
      // Navigate to projects list page
      const detailView = document.getElementById('project-detail-view');
      if (detailView && detailView.classList.contains('active')) {
        // If coming from project detail, use animated transition
        if (typeof showProjectsListView === 'function') {
          showProjectsListView();
        }
      } else {
        // Otherwise just show projects page
        if (typeof showProjectsPage === 'function') {
          showProjectsPage();
        }
      }
      break;
      
    case 'chat':
      // Navigate to chat session
      if (sessionId) {
        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
          setCurrent(session);
        }
      }
      break;
      
    case 'project-detail':
      // Navigate to project detail
      if (projectId) {
        const project = getProjects().find(p => p.id === projectId);
        if (project && typeof showProjectDetailView === 'function') {
          showProjectDetailView(project);
        }
      }
      break;
  }
}

// Mouse buttons navigation
document.addEventListener('mousedown', (e) => {
  if (e.button === 3) { // Back button
    e.preventDefault();
    goBackHistory();
  } else if (e.button === 4) { // Forward button
    e.preventDefault();
    goForwardHistory();
  }
});

// Initialize page history on load
document.addEventListener('DOMContentLoaded', initPageHistory);

window.DEBUG = {
  getCacheStats,
  clearSessionCache,
  preloadFrequentSessions,
  invalidateSessionCache: (id) => invalidateSessionCache(id || (current && current.id)),
  
  // Performance profiling
  profileSessionSwitch: (sessionId) => {
    const startTime = performance.now();
    const targetSession = state.sessions.find(s => s.id === sessionId);
    if (targetSession) {
      console.log(`Switching to session: ${targetSession.name}`);
      setCurrent(targetSession);
      setTimeout(() => {
        const endTime = performance.now();
        console.log(`✅ Session switch took ${(endTime - startTime).toFixed(2)}ms`);
        console.log('Cache stats:', getCacheStats());
      }, 150);
    } else {
      console.log('Session not found:', sessionId);
    }
  },
  
  profileMultipleSwitches: (count = 5) => {
    const sessions = state.sessions.slice(0, count);
    let totalTime = 0;
    let switchCount = 0;
    
    console.log(`🚀 Profiling ${sessions.length} session switches...`);
    
    function switchNext(index) {
      if (index >= sessions.length) {
        console.log(`📊 Average switch time: ${(totalTime / switchCount).toFixed(2)}ms`);
        console.log('Final cache stats:', getCacheStats());
        return;
      }
      
      const startTime = performance.now();
      setCurrent(sessions[index]);
      
      setTimeout(() => {
        const endTime = performance.now();
        const switchTime = endTime - startTime;
        totalTime += switchTime;
        switchCount++;
        
        console.log(`Switch ${index + 1}: ${switchTime.toFixed(2)}ms (${sessions[index].name})`);
        
        setTimeout(() => switchNext(index + 1), 200);
      }, 100);
    }
    
    switchNext(0);
  },
  
  log,
  md,
  addMessage,
  clearLog,

  getActiveHovers: () => Array.from(activeHoverElements).map(el => ({
    language: el.querySelector('.language-name')?.textContent,
    codeSnippet: el.querySelector('pre code')?.textContent?.substring(0, 30),
    hasForceHover: el.classList.contains('force-hover-state')
  })),
  
  clearHoverStates: () => {
    activeHoverElements.forEach(el => {
      el.classList.remove('force-hover-state');
    });
    activeHoverElements.clear();
  }
};


