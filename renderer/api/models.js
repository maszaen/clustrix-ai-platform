/**
 * Models & Settings API Module
 * Extracted from renderer.js - 99% exact code
 * Model configuration and settings management
 */

(function() {
  'use strict';

  function applyTheme(theme) {
    document.body.className =
      theme === "dark" ? "dark-theme scrollable" : "light-theme scrollable";
    document.documentElement.className =
      theme === "dark" ? "dark-theme" : "light-theme";
    
    const themeSlider = $("#theme-slider");
    if (themeSlider) {
      themeSlider.checked = theme === "dark";
    }
    
    state.settings.theme = theme;

    localStorage.setItem("clustrix-theme", theme);

    log("THEME", 2, "applyTheme", "Theme applied", { theme });
  }

  function toggleTheme() {
    const newTheme = state.settings.theme === "light" ? "dark" : "light";
    applyTheme(newTheme);
    save();
  }

  function getActiveModel() {
    const models = state.settings?.models;
    if (!models || !models.active) {
      return {
        provider: "openai",
        model: "gpt-4o",
        label: "GPT-4o",
      };
    }

    return {
      provider: models.active.platform || "openai",
      model: models.active.model || "gpt-4o",
      label: models.active.label || "GPT-4o",
    };
  }

  function normalizeProviderModels(models) {
    if (!Array.isArray(models)) return [];
    
    return models.map(m => ({
      id: m.id || m.model,
      label: m.label || m.name || m.id,
      paid: m.paid || false,
    }));
  }

  function persistModels(config) {
    state.settings.models = config;
    return save();
  }

  // Export to global window object
  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;
  window.getActiveModel = getActiveModel;
  window.normalizeProviderModels = normalizeProviderModels;
  window.persistModels = persistModels;
})();
