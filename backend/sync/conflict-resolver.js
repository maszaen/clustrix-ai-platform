/**
 * Conflict Resolver
 * 
 * Handles conflict detection and resolution UI for smart sync.
 * When two devices edit the same session concurrently (same timestamp,
 * different hash), presents a modal for user to choose resolution.
 */

const { logWithContext } = require('../../utils/logger');
const { timestampsMatch, formatTimestamp } = require('./sync-helpers');

const log = (level, method, message, data = {}) => {
  logWithContext('CONFLICT', level, method, message, data);
};

function getRecordFingerprint(record, type) {
  if (record?.hash) {
    return record.hash;
  }

  if (type === 'session') {
    const metadata = typeof record.metadata === 'string'
      ? record.metadata
      : JSON.stringify(record.metadata || {});
    return [
      record.id || '',
      record.name || '',
      record.type || '',
      metadata,
      record.updated_at || ''
    ].join('|');
  }

  if (type === 'message') {
    const metadata = typeof record.metadata === 'string'
      ? record.metadata
      : JSON.stringify(record.metadata || {});
    return [
      record.id || '',
      record.session_id || '',
      record.role || '',
      record.content || '',
      metadata,
      record.updated_at || ''
    ].join('|');
  }

  return JSON.stringify(record || {});
}

class ConflictResolver {
  constructor() {
    this.pendingConflicts = [];
    this.currentConflictIndex = 0;
    this.resolutionCallback = null;
  }
  
  /**
   * Detect conflicts between local and cloud records
   * 
   * A conflict exists when:
   * - Same record ID
   * - Timestamps match (within tolerance)
   * - Different content hash
   * 
   * @param {Array} localRecords - Records from local database
   * @param {Array} cloudRecords - Records from cloud database
   * @returns {Array} Conflicts { local, cloud, type }
   */
  detectConflicts(localRecords, cloudRecords, type = 'session') {
    const conflicts = [];
    const cloudMap = new Map(cloudRecords.map(r => [r.id, r]));
    
    for (const local of localRecords) {
      const cloud = cloudMap.get(local.id);
      
      if (!cloud) continue; // Not a conflict, just new local record
      
      const localUpdatedAt = Number(local.updated_at) || 0;
      const cloudUpdatedAt = Number(cloud.updated_at) || 0;
      const timestampsClose = timestampsMatch(localUpdatedAt, cloudUpdatedAt, 1000);
      const localIsNewer = localUpdatedAt > cloudUpdatedAt;

      const localFingerprint = getRecordFingerprint(local, type);
      const cloudFingerprint = getRecordFingerprint(cloud, type);
      const contentDiffers = localFingerprint !== cloudFingerprint;

      if (contentDiffers && (!localIsNewer || timestampsClose)) {
        conflicts.push({
          id: local.id,
          local,
          cloud,
          type,
          detectedAt: Date.now()
        });

        log(3, 'detectConflicts', 'Conflict detected', {
          id: local.id,
          type,
          localHash: local.hash?.substring(0, 8) || localFingerprint.substring(0, 8),
          cloudHash: cloud.hash?.substring(0, 8) || cloudFingerprint.substring(0, 8),
          localTime: formatTimestamp(localUpdatedAt),
          cloudTime: formatTimestamp(cloudUpdatedAt),
          reason: timestampsClose ? 'timestamps-close' : 'cloud-newer'
        });
      }
    }
    
    log(2, 'detectConflicts', 'Conflict detection complete', {
      type,
      localCount: localRecords.length,
      cloudCount: cloudRecords.length,
      conflictsFound: conflicts.length
    });
    
    return conflicts;
  }
  
  /**
   * Queue conflicts for resolution
   * 
   * @param {Array} conflicts - Array of conflicts from detectConflicts
   */
  queueConflicts(conflicts) {
    this.pendingConflicts = [...this.pendingConflicts, ...conflicts];
    
    log(2, 'queueConflicts', 'Conflicts queued', {
      newConflicts: conflicts.length,
      totalPending: this.pendingConflicts.length
    });
  }
  
  /**
   * Check if there are pending conflicts
   * 
   * @returns {boolean} True if conflicts pending
   */
  hasPendingConflicts() {
    return this.pendingConflicts.length > 0;
  }
  
  /**
   * Get next conflict to resolve
   * 
   * @returns {Object|null} Next conflict or null if none
   */
  getNextConflict() {
    if (this.currentConflictIndex >= this.pendingConflicts.length) {
      return null;
    }
    
    return this.pendingConflicts[this.currentConflictIndex];
  }
  
  /**
   * Show conflict resolution modal
   * 
   * Displays modal with side-by-side comparison of local vs cloud.
   * User can choose: Keep Local, Keep Cloud, or Merge Both.
   * 
   * @param {Object} conflict - Conflict object { local, cloud, type }
   * @param {Function} onResolve - Callback(resolution) where resolution is 'local'|'cloud'|'merge'
   */
  showConflictModal(conflict, onResolve) {
    log(2, 'showConflictModal', 'Showing conflict modal', {
      id: conflict.id,
      type: conflict.type
    });
    
    const modal = document.getElementById('sync-conflict-modal');
    const sessionNameEl = document.getElementById('conflict-session-name');
    const localInfoEl = document.getElementById('conflict-local-info');
    const cloudInfoEl = document.getElementById('conflict-cloud-info');
    const localPreviewEl = document.getElementById('conflict-local-preview');
    const cloudPreviewEl = document.getElementById('conflict-cloud-preview');
    
    // Set session name
    sessionNameEl.textContent = conflict.local.name || 'Unnamed Session';
    
    // Set local info
    localInfoEl.innerHTML = `
      <div><strong>Device:</strong> ${conflict.local.device_id || 'Unknown'}</div>
      <div><strong>Last Modified:</strong> ${formatTimestamp(conflict.local.updated_at)}</div>
      <div><strong>Messages:</strong> ${this.getMessageCount(conflict.local)}</div>
    `;
    
    // Set cloud info
    cloudInfoEl.innerHTML = `
      <div><strong>Device:</strong> ${conflict.cloud.device_id || 'Unknown'}</div>
      <div><strong>Last Modified:</strong> ${formatTimestamp(conflict.cloud.updated_at)}</div>
      <div><strong>Messages:</strong> ${this.getMessageCount(conflict.cloud)}</div>
    `;
    
    // Set content previews
    localPreviewEl.textContent = this.getContentPreview(conflict.local);
    cloudPreviewEl.textContent = this.getContentPreview(conflict.cloud);
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Set up event listeners
    const keepLocalBtn = document.getElementById('conflict-keep-local');
    const keepCloudBtn = document.getElementById('conflict-keep-cloud');
    const mergeBothBtn = document.getElementById('conflict-merge-both');
    const closeBtn = document.getElementById('conflict-close');
    
    const cleanup = () => {
      keepLocalBtn.removeEventListener('click', handleKeepLocal);
      keepCloudBtn.removeEventListener('click', handleKeepCloud);
      mergeBothBtn.removeEventListener('click', handleMergeBoth);
      closeBtn.removeEventListener('click', handleClose);
    };
    
    const handleKeepLocal = () => {
      log(2, 'showConflictModal', 'User chose: Keep Local', { id: conflict.id });
      modal.classList.add('hidden');
      cleanup();
      onResolve('local');
    };
    
    const handleKeepCloud = () => {
      log(2, 'showConflictModal', 'User chose: Keep Cloud', { id: conflict.id });
      modal.classList.add('hidden');
      cleanup();
      onResolve('cloud');
    };
    
    const handleMergeBoth = () => {
      log(2, 'showConflictModal', 'User chose: Merge Both', { id: conflict.id });
      modal.classList.add('hidden');
      cleanup();
      onResolve('merge');
    };
    
    const handleClose = () => {
      log(2, 'showConflictModal', 'User closed modal (default: Keep Local)', { id: conflict.id });
      modal.classList.add('hidden');
      cleanup();
      onResolve('local'); // Default to keeping local on close
    };
    
    keepLocalBtn.addEventListener('click', handleKeepLocal);
    keepCloudBtn.addEventListener('click', handleKeepCloud);
    mergeBothBtn.addEventListener('click', handleMergeBoth);
    closeBtn.addEventListener('click', handleClose);
  }
  
  /**
   * Get message count from session metadata
   * 
   * @param {Object} session - Session record
   * @returns {number} Message count
   */
  getMessageCount(session) {
    try {
      if (session.metadata) {
        const metadata = typeof session.metadata === 'string' 
          ? JSON.parse(session.metadata) 
          : session.metadata;
        
        if (metadata.tokens_by_message) {
          return Object.keys(metadata.tokens_by_message).length;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
    
    return 0;
  }
  
  /**
   * Get content preview from session
   * 
   * Shows summary of session data for preview
   * 
   * @param {Object} session - Session record
   * @returns {string} Preview text
   */
  getContentPreview(session) {
    const lines = [];
    
    lines.push(`Session ID: ${session.id}`);
    lines.push(`Title: ${session.name || 'Unnamed'}`);
    lines.push(`Type: ${session.type || 'regular'}`);
    lines.push(`Created: ${formatTimestamp(session.created_at)}`);
    lines.push(`Modified: ${formatTimestamp(session.updated_at)}`);
    lines.push(`Hash: ${session.hash?.substring(0, 16)}...`);
    
    if (session.persona_name) {
      lines.push(`\nPersona: ${session.persona_name}`);
    }
    
    if (session.tokens_used) {
      lines.push(`Tokens: ${session.tokens_used}`);
    }
    
    try {
      if (session.metadata) {
        const metadata = typeof session.metadata === 'string' 
          ? JSON.parse(session.metadata) 
          : session.metadata;
        
        if (metadata.tokens_by_message) {
          lines.push(`\nMessages: ${Object.keys(metadata.tokens_by_message).length}`);
        }
        
        if (metadata.canvases) {
          const canvasCount = Object.keys(metadata.canvases).length;
          if (canvasCount > 0) {
            lines.push(`Canvases: ${canvasCount}`);
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
    
    return lines.join('\n');
  }
  
  /**
   * Resolve current conflict
   * 
   * Applies the chosen resolution and moves to next conflict.
   * 
   * @param {string} resolution - 'local'|'cloud'|'merge'
   * @param {Object} conflict - The conflict being resolved
   * @returns {Object} Resolution result { action, record }
   */
  resolveConflict(resolution, conflict) {
    log(2, 'resolveConflict', 'Resolving conflict', {
      id: conflict.id,
      type: conflict.type,
      resolution
    });
    
    let result;
    
    switch (resolution) {
      case 'local':
        // Keep local version, discard cloud
        result = {
          action: 'keep_local',
          record: conflict.local
        };
        break;
        
      case 'cloud':
        // Keep cloud version, overwrite local
        result = {
          action: 'keep_cloud',
          record: conflict.cloud
        };
        break;
        
      case 'merge':
        // Merge both versions
        result = {
          action: 'merge',
          record: this.mergeRecords(conflict.local, conflict.cloud, conflict.type)
        };
        break;
        
      default:
        // Default to keeping local
        result = {
          action: 'keep_local',
          record: conflict.local
        };
    }
    
    // Move to next conflict
    this.currentConflictIndex++;
    
    log(2, 'resolveConflict', 'Conflict resolved', {
      id: conflict.id,
      action: result.action,
      remaining: this.pendingConflicts.length - this.currentConflictIndex
    });
    
    return result;
  }
  
  /**
   * Merge two conflicting records
   * 
   * Merging strategy:
   * - Sessions: Keep local, but append cloud messages that don't exist locally
   * - Messages: Keep both (mark as different sequence numbers)
   * 
   * @param {Object} local - Local record
   * @param {Object} cloud - Cloud record
   * @param {string} type - Record type ('session'|'message')
   * @returns {Object} Merged record
   */
  mergeRecords(local, cloud, type) {
    log(3, 'mergeRecords', 'Merging records', {
      id: local.id,
      type
    });
    
    if (type === 'session') {
      // For sessions, keep local session but note that messages need merging
      return {
        ...local,
        _needsMessageMerge: true,
        _cloudVersion: cloud
      };
    }
    
    if (type === 'message') {
      // For messages, we can't truly merge content, so keep local
      // (message-level conflicts are rare since they have sequence numbers)
      return local;
    }
    
    return local;
  }
  
  /**
   * Reset conflict resolution state
   */
  reset() {
    this.pendingConflicts = [];
    this.currentConflictIndex = 0;
    this.resolutionCallback = null;
    
    log(2, 'reset', 'Conflict resolver reset');
  }
  
  /**
   * Get conflict resolution summary
   * 
   * @returns {Object} Summary { total, resolved, pending }
   */
  getSummary() {
    return {
      total: this.pendingConflicts.length,
      resolved: this.currentConflictIndex,
      pending: this.pendingConflicts.length - this.currentConflictIndex
    };
  }
}

module.exports = ConflictResolver;
