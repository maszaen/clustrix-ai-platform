(function (global) {
  if (!global) return;

  const state = {
    projects: [],
    currentProject: null,
    projectMessageStagedFiles: [],
    isSelectMode: false,
    loadedProjectSessionCount: 0,
  };

  const selectedProjectIds = new Set();
  let documentListener = null;

  function setProjects(projects) {
    const next = Array.isArray(projects) ? projects : [];
    state.projects.splice(0, state.projects.length, ...next);
  }

  function setCurrentProject(project) {
    state.currentProject = project || null;
  }

  function addProjectMessageFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return;
    state.projectMessageStagedFiles.push(...files);
  }

  function clearProjectMessageFiles() {
    state.projectMessageStagedFiles.length = 0;
  }

  function setSelectMode(enabled) {
    state.isSelectMode = Boolean(enabled);
  }

  function setLoadedProjectSessionCount(count) {
    state.loadedProjectSessionCount = Number.isFinite(count) ? count : 0;
  }

  function setDocumentListener(listener) {
    documentListener = typeof listener === "function" ? listener : null;
  }

  function reset() {
    state.projects.length = 0;
    state.currentProject = null;
    state.projectMessageStagedFiles.length = 0;
    state.isSelectMode = false;
    state.loadedProjectSessionCount = 0;
    selectedProjectIds.clear();
    documentListener = null;
  }

  global.projectsStore = {
    state,
    selectedProjectIds,
    getProjects: () => state.projects,
    setProjects,
    getCurrentProject: () => state.currentProject,
    setCurrentProject,
    getProjectMessageFiles: () => state.projectMessageStagedFiles,
    addProjectMessageFiles,
    clearProjectMessageFiles,
    isSelectMode: () => state.isSelectMode,
    setSelectMode,
    getLoadedProjectSessionCount: () => state.loadedProjectSessionCount,
    setLoadedProjectSessionCount,
    getDocumentListener: () => documentListener,
    setDocumentListener,
    reset,
  };
})(window);
