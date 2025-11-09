import { generateSessionId } from '../ids/id-utils.mjs';
import { nowISO } from '../time/time-utils.mjs';

/**
 * Derives a workspace name from a path.
 * @param {string} [workspacePath]
 * @returns {string}
 */
export function deriveWorkspaceName(workspacePath = '') {
  if (!workspacePath) {
    return '';
  }
  const segments = workspacePath.split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] || workspacePath;
}

/**
 * Normalizes a code group object to ensure consistent shape.
 * @param {object} group
 * @returns {object}
 */
export function normalizeCodeGroup(group = {}) {
  const createdAt = group.created_at || nowISO();
  const updatedAt = group.updated_at || group.last_updated || createdAt;
  const normalized = {
    id: group.id || generateSessionId(),
    name: group.name || 'New Code Workspace',
    description: group.description || '',
    instruction: group.instruction || '',
    created_at: createdAt,
    last_updated: group.last_updated || updatedAt,
    updated_at: updatedAt,
    isFavorite: Boolean(group.isFavorite),
    files: Array.isArray(group.files) ? [...group.files] : [],
    workspacePath: group.workspacePath || '',
    workspaceName: group.workspaceName || group.workspace_name || '',
    workspaceSummary: group.workspaceSummary || null,
    metadata: group.metadata || {},
  };

  if (!normalized.workspaceName && normalized.workspacePath) {
    normalized.workspaceName = deriveWorkspaceName(normalized.workspacePath);
  }

  if (!normalized.workspaceSummary || typeof normalized.workspaceSummary !== 'object') {
    normalized.workspaceSummary = null;
  }

  return normalized;
}

/**
 * Creates a brand new code group object.
 * @param {string} name
 * @param {string} [description='']
 * @returns {object}
 */
export function createCodeGroup(name, description = '') {
  const timestamp = nowISO();
  return normalizeCodeGroup({
    id: generateSessionId(),
    name: name?.trim() || 'New Code Workspace',
    description: description?.trim() || '',
    created_at: timestamp,
    last_updated: timestamp,
    files: [],
    workspacePath: '',
    workspaceName: '',
    workspaceSummary: null,
    metadata: {},
  });
}

/**
 * Applies workspace inspection payload to a code group.
 * @param {object} group
 * @param {{ path?: string, name?: string, summary?: object }} workspace
 * @returns {object}
 */
export function applyWorkspaceToGroup(group, workspace = {}) {
  if (!group) return group;
  const next = normalizeCodeGroup(group);
  next.workspacePath = workspace.path || workspace.workspacePath || next.workspacePath || '';
  next.workspaceName = workspace.name || workspace.workspaceName || deriveWorkspaceName(next.workspacePath);
  next.workspaceSummary = workspace.summary || workspace.workspaceSummary || null;
  next.last_updated = nowISO();
  next.updated_at = nowISO();
  return next;
}

/**
 * Merges two code groups, preferring properties from the first.
 * Useful for combining local and remote versions.
 * @param {object} local
 * @param {object} remote
 * @returns {object}
 */
export function mergeCodeGroups(local = {}, remote = {}) {
  const normalized = normalizeCodeGroup({
    ...remote,
    ...local,
    // Preserve the newer timestamp
    last_updated: new Date(local.last_updated || local.updated_at || 0).getTime() >
                  new Date(remote.last_updated || remote.updated_at || 0).getTime()
      ? (local.last_updated || local.updated_at)
      : (remote.last_updated || remote.updated_at),
  });
  return normalized;
}

/**
 * Validates a code group object for required fields.
 * @param {object} group
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCodeGroup(group = {}) {
  const errors = [];

  if (!group.id) {
    errors.push('id is required');
  }
  if (!group.name || typeof group.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  if (group.files && !Array.isArray(group.files)) {
    errors.push('files must be an array if provided');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}