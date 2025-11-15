import { closeMobile } from "../renderer.js";
let confirmationModal = null;
let confirmationTitleEl = null;
let confirmationMessageEl = null;
let confirmationConfirmBtn = null;
let confirmationCancelBtn = null;
let confirmationCloseBtn = null;
let confirmationModalOptions = null;
let isConfirmationProcessing = false;
// ==================== MODAL HELPER FUNCTIONS ====================

/**
 * Open modal with animation
 * @param {HTMLElement|string} modal - Modal element or selector
 */
/**
 * Show browser warning modal (no buttons, cannot be closed)
 */
function showBrowserWarningModal() {
  // Create modal if doesn't exist
  let modal = document.getElementById('browser-warning-modal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'browser-warning-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-overlay" style="pointer-events: none;"></div>
      <div class="modal-card" style="text-align: center; max-width: 450px;">
        <div class="modal-header" style="border: none; padding-bottom: 0;">
          <h2 style="margin: 0;">Can't Run The Process</h2>
        </div>
        <div class="modal-body">
          <p style="margin-top: 16px; color: var(--text-secondary); line-height: 1.6;">
            You are running the application inside the browser.
            <br><br>
            This application requires Electron environment to function properly.
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Show modal (remove hidden class)
  modal.classList.remove('hidden');
  log("BROWSER", 2, "showBrowserWarningModal", "Browser mode detected - showing warning");
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

function openModalWithAnimation(modal) {
  const modalElement = typeof modal === 'string' ? document.querySelector(modal) : modal;
  if (!modalElement) return;

  closeMobile();

  // Remove hidden and closing classes
  modalElement.classList.remove('hidden', 'closing');
}

function showConfirmationModal(options = {}, legacyMessage, legacyOnConfirm) {
  return new Promise((resolve) => {
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
      if (!confirmationModal) {
        resolve(false);
        return;
      }
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
      confirmationCancelBtn.onclick = () => {
        closeModalWithAnimation(confirmationModal);
        resolve(false);
      };
    }

    if (confirmationCloseBtn) {
      confirmationCloseBtn.disabled = false;
      confirmationCloseBtn.onclick = () => {
        closeModalWithAnimation(confirmationModal);
        resolve(false);
      };
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
          resolve(true);
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

          // Don't resolve here - let the user try again or cancel
        }
      };
    }

    openModalWithAnimation(confirmationModal);
  });
}

export {
  showBrowserWarningModal,
  closeDropdownWithAnimation,
  openDropdownWithAnimation,
  initConfirmationModal,
  closeModalWithAnimation,
  openModalWithAnimation,
  showConfirmationModal
}