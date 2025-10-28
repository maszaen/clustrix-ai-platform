/**
 * File Upload Handler Module
 * Extracted from renderer.js - 99% exact code
 * Handles file uploads and attachments
 */

(function() {
  'use strict';

  async function handleFileUpload(files) {
    if (!files || files.length === 0) {
      log("UPLOAD", 1, "handleFileUpload", "No files provided");
      return;
    }

    const validFiles = [];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        showToast(`File "${file.name}" is too large (max 10MB)`, "error");
        log("UPLOAD", 3, "handleFileUpload", "File too large", {
          name: file.name,
          size: file.size,
        });
        continue;
      }

      validFiles.push({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        path: file.path || "",
        file: file,
      });
    }

    if (validFiles.length === 0) {
      return;
    }

    if (!current) {
      log("UPLOAD", 2, "handleFileUpload", "No active session, adding to welcome staged files");
      welcomeScreenStagedFiles.push(...validFiles);
      renderWelcomeScreenFiles();
      return;
    }

    if (!current.stagedFiles) {
      current.stagedFiles = [];
    }

    current.stagedFiles.push(...validFiles);

    log("UPLOAD", 2, "handleFileUpload", "Files staged", {
      count: validFiles.length,
      sessionId: current.id,
    });

    renderStagedFiles();
    showToast(`${validFiles.length} file(s) attached`, "success");
  }

  function renderStagedFiles() {
    const container = document.querySelector(".staged-files-container");
    if (!container) return;

    if (!current || !current.stagedFiles || current.stagedFiles.length === 0) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    container.innerHTML = current.stagedFiles
      .map(
        (file, idx) => `
      <div class="staged-file-pill" data-index="${idx}">
        <span class="file-icon">${getFileIcon(file.name)}</span>
        <span class="file-name">${escHtml(file.name)}</span>
        <button class="remove-file-btn" data-index="${idx}" title="Remove file">×</button>
      </div>
    `
      )
      .join("");

    const removeButtons = container.querySelectorAll(".remove-file-btn");
    removeButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        removeStagedFile(idx);
      });
    });
  }

  function removeStagedFile(index) {
    if (!current || !current.stagedFiles) return;

    current.stagedFiles.splice(index, 1);

    log("UPLOAD", 1, "removeStagedFile", "File removed from staging", { index });

    renderStagedFiles();
  }

  function renderWelcomeScreenFiles() {
    const container = document.querySelector(".welcome-staged-files");
    if (!container) return;

    if (!welcomeScreenStagedFiles || welcomeScreenStagedFiles.length === 0) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    container.innerHTML = welcomeScreenStagedFiles
      .map(
        (file, idx) => `
      <div class="staged-file-pill" data-index="${idx}">
        <span class="file-icon">${getFileIcon(file.name)}</span>
        <span class="file-name">${escHtml(file.name)}</span>
        <button class="remove-file-btn" data-index="${idx}" title="Remove file">×</button>
      </div>
    `
      )
      .join("");

    const removeButtons = container.querySelectorAll(".remove-file-btn");
    removeButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        welcomeScreenStagedFiles.splice(idx, 1);
        renderWelcomeScreenFiles();
      });
    });
  }

  // Export to global window object
  window.handleFileUpload = handleFileUpload;
  window.renderStagedFiles = renderStagedFiles;
  window.removeStagedFile = removeStagedFile;
  window.renderWelcomeScreenFiles = renderWelcomeScreenFiles;
})();
