(function (global) {
  if (!global) return;

  const controllerState = {
    isSelectMode: false,
    selectedChatIds: new Set(),
    loadedChatPageCount: 0,
    documentClickHandler: null,
  };

  let deps = null;

  function requireDeps() {
    if (!deps) {
      throw new Error("chatsController not initialized");
    }
    return deps;
  }

  function resetSelectionState() {
    controllerState.isSelectMode = false;
    controllerState.selectedChatIds.clear();
  }

  function setSelectMode(enabled) {
    controllerState.isSelectMode = Boolean(enabled);
  }

  function isSelectMode() {
    return controllerState.isSelectMode;
  }

  function getSelectedChatIds() {
    return controllerState.selectedChatIds;
  }

  function getLoadedChatPageCount() {
    return controllerState.loadedChatPageCount;
  }

  function setLoadedChatPageCount(value) {
    controllerState.loadedChatPageCount = value;
  }

  function renderChatsPage() {
    const d = requireDeps();
    const chatsList = document.getElementById("chats-list");
    if (!chatsList) return;

    const escapeHtml = d.escapeHtml || ((text) => text);
    const formatRelativeTime = d.formatRelativeTime || (() => "");

    const searchValue = (
      document.getElementById("chats-search")?.value || ""
    ).toLowerCase();

    let sessions = [...d.state.sessions];
    if (searchValue) {
      sessions = sessions.filter((session) => {
        const nameMatch = (session.name || "")
          .toLowerCase()
          .includes(searchValue);
        const contentMatch = session.messages.some((message) =>
          (message[1] || "").toLowerCase().includes(searchValue),
        );
        return nameMatch || contentMatch;
      });
    }

    sessions.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      return (
        new Date(b.last_updated || b.created_at) -
        new Date(a.last_updated || a.created_at)
      );
    });

    const infoBar = document.getElementById("chats-info-bar");
    const actionBar = document.getElementById("chats-select-action-bar");
    const totalCountEl = document.getElementById("chats-total-count");
    const selectedCountEl = document.getElementById("chats-selected-count");
    const deleteBtn = document.getElementById("chats-delete-selected-btn");

    if (controllerState.isSelectMode) {
      infoBar.style.display = "none";
      actionBar.style.display = "flex";
      selectedCountEl.textContent = `${controllerState.selectedChatIds.size} selected`;
      deleteBtn.disabled = controllerState.selectedChatIds.size === 0;
    } else {
      infoBar.style.display = "flex";
      actionBar.style.display = "none";
      totalCountEl.textContent = `${sessions.length} chats with Clustrix`;
    }

    const total = sessions.length;
    const pageSize = d.SESSIONS_PER_PAGE || 70;
    const limit = Math.min(
      controllerState.loadedChatPageCount > 0
        ? controllerState.loadedChatPageCount
        : pageSize,
      total,
    );
    const pageItems = sessions.slice(0, limit);

    if (pageItems.length === 0 && !controllerState.isSelectMode) {
      chatsList.innerHTML = `<div class="empty-state"><p>${searchValue ? "No chats found" : "No chats yet"}</p></div>`;
      return;
    }

    chatsList.innerHTML = "";
    pageItems.forEach((session) => {
      const chatItem = document.createElement("div");
      chatItem.className = "chat-item";
      chatItem.dataset.sessionId = session.id;

      const isSelected = controllerState.selectedChatIds.has(session.id);

      const checkboxHTML = `
      <div class="chat-item-checkbox-wrapper">
        <input type="checkbox" class="chat-item-checkbox" data-session-id="${session.id}" ${isSelected ? "checked" : ""}>
      </div>
    `;

      if (controllerState.isSelectMode) {
        chatItem.classList.add("select-mode");
      }

      if (isSelected) {
        chatItem.classList.add("selected");
      }

      if (session.isFavorite) {
        chatItem.classList.add("favorite");
      }

      const lastMessage = session.messages[session.messages.length - 1];
      const lastMessageText = lastMessage
        ? lastMessage[1] || "No content"
        : "Empty chat";
      const lastMessagePreview =
        lastMessageText.slice(0, 100) +
        (lastMessageText.length > 100 ? "..." : "");
      const formattedDate = formatRelativeTime(
        session.last_updated || session.created_at,
      );

      chatItem.innerHTML = `
      ${checkboxHTML}
      <div class="chat-item-content">
        <div class="chat-item-header">
          <h3 class="chat-item-title">${escapeHtml(session.name || "Untitled Chat")}</h3>
          <span class="chat-item-date">Last updated ${formattedDate}</span>
        </div>
      </div>
      <div class="chat-item-actions">
        <div class="chat-menu-container">
          <button class="chat-menu-btn" data-session-id="${session.id}" title="Chat options">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
          <div class="chat-menu-dropdown" data-session-id="${session.id}">
            <div class="chat-menu-item" data-action="favorite">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>${session.isFavorite ? "Unstar" : "Star"}</span>
            </div>
            <div class="chat-menu-item" data-action="rename">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
              <span>Rename</span>
            </div>
            <div class="chat-menu-item chat-menu-item-danger" data-action="delete">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 2l-2 2h12l-2-2H6zM4 6v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V6H4zm2 2h8v8H6V8z"/>
              </svg>
              <span>Delete</span>
            </div>
          </div>
        </div>
      </div>
    `;
      chatsList.appendChild(chatItem);
    });

    if (limit < total) {
      const showMoreDiv = document.createElement("div");
      showMoreDiv.className = "show-more-container";
      showMoreDiv.innerHTML = `
      <button id="chats-show-more" class="show-more-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-chevron-down-icon lucide-circle-chevron-down"><circle cx="12" cy="12" r="10"/><path d="m16 10-4 4-4-4"/></svg>
        Show more sessions
      </button>
    `;
      chatsList.appendChild(showMoreDiv);

      document.getElementById("chats-show-more").addEventListener("click", () => {
        controllerState.loadedChatPageCount = limit + (d.SESSIONS_PER_PAGE || 70);
        renderChatsPage();
      });
    }
  }

  function toggleFavorite(sessionId) {
    const d = requireDeps();
    const session = d.state.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    session.isFavorite = !session.isFavorite;
    d.save();
    renderChatsPage();
    d.renderSessions();
  }

  function startRename(sessionId) {
    const d = requireDeps();
    const session = d.state.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const chatItem = document.querySelector(
      `.chat-item[data-session-id="${sessionId}"]`,
    );
    if (!chatItem) return;

    const titleElement = chatItem.querySelector(".chat-item-title");
    const currentName = titleElement.textContent.replace(/^★\s*/, "");

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.className = "chat-rename-input";
    input.style.cssText = `
    background: var(--bg-secondary);
    border: 1px solid var(--primary);
    color: var(--fg);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-size: 16px;
    font-weight: var(--font-bold);
    width: 100%;
    outline: none;
  `;

    titleElement.style.display = "none";
    titleElement.parentNode.insertBefore(input, titleElement);

    input.focus();
    input.select();

    const finishRename = (saveChange = false) => {
      if (saveChange && input.value.trim() && input.value.trim() !== currentName) {
        session.name = input.value.trim();
        session.last_updated = new Date().toISOString();
        d.markSessionDirty(session.id);
        d.save();
        renderChatsPage();
        if (typeof d.showRecentChats === "function") {
          d.showRecentChats();
        } else {
          d.renderSessions();
        }
      } else {
        titleElement.style.display = "";
        input.remove();
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

  function startSidebarRename(sessionId) {
    const d = requireDeps();
    const session = d.state.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const li = document.querySelector(`li[data-session-id="${sessionId}"]`);
    if (!li) return;

    const nameElement = li.querySelector(".session-name");
    if (!nameElement) return;

    const currentName = nameElement.textContent.replace(/^★\s*/, "");

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.className = "sidebar-rename-input";
    input.style.cssText = `
    background: var(--bg-secondary);
    border: 1px solid var(--primary);
    color: var(--fg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    width: 100%;
    outline: none;
  `;

    nameElement.style.display = "none";
    nameElement.parentNode.insertBefore(input, nameElement);

    input.focus();
    input.select();

    const finishRename = (shouldSave = false) => {
      if (shouldSave && input.value.trim() && input.value.trim() !== currentName) {
        session.name = input.value.trim();
        session.last_updated = new Date().toISOString();
        d.save();
        d.renderSessions();
        renderChatsPage();
      } else {
        nameElement.style.display = "";
        input.remove();
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

  function createSessionListItem(s) {
    const d = requireDeps();
    const current = d.getCurrent ? d.getCurrent() : null;
    const esc = d.esc || ((text) => text);
    const log = d.log || (() => {});

    const li = document.createElement("li");
    li.className = s === current ? "active" : "";
    if (s.isFavorite) {
      li.classList.add("favorite");
    }
    li.dataset.sessionId = s.id || "";

    li.innerHTML = `
    <div class="session-item-group">
      <a href="#" class="session-link" onclick="return false;">
        <span class="session-title-text session-name">${esc(s.name || "Untitled Chat")}</span>
      </a>
      <div class="session-actions">
          <div class="chat-menu-container">
            <button class="chat-menu-btn session-options-btn" data-session-id="${s.id}" title="Chat options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
              </svg>
            </button>
            <div class="chat-menu-dropdown" data-session-id="${s.id}">
              <div class="chat-menu-item" data-action="favorite">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <span>${s.isFavorite ? "Unstar" : "Star"}</span>
              </div>
              <div class="chat-menu-item" data-action="rename">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                <span>Rename</span>
              </div>
              <div class="chat-menu-item chat-menu-item-danger" data-action="delete">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6 2l-2 2h12l-2-2H6zM4 6v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V6H4zm2 2h8v8H6V8z"/>
                </svg>
                <span>Delete</span>
              </div>
            </div>
          </div>
      </div>
    </div>
  `;

    li.addEventListener("click", (e) => {
      if (e.target.closest(".chat-menu-btn")) {
        e.stopPropagation();
        const menuContainer = e.target.closest(".chat-menu-container");
        const menuButton = menuContainer.querySelector(".chat-menu-btn");
        const dropdown = menuContainer.querySelector(".chat-menu-dropdown");

        document
          .querySelectorAll(".chat-menu-dropdown.clicked-open")
          .forEach((menu) => {
            if (menu !== dropdown) {
              menu.classList.remove("clicked-open");
              const otherButton =
                menu.parentElement.querySelector(".chat-menu-btn");
              if (otherButton) otherButton.classList.remove("clicked-active");
            }
          });

        const isClickedOpen = dropdown.classList.contains("clicked-open");

        if (isClickedOpen) {
          dropdown.classList.remove("clicked-open");
          menuButton.classList.remove("clicked-active");
        } else {
          dropdown.classList.add("clicked-open");
          menuButton.classList.add("clicked-active");
        }
        return;
      }

      if (e.target.closest(".chat-menu-item")) {
        e.stopPropagation();
        const menuItem = e.target.closest(".chat-menu-item");
        const action = menuItem.dataset.action;
        const dropdown = e.target.closest(".chat-menu-dropdown");
        const menuSessionId = dropdown.dataset.sessionId;

        dropdown.classList.remove("clicked-open");
        const menuButton = dropdown.parentElement.querySelector(".chat-menu-btn");
        if (menuButton) menuButton.classList.remove("clicked-active");

        if (action === "delete") {
          d.showConfirmationModal(
            "Delete Session",
            `Are you sure you want to delete "${s.name}"?`,
            () => {
              d.deleteSession(s);
              d.renderSessions();
              renderChatsPage();
            },
          );
        } else if (action === "favorite") {
          toggleFavorite(menuSessionId);
        } else if (action === "rename") {
          startSidebarRename(menuSessionId);
        }
        return;
      }

      if (!e.target.closest(".session-actions")) {
        d.setCurrent(s);

        const chatArea = document.querySelector(".chat-area");
        const projectDetailView = document.querySelector(".project-detail-view");
        if (chatArea && chatArea.classList.contains("projects-active")) {
          log("UI", 1, "session-click", "Switching from projects to chat", {
            sessionId: s.id,
          });

          chatArea.classList.remove("welcome-active");
          chatArea.classList.remove("chats-active");
          chatArea.classList.remove("artifacts-active");
          projectDetailView.classList.remove("active");
          chatArea.classList.remove("projects-active");

          d.savePageState("chat", s.id);

          document.getElementById("chats-btn")?.classList.remove("active");
          document.getElementById("artifact-btn")?.classList.remove("active");
          document.getElementById("projects-btn")?.classList.remove("active");

          d.renderHistory();
          d.renderUploadedFiles();
        }
      }
    });

    li.addEventListener("mouseleave", () => {
      const dropdown = li.querySelector(".chat-menu-dropdown.clicked-open");
      const menuButton = li.querySelector(".chat-menu-btn.clicked-active");

      if (dropdown && menuButton) {
        dropdown.classList.remove("clicked-open");
        menuButton.classList.remove("clicked-active");
      }
    });

    return li;
  }

  function setupChatsPageListeners() {
    const d = requireDeps();
    const log = d.log || (() => {});
    const page = document.getElementById("chats-page");
    if (!page) return;

    if (page._listener) {
      page.removeEventListener("click", page._listener);
    }

    const pageListener = (e) => {
      const target = e.target;
      const sessionId = target.closest(".chat-item")?.dataset.sessionId;

      if (target.closest("#chats-select-btn")) {
        controllerState.isSelectMode = true;
        renderChatsPage();
        return;
      }

      if (target.closest("#chats-select-close-btn")) {
        controllerState.isSelectMode = false;
        controllerState.selectedChatIds.clear();
        renderChatsPage();
        return;
      }

      if (target.closest(".chat-menu-btn")) {
        e.stopPropagation();
        const menuContainer = target.closest(".chat-menu-container");
        const menuButton = menuContainer.querySelector(".chat-menu-btn");
        const dropdown = menuContainer.querySelector(".chat-menu-dropdown");

        document
          .querySelectorAll(".chat-menu-dropdown.persistent-open")
          .forEach((menu) => {
            if (menu !== dropdown) {
              menu.classList.remove("persistent-open");
              const otherButton =
                menu.parentElement.querySelector(".chat-menu-btn");
              if (otherButton) otherButton.classList.remove("persistent-active");
            }
          });

        const isPersistentOpen = dropdown.classList.contains("persistent-open");

        if (isPersistentOpen) {
          dropdown.classList.remove("persistent-open");
          menuButton.classList.remove("persistent-active");
        } else {
          dropdown.classList.add("persistent-open");
          menuButton.classList.add("persistent-active");
        }
        return;
      }

      if (target.closest(".chat-menu-item")) {
        e.stopPropagation();
        const menuItem = target.closest(".chat-menu-item");
        const action = menuItem.dataset.action;
        const dropdown = target.closest(".chat-menu-dropdown");
        const menuSessionId = dropdown.dataset.sessionId;

        dropdown.classList.remove("persistent-open");
        const menuButton = dropdown.parentElement.querySelector(".chat-menu-btn");
        if (menuButton) menuButton.classList.remove("persistent-active");

        if (action === "delete") {
          const session = d.state.sessions.find((s) => s.id === menuSessionId);
          if (session) {
            d.showConfirmationModal(
              "Delete Chat",
              `Are you sure you want to delete "${session.name || "Untitled Chat"}"?`,
              () => {
                d.deleteSession(session);
                renderChatsPage();
                d.renderSessions();
              },
            );
          }
        } else if (action === "favorite") {
          toggleFavorite(menuSessionId);
        } else if (action === "rename") {
          startRename(menuSessionId);
        }
        return;
      }

      if (controllerState.isSelectMode && target.closest("#chats-delete-selected-btn")) {
        if (controllerState.selectedChatIds.size === 0) return;
        d.showConfirmationModal(
          "Delete Selected Chats",
          `Delete ${controllerState.selectedChatIds.size} chats?`,
          () => {
            const idsToDelete = [...controllerState.selectedChatIds];
            d.state.sessions = d.state.sessions.filter(
              (s) => !idsToDelete.includes(s.id),
            );
            d.clearDirtyTracking?.();
            d.save();
            controllerState.isSelectMode = false;
            controllerState.selectedChatIds.clear();
            renderChatsPage();
            d.renderSessions();
          },
        );
        return;
      }

      if (
        target.closest(".chat-item-checkbox") ||
        target.classList.contains("chat-item-checkbox")
      ) {
        e.stopPropagation();
        const checkbox = target.closest(".chat-item-checkbox") || target;
        const checkboxSessionId = checkbox.dataset.sessionId;

        if (checkboxSessionId) {
          if (controllerState.selectedChatIds.has(checkboxSessionId)) {
            controllerState.selectedChatIds.delete(checkboxSessionId);
            checkbox.checked = false;
          } else {
            controllerState.selectedChatIds.add(checkboxSessionId);
            checkbox.checked = true;
          }

          if (controllerState.selectedChatIds.size > 0) {
            controllerState.isSelectMode = true;
          } else {
            controllerState.isSelectMode = false;
          }

          renderChatsPage();
        }
        return;
      }

      if (sessionId) {
        if (controllerState.isSelectMode) {
          if (controllerState.selectedChatIds.has(sessionId)) {
            controllerState.selectedChatIds.delete(sessionId);
          } else {
            controllerState.selectedChatIds.add(sessionId);
          }
          renderChatsPage();
        } else {
          const session = d.state.sessions.find((s) => s.id === sessionId);
          if (session) {
            d.setCurrent(session);
            d.restoreNormalView();
          }
        }
      }

      if (target.closest("#chats-select-all-checkbox")) {
        const isChecked = target.checked;
        const visibleSessionIds = Array.from(
          document.querySelectorAll("#chats-list .chat-item"),
        ).map((item) => item.dataset.sessionId);
        if (isChecked) {
          visibleSessionIds.forEach((id) => controllerState.selectedChatIds.add(id));
          controllerState.isSelectMode = true;
        } else {
          controllerState.selectedChatIds.clear();
          controllerState.isSelectMode = false;
        }
        renderChatsPage();
      }
    };

    page.addEventListener("click", pageListener);
    page._listener = pageListener;

    if (!page._hoverHandlersAttached) {
      page.addEventListener(
        "mouseenter",
        (e) => {
          const chatItem = e.target.closest(".chat-item");
          if (chatItem) {
            const dropdown = chatItem.querySelector(
              ".chat-menu-dropdown.persistent-open",
            );
            const menuButton = chatItem.querySelector(".chat-menu-btn");
            if (dropdown && menuButton) {
              menuButton.classList.add("persistent-active");
            }
          }
        },
        true,
      );

      page.addEventListener(
        "mouseleave",
        (e) => {
          const chatItem = e.target.closest(".chat-item");
          if (chatItem) {
            const rect = chatItem.getBoundingClientRect();
            const isStillInside =
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom;

            const dropdown = chatItem.querySelector(
              ".chat-menu-dropdown.persistent-open",
            );
            const isHoveringDropdown =
              dropdown && e.target.closest(".chat-menu-dropdown");

            if (!isStillInside && !isHoveringDropdown) {
              const menuButton = chatItem.querySelector(".chat-menu-btn");
              if (dropdown && menuButton) {
                dropdown.classList.remove("persistent-open");
                menuButton.classList.remove("persistent-active");
              }
            }
          }
        },
        true,
      );

      page.addEventListener(
        "mouseleave",
        (e) => {
          const dropdown = e.target.closest(".chat-menu-dropdown.persistent-open");
          if (dropdown) {
            setTimeout(() => {
              const chatItem = dropdown.closest(".chat-item");
              if (chatItem) {
                const chatRect = chatItem.getBoundingClientRect();
                const dropdownRect = dropdown.getBoundingClientRect();

                const mouseX = window.lastMouseX || 0;
                const mouseY = window.lastMouseY || 0;

                const isInChatItem =
                  mouseX >= chatRect.left &&
                  mouseX <= chatRect.right &&
                  mouseY >= chatRect.top &&
                  mouseY <= chatRect.bottom;

                const isInDropdown =
                  mouseX >= dropdownRect.left &&
                  mouseX <= dropdownRect.right &&
                  mouseY >= dropdownRect.top &&
                  mouseY <= dropdownRect.bottom;

                if (!isInChatItem && !isInDropdown) {
                  const menuButton = chatItem.querySelector(".chat-menu-btn");
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

      page.addEventListener("mousemove", (e) => {
        window.lastMouseX = e.clientX;
        window.lastMouseY = e.clientY;
      });

      page._hoverHandlersAttached = true;
    }

    if (controllerState.documentClickHandler) {
      document.removeEventListener("click", controllerState.documentClickHandler);
    }

    controllerState.documentClickHandler = (e) => {
      if (!e.target.closest(".chat-menu-container")) {
        document
          .querySelectorAll(".chat-menu-dropdown.persistent-open")
          .forEach((menu) => {
            menu.classList.remove("persistent-open");
            const menuButton = menu.parentElement.querySelector(".chat-menu-btn");
            if (menuButton) menuButton.classList.remove("persistent-active");
          });
      }

      if (e.target.closest(".project-show-more")) {
        e.preventDefault();
        const showMoreLink = e.target.closest(".project-show-more");
        const projectId = showMoreLink.dataset.projectId;
        if (projectId) {
          const projects = typeof d.getProjectsData === "function"
            ? d.getProjectsData()
            : [];
          const project = projects.find((p) => p.id === projectId);
          if (project && typeof d.showProjectDetailView === "function") {
            d.showProjectDetailView(project);
          }
        }
      }
    };

    document.addEventListener("click", controllerState.documentClickHandler);

    const searchInput = document.getElementById("chats-search");
    if (searchInput && !searchInput._listenerAttached) {
      searchInput.addEventListener("input", () => renderChatsPage());
      searchInput._listenerAttached = true;
    }
  }

  function filterChats(searchTerm) {
    const chatItems = document.querySelectorAll(".chat-item");
    const term = (searchTerm || "").toLowerCase();

    chatItems.forEach((item) => {
      const title = item
        .querySelector(".chat-item-title")
        .textContent.toLowerCase();
      const preview = item
        .querySelector(".chat-item-preview")
        ?.textContent.toLowerCase() || "";
      const matches = title.includes(term) || preview.includes(term);
      item.style.display = matches ? "flex" : "none";
    });
  }

  function init(options = {}) {
    deps = options;
    return {
      renderChatsPage,
      setupChatsPageListeners,
      toggleFavorite,
      startRename,
      startSidebarRename,
      createSessionListItem,
      filterChats,
      resetSelectionState,
      setSelectMode,
      isSelectMode,
      getSelectedChatIds,
      getLoadedChatPageCount,
      setLoadedChatPageCount,
    };
  }

  global.chatsController = { init };
})(window);
