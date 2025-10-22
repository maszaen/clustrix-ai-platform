const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { log } = require('../../../utils/logger');

class FileOperationsManager {
  constructor() {
    this.workspaceRoot = null;
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Set the workspace root directory
   * @param {string} rootPath - Absolute path to workspace root
   */
  setWorkspaceRoot(rootPath) {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Workspace does not exist: ${rootPath}`);
    }
    this.workspaceRoot = path.resolve(rootPath);
    log('FILE_OPS', 1, 'setWorkspace', `Workspace: ${this.workspaceRoot}`);
  }

  /**
   * Resolve relative path to absolute, with security check
   * @param {string} relativePath - Path relative to workspace
   * @returns {string} Absolute path
   */
  resolvePath(relativePath) {
    if (!this.workspaceRoot) {
      throw new Error('Workspace not set');
    }
    
    const resolved = path.resolve(this.workspaceRoot, relativePath);
    
    // Security: ensure path is within workspace
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error('Path outside workspace');
    }
    
    return resolved;
  }

  /**
   * Create a file with content
   * @param {string} relativePath - Path relative to workspace
   * @param {string} content - File content
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Result
   */
  async createFile(relativePath, content, options = {}) {
    const fullPath = this.resolvePath(relativePath);
    
    log('FILE_OPS', 1, 'createFile', `Creating: ${relativePath}`);

    // Check if exists
    if (fs.existsSync(fullPath) && !options.overwrite) {
      throw new Error(`File exists: ${relativePath}`);
    }

    // Create backup if overwriting
    if (fs.existsSync(fullPath)) {
      await this.createBackup(fullPath);
    }

    // Create directories
    const dir = path.dirname(fullPath);
    await fsp.mkdir(dir, { recursive: true });

    // Write file
    await fsp.writeFile(fullPath, content, 'utf-8');

    return {
      success: true,
      path: relativePath,
      size: Buffer.byteLength(content, 'utf-8')
    };
  }

  /**
   * Read specific lines from file (efficient - doesn't load entire file into memory)
   * @param {string} relativePath - Path relative to workspace
   * @param {number} startLine - Start line number (1-indexed)
   * @param {number} endLine - End line number (1-indexed, optional)
   * @returns {Promise<string>} Line content
   */
  async readLines(relativePath, startLine, endLine) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Validate line numbers (1-indexed)
    if (startLine < 1 || startLine > lines.length) {
      throw new Error(`Invalid start line: ${startLine}`);
    }

    const start = startLine - 1;
    const end = endLine ? Math.min(endLine, lines.length) : lines.length;

    return lines.slice(start, end).join('\n');
  }

  /**
   * Edit specific lines in file
   * @param {string} relativePath - Path relative to workspace
   * @param {number} startLine - Start line number (1-indexed)
   * @param {number} endLine - End line number (1-indexed)
   * @param {string} newContent - New content for lines
   * @returns {Promise<Object>} Result
   */
  async editLines(relativePath, startLine, endLine, newContent) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    log('FILE_OPS', 1, 'editLines', `Editing ${relativePath}:${startLine}-${endLine}`);

    // Create backup
    await this.createBackup(fullPath);

    // Read current content
    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Validate
    if (startLine < 1 || startLine > lines.length) {
      throw new Error(`Invalid start line: ${startLine}`);
    }

    // Replace lines
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine || startLine);
    const replacement = newContent.split('\n');

    const newLines = [...before, ...replacement, ...after];

    // Write back
    await fsp.writeFile(fullPath, newLines.join('\n'), 'utf-8');

    return {
      success: true,
      path: relativePath,
      linesChanged: (endLine || startLine) - startLine + 1
    };
  }

  /**
   * Search within a file
   * @param {string} relativePath - Path relative to workspace
   * @param {string} pattern - Search pattern (regex)
   * @returns {Promise<Array>} Matching lines
   */
  async searchInFile(relativePath, pattern) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    const regex = new RegExp(pattern, 'gi');
    const matches = [];

    lines.forEach((line, index) => {
      if (regex.test(line)) {
        matches.push({
          lineNumber: index + 1,
          line: line.trim()
        });
      }
    });

    return matches;
  }

  /**
   * Append to end of file
   * @param {string} relativePath - Path relative to workspace
   * @param {string} content - Content to append
   * @returns {Promise<Object>} Result
   */
  async appendToFile(relativePath, content) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    await this.createBackup(fullPath);
    await fsp.appendFile(fullPath, content, 'utf-8');

    return { success: true, path: relativePath };
  }

  /**
   * Delete file (moves to trash for recovery)
   * @param {string} relativePath - Path relative to workspace
   * @param {boolean} skipConfirmation - Skip confirmation for critical files
   * @returns {Promise<Object>} Result
   */
  async deleteFile(relativePath, skipConfirmation = false) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    // Critical files require confirmation
    const criticalFiles = ['package.json', 'tsconfig.json', '.env', 'README.md'];
    const fileName = path.basename(relativePath);
    
    if (criticalFiles.includes(fileName) && !skipConfirmation) {
      return {
        requiresConfirmation: true,
        path: relativePath,
        reason: `${fileName} is a critical file`
      };
    }

    log('FILE_OPS', 2, 'deleteFile', `Deleting: ${relativePath}`);

    // Move to trash instead of permanent delete
    const trashPath = path.join(
      this.backupDir,
      'trash',
      `${Date.now()}_${fileName}`
    );

    await fsp.mkdir(path.dirname(trashPath), { recursive: true });
    await fsp.rename(fullPath, trashPath);

    return {
      success: true,
      path: relativePath,
      trashPath,
      recoverable: true
    };
  }

  /**
   * Create backup of file
   * @param {string} fullPath - Full absolute path to file
   * @returns {Promise<string>} Backup path
   */
  async createBackup(fullPath) {
    const fileName = path.basename(fullPath);
    const timestamp = Date.now();
    const backupPath = path.join(this.backupDir, `${timestamp}_${fileName}`);

    await fsp.copyFile(fullPath, backupPath);

    log('FILE_OPS', 1, 'createBackup', `Backed up: ${fileName}`);

    return backupPath;
  }

  /**
   * Get file info without reading content
   * @param {string} relativePath - Path relative to workspace
   * @returns {Promise<Object>} File info
   */
  async getFileInfo(relativePath) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const stats = await fsp.stat(fullPath);
    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    return {
      path: relativePath,
      size: stats.size,
      lineCount: lines.length,
      created: stats.birthtime,
      modified: stats.mtime
    };
  }

  /**
   * List files in directory
   * @param {string} relativePath - Path relative to workspace
   * @returns {Promise<Array>} List of files
   */
  async listDirectory(relativePath = '.') {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Directory not found: ${relativePath}`);
    }

    const stats = await fsp.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${relativePath}`);
    }

    const entries = await fsp.readdir(fullPath, { withFileTypes: true });
    
    return entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(relativePath, entry.name)
    }));
  }
}

module.exports = FileOperationsManager;
