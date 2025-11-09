import { nowISO, formatRelativeTime } from '../time/time-utils.mjs';
import { escapeHtml } from '../markdown/markdown.mjs';

const STATE = {
  codes: [],
  currentCode: null,
  sessions: [],
};

let deps = {
  log: () => {},
  savePageState: () => {},
  setCurrentSession: () => {},
  createNewSession: null,
  focusSession: null,
  pushPageHistory: null,
  closeMobileSidebar: null,
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

function updateInfoBar() {
  const infoEl = document.getElementById('codes-total-count');
  if (!infoEl) return;

  const total = STATE.codes.length;
  infoEl.textContent = total === 0 ? 'No code workspaces yet' : `${total} code workspace${total === 1 ? '' : 's'}`;
}

function renderCodesList() {
  const list = getCodesListElement();
  if (!list) return;

  const searchValue = (document.getElementById('codes-search')?.value || '').trim().toLowerCase();
  const filtered = STATE.codes.filter(code => {
    if (!searchValue) return true;
    return (
      code.name?.toLowerCase().includes(searchValue) ||
      code.description?.toLowerCase().includes(searchValue)
    );
  });

  list.innerHTML = '';

  if (filtered.length === 0) {
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
    item.innerHTML = `
      <div class="project-item-content">
        <div class="project-item-header">
          <h3>${escapeHtml(code.name || 'Untitled code workspace')}</h3>
          <button class="code-item-open" title="Open workspace" data-code-id="${code.id}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
        <p class="project-item-description">${escapeHtml(code.description || 'No description')}</p>
        <div class="project-item-meta">
          <span>Updated ${formatRelativeTime(code.updated_at || code.last_updated || code.created_at || nowISO())}</span>
          ${code.workspacePath ? `<span class="project-item-meta-pill">${escapeHtml(code.workspacePath)}</span>` : ''}
        </div>
      </div>
    `;

    item.addEventListener('click', (event) => {
      const target = event.target;
      if (target.closest('.code-item-open')) {
        event.preventDefault();
      }
      showCodeDetail(code.id);
    });

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

  if (hadActiveCode) {
    deps.pushPageHistory?.({ page: 'codes-list' });
  }
}

function renderCodeInstruction(code) {
  const container = document.getElementById('code-instruction-text');
  if (!container) return;

  container.textContent = '';
  if (code.instruction) {
    const text = document.createElement('p');
    text.innerHTML = escapeHtml(code.instruction).replace(/\n/g, '<br/>');
    container.appendChild(text);
  } else {
    const hint = document.createElement('p');
    hint.className = 'empty-hint';
    hint.textContent = 'No instruction yet. Provide guidance for this workspace to shape the coding agent.';
    container.appendChild(hint);
  }
}

function renderCodeWorkspace(code) {
  const summary = document.getElementById('code-workspace-summary');
  if (!summary) return;

  summary.innerHTML = '';

  if (!code.workspacePath) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'No workspace selected. Choose a local project folder to enable context-aware coding.';
    summary.appendChild(empty);
    return;
  }

  const pathEl = document.createElement('div');
  pathEl.className = 'workspace-path';
  pathEl.textContent = code.workspacePath;

  const meta = document.createElement('div');
  meta.className = 'workspace-meta';
  const stats = code.workspaceMetadata || {};
  const folders = stats.folderCount ?? stats.folders ?? 0;
  const files = stats.fileCount ?? stats.files ?? 0;
  const ignored = stats.ignored ?? 0;
  const parts = [];
  if (files) parts.push(`${files} files`);
  if (folders) parts.push(`${folders} folders`);
  if (ignored) parts.push(`${ignored} ignored`);
  meta.textContent = parts.length > 0 ? parts.join(' • ') : 'Workspace metadata not available';

  summary.appendChild(pathEl);
  summary.appendChild(meta);
}

function renderCodeSessions(code) {
  const list = document.getElementById('code-sessions-list');
  if (!list) return;

  list.innerHTML = '';
  const related = STATE.sessions.filter(session => session.codeId === code.id);
  if (related.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'No sessions yet. Start a new coding conversation to launch the PowerShell workspace.';
    list.appendChild(empty);
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
    item.innerHTML = `
      <div class="project-session-main">
        <h4>${escapeHtml(session.name || 'Untitled session')}</h4>
        <p>Last activity ${formatRelativeTime(session.last_updated || session.created_at || nowISO())}</p>
      </div>
      <button class="project-session-open" data-session-id="${session.id}" title="Open session">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    `;

    item.addEventListener('click', (event) => {
      const sessionId = event.currentTarget?.querySelector('.project-session-open')?.dataset.sessionId;
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

  const starBtn = detailView?.querySelector('.code-star-btn');
  if (starBtn) {
    starBtn.classList.toggle('active', !!code.isFavorite);
    starBtn.dataset.codeId = code.id;
  }

  renderCodeInstruction(code);
  renderCodeWorkspace(code);
  renderCodeSessions(code);
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
    chatTitle.textContent = 'Codes';
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
  document.getElementById('new-code-btn')?.addEventListener('click', async () => {
    await promptNewCode();
  });

  document.getElementById('codes-search')?.addEventListener('input', () => {
    renderCodesList();
  });

  document.getElementById('back-to-codes-btn')?.addEventListener('click', () => {
    showCodesListView();
  });

  document.getElementById('code-edit-instruction-btn')?.addEventListener('click', async () => {
    if (!STATE.currentCode) return;
    const existing = STATE.currentCode.instruction || '';
    const value = await showCodesInputModal({
      title: 'Workspace Instruction',
      description: 'Provide guidance that shapes how the coding agent operates for this workspace.',
      defaultValue: existing,
      placeholder: 'Explain goals, coding standards, or workflows...',
      multiline: true,
      confirmLabel: 'Save Instruction',
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
      description: 'Select or paste the local folder that contains this project to enable context-aware assistance.',
      defaultValue: existing,
      placeholder: 'C:/Users/you/projects/acme-app',
      confirmLabel: 'Save Path',
      multiline: false,
      allowEmpty: true,
    });
    if (value === null) return;
    STATE.currentCode.workspacePath = value.trim();
    STATE.currentCode.updated_at = nowISO();
    renderCodeWorkspace(STATE.currentCode);
    saveCodes();
  });

  document.getElementById('code-new-session-btn')?.addEventListener('click', async () => {
    if (!STATE.currentCode || !deps.createNewSession) return;
    const session = await deps.createNewSession([], {
      type: 'code',
      codeId: STATE.currentCode.id,
    });
    if (!session) return;
    renderCodeSessions(STATE.currentCode);
    deps.focusSession?.(session.id);
  });

  const starBtn = document.querySelector('#code-detail-view .code-star-btn');
  starBtn?.addEventListener('click', () => {
    if (!STATE.currentCode) return;
    STATE.currentCode.isFavorite = !STATE.currentCode.isFavorite;
    starBtn.classList.toggle('active', STATE.currentCode.isFavorite);
    STATE.currentCode.updated_at = nowISO();
    saveCodes();
    renderCodesList();
  });
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
}) {
  return new Promise((resolve) => {
    const modal = createModalContainer();
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
          <h2>${escapeHtml(title)}</h2>
          <button class="close-btn" type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <form class="modal-form">
          <div class="modal-body">
            ${description ? `<p class="modal-description">${escapeHtml(description)}</p>` : ''}
            <div class="form-group">
              ${multiline
                ? `<textarea class="codes-modal-input" rows="6" placeholder="${escapeHtml(placeholder)}" ${allowEmpty ? '' : 'required'}>${escapeHtml(defaultValue)}</textarea>`
                : `<input class="codes-modal-input" type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" ${allowEmpty ? '' : 'required'} />`
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-btn" data-action="cancel" type="button">Cancel</button>
            <button class="primary-btn" data-action="confirm" type="submit">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = buildModalCloseHandler(modal, resolve);
    const overlay = modal.querySelector('.modal-overlay');
    const closeBtn = modal.querySelector('.close-btn');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const form = modal.querySelector('.modal-form');
    const inputEl = modal.querySelector('.codes-modal-input');

    const submit = () => {
      if (!inputEl) {
        close(null);
        return;
      }

      const trimmed = (inputEl.value || '').trim();

      if (!allowEmpty && !trimmed) {
        inputEl.setCustomValidity('Please enter a value.');
        inputEl.reportValidity();
        inputEl.setCustomValidity('');
        inputEl.focus();
        return;
      }

      close(trimmed);
    };

    overlay?.addEventListener('click', () => close(null));
    closeBtn?.addEventListener('click', () => close(null));
    cancelBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      close(null);
    });

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      } else if (multiline && event.key === 'Enter' && event.ctrlKey) {
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
      <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
          <h2>Create Code Workspace</h2>
          <button class="close-btn" type="button" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <form class="modal-form">
          <div class="modal-body">
            <div class="form-group">
              <label for="codes-new-name">Name</label>
              <input id="codes-new-name" class="codes-modal-input" type="text" placeholder="New workspace name" required />
            </div>
            <div class="form-group">
              <label for="codes-new-description">Description</label>
              <textarea id="codes-new-description" rows="3" placeholder="Optional description..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-btn" data-action="cancel" type="button">Cancel</button>
            <button class="primary-btn" data-action="confirm" type="submit">Create</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = buildModalCloseHandler(modal, resolve);
    const overlay = modal.querySelector('.modal-overlay');
    const closeBtn = modal.querySelector('.close-btn');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const form = modal.querySelector('.modal-form');
    const nameInput = modal.querySelector('#codes-new-name');
    const descriptionInput = modal.querySelector('#codes-new-description');

    const submit = () => {
      if (!(nameInput instanceof HTMLInputElement)) {
        close(null);
        return;
      }

      const rawName = nameInput.value || '';
      const trimmedName = rawName.trim();

      if (!trimmedName) {
        nameInput.setCustomValidity('Please enter a workspace name.');
        nameInput.reportValidity();
        nameInput.setCustomValidity('');
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

    overlay?.addEventListener('click', () => close(null));
    closeBtn?.addEventListener('click', () => close(null));
    cancelBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      close(null);
    });

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      } else if (event.key === 'Enter' && event.ctrlKey && document.activeElement === descriptionInput) {
        event.preventDefault();
        submit();
      }
    });

    if (nameInput instanceof HTMLInputElement) {
      nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
          event.preventDefault();
          submit();
        }
      });
    }

    setTimeout(() => {
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus();
        nameInput.select();
      }
    }, 0);
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
