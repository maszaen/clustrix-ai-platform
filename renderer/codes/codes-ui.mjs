import { AppState } from '../renderer.js';
import { filesUploadDark, filesUploadLight } from '../utils/constants.mjs'
import { nowISO, formatRelativeTime } from '../time/time-utils.mjs';
import { escapeHtml } from '../markdown/markdown.mjs';
import { showConfirmationModal } from '../ui/modal.mjs'

const STATE = {
  codes: [],
  currentCode: null,
  sessions: [],
  isSelectMode: false,
  selectedCodeIds: new Set(),
};

let isComposerSubmitting = false;
let codeMessageStagedFiles = [];
let deps = {
  log: () => {},
  savePageState: () => {},
  setCurrentSession: () => {},
  createNewSession: null,
  focusSession: null,
  pushPageHistory: null,
  closeMobileSidebar: null,
  launchCodeSession: null,
};

function log(context, level, fn, message, details = {}) {
  try {
    deps.log?.(context, level, fn, message, details);
  } catch (error) {
    console.debug(`[codes:${fn}]`, message, details, error);
  }
}

function getCodesListElement() {
  return document.getElementById('codes-list');
}

function getCodeDetailView() {
  return document.getElementById('code-detail-view');
}

function getCodeComposerInput() {
  return document.getElementById('code-message-input');
}

function getCodeComposerSendButton() {
  return document.getElementById('code-send-btn');
}

function resizeCodeComposer(input = getCodeComposerInput()) {
  if (!input) return;
  input.style.height = 'auto';
  const maxHeight = 280;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
}

function resetCodeComposer() {
  const input = getCodeComposerInput();
  if (!input) return;
  input.value = '';
  input.disabled = false;
  input.style.height = 'auto';
  resizeCodeComposer(input);
}

async function submitCodeComposer() {
  if (isComposerSubmitting) return;
  if (!STATE.currentCode) return;

  const input = getCodeComposerInput();
  if (!input) return;

  const raw = input.value || '';
  const trimmed = raw.trim();
  if (!trimmed) {
    resizeCodeComposer(input);
    return;
  }

  // Check if workspace is set
  if (!STATE.currentCode.workspacePath || STATE.currentCode.workspacePath.trim() === '') {
    // Open workspace settings modal instead of sending message
    log('CODES', 2, 'submitCodeComposer', 'Workspace not set, opening settings modal');

    const existing = STATE.currentCode.workspacePath || '';
    const value = await showCodesInputModal({
      title: 'Workspace Directory Required',
      description: 'Please set a workspace directory before starting a code session. This allows the AI to access and understand your project context.',
      defaultValue: existing,
      placeholder: 'C:/Users/you/projects/acme-app',
      confirmLabel: 'Save Path',
      multiline: false,
      allowEmpty: false,
      hasBrowseButton: true,
    });

    if (value && value.trim()) {
      STATE.currentCode.workspacePath = value.trim();
      STATE.currentCode.updated_at = nowISO();
      renderCodeWorkspace(STATE.currentCode);
      await saveCodes();

      // After setting workspace, focus back to input
      if (input) {
        input.focus();
      }
    }
    return;
  }

  if (typeof deps.launchCodeSession !== 'function') {
    log('CODES', 2, 'submitCodeComposer', 'launchCodeSession dependency missing');
    return;
  }

  const sendBtn = getCodeComposerSendButton();

  isComposerSubmitting = true;
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const session = await deps.launchCodeSession({
      code: STATE.currentCode,
      prompt: trimmed,
    });

    if (session) {
      STATE.currentCode.updated_at = nowISO();
      await saveCodes();
      resetCodeComposer();
      renderCodeSessions(STATE.currentCode);
    }
  } catch (error) {
    log('CODES', 4, 'submitCodeComposer', 'Failed to start code session from composer', {
      error: error?.message || error,
      codeId: STATE.currentCode?.id,
    });
  } finally {
    const composerInput = getCodeComposerInput();
    if (composerInput) {
      composerInput.disabled = false;
      resizeCodeComposer(composerInput);
      composerInput.focus();
    }
    const button = getCodeComposerSendButton();
    if (button) button.disabled = false;
    isComposerSubmitting = false;
  }
}

function updateInfoBar() {
  const infoEl = document.getElementById('codes-total-count');
  if (!infoEl) return;

  const total = STATE.codes.length;
  infoEl.textContent = total === 0 ? 'No code workspaces yet' : `${total} code workspace${total === 1 ? '' : 's'}`;
}

function renderCodeMessageFiles() {
  const container = document.getElementById('code-message');
  if (!container) return;

  container.innerHTML = '';

  codeMessageStagedFiles.forEach((file, index) => {
    const pill = document.createElement('div');
    pill.className = 'file-pill';
    pill.innerHTML = `<span>${escapeHtml(file.name)}</span><button class="remove-file-btn" data-index="${index}">&times;</button>`;
    pill.querySelector('.remove-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      codeMessageStagedFiles.splice(index, 1);
      renderCodeMessageFiles();
    });
    container.appendChild(pill);
  });
}

async function startCodeRename(code) {
  const value = await showCodesInputModal({
    title: 'Rename Code Workspace',
    description: 'Enter a new name for this code workspace.',
    defaultValue: code.name || '',
    placeholder: 'Code workspace name',
    confirmLabel: 'Rename',
  });

  if (value === null || value === code.name) return;

  code.name = value;
  code.updated_at = nowISO();

  await saveCodes();
  renderCodesList();
}

async function startCodeDetailRename(code) {
  const value = await showCodesInputModal({
    title: 'Rename Code Workspace',
    description: 'Enter a new name for this code workspace.',
    defaultValue: code.name || '',
    placeholder: 'Code workspace name',
    confirmLabel: 'Rename',
  });

  if (value === null || value === code.name) return;

  code.name = value;
  code.updated_at = nowISO();

  const titleEl = document.getElementById('code-detail-title');
  if (titleEl) titleEl.textContent = value || 'Untitled code workspace';

  await saveCodes();
  renderCodesList();
}

async function startCodeDetailEditDescription(code) {
  const value = await showCodesInputModal({
    title: 'Edit Description',
    description: 'Update the description for this code workspace.',
    defaultValue: code.description || '',
    placeholder: 'Description...',
    multiline: true,
    confirmLabel: 'Save',
    allowEmpty: true,
  });

  if (value === null) return;

  code.description = value;
  code.updated_at = nowISO();

  const descEl = document.getElementById('code-detail-desc');
  if (descEl) descEl.textContent = value || 'No description available';

  await saveCodes();
}

async function deleteCode(code) {
  const confirmed = await showConfirmationModal({
    title: 'Delete Code Workspace',
    message: `Are you sure you want to delete "${code.name || 'Untitled code workspace'}"? This action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    confirmVariant: 'danger',
  });

  if (!confirmed) return;

  const index = STATE.codes.findIndex(c => c.id === code.id);
  if (index !== -1) {
    STATE.codes.splice(index, 1);
    await saveCodes();

    if (STATE.currentCode?.id === code.id) {
      showCodesListView();
    }

    renderCodesList();
  }
}

function updateCodeStarButton() {
  const detailView = getCodeDetailView();
  const starBtn = detailView?.querySelector('.code-star-btn');

  if (starBtn && STATE.currentCode) {
    if (STATE.currentCode.isFavorite) {
      starBtn.classList.add('starred');
    } else {
      starBtn.classList.remove('starred');
    }
  }
}

function renderCodesList() {
  const list = getCodesListElement();
  if (!list) return;

  const infoBar = document.getElementById('codes-info-bar');
  const actionBar = document.getElementById('codes-select-action-bar');
  const selectedCountEl = document.getElementById('codes-selected-count');
  const deleteBtn = document.getElementById('codes-delete-selected-btn');

  if (STATE.isSelectMode) {
    infoBar.style.display = 'none';
    actionBar.style.display = 'flex';
    selectedCountEl.textContent = `${STATE.selectedCodeIds.size} selected`;
    if (deleteBtn) {
      deleteBtn.disabled = STATE.selectedCodeIds.size === 0;
    }
  } else {
    infoBar.style.display = 'flex';
    actionBar.style.display = 'none';
  }

  const searchValue = (document.getElementById('codes-search')?.value || '').trim().toLowerCase();
  let filtered = STATE.codes.filter(code => {
    if (!searchValue) return true;
    return (
      code.name?.toLowerCase().includes(searchValue) ||
      code.description?.toLowerCase().includes(searchValue)
    );
  });

  // Sort: favorites first, then by updated_at
  filtered.sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
    const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  list.innerHTML = '';

  if (filtered.length === 0 && !STATE.isSelectMode) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-body">
        <h3>No code workspaces found</h3>
        <p>Start by creating a new code workspace to organize your coding sessions.</p>
      </div>
    `;
    list.appendChild(empty);
    updateInfoBar();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const code of filtered) {
    const item = document.createElement('div');
    item.className = 'project-item code-item';
    item.dataset.codeId = code.id;

    const isSelected = STATE.selectedCodeIds.has(code.id);

    if (STATE.isSelectMode) {
      item.classList.add('select-mode');
    }

    if (isSelected) {
      item.classList.add('selected');
    }

    const formattedDate = formatRelativeTime(code.updated_at || code.last_updated || code.created_at || nowISO());

    const checkboxHTML = `
      <div class="project-item-checkbox-wrapper">
        <input type="checkbox" class="project-item-checkbox" data-code-id="${code.id}" ${isSelected ? 'checked' : ''}>
      </div>
    `;

    item.innerHTML = `
      ${checkboxHTML}
      <div class="project-item-content">
        <div class="project-item-header">
          <h3 class="project-item-title">${escapeHtml(code.name || 'Untitled code workspace')}</h3>
          <span class="project-item-date">Last updated ${formattedDate}</span>
        </div>

        ${code.description ? `<p class="project-description">${escapeHtml(code.description)}</p>` : `<p class="project-description">No description available</p>`}
      </div>
      <div class="project-item-actions">
        <div class="project-menu-container">
          <button class="project-menu-btn" data-code-id="${code.id}" title="Code workspace options">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
          <div class="project-menu-dropdown code-menu-dropdown" data-code-id="${code.id}">
            <div class="project-menu-item" data-action="open">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              <span>Open Code Workspace</span>
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

    fragment.appendChild(item);
  }

  list.appendChild(fragment);
  updateInfoBar();
}

function showCodesListView() {
  const detailView = getCodeDetailView();
  if (detailView && detailView.classList.contains('active')) {
    detailView.classList.remove('active');
    detailView.classList.add('closing');
    setTimeout(() => {
      detailView.classList.remove('closing');
      detailView.style.display = 'none';
    }, 300);
  } else if (detailView) {
    detailView.classList.remove('active', 'closing');
    detailView.style.display = 'none';
  }

  const list = getCodesListElement();
  if (list) {
    list.style.display = 'grid';
  }
  const hadActiveCode = !!STATE.currentCode;
  STATE.currentCode = null;
  codeMessageStagedFiles = [];
  renderCodeMessageFiles();
  resetCodeComposer();
  const composerSendBtn = getCodeComposerSendButton();
  if (composerSendBtn) {
    composerSendBtn.disabled = false;
  }

  if (hadActiveCode) {
    deps.pushPageHistory?.({ page: 'codes-list' });
  }
}

function renderCodeInstruction(code) {
  const container = document.querySelector('#code-detail-view .project-instructions');
  if (!container) return;

  // Remove existing instruction text if any
  const existingText = container.querySelector('.project-instruction-text');
  if (existingText) {
    existingText.remove();
  }

  // Create new instruction text element
  const instructionDiv = document.createElement('div');
  instructionDiv.className = 'project-instruction-text';
  instructionDiv.id = 'code-instruction-text';

  if (code.instruction) {
    const text = document.createElement('p');
    text.className = 'instruction-preview-text';
    text.innerHTML = escapeHtml(code.instruction).replace(/\n/g, '<br/>');
    instructionDiv.appendChild(text);
  }


  container.appendChild(instructionDiv);
}

function renderCodeWorkspace(code) {
  const container = document.getElementById('code-workspace-list');
  if (!container) return;

  container.innerHTML = '';

  AppState.on('theme-changed', () => {
    if (!code.workspacePath) {
      renderEmptyState();
    }
  });

  function renderEmptyState() {
    const oldEmpty = container.querySelector('.file-empty-state-icon');
    if (oldEmpty) oldEmpty.remove();
    
    const isDarkTheme = (AppState.theme === 'dark');
    const iconSVG = isDarkTheme ? filesUploadDark : filesUploadLight;
    
    const empty = document.createElement('div');
    empty.className = 'file-empty-state-icon';
    empty.style.gridColumn = '1 / -1';
    empty.innerHTML = `
      <div class="file-drop-icon">${iconSVG}</div>
      <small>Select a project folder to enable<br>context-aware coding assistance.</small>
    `;
    container.appendChild(empty);
  }

  // Initial render
  if (!code.workspacePath) {
    container.classList.add('project-files-grid');
    renderEmptyState();
    return;
  }


  container.classList.remove('project-files-grid');

  const workspaceItem = document.createElement('div');
  workspaceItem.innerHTML = `
    <div class="project-file-info">
      <div class="project-file-text">
        <p class="project-file-name">${escapeHtml(code.workspacePath.split(/[\\/]/).pop() || code.workspacePath)}</p>
        <p class="project-file-size">${escapeHtml(code.workspacePath)}</p>
      </div>
    </div>
  `;

  container.appendChild(workspaceItem);

  const stats = code.workspaceMetadata || {};
  const folders = stats.folderCount ?? stats.folders ?? 0;
  const files = stats.fileCount ?? stats.files ?? 0;
  const ignored = stats.ignored ?? 0;
  if (files || folders) {
    const meta = document.createElement('p');
    meta.className = 'project-file-meta';
    const parts = [];
    if (files) parts.push(`${files} files`);
    if (folders) parts.push(`${folders} folders`);
    if (ignored) parts.push(`${ignored} ignored`);
    meta.textContent = parts.join(' • ');
    container.appendChild(meta);
  }
}

function renderCodeSessions(code) {
  const list = document.getElementById('code-sessions-list');
  if (!list) return;

  list.innerHTML = '';
  const related = STATE.sessions.filter(session => session.codeId === code.id);
  if (related.length === 0) {
    list.innerHTML = `
      <div class="project-session-item-none">
        <p>Start a coding session to organize<br>conversations and leverage workspace context.</p>
      </div>
    `;
    return;
  }

  related.sort((a, b) => {
    const da = new Date(a.last_updated || a.created_at || 0).getTime();
    const db = new Date(b.last_updated || b.created_at || 0).getTime();
    return db - da;
  });

  for (const session of related) {
    const item = document.createElement('div');
    item.className = 'project-session-item';
    item.dataset.sessionId = session.id;

    const formattedDate = formatRelativeTime(session.last_updated || session.created_at || nowISO());

    item.innerHTML = `
      <div class="session-info">
        <h4 class="session-title">${escapeHtml(session.name || 'Untitled session')}</h4>
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
            <div class="session-menu-item" data-action="open">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              <span>Open Session</span>
            </div>
            <div class="session-menu-item" data-action="favorite">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>${session.isFavorite ? 'Unstar' : 'Star'}</span>
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

    item.addEventListener('click', (event) => {
      // Don't open session if clicking on menu
      if (event.target.closest('.session-menu-container')) {
        return;
      }

      const sessionId = item.dataset.sessionId;
      if (sessionId) {
        deps.focusSession?.(sessionId);
      }
    });

    list.appendChild(item);
  }
}

function renderCodeDetail(code) {
  const detailView = getCodeDetailView();
  const list = getCodesListElement();
  if (list) {
    list.style.display = 'none';
  }

  if (detailView) {
    detailView.style.display = 'flex';
    detailView.classList.remove('closing');
    detailView.classList.add('active');
  }

  const titleEl = document.getElementById('code-detail-title');
  const descEl = document.getElementById('code-detail-desc');
  if (titleEl) titleEl.textContent = code.name || 'Untitled code workspace';
  if (descEl) descEl.textContent = code.description || 'No description available';

  updateCodeStarButton();

  renderCodeMessageFiles();
  renderCodeInstruction(code);
  renderCodeWorkspace(code);
  renderCodeSessions(code);

  const composerInput = getCodeComposerInput();
  if (composerInput) {
    const placeholderName = code.name ? ` ${code.name}` : '';
    composerInput.placeholder = `Ask about${placeholderName || ' this workspace'} or start a new coding run...`;
    composerInput.disabled = false;
    resizeCodeComposer(composerInput);
    setTimeout(() => {
      composerInput.focus();
    }, 0);
  }

  const composerSendBtn = getCodeComposerSendButton();
  if (composerSendBtn) {
    composerSendBtn.disabled = false;
  }
}

function showCodeDetail(codeId) {
  const code = STATE.codes.find(c => c.id === codeId);
  if (!code) return;

  STATE.currentCode = code;
  renderCodeDetail(code);

  deps.pushPageHistory?.({ page: 'code-detail', codeId: code.id });
}

function activateCodesPage() {
  if (window.innerWidth <= 998) {
    deps.closeMobileSidebar?.();
  }

  deps.setCurrentSession?.(null);

  // Reset select mode
  STATE.isSelectMode = false;
  STATE.selectedCodeIds.clear();

  const chatArea = document.querySelector('.chat-area');
  if (chatArea) {
    chatArea.classList.remove('welcome-active', 'chats-active', 'artifacts-active', 'projects-active');
    chatArea.classList.add('codes-active');
  }

  document.getElementById('codes-btn')?.classList.add('active');
  document.getElementById('projects-btn')?.classList.remove('active');
  document.getElementById('chats-btn')?.classList.remove('active');
  document.getElementById('artifact-btn')?.classList.remove('active');

  deps.savePageState?.('codes');
  deps.pushPageHistory?.({ page: 'codes-list' });

  const chatTitle = document.getElementById('chat-title');
  if (chatTitle) {
    chatTitle.textContent = 'Your Code Workspaces';
    chatTitle.title = 'Manage your code workspaces';
  }
  const logoEl = document.getElementById('clustrix-logo');
  if (logoEl) {
    logoEl.innerHTML = '';
  }

  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.style.display = 'none';
  }

  const projectDetail = document.getElementById('project-detail-view');
  if (projectDetail && projectDetail.classList.contains('active')) {
    projectDetail.classList.remove('active');
    projectDetail.classList.add('closing');
    setTimeout(() => {
      projectDetail.classList.remove('closing');
      projectDetail.style.display = 'none';
    }, 300);
  }

  showCodesListView();
  renderCodesList();
  updateInfoBar();

  const searchInput = document.getElementById('codes-search');
  if (searchInput) {
    searchInput.focus();
  }
}

function ensureListeners() {
  // Add global click handler for menus and dropdowns
  document.addEventListener('click', (e) => {
    const target = e.target;

    // Handle code card menu button clicks
    if (target.closest('.code-item .project-menu-btn')) {
      e.stopPropagation();
      const menuContainer = target.closest('.project-menu-container');
      const menuButton = menuContainer?.querySelector('.project-menu-btn');
      const dropdown = menuContainer?.querySelector('.code-menu-dropdown');

      if (dropdown && menuButton) {
        // Close all other persistent-open menus
        document.querySelectorAll('.code-menu-dropdown.persistent-open').forEach((menu) => {
          if (menu !== dropdown) {
            menu.classList.remove('persistent-open');
            const otherButton = menu.parentElement?.querySelector('.project-menu-btn');
            if (otherButton) otherButton.classList.remove('persistent-active');
          }
        });

        // Toggle current menu's persistent state
        const isOpen = dropdown.classList.contains('persistent-open');
        if (isOpen) {
          dropdown.classList.remove('persistent-open');
          menuButton.classList.remove('persistent-active');
        } else {
          dropdown.classList.add('persistent-open');
          menuButton.classList.add('persistent-active');
        }
      }
      return;
    }

    // Handle code card menu item clicks
    if (target.closest('.code-menu-dropdown .project-menu-item')) {
      e.stopPropagation();
      const menuItem = target.closest('.project-menu-item');
      const action = menuItem?.dataset.action;
      const dropdown = target.closest('.code-menu-dropdown');
      const codeId = dropdown?.dataset.codeId;

      // Close menu
      if (dropdown) {
        dropdown.classList.remove('persistent-open');
        const menuButton = dropdown.parentElement?.querySelector('.project-menu-btn');
        if (menuButton) menuButton.classList.remove('persistent-active');
      }

      const code = STATE.codes.find(c => c.id === codeId);
      if (!code) return;

      if (action === 'open') {
        showCodeDetail(codeId);
      } else if (action === 'rename') {
        startCodeRename(code);
      } else if (action === 'delete') {
        deleteCode(code);
      }
      return;
    }

    // Close code card menus when clicking outside
    if (!target.closest('.project-menu-container')) {
      document.querySelectorAll('.code-menu-dropdown.persistent-open').forEach((menu) => {
        menu.classList.remove('persistent-open');
        const menuButton = menu.parentElement?.querySelector('.project-menu-btn');
        if (menuButton) menuButton.classList.remove('persistent-active');
      });
    }

    // Handle code title menu button clicks (in detail view)
    if (target.closest('.code-title-menu-btn')) {
      e.stopPropagation();
      const menuContainer = target.closest('.project-title-menu-container');
      const menuButton = menuContainer?.querySelector('.code-title-menu-btn');
      const dropdown = menuContainer?.querySelector('.code-title-menu-dropdown');

      if (dropdown && menuButton) {
        // Close all other persistent-open menus
        document.querySelectorAll('.code-title-menu-dropdown.persistent-open').forEach((menu) => {
          if (menu !== dropdown) {
            menu.classList.remove('persistent-open');
            const otherButton = menu.parentElement?.querySelector('.code-title-menu-btn');
            if (otherButton) otherButton.classList.remove('persistent-active');
          }
        });

        // Toggle current menu's persistent state
        const isOpen = dropdown.classList.contains('persistent-open');
        if (isOpen) {
          dropdown.classList.remove('persistent-open');
          menuButton.classList.remove('persistent-active');
        } else {
          dropdown.classList.add('persistent-open');
          menuButton.classList.add('persistent-active');
        }
      }
      return;
    }

    // Handle code title menu item clicks (in detail view)
    if (target.closest('.code-title-menu-dropdown .project-title-menu-item')) {
      e.stopPropagation();
      const menuItem = target.closest('.project-title-menu-item');
      const action = menuItem?.dataset.action;
      const dropdown = target.closest('.code-title-menu-dropdown');

      // Close menu
      if (dropdown) {
        dropdown.classList.remove('persistent-open');
        const menuButton = dropdown.parentElement?.querySelector('.code-title-menu-btn');
        if (menuButton) menuButton.classList.remove('persistent-active');
      }

      if (action === 'rename' && STATE.currentCode) {
        startCodeDetailRename(STATE.currentCode);
      } else if (action === 'edit-description' && STATE.currentCode) {
        startCodeDetailEditDescription(STATE.currentCode);
      } else if (action === 'delete' && STATE.currentCode) {
        deleteCode(STATE.currentCode);
      }
    }

    // Close code title menu when clicking outside
    if (!target.closest('.project-title-menu-container')) {
      document.querySelectorAll('.code-title-menu-dropdown.persistent-open').forEach((menu) => {
        menu.classList.remove('persistent-open');
        const menuButton = menu.parentElement?.querySelector('.code-title-menu-btn');
        if (menuButton) menuButton.classList.remove('persistent-active');
      });
    }

    // Handle session menu button clicks
    if (target.closest('.session-menu-btn')) {
      e.stopPropagation();
      const menuContainer = target.closest('.session-menu-container');
      const menuButton = menuContainer?.querySelector('.session-menu-btn');
      const dropdown = menuContainer?.querySelector('.session-menu-dropdown');

      if (dropdown && menuButton) {
        // Close all other session menus
        document.querySelectorAll('.session-menu-dropdown.persistent-open').forEach((menu) => {
          if (menu !== dropdown) {
            menu.classList.remove('persistent-open');
            const otherButton = menu.parentElement?.querySelector('.session-menu-btn');
            if (otherButton) otherButton.classList.remove('persistent-active');
          }
        });

        // Toggle current menu
        const isOpen = dropdown.classList.contains('persistent-open');
        if (isOpen) {
          dropdown.classList.remove('persistent-open');
          menuButton.classList.remove('persistent-active');
        } else {
          dropdown.classList.add('persistent-open');
          menuButton.classList.add('persistent-active');
        }
      }
      return;
    }

    // Handle session menu item clicks
    if (target.closest('.session-menu-dropdown .session-menu-item')) {
      e.stopPropagation();
      const menuItem = target.closest('.session-menu-item');
      const action = menuItem?.dataset.action;
      const dropdown = target.closest('.session-menu-dropdown');
      const sessionId = dropdown?.dataset.sessionId;

      // Close menu
      if (dropdown) {
        dropdown.classList.remove('persistent-open');
        const menuButton = dropdown.parentElement?.querySelector('.session-menu-btn');
        if (menuButton) menuButton.classList.remove('persistent-active');
      }

      const session = STATE.sessions.find(s => s.id === sessionId);
      if (!session) return;

      if (action === 'open') {
        deps.focusSession?.(sessionId);
      } else if (action === 'favorite') {
        session.isFavorite = !session.isFavorite;
        renderCodeSessions(STATE.currentCode);
      } else if (action === 'rename') {
        // TODO: Add rename session functionality
        log('CODES', 2, 'session-menu', 'Rename session not yet implemented');
      } else if (action === 'delete') {
        // TODO: Add delete session functionality
        log('CODES', 2, 'session-menu', 'Delete session not yet implemented');
      }
      return;
    }

    // Close session menus when clicking outside
    if (!target.closest('.session-menu-container')) {
      document.querySelectorAll('.session-menu-dropdown.persistent-open').forEach((menu) => {
        menu.classList.remove('persistent-open');
        const menuButton = menu.parentElement?.querySelector('.session-menu-btn');
        if (menuButton) menuButton.classList.remove('persistent-active');
      });
    }

    // Handle clicks on code item cards
    if (target.closest('.code-item')) {
      const item = target.closest('.code-item');
      const codeId = item?.dataset.codeId;

      // Skip if clicking on checkbox, menu button, or menu dropdown
      if (target.closest('.project-item-checkbox-wrapper') ||
          target.closest('.project-menu-btn') ||
          target.closest('.code-menu-dropdown')) {
        return;
      }

      if (STATE.isSelectMode && codeId) {
        // In select mode, toggle selection
        if (STATE.selectedCodeIds.has(codeId)) {
          STATE.selectedCodeIds.delete(codeId);
        } else {
          STATE.selectedCodeIds.add(codeId);
        }

        if (STATE.selectedCodeIds.size === 0) {
          STATE.isSelectMode = false;
        }

        renderCodesList();
      } else if (codeId) {
        // In normal mode, open code detail
        showCodeDetail(codeId);
      }
    }
  });

  document.getElementById('new-code-btn')?.addEventListener('click', async () => {
    await promptNewCode();
  });

  document.getElementById('codes-search')?.addEventListener('input', () => {
    renderCodesList();
  });

  document.getElementById('back-to-codes-btn')?.addEventListener('click', () => {
    showCodesListView();
  });

  // Select mode buttons
  document.getElementById('codes-select-btn')?.addEventListener('click', () => {
    STATE.isSelectMode = true;
    renderCodesList();
  });

  document.getElementById('codes-select-close-btn')?.addEventListener('click', () => {
    STATE.isSelectMode = false;
    STATE.selectedCodeIds.clear();
    renderCodesList();
  });

  document.getElementById('codes-delete-selected-btn')?.addEventListener('click', async () => {
    if (STATE.selectedCodeIds.size === 0) return;

    const confirmed = await showConfirmationModal({
      title: 'Delete Code Workspaces',
      message: `Are you sure you want to delete ${STATE.selectedCodeIds.size} code workspace${STATE.selectedCodeIds.size === 1 ? '' : 's'}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
    });

    if (confirmed) {
      const idsToDelete = Array.from(STATE.selectedCodeIds);
      STATE.codes = STATE.codes.filter((c) => !idsToDelete.includes(c.id));
      await saveCodes();
      STATE.isSelectMode = false;
      STATE.selectedCodeIds.clear();

      const selectAllCheckbox = document.getElementById('codes-select-all-checkbox');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;

      renderCodesList();
    }
  });

  document.getElementById('codes-select-all-checkbox')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const visibleCodeIds = Array.from(
      document.querySelectorAll('.code-item')
    ).map((item) => item.dataset.codeId);

    if (isChecked) {
      visibleCodeIds.forEach((id) => STATE.selectedCodeIds.add(id));
      STATE.isSelectMode = true;
    } else {
      STATE.selectedCodeIds.clear();
      STATE.isSelectMode = false;
    }

    renderCodesList();
  });

  document.getElementById('edit-code-instruction-btn')?.addEventListener('click', async () => {
    if (!STATE.currentCode) return;
    const existing = STATE.currentCode.instruction || '';
    const value = await showCodesInputModal({
      title: 'Workspace Instruction',
      description: 'Provide guidance that shapes how the coding agent operates for this workspace.',
      defaultValue: existing,
      placeholder: 'Explain goals, coding standards, or workflows...',
      multiline: true,
      confirmLabel: 'Save Instruction',
      allowEmpty: true,
    });
    if (value === null) return;
    STATE.currentCode.instruction = value.trim();
    STATE.currentCode.updated_at = nowISO();
    renderCodeInstruction(STATE.currentCode);
    saveCodes();
  });

  document.getElementById('code-workspace-btn')?.addEventListener('click', async () => {
    if (!STATE.currentCode) return;

    const existing = STATE.currentCode.workspacePath || '';
    const value = await showCodesInputModal({
      title: 'Workspace Directory',
      description: 'Enter the local folder path that contains this project to enable context-aware assistance.',
      defaultValue: existing,
      placeholder: 'C:/Users/you/projects/acme-app',
      confirmLabel: 'Save Path',
      multiline: false,
      allowEmpty: true,
      hasBrowseButton: true,
    });
    if (value === null) return;
    STATE.currentCode.workspacePath = value.trim();
    STATE.currentCode.updated_at = nowISO();
    renderCodeWorkspace(STATE.currentCode);
    saveCodes();
  });

  const composerInput = getCodeComposerInput();
  if (composerInput) {
    composerInput.addEventListener('input', () => {
      resizeCodeComposer(composerInput);
    });

    composerInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        submitCodeComposer();
      }
    });
  }

  const composerSendBtn = getCodeComposerSendButton();
  if (composerSendBtn) {
    composerSendBtn.addEventListener('click', (event) => {
      event.preventDefault();
      submitCodeComposer();
    });
  }

  const starBtn = document.querySelector('#code-detail-view .code-star-btn');
  starBtn?.addEventListener('click', () => {
    if (!STATE.currentCode) return;
    STATE.currentCode.isFavorite = !STATE.currentCode.isFavorite;
    updateCodeStarButton();
    STATE.currentCode.updated_at = nowISO();
    saveCodes();
    renderCodesList();
  });

  // Add hover management for persistent menus - CODES PAGE VERSION
  const codesPage = document.getElementById('codes-page');
  if (codesPage) {
    codesPage.addEventListener(
      'mouseenter',
      (e) => {
        const codeItem = e.target.closest('.code-item');
        if (codeItem) {
          const dropdown = codeItem.querySelector(
            '.code-menu-dropdown.persistent-open',
          );
          const menuButton = codeItem.querySelector('.project-menu-btn');
          if (dropdown && menuButton) {
            menuButton.classList.add('persistent-active');
          }
        }
      },
      true,
    );

    codesPage.addEventListener(
      'mouseleave',
      (e) => {
        const codeItem = e.target.closest('.code-item');
        if (codeItem) {
          // Check if mouse is actually leaving the code-item
          const rect = codeItem.getBoundingClientRect();
          const isStillInside =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;

          // Check if mouse is hovering over dropdown menu
          const dropdown = codeItem.querySelector(
            '.code-menu-dropdown.persistent-open',
          );
          const isHoveringDropdown =
            dropdown && e.target.closest('.code-menu-dropdown');

          // Only close menu if mouse actually left code-item AND not hovering dropdown
          if (!isStillInside && !isHoveringDropdown) {
            const menuButton = codeItem.querySelector('.project-menu-btn');
            if (dropdown && menuButton) {
              dropdown.classList.remove('persistent-open');
              menuButton.classList.remove('persistent-active');
            }
          }
        }
      },
      true,
    );

    // Handle mouseleave from dropdown menu
    codesPage.addEventListener(
      'mouseleave',
      (e) => {
        const dropdown = e.target.closest(
          '.code-menu-dropdown.persistent-open',
        );
        if (dropdown) {
          // Delay check to ensure mouse isn't moving to code-item
          setTimeout(() => {
            const codeItem = dropdown.closest('.code-item');
            if (codeItem) {
              // Check if mouse is still within code-item or dropdown
              const codeRect = codeItem.getBoundingClientRect();
              const dropdownRect = dropdown.getBoundingClientRect();

              // Get current mouse position (approximate)
              const mouseX = window.lastMouseX || 0;
              const mouseY = window.lastMouseY || 0;

              const isInCodeItem =
                mouseX >= codeRect.left &&
                mouseX <= codeRect.right &&
                mouseY >= codeRect.top &&
                mouseY <= codeRect.bottom;

              const isInDropdown =
                mouseX >= dropdownRect.left &&
                mouseX <= dropdownRect.right &&
                mouseY >= dropdownRect.top &&
                mouseY <= dropdownRect.bottom;

              // Close menu if mouse is not in code-item or dropdown
              if (!isInCodeItem && !isInDropdown) {
                const menuButton = codeItem.querySelector('.project-menu-btn');
                if (menuButton) {
                  dropdown.classList.remove('persistent-open');
                  menuButton.classList.remove('persistent-active');
                }
              }
            }
          }, 50);
        }
      },
      true,
    );

    // Track mouse position for dropdown detection
    if (!window.lastMouseX) {
      document.addEventListener('mousemove', (e) => {
        window.lastMouseX = e.clientX;
        window.lastMouseY = e.clientY;
      });
    }
  }

  // Add hover management for project-session-item persistent menus
  document.addEventListener(
    'mouseenter',
    (e) => {
      if (!(e.target instanceof Element)) return;
      const sessionItem = e.target.closest('.project-session-item');
      if (sessionItem) {
        const dropdown = sessionItem.querySelector(
          '.session-menu-dropdown.persistent-open',
        );
        const menuButton = sessionItem.querySelector('.session-menu-btn');
        if (dropdown && menuButton) {
          menuButton.classList.add('persistent-active');
        }
      }
    },
    true,
  );

  document.addEventListener(
    'mouseleave',
    (e) => {
      if (!(e.target instanceof Element)) return;
      const sessionItem = e.target.closest('.project-session-item');
      if (sessionItem) {
        const rect = sessionItem.getBoundingClientRect();
        const isStillInside =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        const dropdown = sessionItem.querySelector(
          '.session-menu-dropdown.persistent-open',
        );
        const isHoveringDropdown =
          dropdown && e.target.closest('.session-menu-dropdown');

        if (!isStillInside && !isHoveringDropdown) {
          const menuButton = sessionItem.querySelector('.session-menu-btn');
          if (dropdown && menuButton) {
            dropdown.classList.remove('persistent-open');
            menuButton.classList.remove('persistent-active');
          }
        }
      }
    },
    true,
  );
}

async function loadCodes() {
  try {
    const loaded = await window.api?.codes?.load?.();
    if (Array.isArray(loaded)) {
      STATE.codes = loaded.map(code => ({ ...code }));
    } else {
      STATE.codes = [];
    }
    renderCodesList();
    updateInfoBar();
  } catch (error) {
    log('CODES', 4, 'loadCodes', 'Failed to load codes', { error: error?.message });
    STATE.codes = [];
  }
}

async function saveCodes() {
  try {
    await window.api?.codes?.save?.(STATE.codes);
    renderCodesList();
  } catch (error) {
    log('CODES', 4, 'saveCodes', 'Failed to save codes', { error: error?.message });
  }
}

async function promptNewCode() {
  const result = await showNewCodeModal();
  if (!result) {
    return;
  }

  const code = {
    id: crypto.randomUUID(),
    name: result.name.trim(),
    description: result.description.trim(),
    instruction: '',
    workspacePath: '',
    workspaceMetadata: {},
    created_at: nowISO(),
    updated_at: nowISO(),
    isFavorite: false,
    metadata: {},
  };

  STATE.codes.unshift(code);
  await saveCodes();
  renderCodesList();
  showCodeDetail(code.id);
}

function buildModalCloseHandler(modal, resolve) {
  return (value) => {
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    resolve(value);
  };
}

function createModalContainer() {
  const modal = document.createElement('div');
  modal.className = 'modal codes-modal';
  return modal;
}

function showCodesInputModal({
  title,
  description = '',
  defaultValue = '',
  placeholder = '',
  multiline = false,
  confirmLabel = 'Save',
  allowEmpty = false,
  hasBrowseButton = false,
}) {
  return new Promise((resolve) => {
    const modal = createModalContainer();
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
          <h2>${escapeHtml(title)}</h2>
          <button class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          ${description ? `<p class="modal-description">${escapeHtml(description)}</p>` : ''}
          <div class="form-group">
            ${multiline
              ? `<textarea rows="6" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>`
              : `<input type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />`
            }
            ${hasBrowseButton ? `<button class="secondary-btn modal-browse-btn" type="button" style="margin-top: 10px;">Browse</button>` : ''}
          </div>
          <div class="form-actions">
            <button class="primary-btn" data-action="cancel">Cancel</button>
            <button class="primary-btn" data-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = buildModalCloseHandler(modal, resolve);
    const overlay = modal.querySelector('.modal-overlay');
    const closeBtn = modal.querySelector('.close-btn');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    const inputEl = modal.querySelector('.form-group input, .form-group textarea');
    const browseBtn = modal.querySelector('.modal-browse-btn');

    // Browse button handler
    if (browseBtn && window.api?.files?.selectDirectory) {
      browseBtn.addEventListener('click', async () => {
        try {
          const result = await window.api.files.selectDirectory();
          if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
            if (inputEl) {
              inputEl.value = result.filePaths[0];
            }
          }
        } catch (error) {
          log('CODES', 3, 'modal-browse-btn', 'Failed to open directory selector', { error: error?.message });
        }
      });
    }

    const submit = () => {
      if (!inputEl) {
        close(null);
        return;
      }

      const trimmed = (inputEl.value || '').trim();

      if (!allowEmpty && !trimmed) {
        inputEl.focus();
        return;
      }

      close(trimmed);
    };

    overlay?.addEventListener('click', () => close(null));
    closeBtn?.addEventListener('click', () => close(null));
    cancelBtn?.addEventListener('click', () => close(null));
    confirmBtn?.addEventListener('click', () => submit());

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      } else if (event.key === 'Enter' && (!multiline || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    });

    setTimeout(() => {
      if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement) {
        inputEl.focus();
        if (inputEl instanceof HTMLInputElement && !multiline) {
          inputEl.select();
        }
      }
    }, 0);
  });
}

function showNewCodeModal() {
  return new Promise((resolve) => {
    const modal = createModalContainer();
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-card" style="max-width: 500px;">
        <div class="modal-header">
          <h2>Create Code Workspace</h2>
          <button class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="codes-new-name">Name</label>
            <input id="codes-new-name" type="text" placeholder="New workspace name" />
          </div>
          <div class="form-group">
            <label for="codes-new-description">Description (Optional)</label>
            <textarea id="codes-new-description" placeholder="Describe your workspace..." rows="3"></textarea>
          </div>
          <div class="form-actions">
            <button id="cancel-code-btn" class="primary-btn">Cancel</button>
            <button id="create-code-btn" class="primary-btn">Create Workspace</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = buildModalCloseHandler(modal, resolve);
    const overlay = modal.querySelector('.modal-overlay');
    const closeBtn = modal.querySelector('.close-btn');
    const cancelBtn = modal.querySelector('#cancel-code-btn');
    const confirmBtn = modal.querySelector('#create-code-btn');
    const nameInput = modal.querySelector('#codes-new-name');
    const descriptionInput = modal.querySelector('#codes-new-description');

    if (nameInput) nameInput.focus();

    const submit = () => {
      if (!(nameInput instanceof HTMLInputElement)) {
        close(null);
        return;
      }

      const rawName = nameInput.value || '';
      const trimmedName = rawName.trim();

      if (!trimmedName) {
        nameInput.focus();
        return;
      }

      const descriptionValue = descriptionInput instanceof HTMLTextAreaElement
        ? (descriptionInput.value || '').trim()
        : '';

      close({
        name: trimmedName,
        description: descriptionValue,
      });
    };

    modal.addEventListener('click', (e) => {
      if (
        e.target.closest('.close-btn') ||
        e.target.closest('#cancel-code-btn') ||
        e.target === overlay
      ) {
        close(null);
      }

      if (e.target.closest('#create-code-btn')) {
        submit();
      }
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
    });
  });
}

/**
 * Initialize the codes page feature with renderer-provided helpers.
 * @param {Object} [options]
 * @param {Function} [options.log] logger wrapper
 * @param {Function} [options.savePageState] persist current page state
 * @param {Function} [options.setCurrentSession] setter for active chat session
 * @param {Function} [options.createNewSession] factory for creating sessions
 * @param {Function} [options.focusSession] focus a specific session by id
 * @param {Function} [options.launchCodeSession] launch a code session with initial prompt
 * @param {Function} [options.pushPageHistory] push navigation breadcrumb
 * @param {Function} [options.closeMobileSidebar] close the mobile sidebar if open
 */
export function initializeCodesFeature(options = {}) {
  deps = {
    ...deps,
    ...options,
  };

  ensureListeners();
  loadCodes();
}

/**
 * Refresh code session relationships when chat sessions change.
 * @param {Array} [allSessions=[]] complete sessions collection
 */
export function handleSessionsUpdate(allSessions = []) {
  STATE.sessions = Array.isArray(allSessions) ? allSessions : [];
  if (STATE.currentCode) {
    renderCodeSessions(STATE.currentCode);
  }
}

/**
 * Activate the codes page, mirroring sidebar navigation behaviour.
 */
export function showCodesPage() {
  activateCodesPage();
}

/**
 * Expose a snapshot of the current codes state for external consumers.
 * @returns {{codes: Array, currentCode: Object|null}}
 */
export function getCodesState() {
  return {
    codes: STATE.codes.slice(),
    currentCode: STATE.currentCode,
  };
}

/**
 * Open code detail view by identifier.
 * @param {string} codeId target workspace id
 */
export function openCodeDetail(codeId) {
  showCodeDetail(codeId);
}

/**
 * Get code message staged files array for file upload
 * @returns {Array} staged files array
 */
export function getCodeMessageStagedFiles() {
  return codeMessageStagedFiles;
}

/**
 * Render code message staged files
 */
export { renderCodeMessageFiles };
