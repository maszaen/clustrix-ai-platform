/**
 * Toast Notification Module
 * Extracted from renderer.js - 99% exact code
 * Shows temporary notification messages
 */

(function() {
  'use strict';

  function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    const toastContainer = document.querySelector(".toast-container") || createToastContainer();
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);

    log("TOAST", 1, "showToast", "Toast notification shown", {
      message,
      type,
      duration,
    });
  }

  function createToastContainer() {
    const container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
    return container;
  }

  // Export to global window object
  window.showToast = showToast;
})();
