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
    console.log(`RE+ACT: Initializing session ${sessionId} with ${files.length} files`);
    
    // Use the files passed directly instead of getting from global embedding engine
    // This ensures we have the correct files for this specific session
    const processedFiles = files.map(file => ({
      name: file.name,
      type: file.type || 'unknown',
      content: file.content || '',
      path: file.name, // Use filename as path for search engine
      metadata: {
        sessionId,
        uploadedAt: new Date().toISOString(),
        ...file
      }
    }));
    
    console.log(`RE+ACT: Using ${processedFiles.length} files directly from session`);
    
    this.searchEngine.loadProjectFiles(processedFiles);
    
    const capabilities = this.searchEngine.getCapabilities();
    this.sessionState.set(sessionId, {
      files: processedFiles, // Store the processed files for this session
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
    console.log(`RE+ACT: Processing query for session ${sessionId}`);
    
    const sessionState = this.sessionState.get(sessionId);
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not initialized`);
    }

    // Send initial thinking update
    if (progressCallback) {
      progressCallback({
        type: 'searching',
        data: { summarizedQuery: `Analyzing: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"` }
      });
    }

    // Step 1: Initial reasoning - let AI understand the problem and plan actions
    const reasoningPrompt = this.buildReasoningPrompt(userQuery, sessionState);
    console.log(`RE+ACT: Sending reasoning prompt to AI...`);
    
    const reasoningResponse = await this.makeAIRequest(reasoningPrompt, sessionId);
    
    // Step 2: Parse AI's plan and execute actions
    const plan = this.parseReasoningResponse(reasoningResponse);
    console.log(`RE+ACT: AI generated plan with ${plan.actions.length} actions`);
    
    // Update thinking with plan
    if (progressCallback) {
      progressCallback({
        type: 'reading_complete',
        data: { 
          pageCount: plan.actions.length,
          actionType: 'Planning',
          success: true
        }
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
            content: `Stopped execution after ${MAX_ACTIONS} actions to prevent infinite loops`
          });
        }
        break;
      }
      
      // Send SEARCHING update like websearch
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: `${action.type}: ${action.why || 'Searching for information...'}` }
        });
      }
      
      const actionResult = await this.executeAction(action, sessionId);
      sessionState.actionHistory.push({
        action,
        result: actionResult,
        timestamp: new Date().toISOString()
      });
      
      totalActionsExecuted++;
      
      // Send PROCESSING update after first few actions to show progress
      if (progressCallback && totalActionsExecuted === 2) {
        progressCallback({
          type: 'processing',
          data: { count: totalActionsExecuted }
        });
      }
      
      // Send READING_COMPLETE update like websearch
      if (progressCallback) {
        const resultCount = Array.isArray(actionResult.results) ? actionResult.results.length : (actionResult.resultCount || 0);
        progressCallback({
          type: 'reading_complete',
          data: { 
            pageCount: resultCount,
            actionType: action.type,
            success: actionResult.success
          }
        });
      }

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
          type: 'reading_complete',
          data: { 
            pageCount: sessionState.actionHistory.length,
            actionType: 'Synthesis',
            success: true
          }
        });
      }
      
      const synthesisPrompt = this.buildSynthesisPrompt(userQuery, sessionState.actionHistory, sessionState);
      finalResponse = await this.makeAIRequest(synthesisPrompt, sessionId);
    }
    
    console.log(`RE+ACT: Completed processing with ${sessionState.actionHistory.length} actions executed`);
    
    let hasText = typeof finalResponse === "string" && finalResponse.trim().length > 0;
    let looksLikePlanOnly = hasText && /(^|\n)\s*PLAN\s*:|^\s*\*\*REASONING\*\*|^REASONING:/i.test(finalResponse) && !/FINAL ANSWER|JAWABAN AKHIR|KESIMPULAN|SOLUTION|SOLUSI/i.test(finalResponse);
    
    // Clean up uninformative prefixes but preserve thinking tags
    if (hasText) {
      finalResponse = finalResponse.replace(/^Based on the (content|search analysis|findings?|results?)\.?\s*/i, '');
      finalResponse = finalResponse.replace(/^Here is (my|the) analysis:?\s*/i, '');
      finalResponse = finalResponse.replace(/^I have analyzed your project files?:?\s*/i, '');
      // Remove REASONING section if it exists but preserve thinking tags
      finalResponse = finalResponse.replace(/^(\*\*)?REASONING(\*\*)?:\s*(.*?)(?=\n\n|\n?$)/s, '$3');
      // Remove PLAN section if it exists
      finalResponse = finalResponse.replace(/^(\*\*)?PLAN(\*\*)?:\s*(.*?)(?=\n\n|\n?$)/s, '$3');
    }

    // For RE+ACT responses, don't strip thinking content like we do for planning sections
    // Let the frontend handle thinking mode display like regular responses
    // if (hasText && looksLikePlanOnly) {
    //   // Try to extract the actual response from after the planning section
    //   const currentThinkingMatch = finalResponse.match(/CURRENT THINKING:\s*(.*?)$/s);
    //   if (currentThinkingMatch && currentThinkingMatch[1].trim().length > 50) {
    //     // Use the content after CURRENT THINKING as the response
    //     finalResponse = currentThinkingMatch[1].trim();
    //     looksLikePlanOnly = false;
    //   } else {
    //     // If no CURRENT THINKING section, try to extract content after REASONING section
    //     const reasoningMatch = finalResponse.match(/^(\*\*)?REASONING(\*\*)?:\s*(.*?)(?=\n\n|\n?$)/s);
    //     if (reasoningMatch && reasoningMatch[3].trim().length > 50) {
    //       finalResponse = reasoningMatch[3].trim();
    //     }
    //   }
    // }

    if (!hasText || looksLikePlanOnly) {
      const planText = typeof plan === "string" ? plan : JSON.stringify(plan);
      const ctx = Array.isArray(sessionState.files) ? sessionState.files.map(f => `${f.name}\n${f.content}`).join("\n\n") : "";
      const finalPrompt = ["Complete the user's request based on the following plan and project context.","Plan:", String(planText || ""), "Context:", ctx, "Provide a final answer that can be used directly, not a plan."].join("\n\n");
      const synthesized = await this.makeAIRequest(finalPrompt, sessionId);
      finalResponse = typeof synthesized === "string" ? synthesized : (synthesized && synthesized.content) || "";
    }    return {
      response: finalResponse,
      actionsExecuted: sessionState.actionHistory.length,
      searchResults: sessionState.actionHistory.map(h => h.result),
      reasoning: plan.reasoning
    };
  }

  /**
   * Build synthesis prompt for final response
   */
  buildSynthesisPrompt(userQuery, actionHistory, sessionState) {
    const actionResults = actionHistory.map((action, index) => 
      `SEARCH ACTION ${index + 1} COMPLETED:\nAction: ${action.action} with ${JSON.stringify(action.params)}\nResult: ${this.formatActionResult(action.result)}`
    ).join('\n\n');

    const fileList = sessionState.files.map(f => `- ${f.name} (${f.type})`).join('\n');

    return `You are an AI assistant that has analyzed project files using search capabilities. Now provide a comprehensive final answer.

ORIGINAL USER QUERY: "${userQuery}"

SEARCH RESULTS PERFORMED:
${actionResults}

AVAILABLE FILES ANALYZED:
${fileList}

INSTRUCTIONS FOR FINAL RESPONSE:
1. Use the SAME LANGUAGE as the user's query (if user asked in Indonesian, respond in Indonesian)
2. Provide a clear, actionable answer based on the search results
3. Include thinking/reasoning process in your response using <thinking> tags
4. Structure your response professionally with clear sections if needed
5. Reference specific files and findings from the search results
6. Save your thinking process for future reference

Format your response with thinking included:
<thinking>
[Your analysis and reasoning process]
</thinking>

[Your final answer in the user's language]

IMPORTANT: The thinking section must be included and will be saved for future reference.`;
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
   * Build synthesis prompt for final answer
   */
  buildSynthesisPrompt(userQuery, sessionState, actionResults, userLanguage = 'en') {
    const fileList = sessionState.files.map(f => `- ${f.name} (${f.type})`).join('\n');

    // Format action results for context
    const resultsContext = actionResults.map((result, index) => {
      if (result.success) {
        return `ACTION ${index + 1}: ${result.action}
PARAMETERS: ${JSON.stringify(result.params)}
RESULTS (${result.resultCount} items):
${Array.isArray(result.results) ? result.results.map(r => `- ${r}`).join('\n') : result.results}`;
      } else {
        return `ACTION ${index + 1}: ${result.action} - FAILED`;
      }
    }).join('\n\n');

    return `You are an AI assistant synthesizing information from project files to answer the user's question.

USER FILES:
${fileList}

USER QUERY: "${userQuery}"

SEARCH RESULTS FROM ANALYSIS:
${resultsContext}

INSTRUCTIONS:
1. Analyze all the search results and file information
2. Provide a comprehensive answer to the user's question
3. Include relevant code examples, file references, and explanations
4. Use the user's language for the final answer: ${userLanguage}

IMPORTANT: Structure your response with:
<thinking>
[Your analysis and reasoning process]
</thinking>

[Your final answer in the user's language]

IMPORTANT: The thinking section must be included and will be saved for future reference.`;
  }

  /**
   * Detect user's language from their query
   */
  detectUserLanguage(userQuery) {
    // Simple language detection based on common words and characters
    const query = userQuery.toLowerCase();

    // Indonesian indicators
    if (/\b(apa|bagaimana|dimana|kapan|mengapa|siapa|yang|dan|atau|dengan|untuk|dari|pada|ke|di)\b/.test(query) ||
        /[àâäéèêëïîôöùûüÿç]/.test(query) === false && // Not French
        /[ñ¿¡]/.test(query) === false && // Not Spanish
        query.includes('yang') || query.includes('untuk') || query.includes('dengan')) {
      return 'id'; // Indonesian
    }

    // French indicators
    if (/\b(le|la|les|du|de|des|et|à|un|une|dans|sur|avec|pour|par|mais|ou|si|nous|vous|ils|elles)\b/.test(query) ||
        /[àâäéèêëïîôöùûüÿç]/.test(query)) {
      return 'fr'; // French
    }

    // Spanish indicators
    if (/\b(el|la|los|las|de|del|en|con|por|para|como|que|es|son|está|están|y|o|si|no|muy|más)\b/.test(query) ||
        /[ñ¿¡]/.test(query)) {
      return 'es'; // Spanish
    }

    // German indicators
    if (/\b(der|die|das|den|dem|des|und|mit|für|auf|ist|sind|war|waren|sein|haben|hatte)\b/.test(query) ||
        /[äöüß]/.test(query)) {
      return 'de'; // German
    }

    // Default to English
    return 'en';
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
    const extractPlanSection = () => {
      const planMatch = response.match(/PLAN\s*:\s*([\s\S]*)/i);
      if (!planMatch) {
        return '';
      }

      let section = planMatch[1];
      const terminators = [
        /\n\s*CURRENT THINKING\s*:/i,
        /\n\s*FINAL ANSWER\s*:/i,
        /\n\s*FINAL RESPONSE\s*:/i,
        /\n\s*JAWABAN AKHIR\s*:/i,
        /\n\s*KESIMPULAN\s*:/i,
        /\n\s*SOLUTION\s*:/i
      ];

      for (const terminator of terminators) {
        const idx = section.search(terminator);
        if (idx !== -1) {
          section = section.slice(0, idx);
          break;
        }
      }

      return section.trim();
    };

    const extractParameters = (text) => {
      if (!text) {
        return { paramsSource: '', remainder: '' };
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return { paramsSource: '', remainder: '' };
      }

      if (trimmed.startsWith('```')) {
        const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch) {
          const remainder = trimmed.slice(fenceMatch[0].length);
          return { paramsSource: fenceMatch[1].trim(), remainder: remainder.trim() };
        }
      }

      if (trimmed.startsWith('{')) {
        let depth = 0;
        let inString = false;
        let escape = false;
        let stringChar = null;

        for (let i = 0; i < trimmed.length; i++) {
          const char = trimmed[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === '\\') {
            escape = true;
            continue;
          }

          if (inString) {
            if (char === stringChar) {
              inString = false;
            }
            continue;
          }

          if (char === '"' || char === '\'' || char === '`') {
            inString = char;
            stringChar = char;
            continue;
          }

          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              const paramsSource = trimmed.slice(0, i + 1);
              const remainder = trimmed.slice(i + 1);
              return { paramsSource, remainder: remainder.trim() };
            }
          }
        }

        return { paramsSource: trimmed, remainder: '' };
      }

      const whyIndex = trimmed.search(/\bWHY:/i);
      if (whyIndex !== -1) {
        return {
          paramsSource: trimmed.slice(0, whyIndex).trim(),
          remainder: trimmed.slice(whyIndex).trim()
        };
      }

      const newlineIndex = trimmed.indexOf('\n');
      if (newlineIndex !== -1) {
        return {
          paramsSource: trimmed.slice(0, newlineIndex).trim(),
          remainder: trimmed.slice(newlineIndex).trim()
        };
      }

      return { paramsSource: trimmed, remainder: '' };
    };

    const parseActionParams = (rawParams) => {
      if (!rawParams) {
        return {};
      }

      let text = rawParams.trim();
      if (!text) {
        return {};
      }

      if (text.startsWith('```')) {
        const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
        if (fenceMatch) {
          text = fenceMatch[1].trim();
        } else {
          text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        }
      }

      const cleaned = text.replace(/^`+|`+$/g, '').trim();
      if (!cleaned) {
        return {};
      }

      if (cleaned.startsWith('{')) {
        try {
          return JSON.parse(cleaned);
        } catch (error) {
          console.warn(`Could not parse action parameters: ${cleaned}`);
        }
      }

      const unquoted = cleaned.replace(/^['"]|['"]$/g, '');
      return { value: unquoted };
    };

    const extractReason = (text) => {
      if (!text) {
        return '';
      }

      const reasonMatch = text.match(/WHY:\s*([\s\S]*)/i);
      if (reasonMatch) {
        return reasonMatch[1].trim();
      }

      return text.trim();
    };

    const planSection = extractPlanSection();

    if (planSection) {
      const actionPattern = /(\d+)\.\s*ACTION:\s*[`*]?([A-Za-z0-9_]+)[`*]?\s*with\s*/gi;
      const matches = Array.from(planSection.matchAll(actionPattern));

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const actionType = match[2].trim();
        const blockStart = match.index ?? 0;
        const blockEnd = i + 1 < matches.length ? matches[i + 1].index : planSection.length;
        const block = planSection.slice(blockStart, blockEnd);

        const afterWith = block.slice(match[0].length).trim();
        const { paramsSource, remainder } = extractParameters(afterWith);
        const params = parseActionParams(paramsSource);
        const reason = extractReason(remainder);

        plan.actions.push({
          type: actionType,
          params,
          reason,
          executed: false
        });
      }
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
      const resultCount = Array.isArray(result) ? result.length : (result ? 1 : 0);

      console.log(`Action ${action.type} returned ${resultCount} result(s)`);

      action.executed = true;

      return {
        success: true,
        action: action.type,
        params: action.params,
        resultCount,
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
      const result = h.result.success ? `${h.result.resultCount} results` : `Failed: ${h.result.error || 'Unknown error'}`;
      return `${i + 1}. ${h.action.type}: ${result}`;
    }).join('\n');

    // Collect all unique files that were found in search results
    const foundFiles = new Set();
    actionHistory.forEach(h => {
      if (h.result.success && h.result.results && Array.isArray(h.result.results)) {
        h.result.results.forEach(r => {
          if (r.fileName || r.source) {
            foundFiles.add(r.fileName || r.source);
          }
        });
      }
    });

    // Include full content of found files
    let fileContext = '';
    if (foundFiles.size > 0) {
      fileContext = '\n\nRELEVANT FILE CONTENT:\n';
      sessionState.files.forEach(file => {
        if (foundFiles.has(file.name)) {
          fileContext += `--- START OF FILE: ${file.name} ---\n${file.content}\n--- END OF FILE: ${file.name} ---\n\n`;
        }
      });
    }

    const allResults = actionHistory
      .filter(h => h.result.success && h.result.results)
      .map(h => {
        const actionType = h.action.type;
        const results = Array.isArray(h.result.results)
          ? h.result.results.map(r => `${r.fileName || r.source || 'unknown'}:${r.lineNumber || r.line || 'N/A'} - ${r.context || r.preview || r.text || r.content || r}`).join('\n')
          : JSON.stringify(h.result.results, null, 2);
        return `${actionType.toUpperCase()} RESULTS:\n${results}`;
      }).join('\n\n---\n\n');

    const userLanguage = this.detectUserLanguage(userQuery);

    return `You are an AI assistant synthesizing information from project files to answer the user's question.

USER QUERY: "${userQuery}"

SEARCH ACTIONS PERFORMED:
${searchSummary}

${allResults ? `SEARCH RESULTS:\n${allResults}\n\n` : ''}${fileContext}INSTRUCTIONS:
1. Analyze all the search results and the relevant file content provided above
2. Provide a comprehensive answer to the user's question based on the findings
3. Include relevant code examples, file references, and explanations
4. Use the user's language for the final answer: ${userLanguage}

IMPORTANT: Structure your response with:
<thinking>
[Your analysis and reasoning process]
</thinking>

[Your final answer in the user's language]

IMPORTANT: The thinking section must be included and will be saved for future reference.`;
  }

  /**
   * Make AI request (integrated with existing LangChain service)
   */
  async makeAIRequest(prompt, sessionId) {
    console.log(`AI Request for session ${sessionId}:`, prompt.slice(0, 100) + '...');

    const sessionData = this.sessionState.get(sessionId);
    if (!sessionData || !sessionData.model) {
      console.error('AI request failed: Session not properly initialized with model information');
      return this.generateFallbackResponse(prompt);
    }

    const { provider, model, apiKey, baseUrl } = sessionData.model;
    const https = require('https');

    const url = new URL(`${baseUrl.replace(/\/+$/,'')}/chat/completions`);
    const bodyObj = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false
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

    const makeHttpRequest = () => new Promise((resolve, reject) => {
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
            const error = new Error(`HTTP ${res.statusCode}: ${data}`);
            error.statusCode = res.statusCode;
            error.responseBody = data;
            reject(error);
            return;
          }
          resolve(data);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });

    const extractStatusCode = (error) => {
      if (!error) return null;
      if (typeof error.statusCode === 'number') {
        return error.statusCode;
      }
      const match = (error.message || '').match(/HTTP\s+(\d{3})/i);
      return match ? parseInt(match[1], 10) : null;
    };

    const isRetryable = (error) => {
      const status = extractStatusCode(error);
      if (status === 429 || (status >= 500 && status < 600)) {
        return true;
      }

      const transientCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH']);
      return transientCodes.has(error?.code);
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const maxAttempts = 4;
    const baseDelay = 500;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const responseText = await makeHttpRequest();
        const jsonResponse = JSON.parse(responseText);
        const content = jsonResponse?.choices?.[0]?.message?.content ||
                        jsonResponse?.message?.content ||
                        jsonResponse?.output_text || '';
        return content;
      } catch (error) {
        lastError = error;
        const status = extractStatusCode(error);
        const shouldRetry = attempt < maxAttempts && isRetryable(error);

        if (shouldRetry) {
          const backoff = baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 200);
          const delay = backoff + jitter;
          console.warn(`AI request attempt ${attempt} failed (${status || error.code || 'error'}). Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        console.error(`AI request attempt ${attempt} failed:`, error);
        break;
      }
    }

    console.error('AI request failed after retries:', lastError);
    return this.generateFallbackResponse(prompt);
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