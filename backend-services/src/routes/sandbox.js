/**
 * Sandbox API Route
 * 
 * Daytona sandbox integration for secure code execution
 * Allows AI-generated code to run in isolated environments
 */

const express = require('express');
const router = express.Router();
const { Daytona } = require('@daytonaio/sdk');

// In-memory sandbox cache (production: use Redis)
const sandboxCache = new Map();

// Initialize Daytona client (uses DAYTONA_API_KEY env var)
let daytona = null;

/**
 * Get or create Daytona client
 */
function getDaytona() {
  if (!daytona) {
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) {
      throw new Error('DAYTONA_API_KEY environment variable is required');
    }
    daytona = new Daytona({
      apiKey,
      target: process.env.DAYTONA_TARGET || 'us', // 'us' or 'eu'
    });
  }
  return daytona;
}

/**
 * POST /api/sandbox/create
 * 
 * Create a new sandbox instance
 * Body: { language?, name?, envVars?, autoStopInterval? }
 */
router.post('/create', async (req, res) => {
  try {
    const { 
      language = 'python', 
      name,
      envVars = {},
      autoStopInterval = 15, // minutes
    } = req.body;
    
    const client = getDaytona();
    
    // Create sandbox with specified config
    const sandbox = await client.create({
      language, // 'python' | 'typescript' | 'javascript'
      name,
      envVars,
      autoStopInterval,
    });
    
    // Cache sandbox reference
    sandboxCache.set(sandbox.id, {
      sandbox,
      userId: req.user?.userId,
      createdAt: Date.now(),
    });
    
    res.json({
      success: true,
      sandboxId: sandbox.id,
      name: sandbox.name,
      state: sandbox.state,
      language,
    });
  } catch (error) {
    console.error('[Sandbox] Create error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'SANDBOX_CREATE_FAILED' 
    });
  }
});

/**
 * POST /api/sandbox/:id/run-code
 * 
 * Execute code in sandbox
 * Body: { code, timeout? }
 */
router.post('/:id/run-code', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, timeout = 30 } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required', code: 'MISSING_CODE' });
    }
    
    // Get sandbox from cache or fetch it
    let sandboxData = sandboxCache.get(id);
    let sandbox;
    
    if (sandboxData) {
      sandbox = sandboxData.sandbox;
    } else {
      // Fetch existing sandbox by ID
      const client = getDaytona();
      sandbox = await client.get(id);
      sandboxCache.set(id, {
        sandbox,
        userId: req.user?.userId,
        createdAt: Date.now(),
      });
    }
    
    // Execute code
    const response = await sandbox.process.codeRun(code, {}, timeout * 1000);
    
    res.json({
      success: response.exitCode === 0,
      exitCode: response.exitCode,
      result: response.result,
      stdout: response.artifacts?.stdout || response.result,
      charts: response.artifacts?.charts || [],
    });
  } catch (error) {
    console.error('[Sandbox] Run code error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'CODE_EXECUTION_FAILED' 
    });
  }
});

/**
 * POST /api/sandbox/:id/run-command
 * 
 * Execute shell command in sandbox
 * Body: { command, cwd?, timeout? }
 */
router.post('/:id/run-command', async (req, res) => {
  try {
    const { id } = req.params;
    const { command, cwd, timeout = 60 } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required', code: 'MISSING_COMMAND' });
    }
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
      sandboxCache.set(id, sandboxData);
    }
    
    const response = await sandboxData.sandbox.process.executeCommand(
      command, 
      cwd, 
      undefined, 
      timeout
    );
    
    res.json({
      success: response.exitCode === 0,
      exitCode: response.exitCode,
      result: response.result,
    });
  } catch (error) {
    console.error('[Sandbox] Run command error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'COMMAND_EXECUTION_FAILED' 
    });
  }
});

/**
 * POST /api/sandbox/:id/upload
 * 
 * Upload file to sandbox
 * Body: { content, remotePath, encoding? }
 */
router.post('/:id/upload', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, remotePath, encoding = 'utf-8' } = req.body;
    
    if (!content || !remotePath) {
      return res.status(400).json({ 
        error: 'Content and remotePath are required', 
        code: 'MISSING_PARAMS' 
      });
    }
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
      sandboxCache.set(id, sandboxData);
    }
    
    // Convert content to Buffer
    const buffer = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf-8');
    
    await sandboxData.sandbox.fs.uploadFile(buffer, remotePath);
    
    res.json({
      success: true,
      path: remotePath,
    });
  } catch (error) {
    console.error('[Sandbox] Upload error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'UPLOAD_FAILED' 
    });
  }
});

/**
 * GET /api/sandbox/:id/download
 * 
 * Download file from sandbox
 * Query: { path, encoding? }
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { path: remotePath, encoding = 'utf-8' } = req.query;
    
    if (!remotePath) {
      return res.status(400).json({ error: 'Path is required', code: 'MISSING_PATH' });
    }
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
      sandboxCache.set(id, sandboxData);
    }
    
    const content = await sandboxData.sandbox.fs.downloadFile(remotePath);
    
    if (encoding === 'base64') {
      res.json({
        success: true,
        content: content.toString('base64'),
        encoding: 'base64',
      });
    } else {
      res.json({
        success: true,
        content: content.toString('utf-8'),
        encoding: 'utf-8',
      });
    }
  } catch (error) {
    console.error('[Sandbox] Download error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'DOWNLOAD_FAILED' 
    });
  }
});

/**
 * GET /api/sandbox/:id/files
 * 
 * List files in sandbox directory
 * Query: { path? }
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    const { path: dirPath = '.' } = req.query;
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
      sandboxCache.set(id, sandboxData);
    }
    
    const files = await sandboxData.sandbox.fs.listFiles(dirPath);
    
    res.json({
      success: true,
      path: dirPath,
      files: files.map(f => ({
        name: f.name,
        isDir: f.isDir,
        size: f.size,
        modTime: f.modTime,
      })),
    });
  } catch (error) {
    console.error('[Sandbox] List files error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'LIST_FILES_FAILED' 
    });
  }
});

/**
 * GET /api/sandbox/:id/preview
 * 
 * Get preview URL for a port
 * Query: { port }
 */
router.get('/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const { port } = req.query;
    
    if (!port) {
      return res.status(400).json({ error: 'Port is required', code: 'MISSING_PORT' });
    }
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
      sandboxCache.set(id, sandboxData);
    }
    
    const preview = await sandboxData.sandbox.getPreviewLink(parseInt(port, 10));
    
    res.json({
      success: true,
      url: preview.url,
      port: parseInt(port, 10),
    });
  } catch (error) {
    console.error('[Sandbox] Preview error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'PREVIEW_FAILED' 
    });
  }
});

/**
 * GET /api/sandbox/:id/status
 * 
 * Get sandbox status and info
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = getDaytona();
    const sandbox = await client.get(id);
    
    // Update cache
    sandboxCache.set(id, {
      sandbox,
      userId: req.user?.userId,
      createdAt: sandboxCache.get(id)?.createdAt || Date.now(),
    });
    
    res.json({
      success: true,
      id: sandbox.id,
      name: sandbox.name,
      state: sandbox.state,
      cpu: sandbox.cpu,
      memory: sandbox.memory,
      disk: sandbox.disk,
    });
  } catch (error) {
    console.error('[Sandbox] Status error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'STATUS_FAILED' 
    });
  }
});

/**
 * POST /api/sandbox/:id/stop
 * 
 * Stop a running sandbox
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
    }
    
    await sandboxData.sandbox.stop();
    
    res.json({
      success: true,
      message: 'Sandbox stopped',
    });
  } catch (error) {
    console.error('[Sandbox] Stop error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'STOP_FAILED' 
    });
  }
});

/**
 * POST /api/sandbox/:id/start
 * 
 * Start a stopped sandbox
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const { timeout = 60 } = req.body;
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
      sandboxCache.set(id, sandboxData);
    }
    
    await sandboxData.sandbox.start(timeout);
    
    res.json({
      success: true,
      message: 'Sandbox started',
    });
  } catch (error) {
    console.error('[Sandbox] Start error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'START_FAILED' 
    });
  }
});

/**
 * DELETE /api/sandbox/:id
 * 
 * Delete a sandbox
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    let sandboxData = sandboxCache.get(id);
    if (!sandboxData) {
      const client = getDaytona();
      const sandbox = await client.get(id);
      sandboxData = { sandbox };
    }
    
    await sandboxData.sandbox.delete();
    
    // Remove from cache
    sandboxCache.delete(id);
    
    res.json({
      success: true,
      message: 'Sandbox deleted',
    });
  } catch (error) {
    console.error('[Sandbox] Delete error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'DELETE_FAILED' 
    });
  }
});

/**
 * GET /api/sandbox/list
 * 
 * List all sandboxes for current user (from cache)
 */
router.get('/list', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const sandboxes = [];
    
    for (const [id, data] of sandboxCache) {
      if (!userId || data.userId === userId) {
        sandboxes.push({
          id,
          createdAt: data.createdAt,
          name: data.sandbox?.name,
          state: data.sandbox?.state,
        });
      }
    }
    
    res.json({
      success: true,
      sandboxes,
    });
  } catch (error) {
    console.error('[Sandbox] List error:', error);
    res.status(500).json({ 
      error: error.message, 
      code: 'LIST_FAILED' 
    });
  }
});

module.exports = router;
