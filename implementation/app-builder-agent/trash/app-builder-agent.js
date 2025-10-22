const { log } = require('../../../utils/logger');

class AppBuilderAgent {
  constructor(services) {
    this.terminal = services.terminal;
    this.fileOps = services.fileOps;
    this.requestLimiter = services.requestLimiter;
    this.searchEngine = services.searchEngine;
  }

  /**
   * Main build process orchestration
   * @param {string} userPrompt - User's app description
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Build result
   */
  async buildApp(userPrompt, sessionId) {
    log('APP_BUILDER', 1, 'buildApp', `Starting build for session ${sessionId}`);

    try {
      // Phase 1: Clarification (handled by chat system)
      // Phase 2: Planning (handled by AI)
      // Phase 3: Execution (handled here)
      
      // This is called after user approves the plan
      return {
        status: 'ready',
        message: 'Awaiting plan approval from user'
      };
      
    } catch (error) {
      log('APP_BUILDER', 3, 'buildApp', `Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute approved plan
   * @param {Object} plan - Build plan with directories, files, commands
   * @param {string} sessionId - Session identifier
   * @param {Function} progressCallback - Progress update callback
   * @returns {Promise<Object>} Execution result
   */
  async executePlan(plan, sessionId, progressCallback) {
    const results = {
      success: true,
      steps: [],
      errors: [],
      totalSteps: 0,
      completedSteps: 0
    };

    // Calculate total steps
    results.totalSteps = 
      (plan.directories?.length || 0) + 
      (plan.files?.length || 0) + 
      (plan.commands?.length || 0);

    log('APP_BUILDER', 1, 'executePlan', `Executing plan: ${results.totalSteps} steps`);

    try {
      // Step 1: Create directories
      if (plan.directories && plan.directories.length > 0) {
        progressCallback?.({ 
          phase: 'directories', 
          current: 0, 
          total: plan.directories.length 
        });

        for (let i = 0; i < plan.directories.length; i++) {
          const dir = plan.directories[i];
          
          try {
            await this.terminal.execute(`mkdir -p ${dir}`);
            results.steps.push({ 
              action: 'mkdir', 
              path: dir, 
              success: true 
            });
            results.completedSteps++;
            
            progressCallback?.({ 
              phase: 'directories', 
              current: i + 1, 
              total: plan.directories.length,
              overall: results.completedSteps,
              overallTotal: results.totalSteps
            });
            
          } catch (error) {
            results.errors.push({ 
              action: 'mkdir', 
              path: dir, 
              error: error.message 
            });
          }
        }
      }

      // Step 2: Create files
      if (plan.files && plan.files.length > 0) {
        progressCallback?.({ 
          phase: 'files', 
          current: 0, 
          total: plan.files.length 
        });

        for (let i = 0; i < plan.files.length; i++) {
          const file = plan.files[i];
          
          // Check request limit
          if (!this.requestLimiter.canMakeRequest(sessionId)) {
            results.errors.push({
              error: 'Max AI requests reached'
            });
            results.success = false;
            break;
          }

          try {
            await this.fileOps.createFile(file.path, file.content);
            results.steps.push({ 
              action: 'create', 
              path: file.path, 
              success: true 
            });
            results.completedSteps++;
            
            this.requestLimiter.incrementCounter(sessionId);
            
            progressCallback?.({ 
              phase: 'files', 
              current: i + 1, 
              total: plan.files.length,
              overall: results.completedSteps,
              overallTotal: results.totalSteps,
              requestsRemaining: this.requestLimiter.getRemaining(sessionId)
            });
            
          } catch (error) {
            results.errors.push({ 
              action: 'create', 
              path: file.path, 
              error: error.message 
            });
          }
        }
      }

      // Step 3: Run commands
      if (plan.commands && plan.commands.length > 0) {
        progressCallback?.({ 
          phase: 'commands', 
          current: 0, 
          total: plan.commands.length 
        });

        for (let i = 0; i < plan.commands.length; i++) {
          const cmd = plan.commands[i];
          
          try {
            // Check if requires approval
            if (this.terminal.requiresApproval(cmd.command)) {
              // This will be handled by UI approval flow
              results.steps.push({ 
                action: 'command', 
                command: cmd.command, 
                requiresApproval: true 
              });
              continue;
            }

            const result = await this.terminal.execute(cmd.command);
            results.steps.push({ 
              action: 'command', 
              command: cmd.command, 
              success: result.success,
              output: result.stdout
            });
            results.completedSteps++;
            
            progressCallback?.({ 
              phase: 'commands', 
              current: i + 1, 
              total: plan.commands.length,
              overall: results.completedSteps,
              overallTotal: results.totalSteps
            });
            
          } catch (error) {
            results.errors.push({ 
              action: 'command', 
              command: cmd.command, 
              error: error.message 
            });
          }
        }
      }

      // Final status
      if (results.errors.length > 0) {
        results.success = false;
      }

      progressCallback?.({ phase: 'complete', results });

      log('APP_BUILDER', 1, 'executePlan', `Plan execution complete: ${results.completedSteps}/${results.totalSteps} steps`);

      return results;

    } catch (error) {
      log('APP_BUILDER', 3, 'executePlan', `Execution error: ${error.message}`);
      results.success = false;
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * Validate plan before execution
   * @param {Object} plan - Build plan to validate
   * @returns {Object} Validation result
   */
  validatePlan(plan) {
    const issues = [];

    // Check required fields
    if (!plan.projectName) {
      issues.push('Missing project name');
    }

    if (!plan.directories || plan.directories.length === 0) {
      issues.push('No directories defined');
    }

    if (!plan.files || plan.files.length === 0) {
      issues.push('No files defined');
    }

    // Check file content
    if (plan.files) {
      plan.files.forEach((file, index) => {
        if (!file.path) {
          issues.push(`File ${index} missing path`);
        }
        if (file.content === undefined) {
          issues.push(`File ${index} missing content`);
        }
      });
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Execute single command with approval check
   * @param {string} command - Command to execute
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Execution result
   */
  async executeCommand(command, sessionId) {
    // Validate command
    const validation = this.terminal.validateCommand(command);
    
    if (validation.blocked) {
      throw new Error(validation.reason);
    }

    if (validation.requiresApproval) {
      return {
        requiresApproval: true,
        command,
        reason: validation.reason
      };
    }

    // Execute
    const result = await this.terminal.execute(command);
    
    log('APP_BUILDER', 1, 'executeCommand', `Executed: ${command} (exit ${result.exitCode})`);

    return result;
  }

  /**
   * Get workspace file tree
   * @param {string} rootPath - Root directory path
   * @returns {Promise<Object>} File tree structure
   */
  async getFileTree(rootPath) {
    try {
      this.fileOps.setWorkspaceRoot(rootPath);
      const entries = await this.fileOps.listDirectory('.');
      
      return {
        success: true,
        root: rootPath,
        entries
      };
    } catch (error) {
      log('APP_BUILDER', 3, 'getFileTree', `Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AppBuilderAgent;
