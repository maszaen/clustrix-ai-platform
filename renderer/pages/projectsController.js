(function (global) {
  if (!global) return;

  const REQUIRED_KEYS = [
    "state",
    "projectsStore",
    "selectedProjectIds",
    "formatRelativeTime",
    "escapeHtml",
    "esc",
    "log",
    "getExtension",
    "renderSessions",
    "updateInputState",
    "savePageState",
    "pushPageHistory",
    "renderHistory",
    "renderUploadedFiles",
    "showConfirmationModal",
    "deleteSession",
    "setCurrent",
    "getCurrentSession",
    "setCurrentSessionValue",
    "createNewSession",
    "clearLog",
    "addMessage",
    "createResponseSpacer",
    "expandSpacer",
    "generateAndSetTitle",
    "save",
    "scheduleThinkingText",
    "buildMessagesForProject",
    "startStream",
    "getActiveChatConfig",
    "getModelMeta",
    "generateSessionId",
    "nowISO",
    "saveDraftDebounced",
    "loadDraftForSession",
    "filesUploadDark",
    "filesUploadLight",
    "openModalWithAnimation",
    "closeModalWithAnimation",
  ];

  function init(options = {}) {
    REQUIRED_KEYS.forEach((key) => {
      if (!(key in options)) {
        throw new Error(`projectsController.init missing required option: ${key}`);
      }
    });

    const {
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
      getCurrentSession,
      setCurrentSessionValue,
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
    } = options;

    const {
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

    function renderProjectMessageFiles() {
      const container = document.getElementById("project-message");
      if (!container) return;

      container.innerHTML = "";
      const stagedFiles = getProjectMessageFiles();
      stagedFiles.forEach((file, index) => {
        const pill = document.createElement("div");
        pill.className = "file-pill";
        pill.innerHTML = `<span>${esc(file.name)}</span><button class="remove-file-btn" data-index="${index}">&times;</button>`;
        pill.querySelector(".remove-file-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          stagedFiles.splice(index, 1);
          renderProjectMessageFiles();
        });
        container.appendChild(pill);
      });
    }

    function showProjectsPage() {
      setCurrentSessionValue(null);
      setProjectsSelectMode(false);
      selectedProjectIds.clear();

      const chatArea = document.querySelector(".chat-area");
      chatArea?.classList.remove("welcome-active", "chats-active", "artifacts-active");
      chatArea?.classList.add("projects-active");

      document.getElementById("projects-btn")?.classList.add("active");
      document.getElementById("chats-btn")?.classList.remove("active");
      document.getElementById("artifact-btn")?.classList.remove("active");

      savePageState("projects");
      if (typeof pushPageHistory === "function") {
        pushPageHistory({ page: "projects-list" });
      }

      const titleEl = document.getElementById("chat-title");
      if (titleEl) {
        titleEl.textContent = "Your Projects";
        titleEl.title = "Manage your project workspaces";
      }
      const logo = document.getElementById("clustrix-logo");
      if (logo) logo.innerHTML = "";

      const welcomeScreen = document.getElementById("welcome-screen");
      if (welcomeScreen) welcomeScreen.style.display = "none";

      const detailView = document.getElementById("project-detail-view");
      if (detailView && detailView.classList.contains("active")) {
        detailView.classList.remove("active");
        detailView.classList.add("closing");
        setTimeout(() => {
          detailView.classList.remove("closing");
          detailView.style.display = "none";
        }, 300);
      }

      showProjectsListView();
      renderProjectsPage();
      renderSessions();
      updateInputState();

      const searchInput = document.getElementById("projects-search");
      searchInput?.focus();

      log("UI", 2, "showProjectsPage", "Switched to Projects Page");
    }

    function showProjectsListView() {
      const listView = document.getElementById("projects-list-view");
      const detailView = document.getElementById("project-detail-view");

      const chatArea = document.querySelector(".chat-area");
      if (chatArea && !chatArea.classList.contains("projects-active")) {
        chatArea.classList.add("projects-active");
      }

      if (detailView && detailView.classList.contains("active")) {
        detailView.classList.remove("active");
        detailView.classList.add("closing");
        setTimeout(() => {
          detailView.classList.remove("closing");
          detailView.style.display = "none";
          if (listView) listView.style.display = "flex";
        }, 300);
      } else {
        if (listView) listView.style.display = "flex";
        if (detailView) {
          detailView.classList.remove("active", "closing");
          detailView.style.display = "none";
        }
      }

      setCurrentProject(null);
      clearProjectMessageFiles();
      renderProjectMessageFiles();

      const projectInput = document.getElementById("project-message-input");
      if (projectInput) {
        projectInput.value = "";
        projectInput.style.height = "auto";
      }
    }

    function showProjectDetailView(project) {
      setLoadedProjectSessionCount(0);

      const listView = document.getElementById("projects-list-view");
      const detailView = document.getElementById("project-detail-view");
      const chatArea = document.querySelector(".chat-area");
      if (chatArea && !chatArea.classList.contains("projects-active")) {
        chatArea.classList.add("projects-active");
      }

      if (listView && listView.style.display !== "none") {
        listView.style.display = "none";
        if (detailView) {
          detailView.style.display = "flex";
          detailView.classList.add("active");
        }
      } else {
        if (listView) listView.style.display = "none";
        if (detailView) {
          detailView.style.display = "flex";
          detailView.classList.add("active");
        }
      }

      const activeProject = getCurrentProject();
      const isDifferentProject = !activeProject || activeProject.id !== project.id;
      setCurrentProject(project);

      if (isDifferentProject && typeof pushPageHistory === "function") {
        pushPageHistory({ page: "project-detail", projectId: project.id });
      }

      if (isDifferentProject) {
        clearProjectMessageFiles();
        renderProjectMessageFiles();

        const projectInput = document.getElementById("project-message-input");
        if (projectInput) {
          projectInput.value = "";
          projectInput.style.height = "auto";
        }
      } else {
        renderProjectMessageFiles();
      }

      const titleEl = document.getElementById("project-detail-title");
      const descEl = document.getElementById("project-detail-desc");
      if (titleEl) titleEl.textContent = project.name || "Untitled Project";
      if (descEl) descEl.textContent = project.description || "No description available";

      updateProjectStarButton();
      renderProjectSessions(project);
      renderProjectInstructions(project);
      renderProjectFiles(project);

      const projectInput = document.getElementById("project-message-input");
      projectInput?.focus();
    }

    function renderProjectsPage() {
      const projectsList = document.getElementById("projects-list");
      if (!projectsList) return;

      const searchValue = (
        document.getElementById("projects-search")?.value || ""
      ).toLowerCase();

      // Filter projects
      let projects = [...getProjects()];
      if (searchValue) {
        projects = projects.filter((project) => {
          const nameMatch = (project.name || "")
            .toLowerCase()
            .includes(searchValue);
          const descMatch = (project.description || "")
            .toLowerCase()
            .includes(searchValue);
          return nameMatch || descMatch;
        });
      }

      // Sort projects: favorites first, then by last_updated
      projects.sort((a, b) => {
        // Favorites come first
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;

        // Then sort by last_updated
        return new Date(b.last_updated || b.created_at) - new Date(a.last_updated || a.created_at);
      });

      // Update UI Controls based on mode
      const infoBar = document.getElementById("projects-info-bar");
      const actionBar = document.getElementById("projects-select-action-bar");
      const totalCountEl = document.getElementById("projects-total-count");
      const selectedCountEl = document.getElementById("projects-selected-count");
      const deleteBtn = document.getElementById("projects-delete-selected-btn");
      const selectMode = getProjectsSelectMode();

      if (selectMode) {
        infoBar.style.display = "none";
        actionBar.style.display = "flex";
        selectedCountEl.textContent = `${selectedProjectIds.size} selected`;
        deleteBtn.disabled = selectedProjectIds.size === 0;
      } else {
        infoBar.style.display = "flex";
        actionBar.style.display = "none";
        totalCountEl.textContent = `${projects.length} projects`;
      }
      projectsList.innerHTML = "";

      if (projects.length === 0 && !selectMode) {
        projectsList.innerHTML = `
      <div class="empty-state">
        ${blankProjectListSvg}
        <h3>Looking to start a project?</h3>
        <p>Upload materials, set custom instructions,<br>and organize conversations in one space.</p>
      </div>
    `;
        return;
      }

      projects.forEach((project) => {
        const projectItem = createProjectListItem(project);
        projectsList.appendChild(projectItem);
      });
    }

    function createProjectListItem(project) {
      const item = document.createElement("div");
      item.className = "project-item";
      item.dataset.projectId = project.id;

      const sessionCount = state.sessions.filter(
        (s) => s.projectId === project.id,
      ).length;
      const fileCount = project.files ? project.files.length : 0;

      const isSelected = selectedProjectIds.has(project.id);

      const checkboxHTML = `
        <div class="project-item-checkbox-wrapper">
          <input type="checkbox" class="project-item-checkbox" data-project-id="${project.id}" ${isSelected ? "checked" : ""}>
        </div>
      `;

      if (isProjectsSelectMode) {
        item.classList.add("select-mode");
      }

      if (isSelected) {
        item.classList.add("selected");
      }

      const formattedDate = formatRelativeTime(project.last_updated || project.created_at);

      item.innerHTML = `
        ${checkboxHTML}
        <div class="project-item-content">
          <div class="project-item-header">
            <h3 class="project-item-title">${escapeHtml(project.name || "Untitled Project")}</h3>
            <span class="project-item-date">Last updated ${formattedDate}</span>
          </div>
          
          ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : `<p class="project-description">No description available</p>`}
        </div>
        <div class="project-item-actions">
          <div class="project-menu-container">
            <button class="project-menu-btn" data-project-id="${project.id}" title="Project options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
              </svg>
            </button>
            <div class="project-menu-dropdown" data-project-id="${project.id}">
              <div class="project-menu-item" data-action="open">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span>Open Project</span>
              </div>
              <div class="project-menu-item" data-action="rename">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                <span>Rename</span>
              </div>
              <div class="project-menu-item project-menu-item-danger" data-action="delete">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6 2l-2 2h12l-2-2H6zM4 6v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V6H4zm2 2h8v8H6V8z"/>
                </svg>
                <span>Delete</span>
              </div>
            </div>
          </div>
        </div>
      `;

      return item;
    }

    function renderProjectSessions(project) {
      const sessionsList = document.getElementById("project-sessions-list");
      if (!sessionsList || !project) return;

      // Get sessions for this project
      let projectSessions = state.sessions.filter((s) => s.projectId === project.id);

      // Sort sessions: favorites first, then by last_updated
      projectSessions.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return new Date(b.last_updated || b.created_at) - new Date(a.last_updated || a.created_at);
      });

      sessionsList.innerHTML = ""; // Bersihkan daftar

      if (projectSessions.length === 0) {
        sessionsList.innerHTML = `
          <div class="project-session-item-none">
            <p>Start a chat to keep conversations<br>organized and re-use project knowledge.</p>
          </div>
        `;
        return;
      }

      // Pagination - use loadedProjectSessionCount or default to 5
      const total = projectSessions.length;
      const pageSize = 9; // Show 5 more each time
      const limit = Math.min(
        loadedProjectSessionCount > 0 ? loadedProjectSessionCount : pageSize,
        total,
      );
      const sessionsToShow = projectSessions.slice(0, limit);
      const hasMoreSessions = limit < total;

      sessionsToShow.forEach((session) => {
        const sessionItem = document.createElement("div");
        sessionItem.className = "project-session-item";
        sessionItem.dataset.sessionId = session.id;
        if (session.isFavorite) sessionItem.classList.add("favorite");

        const lastMessage = session.messages[session.messages.length - 1];
        const preview = lastMessage
          ? lastMessage[1].substring(0, 80) + "..."
          : "Empty conversation";

        const formattedDate = formatRelativeTime(session.last_updated || session.created_at);

        sessionItem.innerHTML = `
          <div class="session-info">
            <h4 class="session-title">${escapeHtml(session.name || "Untitled Chat")}</h4>
            <small class="session-date">Last updated ${formattedDate}</small>
          </div>
          <div class="session-actions">
            <div class="session-menu-container">
              <button class="session-menu-btn" data-session-id="${session.id}" title="Session options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
              <div class="session-menu-dropdown" data-session-id="${session.id}">
                <div class="session-menu-item" data-action="favorite">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  <span>${session.isFavorite ? "Unstar" : "Star"}</span>
                </div>
                <div class="session-menu-item" data-action="rename">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                  <span>Rename</span>
                </div>
                <div class="session-menu-item session-menu-item-danger" data-action="delete">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6 2l-2 2h12l-2-2H6zM4 6v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V6H4zm2 2h8v8H6V8z"/>
                </svg>
                  <span>Delete</span>
                </div>
              </div>
            </div>
          </div>
        `;

        sessionsList.appendChild(sessionItem);
      });

      // Add "Show More" button if there are more sessions
      if (hasMoreSessions) {
        const showMoreItem = document.createElement("div");
        showMoreItem.className = "project-session-show-more";
        showMoreItem.innerHTML = `
          <button class="show-more-btn-detail-view show-more-btn" data-project-id="${project.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-chevron-down-icon lucide-circle-chevron-down"><circle cx="12" cy="12" r="10"/><path d="m16 10-4 4-4-4"/></svg>
          </button>
        `;
        sessionsList.appendChild(showMoreItem);
      }
    }

    function renderProjectInstructions(project) {
      const container = document.querySelector(".project-instructions");
      if (!container) return;

      // Cari dan hapus elemen instruksi lama jika ada, agar tidak duplikat
      const oldInstructionText = container.querySelector("#project-instruction-text");
      if (oldInstructionText) {
        oldInstructionText.remove();
      }

      // Cek apakah ada instruksi yang valid
      if (project.instruction && project.instruction.trim() !== "") {
        // Buat elemen <p> baru untuk menampilkan teks
        const instructionText = document.createElement("p");
        instructionText.id = "project-instruction-text"; // Beri ID agar mudah ditemukan lagi
        instructionText.className = "instruction-preview-text"; // Beri class untuk styling
        instructionText.innerHTML = escapeHtml(project.instruction).replace(/\n/g, "<br>");
        
        // Sisipkan elemen teks ini SETELAH header
        const header = container.querySelector(".project-card-header");
        if (header) {
          header.insertAdjacentElement('afterend', instructionText);
        }
      }
    }

    function renderProjectFiles(project) {
      const filesList = document.getElementById("project-files-list");
      if (!filesList) return;

      filesList.innerHTML = ""; // Bersihkan daftar

      if (!project.files || project.files.length === 0) {
        const isDarkTheme = (state.settings.theme === "dark");
        const iconSVG = isDarkTheme
          ? filesUploadDark
          : filesUploadLight;

        filesList.innerHTML = `
          <div class="file-empty-state-icon" style="grid-column: 1 / -1;">
            <div class="file-drop-icon">${iconSVG}</div>
            <small>Add PDFs, documents, or other text<br>to reference in this project.</small>
          </div>
        `;
        return;
      }

      project.files.forEach((file, index) => {
        const lineCount = file.content ? file.content.split('\n').length : 0;
        const extension = file.type || getExtension(file.name).toLowerCase();
        
        const fileCard = document.createElement("div");
        fileCard.className = "file-card";
        fileCard.dataset.index = index; // Untuk view file

        fileCard.innerHTML = `
          <button class="file-card-delete-btn" data-index="${index}" title="Delete File">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256"><path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"></path></svg>
          </button>
          <div class="file-card-header">
            <h4>${escapeHtml(file.name)}</h4>
            <p class="file-card-info">${lineCount} lines</p>
          </div>
          <div class="file-card-footer">
            <span class="file-type-tag">${escapeHtml(extension)}</span>
          </div>
        `;
        
        // Tambahkan listener untuk view
        fileCard.addEventListener('click', (e) => {
            if (!e.target.closest('.file-card-delete-btn')) {
                viewProjectFile(index);
            }
        });

        // Tambahkan listener untuk delete
        fileCard.querySelector('.file-card-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProjectFile(index);
        });

        filesList.appendChild(fileCard);
      });
    }

    async function deleteProjectFile(index) {
      if (!currentProject || !currentProject.files || !currentProject.files[index])
        return;

      const file = currentProject.files[index];

      showConfirmationModal(
        `Delete File`,
        `Are you sure you want to delete the file "${file.name}"?`,
        async () => {
          currentProject.files.splice(index, 1);
          currentProject.last_updated = nowISO();

          await saveProjectsData();
          renderProjectFiles(currentProject);

          log("PROJECTS", 2, "deleteProjectFile", "Project file deleted", {
            projectId: currentProject.id,
            index,
            fileName: file.name,
          });
        },
      );
    }

    async function viewProjectFile(index) {
      if (!currentProject || !currentProject.files || !currentProject.files[index])
        return;

      const file = currentProject.files[index];

      const modal = document.createElement("div");
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-card" style="max-width: 800px;">
          <div class="modal-header">
            <h2>View File: ${escapeHtml(file.name)}</h2>
            <button class="close-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="file-info-display">
              <p><strong>Type:</strong> ${escapeHtml(file.type)}</p>
              <p><strong>Size:</strong> ${file.size && !isNaN(file.size) ? (file.size / 1024).toFixed(1) + ' KB' : 'Unknown'}</p>
            </div>
            <div class="file-content-preview">
              <label>Content Preview:</label>
              <div class="file-content-display">${escapeHtml(file.content).replace(/\n/g, "<br>")}</div>
            </div>
            <div class="form-actions">
              <button id="close-file-view-btn" class="icon-btn primary">Close</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.addEventListener("click", (e) => {
        if (
          e.target.closest(".close-btn") ||
          e.target.closest("#close-file-view-btn") ||
          e.target === modal.querySelector(".modal-overlay")
        ) {
          document.body.removeChild(modal);
        }
      });
    }

    async function deleteProject(project) {
      try {
        // Delete all sessions associated with this project
        const sessionsToDelete = state.sessions.filter(
          (s) => s.projectId === project.id,
        );
        for (const session of sessionsToDelete) {
          await deleteSession(session);
        }

        // Remove project from projects data
        const projectIndex = projectsData.findIndex((p) => p.id === project.id);
        if (projectIndex !== -1) {
          projectsData.splice(projectIndex, 1);
          await saveProjectsData();
        }

        // If this was the current project, clear it
        if (currentProject && currentProject.id === project.id) {
          currentProject = null;
        }

        log("PROJECTS", 2, "deleteProject", "Project deleted successfully", {
          projectId: project.id,
          name: project.name,
          deletedSessions: sessionsToDelete.length,
        });

        // Re-render projects page
        renderProjectsPage();
      } catch (error) {
        log("PROJECTS", 4, "deleteProject", "Error deleting project", {
          projectId: project.id,
          error: error.message,
        });
      }
    }

    function setupProjectsPageListeners() {
      // Projects search
      const searchInput = document.getElementById("projects-search");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          renderProjectsPage();
        });
      }

      // New project button
      const newProjectBtn = document.getElementById("new-project-btn");
      if (newProjectBtn) {
        newProjectBtn.addEventListener("click", () => {
          showCreateProjectModal();
        });
      }

      // Back to projects button
      const backBtn = document.getElementById("back-to-projects-btn");
      if (backBtn) {
        backBtn.addEventListener("click", () => {
          showProjectsListView();
        });
      }

      // Project select mode listeners
      const projectsPage = document.getElementById("projects-page");
      if (!projectsPage) return;

      // Remove previous listener if exists
      if (projectsPage._listener) {
        projectsPage.removeEventListener("click", projectsPage._listener);
      }

      // Central listener for all actions
      const pageListener = (e) => {
        const target = e.target;
        const projectId = target.closest(".project-item")?.dataset.projectId;

        // Action to activate select mode
        if (target.closest("#projects-select-btn")) {
          isProjectsSelectMode = true;
          renderProjectsPage();
          return;
        }

        // Action to close select mode
        if (target.closest("#projects-select-close-btn")) {
          isProjectsSelectMode = false;
          selectedProjectIds.clear();
          renderProjectsPage();
          return;
        }

        // Mass delete action (only in select mode)
        if (
          isProjectsSelectMode &&
          target.closest("#projects-delete-selected-btn")
        ) {
          if (selectedProjectIds.size === 0) return;
          showConfirmationModal(
            "Delete Selected Projects",
            `Delete ${selectedProjectIds.size} projects?`,
            () => {
              const idsToDelete = [...selectedProjectIds];
              projectsData = projectsData.filter(
                (p) => !idsToDelete.includes(p.id),
              );
              saveProjectsData();
              isProjectsSelectMode = false;
              selectedProjectIds.clear();
              renderProjectsPage();
            },
          );
          return;
        }

        // Handle checkbox clicks specifically
        if (
          target.closest(".project-item-checkbox") ||
          target.classList.contains("project-item-checkbox")
        ) {
          e.stopPropagation();
          const checkbox = target.closest(".project-item-checkbox") || target;
          const checkboxProjectId = checkbox.dataset.projectId;

          if (checkboxProjectId) {
            if (selectedProjectIds.has(checkboxProjectId)) {
              selectedProjectIds.delete(checkboxProjectId);
              checkbox.checked = false;
            } else {
              selectedProjectIds.add(checkboxProjectId);
              checkbox.checked = true;
            }

            // Auto-enter select mode when first item is selected
            // Auto-exit select mode when no items are selected
            if (selectedProjectIds.size > 0) {
              isProjectsSelectMode = true;
            } else {
              isProjectsSelectMode = false;
            }

            renderProjectsPage(); // Re-render to update UI
          }
          return;
        }

        // Action for "Select All"
        if (target.closest("#projects-select-all-checkbox")) {
          const isChecked = target.checked;
          const visibleProjectIds = Array.from(
            document.querySelectorAll("#projects-list .project-item"),
          ).map((item) => item.dataset.projectId);
          if (isChecked) {
            visibleProjectIds.forEach((id) => selectedProjectIds.add(id));
            isProjectsSelectMode = true; // Auto-enter select mode
          } else {
            selectedProjectIds.clear();
            isProjectsSelectMode = false; // Auto-exit select mode
          }
          renderProjectsPage();
        }

        // Handle project menu button clicks
        if (target.closest(".project-menu-btn")) {
          e.stopPropagation();
          const menuContainer = target.closest(".project-menu-container");
          const menuButton = menuContainer.querySelector(".project-menu-btn");
          const dropdown = menuContainer.querySelector(".project-menu-dropdown");

          // Close all other persistent-open menus and remove their active states
          document
            .querySelectorAll(".project-menu-dropdown.persistent-open")
            .forEach((menu) => {
              if (menu !== dropdown) {
                menu.classList.remove("persistent-open");
                const otherButton =
                  menu.parentElement.querySelector(".project-menu-btn");
                if (otherButton) otherButton.classList.remove("persistent-active");
              }
            });

          // Toggle current menu's persistent state (for projects page)
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

        // Handle project menu item clicks
        if (target.closest(".project-menu-item")) {
          e.stopPropagation();
          const menuItem = target.closest(".project-menu-item");
          const action = menuItem.dataset.action;
          const dropdown = target.closest(".project-menu-dropdown");
          const menuProjectId = dropdown.dataset.projectId;

          // Close menu and remove persistent state
          dropdown.classList.remove("persistent-open");
          const menuButton = dropdown.parentElement.querySelector(".project-menu-btn");
          if (menuButton) menuButton.classList.remove("persistent-active");

          if (action === "open") {
            const project = projectsData.find((p) => p.id === menuProjectId);
            if (project) showProjectDetailView(project);
          } else if (action === "rename") {
            const project = projectsData.find((p) => p.id === menuProjectId);
            if (project) startProjectRename(project);
          } else if (action === "delete") {
            const project = projectsData.find((p) => p.id === menuProjectId);
            if (project) showDeleteProjectConfirmation(project);
          }
          return;
        }

        // Close project menus when clicking outside
        if (!e.target.closest(".project-menu-container")) {
          document
            .querySelectorAll(".project-menu-dropdown.persistent-open")
            .forEach((menu) => {
              menu.classList.remove("persistent-open");
              const menuButton = menu.parentElement.querySelector(".project-menu-btn");
              if (menuButton) menuButton.classList.remove("persistent-active");
            });
        }

        // Handle session menu button clicks
        if (target.closest(".session-menu-btn")) {
          e.stopPropagation();
          const menuButton = target.closest(".session-menu-btn");
          const menuContainer = menuButton.closest(".session-menu-container");
          const dropdown = menuContainer.querySelector(".session-menu-dropdown");

          // Close all other persistent-open menus and remove their active states
          document
            .querySelectorAll(".session-menu-dropdown.persistent-open")
            .forEach((menu) => {
              if (menu !== dropdown) {
                menu.classList.remove("persistent-open");
                const otherButton =
                  menu.parentElement.querySelector(".session-menu-btn");
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

        // Handle session menu item clicks
        if (target.closest(".session-menu-item")) {
          e.stopPropagation();
          const menuItem = target.closest(".session-menu-item");
          const action = menuItem.dataset.action;
          const dropdown = menuItem.closest(".session-menu-dropdown");
          const menuSessionId = dropdown.dataset.sessionId;

          // Close menu and remove persistent state
          dropdown.classList.remove("persistent-open");
          const menuButton = dropdown.parentElement.querySelector(".session-menu-btn");
          if (menuButton) menuButton.classList.remove("persistent-active");

          if (action === "delete") {
            const session = state.sessions.find((s) => s.id === menuSessionId);
            if (session) {
              showConfirmationModal(
                "Delete Session",
                `Are you sure you want to delete "${session.name}"?`,
                () => {
                  deleteSession(session);
                  if (currentProject) {
                    renderProjectSessions(currentProject); // Refresh project sessions
                  }
                },
              );
            }
          } else if (action === "favorite") {
            const session = state.sessions.find((s) => s.id === menuSessionId);
            if (session) {
              session.isFavorite = !session.isFavorite;
              save();
              if (currentProject) {
                renderProjectSessions(currentProject); // Refresh to update star text
              }
            }
          } else if (action === "rename") {
            const session = state.sessions.find((s) => s.id === menuSessionId);
            if (session) {
              startSidebarRename(menuSessionId);
            }
          }
          return;
        }

        // Close session menus when clicking outside
        if (!e.target.closest(".session-menu-container")) {
          document
            .querySelectorAll(".session-menu-dropdown.persistent-open")
            .forEach((menu) => {
              menu.classList.remove("persistent-open");
              const menuButton = menu.parentElement.querySelector(".session-menu-btn");
              if (menuButton) menuButton.classList.remove("persistent-active");
            });
        }

        // Close project title menus when clicking outside
        if (!e.target.closest(".project-title-menu-container")) {
          document
            .querySelectorAll(".project-title-menu-dropdown.persistent-open")
            .forEach((menu) => {
              menu.classList.remove("persistent-open");
              const menuButton = menu.parentElement.querySelector(".project-title-menu-btn");
              if (menuButton) menuButton.classList.remove("persistent-active");
            });
        }

        // Handle project title menu button clicks
        if (target.closest(".project-title-menu-btn")) {
          e.stopPropagation();
          const menuContainer = target.closest(".project-title-menu-container");
          const menuButton = menuContainer.querySelector(".project-title-menu-btn");
          const dropdown = menuContainer.querySelector(".project-title-menu-dropdown");

          // Close all other persistent-open menus and remove their active states
          document
            .querySelectorAll(".project-title-menu-dropdown.persistent-open")
            .forEach((menu) => {
              if (menu !== dropdown) {
                menu.classList.remove("persistent-open");
                const otherButton =
                  menu.parentElement.querySelector(".project-title-menu-btn");
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

        // Handle project title menu item clicks
        if (target.closest(".project-title-menu-item")) {
          e.stopPropagation();
          const menuItem = target.closest(".project-title-menu-item");
          const action = menuItem.dataset.action;
          const dropdown = target.closest(".project-title-menu-dropdown");

          // Close menu and remove persistent state
          dropdown.classList.remove("persistent-open");
          const menuButton = dropdown.parentElement.querySelector(".project-title-menu-btn");
          if (menuButton) menuButton.classList.remove("persistent-active");

          if (action === "rename") {
            if (currentProject) startProjectDetailRename(currentProject);
          } else if (action === "delete") {
            if (currentProject) showDeleteProjectConfirmation(currentProject);
          }
          return;
        }

        // Handle project star button clicks
        if (target.closest(".project-star-btn")) {
          e.stopPropagation();
          if (currentProject) {
            toggleProjectFavorite(currentProject);
            updateProjectStarButton();
            renderProjectsPage();
          }
          return;
        }

        // Action for clicking project item (could open project or select)
        if (projectId) {
          if (isProjectsSelectMode) {
            if (selectedProjectIds.has(projectId)) {
              selectedProjectIds.delete(projectId);
            } else {
              selectedProjectIds.add(projectId);
            }
            renderProjectsPage(); // Re-render to update UI
          } else {
            // Normal mode: open project (only if not clicking on actions)
            if (!target.closest(".chat-item-actions")) {
              const project = projectsData.find((p) => p.id === projectId);
              if (project) {
                showProjectDetailView(project);
              }
            }
          }
        }
      };

      projectsPage.addEventListener("click", pageListener);
      projectsPage._listener = pageListener; // Save reference to listener

      // Remove previous document listener if exists
      if (projectsDocumentListener) {
        document.removeEventListener("click", projectsDocumentListener);
      }

      // Additional project actions (outside main list items)
      projectsDocumentListener = (e) => {
        // Project send button
        if (e.target.closest("#project-send-btn")) {
          handleProjectSend();
        }

        // Project session click
        if (e.target.closest(".project-session-item")) {
          const sessionItem = e.target.closest(".project-session-item");
          const sessionId = sessionItem?.dataset.sessionId;
          if (sessionId && !e.target.closest(".session-actions")) {
            const session = state.sessions.find((s) => s.id === sessionId);
            if (session) {
              setCurrent(session);
            }
          }
        }

        // Show more sessions button click
        if (e.target.closest(".show-more-btn")) {
          const showMoreBtn = e.target.closest(".show-more-btn");
          const projectId = showMoreBtn?.dataset.projectId;
          if (projectId) {
            // If currently in project detail view and clicking show more on the same project, load more sessions
            if (currentProject && currentProject.id === projectId) {
              // Calculate current limit and add pageSize
              const projectSessions = state.sessions.filter(s => s.projectId === projectId);
              const total = projectSessions.length;
              const pageSize = 5;
              const currentLimit = Math.min(
                loadedProjectSessionCount > 0 ? loadedProjectSessionCount : pageSize,
                total,
              );
              loadedProjectSessionCount = currentLimit + pageSize;
              if (currentProject) {
                renderProjectSessions(currentProject);
              }
              return;
            }

            // For other cases (e.g., from projects list view), find the project and show its detail
            const project = projectsData.find((p) => p.id === projectId);
            if (project) {
              const projectSessions = state.sessions.filter(s => s.projectId === project.id);
              const total = projectSessions.length;
              const pageSize = 5;
              const currentLimit = Math.min(
                loadedProjectSessionCount > 0 ? loadedProjectSessionCount : pageSize,
                total,
              );
              loadedProjectSessionCount = currentLimit + pageSize;
              renderProjectSessions(project);
            }
          }
        }

        if (e.target.closest("#edit-instruction-btn")) {
          showInstructionModal();
          log("INSTRUCTION")
        }

        // Project file drop zone click
        if (e.target.closest("#project-file-drop-zone")) {
          handleProjectFileUpload();
        }

        if (e.target.closest("#project-upload-btn")) {
          handleProjectFileUpload();
        }

        // Delete project file button
        if (e.target.closest(".delete-file-btn")) {
          const fileItem = e.target.closest(".project-file-item");
          const index = fileItem?.dataset.index;
          if (index !== undefined) {
            deleteProjectFile(parseInt(index));
          }
        }

        // View project file button
        if (e.target.closest(".view-file-btn")) {
          const fileItem = e.target.closest(".project-file-item");
          const index = fileItem?.dataset.index;
          if (index !== undefined) {
            viewProjectFile(parseInt(index));
          }
        }
      };

      document.addEventListener("click", projectsDocumentListener);

      // Add hover management for persistent menus - PROJECTS PAGE VERSION
      if (projectsPage) {
        projectsPage.addEventListener(
          "mouseenter",
          (e) => {
            const projectItem = e.target.closest(".project-item");
            if (projectItem) {
              const dropdown = projectItem.querySelector(
                ".project-menu-dropdown.persistent-open",
              );
              const menuButton = projectItem.querySelector(".project-menu-btn");
              if (dropdown && menuButton) {
                menuButton.classList.add("persistent-active");
              }
            }
          },
          true,
        );

        projectsPage.addEventListener(
          "mouseleave",
          (e) => {
            const projectItem = e.target.closest(".project-item");
            if (projectItem) {
              // Check if mouse is actually leaving the project-item
              const rect = projectItem.getBoundingClientRect();
              const isStillInside =
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom;

              // Check if mouse is hovering over dropdown menu
              const dropdown = projectItem.querySelector(
                ".project-menu-dropdown.persistent-open",
              );
              const isHoveringDropdown =
                dropdown && e.target.closest(".project-menu-dropdown");

              // Only close menu if mouse actually left project-item AND not hovering dropdown
              if (!isStillInside && !isHoveringDropdown) {
                const menuButton = projectItem.querySelector(".project-menu-btn");
                if (dropdown && menuButton) {
                  dropdown.classList.remove("persistent-open");
                  menuButton.classList.remove("persistent-active");
                }
              }
            }
          },
          true,
        );

        // Handle mouseleave from dropdown menu
        projectsPage.addEventListener(
          "mouseleave",
          (e) => {
            const dropdown = e.target.closest(
              ".project-menu-dropdown.persistent-open",
            );
            if (dropdown) {
              // Delay check to ensure mouse isn't moving to project-item
              setTimeout(() => {
                const projectItem = dropdown.closest(".project-item");
                if (projectItem) {
                  // Check if mouse is still within project-item or dropdown
                  const projectRect = projectItem.getBoundingClientRect();
                  const dropdownRect = dropdown.getBoundingClientRect();

                  // Get current mouse position (approximate)
                  const mouseX = window.lastMouseX || 0;
                  const mouseY = window.lastMouseY || 0;

                  const isInProjectItem =
                    mouseX >= projectRect.left &&
                    mouseX <= projectRect.right &&
                    mouseY >= projectRect.top &&
                    mouseY <= projectRect.bottom;

                  const isInDropdown =
                    mouseX >= dropdownRect.left &&
                    mouseX <= dropdownRect.right &&
                    mouseY >= dropdownRect.top &&
                    mouseY <= dropdownRect.bottom;

                  // Close menu if mouse is not in project-item or dropdown
                  if (!isInProjectItem && !isInDropdown) {
                    const menuButton = projectItem.querySelector(".project-menu-btn");
                    if (menuButton) {
                      dropdown.classList.remove("persistent-open");
                      menuButton.classList.remove("persistent-active");
                    }
                  }
                }
              }, 50);
            }
          },
          true,
        );

        // Track mouse position for dropdown detection
        document.addEventListener("mousemove", (e) => {
          window.lastMouseX = e.clientX;
          window.lastMouseY = e.clientY;
        });
      }

      // Add hover management for project-session-item persistent menus
      document.addEventListener(
        "mouseenter",
        (e) => {
          if (!(e.target instanceof Element)) return;
          const sessionItem = e.target.closest(".project-session-item");
          if (sessionItem) {
            const dropdown = sessionItem.querySelector(
              ".session-menu-dropdown.persistent-open",
            );
            const menuButton = sessionItem.querySelector(".session-menu-btn");
            if (dropdown && menuButton) {
              menuButton.classList.add("persistent-active");
            }
          }
        },
        true,
      );

      document.addEventListener(
        "mouseleave",
        (e) => {
          if (!(e.target instanceof Element)) return;
          const sessionItem = e.target.closest(".project-session-item");
          if (sessionItem) {
            // Check if mouse is actually leaving the project-session-item
            const rect = sessionItem.getBoundingClientRect();
            const isStillInside =
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom;

            // Check if mouse is hovering over dropdown menu
            const dropdown = sessionItem.querySelector(
              ".session-menu-dropdown.persistent-open",
            );
            const isHoveringDropdown =
              dropdown && e.target.closest(".session-menu-dropdown");

            // Only close menu if mouse actually left project-session-item AND not hovering dropdown
            if (!isStillInside && !isHoveringDropdown) {
              const menuButton = sessionItem.querySelector(".session-menu-btn");
              if (dropdown && menuButton) {
                dropdown.classList.remove("persistent-open");
                menuButton.classList.remove("persistent-active");
              }
            }
          }
        },
        true,
      );

      // Handle mouseleave from session dropdown menu
      document.addEventListener(
        "mouseleave",
        (e) => {
          if (!(e.target instanceof Element)) return;
          const dropdown = e.target.closest(
            ".session-menu-dropdown.persistent-open",
          );
          if (dropdown) {
            // Delay check to ensure mouse isn't moving to project-session-item
            setTimeout(() => {
              const sessionItem = dropdown.closest(".project-session-item");
              if (sessionItem) {
                // Check if mouse is still within project-session-item or dropdown
                const sessionRect = sessionItem.getBoundingClientRect();
                const dropdownRect = dropdown.getBoundingClientRect();

                // Get current mouse position (approximate)
                const mouseX = window.lastMouseX || 0;
                const mouseY = window.lastMouseY || 0;

                const isInSessionItem =
                  mouseX >= sessionRect.left &&
                  mouseX <= sessionRect.right &&
                  mouseY >= sessionRect.top &&
                  mouseY <= sessionRect.bottom;

                const isInDropdown =
                  mouseX >= dropdownRect.left &&
                  mouseX <= dropdownRect.right &&
                  mouseY >= dropdownRect.top &&
                  mouseY <= dropdownRect.bottom;

                // Close menu if mouse is not in project-session-item or dropdown
                if (!isInSessionItem && !isInDropdown) {
                  const menuButton = sessionItem.querySelector(".session-menu-btn");
                  if (menuButton) {
                    dropdown.classList.remove("persistent-open");
                    menuButton.classList.remove("persistent-active");
                  }
                }
              }
            }, 50);
          }
        },
        true,
      );

      // Add hover management for project-title-menu persistent menus
      document.addEventListener(
        "mouseenter",
        (e) => {
          if (!(e.target instanceof Element)) return;
          const titleContainer = e.target.closest(".project-title-menu-container");
          if (titleContainer) {
            const dropdown = titleContainer.querySelector(
              ".project-title-menu-dropdown.persistent-open",
            );
            const menuButton = titleContainer.querySelector(".project-title-menu-btn");
            if (dropdown && menuButton) {
              menuButton.classList.add("persistent-active");
            }
          }
        },
        true,
      );

      document.addEventListener(
        "mouseleave",
        (e) => {
          if (!(e.target instanceof Element)) return;
          const titleContainer = e.target.closest(".project-title-menu-container");
          if (titleContainer) {
            // Check if mouse is actually leaving the project-title-menu-container
            const rect = titleContainer.getBoundingClientRect();
            const isStillInside =
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom;

            // Check if mouse is hovering over dropdown menu
            const dropdown = titleContainer.querySelector(
              ".project-title-menu-dropdown.persistent-open",
            );
            const isHoveringDropdown =
              dropdown && e.target.closest(".project-title-menu-dropdown");

            // Only close menu if mouse actually left project-title-menu-container AND not hovering dropdown
            if (!isStillInside && !isHoveringDropdown) {
              const menuButton = titleContainer.querySelector(".project-title-menu-btn");
              if (dropdown && menuButton) {
                dropdown.classList.remove("persistent-open");
                menuButton.classList.remove("persistent-active");
              }
            }
          }
        },
        true,
      );

      // Handle mouseleave from project title dropdown menu
      document.addEventListener(
        "mouseleave",
        (e) => {
          if (!(e.target instanceof Element)) return;
          const dropdown = e.target.closest(
            ".project-title-menu-dropdown.persistent-open",
          );
          if (dropdown) {
            // Delay check to ensure mouse isn't moving to project-title-menu-container
            setTimeout(() => {
              const titleContainer = dropdown.closest(".project-title-menu-container");
              if (titleContainer) {
                // Check if mouse is still within project-title-menu-container or dropdown
                const titleRect = titleContainer.getBoundingClientRect();
                const dropdownRect = dropdown.getBoundingClientRect();

                // Get current mouse position (approximate)
                const mouseX = window.lastMouseX || 0;
                const mouseY = window.lastMouseY || 0;

                const isInTitleContainer =
                  mouseX >= titleRect.left &&
                  mouseX <= titleRect.right &&
                  mouseY >= titleRect.top &&
                  mouseY <= titleRect.bottom;

                const isInDropdown =
                  mouseX >= dropdownRect.left &&
                  mouseX <= dropdownRect.right &&
                  mouseY >= dropdownRect.top &&
                  mouseY <= dropdownRect.bottom;

                // Close menu if mouse is not in project-title-menu-container or dropdown
                if (!isInTitleContainer && !isInDropdown) {
                  const menuButton = titleContainer.querySelector(".project-title-menu-btn");
                  if (menuButton) {
                    dropdown.classList.remove("persistent-open");
                    menuButton.classList.remove("persistent-active");
                  }
                }
              }
            }, 50);
          }
        },
        true,
      );

      // Project file input is now handled by drop zone click, no need for change listener

      setupTextareaProjectResize();
    }

    function setupTextareaProjectResize() {
      const projectInput = $("#project-message-input");
      if (projectInput) {
        projectInput.addEventListener("input", function () {
          // Save draft for current project session
          if (currentProject && currentProject.id) {
            saveDraftDebounced(`project-${currentProject.id}`, this.value);
          }

          const shell = this.closest(".ta-shell");
          if (shell && shell.__taScroll) {
            return;
          }

          this.style.height = "auto";
          this.style.height = `${Math.min(this.scrollHeight, 350)}px`;
        });

        // Add Ctrl+Enter to send message
        projectInput.addEventListener("keydown", function (e) {
          if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            log(
              "UI",
              0,
              "event:keydown-CtrlEnter-project",
              "Ctrl+Enter pressed in project input, sending message",
            );
            handleProjectSend();
            return false;
          }
        });
      }
    }

    async function showCreateProjectModal() {
      // Create modal for new project
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-card" style="max-width: 500px;">
          <div class="modal-header">
            <h2>Create New Project</h2>
            <button class="close-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="project-name">Project Name</label>
              <input type="text" id="project-name" placeholder="Enter project name..." />
            </div>
            <div class="form-group">
              <label for="project-description">Description (Optional)</label>
              <textarea id="project-description" placeholder="Describe your project..." rows="3"></textarea>
            </div>
            <div class="form-actions">
              <button id="cancel-project-btn" class="primary-btn">Cancel</button>
              <button id="create-project-btn" class="primary-btn">Create Project</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Focus on name input
      const nameInput = modal.querySelector("#project-name");
      if (nameInput) nameInput.focus();

      // Handle modal actions
      modal.addEventListener("click", async (e) => {
        if (
          e.target.closest(".close-btn") ||
          e.target.closest("#cancel-project-btn") ||
          e.target === modal.querySelector(".modal-overlay")
        ) {
          document.body.removeChild(modal);
        }

        if (e.target.closest("#create-project-btn")) {
          const name = nameInput?.value.trim();
          if (!name) {
            nameInput?.focus();
            return;
          }

          const description = modal
            .querySelector("#project-description")
            ?.value.trim();

          await createNewProject(name, description);
          document.body.removeChild(modal);
        }
      });
    }

    async function createNewProject(name, description = "") {
      const project = {
        id: generateSessionId(), // Reuse session ID generator
        name,
        description,
        created_at: nowISO(),
        last_updated: nowISO(),
        isFavorite: false,
        instructions: [],
        files: [],
        settings: {},
      };

      projectsData.unshift(project);
      await saveProjectsData();

      renderProjectsPage();
      showProjectDetailView(project);

      log("PROJECTS", 2, "createNewProject", "New project created", {
        projectId: project.id,
        name,
      });
    }

    async function saveProjectsData() {
      try {
        log("PROJECTS", 1, "saveProjectsData", "Attempting to save projects", {
          projectCount: projectsData.length,
          projects: projectsData.map(p => ({ id: p.id, name: p.name, filesCount: p.files?.length || 0 }))
        });
        
        if (window.api && window.api.projects) {
          const result = await window.api.projects.save(projectsData);
          log("PROJECTS", result ? 2 : 4, "saveProjectsData", result ? "Save successful" : "Save failed", {
            result
          });
        } else {
          // Fallback to localStorage in debug mode
          localStorage.setItem("projects_data", JSON.stringify(projectsData));
          log("PROJECTS", 2, "saveProjectsData", "Saved to localStorage (debug mode)");
        }
      } catch (error) {
        log("PROJECTS", 4, "saveProjectsData", "Error saving projects", {
          error: error.message,
          stack: error.stack
        });
      }
    }

    async function loadProjectsData() {
      try {
        if (window.api && window.api.projects) {
          projectsData = (await window.api.projects.load()) || [];
        } else {
          // Fallback to localStorage in debug mode
          const saved = localStorage.getItem("projects_data");
          projectsData = saved ? JSON.parse(saved) : [];
        }
        
        // Ensure all projects have isFavorite property
        projectsData.forEach(project => {
          if (project.isFavorite === undefined) {
            project.isFavorite = false;
          }
        });
      } catch (error) {
        log("PROJECTS", 4, "loadProjectsData", "Error loading projects", {
          error: error.message,
        });
        projectsData = [];
      }
    }

    async function toggleProjectFavorite(project) {
      project.isFavorite = !project.isFavorite;
      await saveProjectsData();
      
      log("PROJECTS", 2, "toggleProjectFavorite", "Project favorite toggled", {
        projectId: project.id,
        isFavorite: project.isFavorite,
      });
    }

    function updateProjectStarButton() {
      const starBtn = document.querySelector(".project-star-btn");
      if (starBtn && currentProject) {
        if (currentProject.isFavorite) {
          starBtn.classList.add("starred");
        } else {
          starBtn.classList.remove("starred");
        }
      }
    }

    async function handleProjectSend() {
      if (!currentProject) return;

      const input = document.getElementById("project-message-input");
      const originalText = (input?.value || "").trim();
      const stagedUserFiles = projectMessageStagedFiles.filter((file) => !file.error);
      if (!originalText && stagedUserFiles.length === 0) return;

      // Project files stay in project database, only user-uploaded files go to session
      const userFilesForSession = stagedUserFiles.map((file) => ({ ...file }));
      const config = getActiveChatConfig();
      const modelInfo = {
        provider: config.provider,
        model: config.model,
        label:
          getModelMeta(state.settings.models, config.provider, config.model)
            .label || config.model,
      };

      // 2. Buat sesi baru
      const s = await createNewSession([], {
        projectId: currentProject.id,
        type: "project",
      });
      s.uploadedFiles = userFilesForSession; // Only user-uploaded files for this session

      // 3. Isi data pesan di dalam objek sesi
      s.messages.push(["user", originalText, { files: userFilesForSession }]);
      s.messages.push(["ai", "", modelInfo]);

      // 4. Update dan simpan data proyek
      currentProject.last_updated = nowISO();
      await saveProjectsData();

      // 5. Lakukan semua transisi dan rendering UI secara manual dan berurutan
      setCurrent(s); // Ini akan set `current = s` dan memicu renderHistory (yang akan kita timpa)

      // 5a. Penanganan Transisi UI (Wawasan brilian dari Anda)
      const chatArea = document.querySelector(".chat-area");
      const projectDetailView = document.querySelector(".project-detail-view");
      if (chatArea) {
        chatArea.classList.remove("welcome-active", "chats-active", "artifacts-active", "projects-active");
        if(projectDetailView) projectDetailView.classList.remove("active");
      }
      document.getElementById("projects-btn")?.classList.remove("active");

      clearLog();
      addMessage("user", originalText, {
        final: true,
        index: 0,
        metadata: { files: userFilesForSession },
      });
      
      const aiMessageIndex = s.messages.length - 1;
      const aiNode = addMessage("ai", "", {
        final: false,
        index: aiMessageIndex,
        metadata: modelInfo,
      });

      input.value = "";
      input.style.height = "auto";
      projectMessageStagedFiles = [];
      renderProjectMessageFiles();

      createResponseSpacer();
      setTimeout(() => expandSpacer(), 50);

      if (s.name === null) {
        generateAndSetTitle(s);
      }
      await save();
      renderSessions();

      scheduleThinkingText(aiNode);
      const messagesForAI = buildMessagesForProject(s);
      startStream(s, originalText, aiNode, aiMessageIndex, false, messagesForAI);

      // Update daftar sesi di halaman proyek
      if (currentProject) {
        renderProjectSessions(currentProject);
      }
    }

    async function handleProjectFileUpload() {
      if (!currentProject) return;

      log(
        "PROJECTS",
        2,
        "handleProjectFileUpload",
        "Triggering file dialog for project files",
        {
          projectId: currentProject.id,
        },
      );

      try {
        // Use the existing file dialog system that handles all file types properly
        const fileContents = await window.api.files.openDialogAndRead();
        if (!fileContents || fileContents.length === 0) {
          log(
            "PROJECTS",
            1,
            "handleProjectFileUpload",
            "No files selected or dialog canceled",
          );
          return;
        }

        if (!currentProject.files) {
          currentProject.files = [];
        }

        // Filter out files with errors and add to project
        const validFiles = fileContents.filter((f) => !f.error);
        currentProject.files.push(...validFiles);
        currentProject.last_updated = nowISO();

        await saveProjectsData();
        renderProjectFiles(currentProject);

        log(
          "PROJECTS",
          2,
          "handleProjectFileUpload",
          "Project files uploaded successfully",
          {
            projectId: currentProject.id,
            addedCount: validFiles.length,
            totalFiles: currentProject.files.length,
          },
        );
      } catch (error) {
        log(
          "PROJECTS",
          4,
          "handleProjectFileUpload",
          "Error uploading project files",
          { error: error.message },
        );
      }
    }

    function startProjectRename(project) {
      // Ensure we're on the projects page and it's fully rendered
      if (!document.querySelector('#projects-page') || document.querySelector('#projects-page').style.display === 'none') {
        log("PROJECTS", 4, "startProjectRename", "Not on projects page or page not visible", {
          projectId: project.id,
          currentPage: document.querySelector('.page:not([style*="display: none"])')?.id || 'unknown'
        });
        return;
      }

      const projectItem = document.querySelector(
        `#projects-page [data-project-id="${project.id}"]`,
      );
      if (!projectItem) {
        log("PROJECTS", 4, "startProjectRename", "Project item not found in DOM", {
          projectId: project.id,
          availableProjectIds: Array.from(document.querySelectorAll('#projects-page [data-project-id]')).map(el => el.dataset.projectId)
        });
        return;
      }

      // Ensure the project item has basic structure
      if (!projectItem.children || projectItem.children.length === 0) {
        log("PROJECTS", 4, "startProjectRename", "Project item has no children elements", {
          projectId: project.id,
          projectItemHTML: projectItem.innerHTML.substring(0, 100) + '...'
        });
        return;
      }

      const titleElement = projectItem.querySelector(".project-item-title");
      let targetElement = titleElement;
      if (!titleElement) {
        // Try to find any h3 element as fallback
        const h3Element = projectItem.querySelector("h3");
        if (h3Element) {
          h3Element.classList.add("project-item-title");
          targetElement = h3Element;
          log("PROJECTS", 3, "startProjectRename", "Found h3 element, added title class", {
            projectId: project.id,
          });
        } else {
          // Create the title element if it doesn't exist at all
          const headerElement = projectItem.querySelector(".project-item-header");
          if (headerElement) {
            const newTitle = document.createElement("h3");
            newTitle.className = "project-item-title";
            newTitle.textContent = project.name || "Untitled Project";
            headerElement.insertBefore(newTitle, headerElement.firstChild);
            targetElement = newTitle;
            log("PROJECTS", 3, "startProjectRename", "Created missing title element", {
              projectId: project.id,
            });
          } else {
            // Ultimate fallback: create title element in the project item content
            const contentElement = projectItem.querySelector(".project-item-content");
            if (contentElement) {
              const newTitle = document.createElement("h3");
              newTitle.className = "project-item-title";
              newTitle.textContent = project.name || "Untitled Project";
              newTitle.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 4px 0;
                color: var(--text-primary);
              `;
              contentElement.insertAdjacentElement('afterbegin', newTitle);
              targetElement = newTitle;
              log("PROJECTS", 3, "startProjectRename", "Created title element in content area", {
                projectId: project.id,
              });
            } else {
              log("PROJECTS", 4, "startProjectRename", "No suitable container found to create title in", {
                projectId: project.id,
                projectItemHTML: projectItem.innerHTML.substring(0, 300) + '...',
                allClasses: Array.from(projectItem.querySelectorAll('*')).map(el => el.className).filter(c => c).join(', '),
                childElements: Array.from(projectItem.children).map(el => el.tagName + (el.className ? '.' + el.className : '')).join(', ')
              });
              return;
            }
          }
        }
      }
      
      const originalName = project.name || "Untitled Project";

      // Create input element
      const input = document.createElement("input");
      input.type = "text";
      input.value = originalName;
      input.className = "project-rename-input";
      input.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-size: inherit;
        font-weight: inherit;
        padding: 4px 8px;
        border-radius: 4px;
        width: 100%;
      `;

      // Replace title with input
      const parent = targetElement.parentNode;
      parent.replaceChild(input, targetElement);
      input.focus();
      input.select();

      const finishRename = async (save = false) => {
        if (save && input.value.trim() && input.value.trim() !== originalName) {
          project.name = input.value.trim();
          project.last_updated = nowISO();
          await saveProjectsData();

          log("PROJECTS", 2, "startProjectRename", "Project renamed", {
            projectId: project.id,
            oldName: originalName,
            newName: project.name,
          });
        }

        // Restore title element
        const newTitle = document.createElement("h3");
        newTitle.className = "project-item-title";
        newTitle.textContent = project.name || "Untitled Project";
        parent.replaceChild(newTitle, input);

        // Update the date display to reflect the new last_updated time
        const dateElement = projectItem.querySelector(".project-item-date");
        if (dateElement) {
          dateElement.textContent = `Last updated ${formatRelativeTime(project.last_updated || project.created_at)}`;
        }
      };

      input.addEventListener("blur", () => finishRename(true));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finishRename(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finishRename(false);
        }
      });
    }

    function startProjectDetailRename(project) {
      const titleElement = document.getElementById("project-detail-title");
      if (!titleElement) {
        log("PROJECTS", 4, "startProjectDetailRename", "Title element not found", {
          projectId: project.id,
        });
        return;
      }
      
      const originalName = project.name || "Untitled Project";

      // Create input element
      const input = document.createElement("input");
      input.type = "text";
      input.value = originalName;
      input.className = "project-detail-rename-input";
      input.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-size: inherit;
        font-weight: inherit;
        padding: 4px 8px;
        border-radius: 4px;
        width: 100%;
      `;

      // Replace title with input
      const parent = titleElement.parentNode;
      parent.replaceChild(input, titleElement);
      input.focus();
      input.select();

      const finishRename = async (save = false) => {
        if (save && input.value.trim() && input.value.trim() !== originalName) {
          project.name = input.value.trim();
          project.last_updated = nowISO();
          await saveProjectsData();

          log("PROJECTS", 2, "startProjectDetailRename", "Project renamed", {
            projectId: project.id,
            oldName: originalName,
            newName: project.name,
          });
        }

        // Restore title element
        const newTitle = document.createElement("h2");
        newTitle.id = "project-detail-title";
        newTitle.textContent = project.name || "Untitled Project";
        parent.replaceChild(newTitle, input);

        // Update star button state after rename
        updateProjectStarButton();
      };

      input.addEventListener("blur", () => finishRename(true));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finishRename(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finishRename(false);
        }
      });
    }

    function showDeleteProjectConfirmation(project) {
      const sessionCount = state.sessions.filter(
        (s) => s.projectId === project.id,
      ).length;
      const fileCount = project.files ? project.files.length : 0;

      let message = `Are you sure you want to delete the project "${project.name || "Untitled Project"}"?`;
      if (sessionCount > 0 || fileCount > 0) {
        message += `\n\nThis will also delete:`;
        if (sessionCount > 0)
          message += `\n• ${sessionCount} chat session${sessionCount > 1 ? "s" : ""}`;
        if (fileCount > 0)
          message += `\n• ${fileCount} uploaded file${fileCount > 1 ? "s" : ""}`;
      }

      showConfirmationModal("Delete Project", message, async () => {
        await deleteProject(project);
      });
    }

    async function addInstruction(title, content) {
      if (!currentProject) return;

      // Create new instruction object
      const newInstruction = {
        id: generateSessionId(),
        title: title.trim(),
        content: content.trim(),
        created_at: nowISO(),
        updated_at: nowISO(),
      };

      // Add to project's instructions array
      currentProject.instructions.push(newInstruction);
      currentProject.last_updated = nowISO();

      await saveProjectsData();
      renderProjectInstructions(currentProject);

      log("PROJECTS", 2, "addInstruction", "Instruction added", {
        projectId: currentProject.id,
        title: title.substring(0, 30) + (title.length > 30 ? "..." : ""),
      });
    }

    async function viewInstruction(index) {
      if (
        !currentProject ||
        !currentProject.instructions ||
        !currentProject.instructions[index]
      )
        return;

      const instruction = currentProject.instructions[index];

      const modal = document.createElement("div");
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-card" style="max-width: 600px;">
          <div class="modal-header">
            <h2>View Instruction</h2>
            <button class="close-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Title</label>
              <div class="instruction-display-title">${escapeHtml(instruction.title)}</div>
            </div>
            <div class="form-group">
              <label>Content</label>
              <div class="instruction-display-content">${escapeHtml(instruction.content).replace(/\n/g, "<br>")}</div>
            </div>
            <div class="form-actions">
              <button id="close-view-btn" class="icon-btn primary">Close</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.addEventListener("click", (e) => {
        if (
          e.target.closest(".close-btn") ||
          e.target.closest("#close-view-btn") ||
          e.target === modal.querySelector(".modal-overlay")
        ) {
          document.body.removeChild(modal);
        }
      });
    }

    async function updateInstruction(index, title, content) {
      if (
        !currentProject ||
        !currentProject.instructions ||
        !currentProject.instructions[index]
      )
        return;

      currentProject.instructions[index] = {
        ...currentProject.instructions[index],
        content,
        updated_at: nowISO(),
      };

      currentProject.last_updated = nowISO();

      await saveProjectsData();
      renderProjectInstructions(currentProject);

      log("PROJECTS", 2, "updateInstruction", "Instruction updated", {
        projectId: currentProject.id,
        index,
        title: title.substring(0, 30) + (title.length > 30 ? "..." : ""),
      });
    }

    async function deleteInstruction() {
      if (!currentProject || !currentProject.instruction) return;

      showConfirmationModal(
        "Delete Instruction",
        "Are you sure you want to delete this instruction?",
        async () => {
          currentProject.instruction = ""; // Cukup kosongkan stringnya
          currentProject.last_updated = nowISO();

          await saveProjectsData();
          renderProjectInstructions(currentProject);

          log("PROJECTS", 2, "deleteInstruction", "Instruction deleted.", {
            projectId: currentProject.id,
          });
        }
      );
    }

    return {
      showProjectsPage,
      showProjectsListView,
      showProjectDetailView,
      renderProjectsPage,
      createProjectListItem,
      renderProjectSessions,
      renderProjectInstructions,
      renderProjectFiles,
      setupProjectsPageListeners,
      renderProjectMessageFiles,
      setupTextareaProjectResize,
      showCreateProjectModal,
      createNewProject,
      saveProjectsData,
      loadProjectsData,
      toggleProjectFavorite,
      updateProjectStarButton,
      handleProjectSend,
      handleProjectFileUpload,
      deleteProjectFile,
      viewProjectFile,
      startProjectRename,
      startProjectDetailRename,
      showDeleteProjectConfirmation,
      deleteProject,
      addInstruction,
      viewInstruction,
      updateInstruction,
      deleteInstruction,
    };
  }

  // Expose init function to global scope
  global.projectsController = { init };
})(window);