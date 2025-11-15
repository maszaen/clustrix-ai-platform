// ===================================================================
// V3 <set> COMMAND INTEGRATION FOR CODE-AGENT.JS
// ===================================================================
//
// This module provides helpers to detect and route <set> tag commands
// through the PowerShell Invoke-SetCommand handler.
//
// ===================================================================

/**
 * Detect if a command contains <set> tags
 * @param {string} command - The command text from AI
 * @returns {boolean} - True if command contains <set> tags
 */
function hasSetTags(command) {
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Match <set file="..." range={...}>...</set> pattern
  const setTagPattern = /<set\s+file=['"]([^'"]+)['"]\s+range=\{[^}]+\}>/i;
  return setTagPattern.test(command);
}

/**
 * Wrap command in Invoke-SetCommand PowerShell call
 * @param {string} command - The command text containing <set> tags
 * @returns {string} - PowerShell command to execute
 */
function wrapSetCommand(command) {
  // Use PowerShell here-string to safely pass command with special characters
  // The @" "@ syntax allows multi-line strings and preserves formatting
  return `Invoke-SetCommand -CommandText @"\n${command}\n"@`;
}

/**
 * Parse set command output to extract structured results
 * @param {string} output - Raw output from Invoke-SetCommand
 * @returns {object} - Parsed results { success, operations, diff, memoryState }
 */
function parseSetCommandOutput(output) {
  if (!output || typeof output !== 'string') {
    return {
      success: false,
      message: 'No output from set command',
      operations: [],
      diffs: [],
      memoryStates: [],
    };
  }

  const result = {
    success: true,
    message: '',
    operations: [],
    diffs: [],
    memoryStates: [],
  };

  // Extract operation info
  const operationMatches = output.matchAll(/Operation: (REPLACE|DELETE|INSERT)/gi);
  for (const match of operationMatches) {
    result.operations.push(match[1].toUpperCase());
  }

  // Extract diffs
  const diffPattern = /GIT-STYLE DIFF\n={40}\n([\s\S]*?)\n={40}/g;
  const diffMatches = output.matchAll(diffPattern);
  for (const match of diffMatches) {
    result.diffs.push(match[1].trim());
  }

  // Extract memory states
  const memoryPattern = /UPDATED MEMORY STATE\n={40}\n([\s\S]*?)\n(?:={40}|$)/g;
  const memoryMatches = output.matchAll(memoryPattern);
  for (const match of memoryMatches) {
    result.memoryStates.push(match[1].trim());
  }

  // Check for errors
  if (output.includes('Failed') || output.includes('ERROR') || output.includes('out of range')) {
    result.success = false;
    result.message = 'Set command encountered errors (see output for details)';
  } else {
    result.message = `Successfully executed ${result.operations.length} operation(s)`;
  }

  return result;
}

/**
 * Integrate into executeCommand function
 *
 * Usage in code-agent.js:
 *
 * const { hasSetTags, wrapSetCommand, parseSetCommandOutput } = require('./set-command-integration');
 *
 * async function executeCommand(state, command, options = {}) {
 *   // ... existing validation ...
 *
 *   // Check if this is a <set> command
 *   if (hasSetTags(command)) {
 *     const psCommand = wrapSetCommand(command);
 *     const result = await terminal.run(psCommand);
 *
 *     const parsed = parseSetCommandOutput(result.stdout);
 *
 *     return {
 *       output: result.stdout,  // Full output includes diffs + memory
 *       exitCode: parsed.success ? 0 : 1,
 *       blocked: false,
 *       executed: true,
 *       isSetCommand: true,
 *       setResult: parsed,
 *     };
 *   }
 *
 *   // ... continue with normal command execution ...
 * }
 */

module.exports = {
  hasSetTags,
  wrapSetCommand,
  parseSetCommandOutput,
};
