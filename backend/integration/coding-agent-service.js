const { logWithContext } = require('../../utils/logger');

function log(func, message, details = {}) {
  logWithContext('CODING_AGENT', func, message, details);
}

class CodingAgentService {
  constructor(db, terminalManager, langchainService) {
    this.db = db;
    this.terminalManager = terminalManager;
    this.langchainService = langchainService;
    this.maxIterations = 20;

    log('constructor', 'Coding Agent Service initialized');
  }

  /**
   * Generate system prompt for coding agent
   */
  generateSystemPrompt(userPrompt, commandHistory = [], lastCommand = null, commandOutput = null) {
    let historyText = '';
    if (commandHistory.length > 0) {
      historyText = commandHistory.map(h =>
        `- ${h.command} <${h.summary || 'executed'}>`
      ).join('\n');
    }

    let lastCommandSection = '';
    if (lastCommand && commandOutput !== null) {
      lastCommandSection = `
=== LAST COMMAND ===
Command: ${lastCommand}
Output:
${commandOutput}
`;
    }

    const systemPrompt = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

=== ORIGINAL USER REQUEST ===
${userPrompt}

=== COMMAND HISTORY ===
${historyText || '(no commands executed yet)'}
${lastCommandSection}

=== RESPONSE FORMAT ===
You MUST respond using these XML tags:

<internal>
(if there is last command output), summarize hasil search atau perubahan apapun itu.
</internal>
<answer>
Your answer, like "baik zaen, saya akan coba cek dlu main.py"
</answer>
<cmd>
Next PowerShell command (optional - only if needed)
</cmd>

=== RESPONSE FORMAT IF TASK IS DONE ===
<answer>
your final answer, like "oke done zaen, bug tadi sudah fix, aku fix bla bla bla".
</answer>
<end/>

=== DECISION TREE ===
Ask yourself:
1. Did the last command give useful information?
2. Do I need more context before acting?
3. Should I fix something now?
4. Are all bugs fixed? Should I verify?
5. Is the task complete?

Based on answers:
- If need more info → <cmd> to gather data
- If ready to fix → <cmd> to edit file
- If need verification → <cmd> to run code
- If done → <answer> only with <end/>

=== IMPORTANT RULES ===
1. ALWAYS analyze the command output before next action
2. Don't repeat the same command twice
3. If stuck or unsure, ask Zaeni for clarification
4. Keep track of what you've fixed to avoid duplicates
5. When editing, be precise with line numbers (remember 0-indexed)
6. After fixing bugs, ALWAYS verify by running the code
7. If command fails, explain why and try alternative approach
8. If the user prompt is just asking a question (no need for searches or bug fixing), just use tag <answer> with <end/> to answer the user question.

=== WORKFLOW GUIDELINES ===
Bug fixing flow:
1. Search/grep to find issues
2. Check context around issues
3. Fix issues one by one
4. Verify each fix if critical
5. Run final code to ensure everything works
6. Summarize what was fixed

=== CONTINUE WORKING ===
Analyze the output above and take your next action.`;

    return systemPrompt;
  }

  /**
   * Parse XML response from AI
   */
  parseXMLResponse(response) {
    const result = {
      internal: null,
      answer: null,
      command: null,
      isFinal: false
    };

    // Extract <internal>
    const internalMatch = response.match(/<internal>([\s\S]*?)<\/internal>/);
    if (internalMatch) {
      result.internal = internalMatch[1].trim();
    }

    // Extract <answer>
    const answerMatch = response.match(/<answer>([\s\S]*?)<\/answer>/);
    if (answerMatch) {
      result.answer = answerMatch[1].trim();
    }

    // Extract <cmd>
    const cmdMatch = response.match(/<cmd>([\s\S]*?)<\/cmd>/);
    if (cmdMatch) {
      result.command = cmdMatch[1].trim();
    }

    // Check for <end/>
    const endMatch = response.match(/<end\s*\/>/);
    if (endMatch) {
      result.isFinal = true;
    }

    log('parseXMLResponse', 'Parsed XML response', {
      hasInternal: !!result.internal,
      hasAnswer: !!result.answer,
      hasCommand: !!result.command,
      isFinal: result.isFinal
    });

    return result;
  }

  /**
   * Validate if command is destructive and needs user approval
   */
  validateCommand(command) {
    const destructivePatterns = [
      /\bRemove-Item\b/i,
      /\brm\b/i,
      /\bdel\b/i,
      /\bDelete\b/i,
      /\bFormat-/i,
      /\bClear-/i,
      /\bTruncate\b/i,
      /\bDrop\b.*\bTable\b/i,
      /\bDrop\b.*\bDatabase\b/i,
      />\s*\$null/i, // Redirect to null (data loss)
      /\bRemove-/i
    ];

    for (const pattern of destructivePatterns) {
      if (pattern.test(command)) {
        log('validateCommand', 'Destructive command detected', { command: command.substring(0, 100) });
        return {
          isDestructive: true,
          needsApproval: true,
          reason: 'Command contains destructive operations (delete, remove, format, truncate)'
        };
      }
    }

    return {
      isDestructive: false,
      needsApproval: false
    };
  }

  /**
   * Execute coding agent iteration
   */
  async executeIteration(codeId, iterationNumber, userMessage, terminalId, progressCallback) {
    try {
      log('executeIteration', 'Starting iteration', { codeId, iterationNumber, hasUserMessage: !!userMessage });

      // Get previous iterations for context
      const iterations = await this.db.getCodeIterations(codeId);
      const lastIteration = iterations[iterations.length - 1];

      // Build command history
      const commandHistory = iterations
        .filter(it => it.command)
        .map(it => ({
          command: it.command,
          summary: it.ai_internal || 'executed'
        }));

      // Generate system prompt
      const systemPrompt = this.generateSystemPrompt(
        userMessage || iterations[0]?.user_message,
        commandHistory,
        lastIteration?.command,
        lastIteration?.command_output
      );

      // Call AI
      log('executeIteration', 'Calling AI for iteration', { iterationNumber });

      if (progressCallback) {
        progressCallback({ type: 'ai_thinking', iteration: iterationNumber });
      }

      const aiResponse = await this.langchainService.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage || 'Continue working based on the output above.' }
        ],
        stream: false
      });

      const responseText = aiResponse.content || aiResponse.response || aiResponse;

      log('executeIteration', 'AI response received', {
        iterationNumber,
        responseLength: responseText.length
      });

      // Parse XML response
      const parsed = this.parseXMLResponse(responseText);

      // Save iteration to database
      await this.db.saveCodeIteration({
        code_id: codeId,
        iteration_number: iterationNumber,
        user_message: userMessage,
        ai_internal: parsed.internal,
        ai_answer: parsed.answer,
        command: parsed.command,
        command_output: null,
        is_validated: false,
        is_final: parsed.isFinal,
        created_at: Date.now()
      });

      if (progressCallback) {
        progressCallback({
          type: 'iteration_complete',
          iteration: iterationNumber,
          answer: parsed.answer,
          command: parsed.command,
          isFinal: parsed.isFinal
        });
      }

      // If there's a command, validate and execute
      if (parsed.command && !parsed.isFinal) {
        const validation = this.validateCommand(parsed.command);

        if (validation.needsApproval) {
          log('executeIteration', 'Command needs approval', { iterationNumber });

          if (progressCallback) {
            progressCallback({
              type: 'command_approval_needed',
              iteration: iterationNumber,
              command: parsed.command,
              reason: validation.reason
            });
          }

          // Wait for user approval (handled by frontend)
          return {
            needsApproval: true,
            command: parsed.command,
            reason: validation.reason,
            answer: parsed.answer,
            internal: parsed.internal
          };
        }

        // Execute command
        log('executeIteration', 'Executing command', { iterationNumber, command: parsed.command.substring(0, 100) });

        if (progressCallback) {
          progressCallback({
            type: 'command_executing',
            iteration: iterationNumber,
            command: parsed.command
          });
        }

        const commandResult = await this.terminalManager.executeCommand(terminalId, parsed.command);

        // Update iteration with command output
        const updatedIteration = {
          code_id: codeId,
          iteration_number: iterationNumber,
          user_message: userMessage,
          ai_internal: parsed.internal,
          ai_answer: parsed.answer,
          command: parsed.command,
          command_output: commandResult.stdout || commandResult.stderr,
          is_validated: true,
          is_final: parsed.isFinal
        };

        await this.db.saveCodeIteration(updatedIteration);

        if (progressCallback) {
          progressCallback({
            type: 'command_complete',
            iteration: iterationNumber,
            command: parsed.command,
            output: commandResult.stdout || commandResult.stderr
          });
        }

        // Continue to next iteration if not final
        if (!parsed.isFinal && iterationNumber < this.maxIterations) {
          return await this.executeIteration(
            codeId,
            iterationNumber + 1,
            null, // No new user message, continue based on last output
            terminalId,
            progressCallback
          );
        }
      }

      return {
        complete: parsed.isFinal || iterationNumber >= this.maxIterations,
        answer: parsed.answer,
        internal: parsed.internal,
        iterations: iterationNumber
      };

    } catch (error) {
      log('executeIteration', 'Error during iteration', {
        iterationNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start new coding session
   */
  async startCodingSession(codeId, userMessage, progressCallback) {
    try {
      log('startCodingSession', 'Starting new coding session', { codeId });

      // Get or create terminal
      let terminal = this.terminalManager.getTerminalForCode(codeId);
      if (!terminal) {
        const code = await this.db.getCodeById(codeId);
        const terminalInfo = await this.terminalManager.createTerminal(codeId, code?.workspace_path);
        terminal = { terminalId: terminalInfo.terminalId };
      }

      // Execute first iteration
      const result = await this.executeIteration(
        codeId,
        1,
        userMessage,
        terminal.terminalId,
        progressCallback
      );

      return result;
    } catch (error) {
      log('startCodingSession', 'Error starting coding session', {
        codeId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Approve and execute a command that needed validation
   */
  async approveAndExecuteCommand(codeId, iterationNumber, command, terminalId, progressCallback) {
    try {
      log('approveAndExecuteCommand', 'Executing approved command', { codeId, iterationNumber });

      if (progressCallback) {
        progressCallback({
          type: 'command_executing',
          iteration: iterationNumber,
          command
        });
      }

      const commandResult = await this.terminalManager.executeCommand(terminalId, command);

      // Update iteration with command output
      const iteration = await this.db.getCodeIterations(codeId)
        .then(its => its.find(it => it.iteration_number === iterationNumber));

      if (iteration) {
        await this.db.saveCodeIteration({
          ...iteration,
          command_output: commandResult.stdout || commandResult.stderr,
          is_validated: true
        });
      }

      if (progressCallback) {
        progressCallback({
          type: 'command_complete',
          iteration: iterationNumber,
          output: commandResult.stdout || commandResult.stderr
        });
      }

      // Continue to next iteration
      return await this.executeIteration(
        codeId,
        iterationNumber + 1,
        null,
        terminalId,
        progressCallback
      );

    } catch (error) {
      log('approveAndExecuteCommand', 'Error executing approved command', {
        codeId,
        iterationNumber,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = CodingAgentService;
