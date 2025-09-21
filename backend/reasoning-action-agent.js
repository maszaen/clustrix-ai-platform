/**
 * AI Reasoning + Action (RE+ACT) Orchestrator
 * Enables AI to perform multi-step analysis with desktop search capabilities
 */

const DesktopSearchEngine = require('./desktop-search-engine');

class ReasoningActionAgent {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.searchEngine = new DesktopSearchEngine(langchainService);
    this.currentThinking = null;
    this.actionHistory = [];
    this.sessionState = new Map(); // sessionId -> state
  }

  /**
   * Initialize with project files for current session
   */
  initializeSession(sessionId, files, modelInfo = {}) {
    console.log(`🧠 RE+ACT: Initializing session ${sessionId} with ${files.length} files`);
    
    this.searchEngine.loadProjectFiles(files);
    
    const capabilities = this.searchEngine.getCapabilities();
    this.sessionState.set(sessionId, {
      files: files,
      capabilities,
      actionHistory: [],
      currentPlan: null,
      thinkingState: null,
      model: modelInfo  // Store model information for API calls
    });
    
    console.log(`Session initialized with capabilities:`, capabilities);
    return capabilities;
  }

  /**
   * Process user query with RE+ACT pattern
   */
  async processWithReasoningAction(userQuery, sessionId, existingMessages = [], progressCallback = null) {
    console.log(`🧠 RE+ACT: Processing query for session ${sessionId}`);
    
    const sessionState = this.sessionState.get(sessionId);
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not initialized`);
    }

    // Send initial thinking update
    if (progressCallback) {
      progressCallback({
        type: 'thinking',
        content: `🤔 Analyzing your query: "${userQuery.substring(0, 100)}${userQuery.length > 100 ? '...' : ''}"\n\n📋 Planning analysis steps...`
      });
    }

    // Step 1: Initial reasoning - let AI understand the problem and plan actions
    const reasoningPrompt = this.buildReasoningPrompt(userQuery, sessionState);
    console.log(`🤔 RE+ACT: Sending reasoning prompt to AI...`);
    
    const reasoningResponse = await this.makeAIRequest(reasoningPrompt, sessionId);
    
    // Step 2: Parse AI's plan and execute actions
    const plan = this.parseReasoningResponse(reasoningResponse);
    console.log(`📋 RE+ACT: AI generated plan with ${plan.actions.length} actions`);
    
    // Update thinking with plan
    if (progressCallback) {
      progressCallback({
        type: 'thinking',
        content: `📋 Analysis Plan Created:\n${plan.actions.map((action, i) => `${i + 1}. ${action.type} - ${action.why || 'Searching for information'}`).join('\n')}\n\n⚡ Executing actions...`
      });
    }

    // Step 3: Execute actions one by one, updating AI with results
    let finalResponse = reasoningResponse;
    const MAX_ACTIONS = 10; // Prevent infinite loops
    let totalActionsExecuted = 0;
    
    for (const [index, action] of plan.actions.entries()) {
      if (totalActionsExecuted >= MAX_ACTIONS) {
        console.log(`RE+ACT: Stopping execution after ${MAX_ACTIONS} actions to prevent infinite loops`);
        if (progressCallback) {
          progressCallback({
            type: 'thinking',
            content: `⚠️ Stopped execution after ${MAX_ACTIONS} actions to prevent infinite loops`
          });
        }
        break;
      }
      
      console.log(`RE+ACT: Executing action ${index + 1}/${plan.actions.length}: ${action.type}`);
      
      // Update thinking with current action
      if (progressCallback) {
        progressCallback({
          type: 'thinking',
          content: `🔍 Executing action ${index + 1}/${plan.actions.length}: ${action.type}\n${action.why || 'Searching for information...'}`
        });
      }
      
      const actionResult = await this.executeAction(action, sessionId);
      sessionState.actionHistory.push({
        action,
        result: actionResult,
        timestamp: new Date().toISOString()
      });
      
      totalActionsExecuted++;
      
      // Update thinking with action result
      if (progressCallback) {
        const resultSummary = actionResult.success 
          ? `\nFound ${actionResult.count || 0} results`
          : `\n${actionResult.error || 'Action failed'}`;
        // Send a human-friendly thinking update
        progressCallback({
          type: 'thinking',
          content: `\nAction ${index + 1} completed: ${action.type}\n${resultSummary}`
        });

        // Also send a structured action_result payload so the main process can render
        // results similarly to web-search (FOUND_URLS / READING_COMPLETE).
        try {
          const structured = {
            action: action.type,
            params: action.params,
            success: Boolean(actionResult.success),
            resultCount: Array.isArray(actionResult.results) ? actionResult.results.length : (actionResult.resultCount || 0),
            results: Array.isArray(actionResult.results) ? actionResult.results.map(r => ({
              fileName: r.fileName || r.source || '(unknown)',
              lineNumber: r.lineNumber || r.line || null,
              snippet: (r.context || r.preview || r.text || '').toString().substring(0, 800)
            })) : []
          };

          progressCallback({
            type: 'action_result',
            content: `Action ${index + 1} results ready`,
            data: structured
          });
        } catch (e) {
          // Non-fatal - continue
          console.warn('RE+ACT: Failed to emit structured action_result', e);
        }
      }
      
      // Send action result back to AI for next step
      if (index < plan.actions.length - 1 || actionResult.requiresFollowup) {
        const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, index);
        finalResponse = await this.makeAIRequest(followupPrompt, sessionId);
        
        // Check if AI wants to perform additional actions
        const additionalPlan = this.parseReasoningResponse(finalResponse);
        if (additionalPlan.actions.length > 0 && totalActionsExecuted < MAX_ACTIONS) {
          // Filter out invalid actions
          const validActions = additionalPlan.actions.filter(action => {
            return action.type && action.params && Object.keys(action.params).length > 0;
          });
          
          if (validActions.length > 0) {
            console.log(`\nRE+ACT: AI requested ${validActions.length} additional actions`);
            if (progressCallback) {
              progressCallback({
                type: 'thinking',
                content: `\nAI requested ${validActions.length} additional actions, continuing analysis...`
              });
            }
            plan.actions.push(...validActions);
          } else {
            console.log(`RE+ACT: AI requested additional actions but all were invalid, stopping`);
            break;
          }
        }
      }
    }
    
    // Step 4: Final synthesis
    if (sessionState.actionHistory.length > 0) {
      if (progressCallback) {
        progressCallback({
          type: 'thinking',
          content: `\nSynthesizing results from ${sessionState.actionHistory.length} completed actions...\n\nGenerating final analysis...`
        });
      }
      
      const synthesisPrompt = this.buildSynthesisPrompt(userQuery, sessionState.actionHistory, sessionState);
      finalResponse = await this.makeAIRequest(synthesisPrompt, sessionId);
    }
    
    console.log(`RE+ACT: Completed processing with ${sessionState.actionHistory.length} actions executed`);
    
    // Final thinking update with summary
    if (progressCallback) {
      const summary = `\nAnalysis Complete!\nSummary:\n - ${sessionState.actionHistory.length} actions executed\n - ${plan.actions.length} planned steps completed\n - Ready to provide final answer`;
      progressCallback({
        type: 'thinking',
        content: summary
      });
    }
    
    let hasText = typeof finalResponse === "string" && finalResponse.trim().length > 0;
    let looksLikePlanOnly = hasText && /(^|\n)\s*PLAN\s*:|^\s*\*\*REASONING\*\*|^REASONING:/i.test(finalResponse) && !/FINAL ANSWER|JAWABAN AKHIR|KESIMPULAN|SOLUTION|SOLUSI/i.test(finalResponse);
    if (!hasText || looksLikePlanOnly) {
      const planText = typeof plan === "string" ? plan : JSON.stringify(plan);
      const ctx = Array.isArray(sessionState.files) ? sessionState.files.map(f => `${f.name}\n${f.content}`).join("\n\n") : "";
      const finalPrompt = ["Selesaikan permintaan pengguna berdasarkan rencana berikut dan konteks proyek.","Rencana:", String(planText || ""), "Konteks:", ctx, "Berikan jawaban akhir yang langsung bisa dipakai, bukan rencana."].join("\n\n");
      const synthesized = await this.makeAIRequest(finalPrompt, sessionId);
      finalResponse = typeof synthesized === "string" ? synthesized : (synthesized && synthesized.content) || "";
    }

    return {
      response: finalResponse,
      actionsExecuted: sessionState.actionHistory.length,
      searchResults: sessionState.actionHistory.map(h => h.result),
      reasoning: plan.reasoning
    };
  }

  /**
   * Build initial reasoning prompt
   */
  buildReasoningPrompt(userQuery, sessionState) {
    const fileList = sessionState.files.map(f => `- ${f.name} (${f.type})`).join('\n');
    
    return `You are an AI assistant with powerful desktop search capabilities. The user has uploaded project files and needs help.

USER FILES:
${fileList}

AVAILABLE SEARCH CAPABILITIES:
- searchPattern(pattern, options): Search for text patterns across all files (like grep)
- searchFunctions(functionName): Find function definitions
- searchCSS(selector): Find CSS selectors, classes, IDs
- searchHTML(element): Find HTML elements and tags
- searchImports(moduleName): Find import/require statements
- analyzeFileStructure(fileName): Get detailed file structure analysis

USER QUERY: "${userQuery}"

INSTRUCTIONS:
1. REASON about what the user is asking and what information you need
2. PLAN which search actions would help answer their question
3. For each planned action, specify:
   - Action type (e.g., "searchHTML")
   - Parameters (e.g., {"element": "textarea"})
   - Why this action is needed

Respond in this format:
REASONING: [Your analysis of the problem]

PLAN:
1. ACTION: searchHTML with {"element": "textarea"}
   WHY: Need to find if textarea elements exist and how they're defined

2. ACTION: searchCSS with {"selector": "textarea"}
   WHY: Check if there are CSS rules affecting textarea styling

[Continue with more actions as needed]

CURRENT THINKING: [What you expect to find and how it will help]`;
  }

  /**
   * Parse AI's reasoning response to extract action plan
   */
  parseReasoningResponse(response) {
    const plan = {
      reasoning: '',
      actions: [],
      thinking: ''
    };

    // Extract reasoning
    const reasoningMatch = response.match(/REASONING:\s*(.*?)(?=\n\nPLAN:|$)/s);
    if (reasoningMatch) {
      plan.reasoning = reasoningMatch[1].trim();
    }

    // Extract actions
    const actionMatches = response.matchAll(/\d+\.\s*ACTION:\s*[`*]?(\w+)[`*]?\s*with\s*({[^}]*}|\w+)(?:\s*WHY:\s*(.*?)(?=\n\d+\.|$))?/gs);
    
    for (const match of actionMatches) {
      const actionType = match[1].trim(); 
      let params = {};
      
      try {
          let rawParams = match[2];
          if (rawParams.startsWith('{')) {
              let parsed = JSON.parse(rawParams);
              // Cek jika hasilnya adalah objek dengan satu properti 'value'
              // yang isinya adalah string JSON lain.
              if (typeof parsed.value === 'string' && parsed.value.startsWith('{')) {
                  params = JSON.parse(parsed.value);
              } else {
                  params = parsed;
              }
          } else {
              params = { value: rawParams };
          }
      } catch (error) {
          console.warn(`Could not parse action parameters: ${match[2]}`);
          params = { value: match[2] }; // Fallback
      }
      
      plan.actions.push({
        type: actionType,
        params,
        reason: match[3]?.trim() || '',
        executed: false
      });
    }

    // Fallback: some models output PLAN as a markdown table. Try parsing that into actions.
    if (plan.actions.length === 0) {
      try {
        // Find a markdown table under PLAN: header
        const tableMatch = response.match(/\n\s*\|\s*#\s*\|[\s\S]*?\n\s*\|[-\s|:]+\n([\s\S]*?)\n\s*\n/);
        if (tableMatch && tableMatch[1]) {
          const rows = tableMatch[1].trim().split(/\n+/);
          for (const row of rows) {
            // table columns split by |, trim each cell
            const cols = row.split('|').map(c => c.trim()).filter((v,i) => v !== '' || i>0);
            // Expected col layout: [index, ACTION, PARAMETERS, WHY]
            if (cols.length >= 3) {
              const rawAction = cols[1].replace(/\*+/g, '').trim();
              let actionType = rawAction.replace(/[*`]/g, '').split(/\s+/)[0];
              let rawParams = cols[2].trim();
              let params = {};
              try {
                if (rawParams.startsWith('{')) params = JSON.parse(rawParams);
                else params = { value: rawParams.replace(/^`|`$/g, '') };
              } catch (e) {
                params = { value: rawParams };
              }
              plan.actions.push({ type: actionType, params, reason: (cols[3]||'').trim(), executed: false });
            }
          }
        }
      } catch (e) {
        // ignore fallback parsing errors
      }
    }

    // Extract current thinking
    const thinkingMatch = response.match(/CURRENT THINKING:\s*(.*?)$/s);
    if (thinkingMatch) {
      plan.thinking = thinkingMatch[1].trim();
    }

    return plan;
  }

  /**
   * Execute a single action
   */
  async executeAction(action, sessionId) {
    console.log(`Executing ${action.type} with params:`, action.params);
    
    try {
      const result = await this.searchEngine.executeSearchCommand(action.type, action.params);
      
      // Limit results to prevent token overflow
      const limitedResult = this.limitSearchResults(result, 100);
      
      action.executed = true;
      
      return {
        success: true,
        action: action.type,
        params: action.params,
        resultCount: Array.isArray(result) ? result.length : 1,
        results: limitedResult,
        requiresFollowup: this.shouldRequireFollowup(action, result)
      };
      
    } catch (error) {
      console.error(`Action ${action.type} failed:`, error);
      return {
        success: false,
        action: action.type,
        params: action.params,
        error: error.message,
        requiresFollowup: false
      };
    }
  }

  /**
   * Limit search results to prevent token overflow
   */
  limitSearchResults(results, maxLines = 100) {
    if (!Array.isArray(results)) return results;
    
    let totalLines = 0;
    const limitedResults = [];
    
    for (const result of results) {
      const resultLines = result.context ? result.context.split('\n').length : 1;
      
      if (totalLines + resultLines <= maxLines) {
        limitedResults.push(result);
        totalLines += resultLines;
      } else {
        // Add a truncation note
        limitedResults.push({
          ...result,
          context: `[TRUNCATED - Found ${results.length - limitedResults.length} more matches]`,
          truncated: true
        });
        break;
      }
    }
    
    return limitedResults;
  }

  /**
   * Determine if action requires followup
   */
  shouldRequireFollowup(action, result) {
    // If no results found, might need different search strategy
    if (Array.isArray(result) && result.length === 0) {
      return true;
    }
    
    // If too many results, might need to refine search
    if (Array.isArray(result) && result.length > 50) {
      return true;
    }
    
    return false;
  }

  /**
   * Build followup prompt after action execution
   */
  buildFollowupPrompt(action, actionResult, originalPlan, actionIndex) {
    const resultSummary = actionResult.success 
      ? `Found ${actionResult.resultCount} results`
      : `Failed: ${actionResult.error}`;
    
    let resultsText = '';
    if (actionResult.success && actionResult.results) {
      if (Array.isArray(actionResult.results)) {
        resultsText = actionResult.results.map(r => 
          `FILE: ${r.fileName}:${r.lineNumber}\n${r.context}`
        ).join('\n---\n');
      } else {
        resultsText = JSON.stringify(actionResult.results, null, 2);
      }
    }

    return `SEARCH ACTION COMPLETED:
Action: ${action.type} with ${JSON.stringify(action.params)}
Result: ${resultSummary}

SEARCH RESULTS:
${resultsText}

REMAINING ACTIONS: ${originalPlan.actions.length - actionIndex - 1}

Based on these search results, continue your analysis. 

IMPORTANT: Only request additional actions if you absolutely need more information to answer the user's question. If you have enough information to provide a helpful answer, do not request more actions.

If you need to perform additional searches, specify new actions in the same format:

ACTION: searchType with {"param": "value"}
WHY: Explanation

If you have sufficient information to answer the user's question, provide your final analysis without requesting more actions.`;
  }

  /**
   * Build final synthesis prompt
   */
  buildSynthesisPrompt(userQuery, actionHistory, sessionState) {
    const searchSummary = actionHistory.map((h, i) => {
      const result = h.result.success ? `${h.result.resultCount} results` : `Failed: ${h.result.error}`;
      return `${i + 1}. ${h.action.type}: ${result}`;
    }).join('\n');

    const allResults = actionHistory
      .filter(h => h.result.success && h.result.results)
      .map(h => {
        const actionType = h.action.type;
        const results = Array.isArray(h.result.results) 
          ? h.result.results.map(r => `${r.fileName}:${r.lineNumber} - ${r.content}`).join('\n')
          : JSON.stringify(h.result.results, null, 2);
        return `${actionType.toUpperCase()} RESULTS:\n${results}`;
      }).join('\n\n---\n\n');

    return `Based on the search analysis performed, provide a comprehensive answer to the user's question.

ORIGINAL QUESTION: "${userQuery}"

SEARCH ACTIONS PERFORMED:
${searchSummary}

DETAILED FINDINGS:
${allResults}

Please provide a detailed, helpful response that:
1. Directly answers the user's question
2. References specific files and line numbers where relevant
3. Explains what you found and what it means
4. Provides actionable recommendations if applicable
5. Mentions if anything seems missing or problematic

Your response should be practical and specific, referencing the actual code/content found.`;
  }

  /**
   * Make AI request (integrated with existing LangChain service)
   */
  async makeAIRequest(prompt, sessionId) {
    try {
      console.log(`AI Request for session ${sessionId}:`, prompt.slice(0, 100) + '...');

      // Use the existing AI API call method from main process
      // We need to get the current provider and model from the session
      const sessionData = this.sessionState.get(sessionId);
      if (!sessionData || !sessionData.model) {
        throw new Error('Session not properly initialized with model information');
      }

      const { provider, model, apiKey, baseUrl } = sessionData.model;

      // Make direct API call similar to handleOpenAICompatibleStreaming
      const url = new URL(`${baseUrl.replace(/\/+$/,'')}/chat/completions`);
      const bodyObj = {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false  // Non-streaming for RE+ACT
      };

      const body = JSON.stringify(bodyObj);
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://clustrix.local';
        headers['X-Title'] = 'Clustrix Desktop';
      }

      const response = await new Promise((resolve, reject) => {
        const https = require('https');
        const opts = {
          method: 'POST',
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          protocol: url.protocol,
          headers
        };

        const req = https.request(opts, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            resolve(data);
          });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
      });

      const jsonResponse = JSON.parse(response);
      const content = jsonResponse?.choices?.[0]?.message?.content ||
                     jsonResponse?.message?.content ||
                     jsonResponse?.output_text || '';

      return content;

    } catch (error) {
      console.error(`AI request failed:`, error);
      return this.generateFallbackResponse(prompt);
    }
  }

  /**
   * Generate fallback response when AI is not available
   */
  generateFallbackResponse(prompt) {
    // Simple pattern-based response generation
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('textarea') && lowerPrompt.includes('not')) {
      return `REASONING: The user is reporting an issue with textarea elements not appearing or functioning properly.

PLAN:
1. ACTION: searchHTML with {"element": "textarea"}
   WHY: Need to check if textarea elements exist in the HTML files

2. ACTION: searchCSS with {"selector": "textarea"}
   WHY: Check for CSS rules that might be hiding or styling textarea elements

3. ACTION: searchPattern with {"pattern": "display.*none|visibility.*hidden", "options": {"caseSensitive": false}}
   WHY: Look for CSS rules that might be hiding elements

CURRENT THINKING: Will analyze the HTML structure and CSS styling to identify why textarea elements are not visible.`;
    }
    
    // Generic analysis response
    return `REASONING: Analyzing the uploaded files to understand the structure and identify potential issues.

PLAN:
1. ACTION: analyzeFileStructure with {"fileName": "*.html"}
   WHY: Understand the overall HTML structure

2. ACTION: searchPattern with {"pattern": "${lowerPrompt.includes('error') ? 'error|Error|ERROR' : '\\w+'}", "options": {"maxResults": 20}}
   WHY: Search for relevant patterns in the code

CURRENT THINKING: Will examine the file structure and search for relevant patterns to provide helpful analysis.`;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const sessionState = this.sessionState.get(sessionId);
    if (!sessionState) return null;

    return {
      filesLoaded: sessionState.files.length,
      actionsExecuted: sessionState.actionHistory.length,
      searchHistory: this.searchEngine.searchHistory.length,
      capabilities: sessionState.capabilities
    };
  }
}

module.exports = ReasoningActionAgent;