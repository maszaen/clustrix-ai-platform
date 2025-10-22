

const DesktopSearchEngine = require('./desktop-search-engine');
const { log } = require('../utils/logger');
const { optimizeMessages } = require('../utils/message-optimizer');

// OPTIMIZATION: Centralized instruction template to deduplicate across all prompts
// This reduces token waste from repeating 2,600+ character instruction block
const CRITICAL_INSTRUCTIONS = `CRITICAL INSTRUCTIONS:
1. REASON thoroughly about what information is required to answer the question
2. PLAN a comprehensive sequence of search actions - BE THOROUGH, NOT MINIMAL
3. You MUST create AT LEAST 2-3 different search actions to gather sufficient information
4. DO NOT create just 1 action - that's insufficient for quality research
5. SMART FILE SELECTION (when files are available):
   - If you don't know what files are available, START with listAvailableFiles() as your FIRST action
   - When user mentions specific file (e.g., "check renderer.js"), you MUST list files first to confirm it exists
   - After listing files, choose relevant files based on query, then plan targeted searches
   - Use options.file or options.fileName in searchPattern to search specific file only
   - Example: searchPattern with {"pattern": "async", "options": {"file": "renderer.js"}}
6. For document analysis (especially finding author names, titles, dates):
   - Use SIMPLE KEYWORDS first,like: "nama", "penulis", "author", "title", "judul", "bab"
   - Avoid overly specific regex patterns like "Nama\\s*:" - they miss variations
   - Try multiple variations: "nama pengarang", "nama penulis", "author name"
7. For each action specify:
   - Action type (e.g., "webSearch" atau "searchHTML")
   - Parameters in JSON (mis. {"query": "berita Nepal terbaru"})
   - Why this action helps progress the investigation

IMPORTANT: If you're analyzing files, use MULTIPLE different search patterns to find relevant information. Don't rely on just one search.`;

class ReasoningActionAgent {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.searchEngine = new DesktopSearchEngine(langchainService);
    this.currentThinking = null;
    this.actionHistory = [];
    this.sessionState = new Map();
  }

  
  initializeSession(sessionId, files, modelInfo = {}) {
    const logHelper = { sessionId };
    log(logHelper, 'REASONING_ACTION_AGENT', 'initializeSession', 
      `Initializing session with ${files.length} files`);
    
    const processedFiles = files.map(file => ({
      name: file.name,
      type: file.type || 'unknown',
      content: file.content || '',
      path: file.name,
      metadata: {
        sessionId,
        uploadedAt: new Date().toISOString(),
        ...file
      }
    }));
    
    log(logHelper, 'REASONING_ACTION_AGENT', 'initializeSession',
      `Processed ${processedFiles.length} files:\n${processedFiles.map(f => `  - ${f.name} (${f.type})`).join('\n')}`);

    const { searchApiConfig = null, ...modelConfig } = modelInfo || {};

    this.searchEngine.loadProjectFiles(processedFiles);
    this.searchEngine.setSearchConfig(searchApiConfig);

    const capabilities = this.searchEngine.getCapabilities();
    this.sessionState.set(sessionId, {
      files: processedFiles,
      capabilities,
      actionHistory: [],
      currentPlan: null,
      thinkingState: null,
      model: modelConfig,
      searchApiConfig
    });

    log(`Session initialized with capabilities:`, capabilities);
    return capabilities;
  }

  
  async processWithReasoningAction(userQuery, sessionId, existingMessages = [], progressCallback = null, systemPrompt = null, language = 'autodetect') {
    const logHelper = { sessionId };
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction', 
      `Starting query processing\nQuery: "${userQuery}"\nSession: ${sessionId}\nExisting messages: ${existingMessages.length}`);
    
    const sessionState = this.sessionState.get(sessionId);
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not initialized`);
    }
    
    // Reset per-request state so previous runs don't leak into the next query
    sessionState.actionHistory = [];
    sessionState.currentPlan = null;

    // Store conversation history in session state
    sessionState.conversationHistory = existingMessages;
    sessionState.language = language;
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
      `Stored ${existingMessages.length} previous messages in session state for context, language: ${language}`);
    
    const usageBreakdown = [];
    
    if (progressCallback) {
      progressCallback({
        type: 'searching',
        data: { summarizedQuery: `Analyzing: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"` }
      });
    }
    
    const reasoningPrompt = this.buildReasoningPrompt(userQuery, sessionState);
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
      `Built reasoning prompt (${reasoningPrompt.length} chars):\n---PROMPT START---\n${reasoningPrompt}\n---PROMPT END---`);
    
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction', 
      `Sending reasoning prompt to AI model: ${sessionState.model?.model || 'unknown'}`);
    
    const reasoningResult = await this.makeAIRequest(reasoningPrompt, sessionId);
    let reasoningResponse = reasoningResult.content;
    
    // CRITICAL FIX: Use content (main response) for parsing, NOT reasoning_content
    // reasoning_content contains internal thinking with dirty format
    // content contains clean PLAN/ACTION format that parser expects
    if (reasoningResult.reasoning_content) {
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Planning included reasoning_content (${reasoningResult.reasoning_content.length} chars) - logged for debugging only`);
    }
    
    if (reasoningResult.usage) {
      const usageEntry = {
        stage: 'reasoning-planning',
        usage: reasoningResult.usage,
        provider: sessionState.model.provider,
        model: sessionState.model.model,
      };
      usageBreakdown.push(usageEntry);
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Recorded planning usage: ${JSON.stringify(usageEntry)}`);
    } else {
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `No usage data in reasoning result`);
    }
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
      `Received AI response (${reasoningResponse.length} chars):\n---RESPONSE START---\n${reasoningResponse}\n---RESPONSE END---`);
    
    const plan = this.parseReasoningResponse(reasoningResponse);
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
      `Parsed plan:\n  - Reasoning: ${plan.reasoning}\n  - Actions: ${plan.actions.length}\n  - Thinking: ${plan.thinking}\n  - Action details: ${JSON.stringify(plan.actions, null, 2)}`);
    
    // QUALITY CHECK: If AI only created 1 action, encourage more thorough research
    if (plan.actions.length === 1 && sessionState.files && sessionState.files.length > 0) {
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `WARNING: AI only created 1 action. Encouraging more thorough research.`);
      
      // Add a complementary search action to ensure thorough coverage
      const firstAction = plan.actions[0];
      if (firstAction.type === 'analyzeFileStructure') {
        // If only analyzing structure, also add a pattern search
        plan.actions.push({
          type: 'searchPattern',
          params: { 
            pattern: '.{10,}',
            options: { maxResults: 20, contextLines: 3 }
          },
          reason: 'Complementary: Search for substantial content to supplement structure analysis',
          executed: false
        });
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Added complementary searchPattern action to ensure thorough research`);
      } else if (firstAction.type === 'searchPattern') {
        // If only doing pattern search, also try to analyze structure
        plan.actions.push({
          type: 'analyzeFileStructure',
          params: { fileName: sessionState.files[0].name },
          reason: 'Complementary: Analyze document structure to provide complete context',
          executed: false
        });
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Added complementary analyzeFileStructure action to ensure thorough research`);
      }
    }
    
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
    let finalResponse = reasoningResponse;
    const MAX_ACTIONS = 20;
    let totalActionsExecuted = 0;
    
    for (const [index, action] of plan.actions.entries()) {
      const logHelper = { sessionId };
      if (totalActionsExecuted >= MAX_ACTIONS) {
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Stopping execution after ${MAX_ACTIONS} actions to prevent infinite loops`);
        if (progressCallback) {
          progressCallback({
            type: 'thinking',
            content: `Stopped execution after ${MAX_ACTIONS} actions to prevent infinite loops`
          });
        }
        break;
      }
      
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Executing action ${index + 1}/${plan.actions.length}:\n  Type: ${action.type}\n  Params: ${JSON.stringify(action.params)}\n  Reason: ${action.reason}`);
      
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { 
            actionType: action.type,
            actionParams: action.params,
            actionReason: action.reason || '',
            actionIndex: index,
            totalActions: plan.actions.length,
            isLastAction: index === plan.actions.length - 1
          }
        });
      }
      
      const actionResult = await this.executeAction(action, sessionId);
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Action ${index + 1} completed:\n  Success: ${actionResult.success}\n  Result count: ${actionResult.resultCount}\n  Requires followup: ${actionResult.requiresFollowup}`);
      
      sessionState.actionHistory.push({
        action,
        result: actionResult,
        timestamp: new Date().toISOString()
      });
      
      totalActionsExecuted++;
      
      // OPTIMIZATION: Early Stopping - evaluate if we have enough data
      // Calculate total data gathered so far
      const totalDataGathered = sessionState.actionHistory.reduce((sum, entry) => {
        return sum + (entry.result?.resultCount || 0);
      }, 0);
      
      // Early stopping criteria: if we have sufficient data after at least 2 actions
      if (totalActionsExecuted >= 2 && totalDataGathered > 80) {
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `OPTIMIZATION: Early stopping triggered - gathered ${totalDataGathered} results from ${totalActionsExecuted} actions (sufficient data)`);
        if (progressCallback) {
          progressCallback({
            type: 'thinking',
            content: `Gathered sufficient data (${totalDataGathered} results). Proceeding to analysis instead of executing remaining actions.`
          });
        }
        break;
      }
      
      // AUTO-TRIGGER: If action returns 0 results and it's the first/second action, force additional search
      if (actionResult.resultCount === 0 && totalActionsExecuted <= 2 && index === plan.actions.length - 1) {
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Action ${index + 1} returned 0 results. Auto-triggering additional search strategies.`);
        
        // Add fallback search actions based on the failed action type
        const fallbackActions = [];
        
        if (action.type === 'analyzeFileStructure') {
          // If structure analysis failed, try broad pattern search
          fallbackActions.push({
            type: 'searchPattern',
            params: { pattern: '.+', options: { maxResults: 20 } },
            reason: 'Fallback: Broad search after structure analysis returned no results',
            executed: false
          });
        }
        
        if (action.type === 'searchPattern' && sessionState.files && sessionState.files.length > 0) {
          // If pattern search failed, try different patterns
          const fileName = sessionState.files[0].name;
          fallbackActions.push({
            type: 'searchPattern',
            params: { pattern: '[\\w\\s]+', options: { maxResults: 30, files: [fileName] } },
            reason: 'Fallback: Alternative pattern search in specific file',
            executed: false
          });
        }
        
        if (fallbackActions.length > 0) {
          log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
            `Adding ${fallbackActions.length} fallback actions to plan`);
          plan.actions.push(...fallbackActions);
        }
      }
      if (progressCallback && totalActionsExecuted === 2) {
        progressCallback({
          type: 'processing',
          data: { count: totalActionsExecuted }
        });
      }
      if (progressCallback) {
        const resultCount = Array.isArray(actionResult.results) ? actionResult.results.length : (actionResult.resultCount || 0);
        progressCallback({
          type: 'reading_complete',
          data: { 
            pageCount: resultCount,
            actionType: action.type,
            actionIndex: index,
            success: actionResult.success
          }
        });
      }
      try {
        const structured = {
          action: action.type,
          params: action.params,
          success: Boolean(actionResult.success),
          resultCount: Array.isArray(actionResult.results) ? actionResult.results.length : (actionResult.resultCount || 0),
          results: Array.isArray(actionResult.results) ? actionResult.results.map(r => ({
            fileName: r.fileName || r.source || r.url || '(unknown)',
            lineNumber: r.lineNumber || r.line || null,
            url: r.url || (typeof r.source === 'string' && r.source.startsWith('http') ? r.source : null),
            snippet: (r.context || r.preview || r.snippet || r.text || r.content || '').toString().substring(0, 800),
            error: r.error || undefined
          })) : []
        };

        progressCallback({
          type: 'action_result',
          content: `Action ${index + 1} results ready`,
          data: structured
        });
      } catch (e) {
        log('RE+ACT: Failed to emit structured action_result', e);
      }
      // OPTIMIZATION: Only call followup if action failed (0 results) or explicitly marked as requiring followup
      // This prevents ~7,958 tokens waste from non-adaptive followup calls
      const resultCount = Array.isArray(actionResult.results) ? actionResult.results.length : (actionResult.resultCount || 0);
      const shouldCallFollowup = !actionResult.success || resultCount === 0 || actionResult.requiresFollowup === true;
      
      if (shouldCallFollowup) {
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Building followup prompt for action ${index + 1} (success: ${actionResult.success}, resultCount: ${resultCount})`);
        
        const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, index);
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Followup prompt built (${followupPrompt.length} chars):\n---FOLLOWUP PROMPT START---\n${followupPrompt}\n---FOLLOWUP PROMPT END---`);
        
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Sending followup prompt to AI`);
        
        const followupResult = await this.makeAIRequest(followupPrompt, sessionId);
        finalResponse = followupResult.content;
        
        // CRITICAL FIX: Parse actions from content (main response), NOT reasoning_content
        // reasoning_content contains internal thinking with dirty tags like </think>, "SEARCH ACTION COMPLETED", etc
        // content contains clean ACTION format that parser expects
        let sourceForParsing = followupResult.content;
        
        if (followupResult.reasoning_content) {
          log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
            `Followup included reasoning_content (${followupResult.reasoning_content.length} chars) - will be used for logging only`);
        }
        
        if (followupResult.usage) {
          usageBreakdown.push({
            stage: 'reasoning-followup',
            usage: followupResult.usage,
            provider: sessionState.model.provider,
            model: sessionState.model.model,
          });
        }
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Received followup response (${sourceForParsing.length} chars):\n---FOLLOWUP RESPONSE START---\n${sourceForParsing}\n---FOLLOWUP RESPONSE END---`);
        
        const additionalPlan = this.parseReasoningResponse(sourceForParsing);
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Parsed additional plan: ${additionalPlan.actions.length} actions`);
        
        if (additionalPlan.actions.length > 0 && totalActionsExecuted < MAX_ACTIONS) {
          const validActions = additionalPlan.actions.filter(action => {
            return action.type && action.params && Object.keys(action.params).length > 0;
          });
          
          log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
            `Filtered valid actions: ${validActions.length}/${additionalPlan.actions.length}\nValid actions: ${JSON.stringify(validActions, null, 2)}`);
          
          if (validActions.length > 0) {
            log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
              `AI requested ${validActions.length} additional actions, adding to plan`);
            if (progressCallback) {
              progressCallback({
                type: 'thinking',
                content: `\nAI requested ${validActions.length} additional actions, continuing analysis...`
              });
            }
            plan.actions.push(...validActions);
          } else {
            log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
              `AI requested additional actions but all were invalid, stopping execution`);
            break;
          }
        }
      } else {
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `OPTIMIZATION: Skipping followup call for action ${index + 1} - has ${resultCount} results and successful (non-adaptive followup)`);
      }
    }
    
    if (sessionState.actionHistory.length > 0) {
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Building synthesis prompt from ${sessionState.actionHistory.length} actions`);
      
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
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Synthesis prompt built (${synthesisPrompt.length} chars):\n---SYNTHESIS PROMPT START---\n${synthesisPrompt}\n---SYNTHESIS PROMPT END---`);
      
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Sending synthesis prompt to AI`);
      
      const synthesisResult = await this.makeAIRequest(synthesisPrompt, sessionId);
      finalResponse = synthesisResult.content;
      if (synthesisResult.usage) {
        usageBreakdown.push({
          stage: 'reasoning-synthesis',
          usage: synthesisResult.usage,
          provider: sessionState.model.provider,
          model: sessionState.model.model,
        });
      }
      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
        `Received synthesis response (${finalResponse.length} chars):\n---SYNTHESIS RESPONSE START---\n${finalResponse}\n---SYNTHESIS RESPONSE END---`);
    }
    
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
      `Completed processing with ${sessionState.actionHistory.length} actions executed`);
    
    let hasText = typeof finalResponse === "string" && finalResponse.trim().length > 0;
    let looksLikePlanOnly = hasText && /(^|\n)\s*PLAN\s*:|^\s*\*\*REASONING\*\*|^REASONING:/i.test(finalResponse) && !/FINAL ANSWER|JAWABAN AKHIR|KESIMPULAN|SOLUTION|SOLUSI/i.test(finalResponse);
    if (hasText) {
      finalResponse = finalResponse.replace(/^Based on the (content|search analysis|findings?|results?)\.?\s*/i, '');
      finalResponse = finalResponse.replace(/^Here is (my|the) analysis:?\s*/i, '');
      finalResponse = finalResponse.replace(/^I have analyzed your project files?:?\s*/i, '');
      finalResponse = finalResponse.replace(/^(\*\*)?REASONING(\*\*)?:\s*(.*?)(?=\n\n|\n?$)/s, '$3');
      finalResponse = finalResponse.replace(/^(\*\*)?PLAN(\*\*)?:\s*(.*?)(?=\n\n|\n?$)/s, '$3');
    }

    if (!hasText || looksLikePlanOnly) {
      const planText = typeof plan === "string" ? plan : JSON.stringify(plan);
      
      // CRITICAL FIX: DO NOT include full file content - it causes 137K token prompts!
      // Instead, provide file metadata and summary only
      const fileList = Array.isArray(sessionState.files) 
        ? sessionState.files.map(f => `- ${f.name} (${f.type}, ${f.size || 'unknown size'})`).join("\n")
        : "(No files available)";
      
      const actionSummary = sessionState.actionHistory.length > 0
        ? this.prepareActionSummary(sessionState.actionHistory).summaryText
        : "(No search actions executed)";
      
      const finalPrompt = [
        "Complete the user's request based on the following plan and search results.",
        "",
        "PLAN:",
        String(planText || ""),
        "",
        "AVAILABLE FILES:",
        fileList,
        "",
        "SEARCH RESULTS:",
        actionSummary,
        "",
        "Provide a comprehensive final answer based on the plan and search results above. Do NOT request additional searches."
      ].join("\n");
      
      const synthesisResult = await this.makeAIRequest(finalPrompt, sessionId);
      const synthesized = synthesisResult.content;
      if (synthesisResult.usage) {
        usageBreakdown.push({
          stage: 'reasoning-final',
          usage: synthesisResult.usage,
          provider: sessionState.model.provider,
          model: sessionState.model.model,
        });
      }
      finalResponse = typeof synthesized === "string" ? synthesized : "";
    }    return {
      response: finalResponse,
      actionsExecuted: sessionState.actionHistory.length,
      searchResults: sessionState.actionHistory.map(h => h.result),
      reasoning: plan.reasoning,
      usageBreakdown
    };
  }

  
  buildSynthesisPrompt(userQuery, actionHistory, sessionState) {
    const { summaryText, webSources } = this.prepareActionSummary(actionHistory);
    const hasFiles = Array.isArray(sessionState.files) && sessionState.files.length > 0;
    const fileList = hasFiles
      ? sessionState.files.slice(0, 20).map(f => `- ${f.name} (${f.type})`).join('\n')
      : '- Tidak ada file lokal yang tersedia untuk sesi ini.';
    const webSourcesSection = webSources.length > 0
      ? webSources.slice(0, 6).map((item, idx) => `${idx + 1}. ${item.url} -> ${item.snippet || '(ringkasan tidak tersedia)'}`).join('\n')
      : 'Tidak ada sumber web yang berhasil diambil.';
    const userLanguage = this.detectUserLanguage(userQuery, sessionState);
    
    // Count total results from all actions
    const totalResults = actionHistory.reduce((sum, entry) => {
      return sum + (entry.result?.resultCount || 0);
    }, 0);
    
    // Determine confidence level based on results
    const hasGoodData = totalResults > 50;
    const confidenceInstruction = hasGoodData
      ? 'IMPORTANT: You have extensive data from the files. Be CONFIDENT and COMPREHENSIVE in your final answer. Provide detailed insights based on the data you found. Do NOT use disclaimers like "keterbatasan" or "perlu verifikasi" - you have direct access to the content.'
      : 'You have gathered data from the files. Provide your final analysis based on what was found during the search phase.';

    return `You are an expert research assistant providing the FINAL ANSWER based on completed search results.

=== THIS IS THE FINAL SYNTHESIS PHASE ===
All search actions have been completed. Your task is to provide a comprehensive final answer based ONLY on the data gathered below.

DO NOT REQUEST ADDITIONAL SEARCHES. This is the conclusion phase.

ACTION LOG (Search Results):
${summaryText || 'Tidak ada aksi yang dieksekusi.'}

PRIMARY WEB SOURCES:
${webSourcesSection}

PROJECT FILE CONTEXT:
${fileList}

TOTAL DATA GATHERED: ${totalResults} results from ${actionHistory.length} completed search actions

USER QUESTION:
"""${userQuery}"""

${confidenceInstruction}

FINAL ANSWER REQUIREMENTS:
- Jawab dalam bahasa pengguna (detected: ${userLanguage})
- Sertakan <thinking>...</thinking> untuk proses analisis internal
- BE COMPREHENSIVE: Extract and synthesize ALL relevant information from the search results above
- BE CONFIDENT: You have direct access to file content - present findings authoritatively
- Cite specific details: line numbers, function names, actual code snippets from the results
- DO NOT say "kemungkinan", "mungkin", "tampaknya" if you have concrete data in the results
- DO NOT add disclaimers about "keterbatasan" or "perlu membuka file" - the data is already provided above
- When a source includes a URL, format it as a Markdown link: [**Summarized Title Max 4 Words**](URL)

CRITICAL INSTRUCTION:
DO NOT REQUEST MORE SEARCHES - This is the final answer phase, All searches are completed
DO NOT suggest "additional searches needed" - Work with the ${totalResults} results provided

MANDATORY STRUCTURE YOUR FINAL ANSWER:
1. <thinking>Brief analysis of the search results</thinking>
2. Direct findings from the search results (specific, with line numbers and code excerpts)
3. Comprehensive analysis and insights
4. Clear conclusion that answers the user's question

Remember: Provide a FINAL, CONCLUSIVE answer. No follow-up searches. You have ${totalResults} pieces of data - use them to give a complete response.`;
  }

  
  buildReasoningPrompt(userQuery, sessionState) {
    const hasFiles = Array.isArray(sessionState.files) && sessionState.files.length > 0;
    const fileList = hasFiles
      ? sessionState.files.map(f => `- ${f.name} (${f.type})`).join('\n')
      : '- (Tidak ada file proyek yang tersedia, gunakan riset web sebagai sumber utama)';

    const webFocusNote = !hasFiles
      ? '\nFOKUS: Tidak ada file lokal, jadi rencanakan minimal satu tindakan research menggunakan webSearch/fetchWebPage untuk mendapatkan informasi yang relevan.'
      : '';

    return `You are an autonomous research agent with access to project files and live internet tools.

The current date is ${new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric' })}. Use this date for any time-sensitive information or web searches.

USER FILES:
${fileList}

AVAILABLE SEARCH CAPABILITIES (Use these to create your action plan):
These are the ONLY capabilities you can use. DO NOT invent new ones like "searchWithLines", "getFileContent", etc.

1. searchPattern(pattern, options) - Search for text pattern across all files
   Parameters:
   - pattern: The text or regex pattern to search for
   - options: {
       file: "fileName.js" (optional - search specific file only),
       fileName: "fileName.js" (alias for file),
       contextLines: 10-80 (default: 3 - number of surrounding lines to include),
       maxResults: number (optional - limit results)
     }
   Examples:
   - searchPattern with {"pattern": "async function", "options": {"contextLines": 30}}
   - searchPattern with {"pattern": "buildSynthesisPrompt", "options": {"file": "reasoning-action-agent.js", "contextLines": 50}}
   - searchPattern with {"pattern": "IPC.*handler", "options": {"contextLines": 20, "maxResults": 10}}
   
   CRITICAL contextLines guidance:
   - For function definitions: Use 30-80 lines to get complete function body
   - For small snippets: Use 10-20 lines for local context
   - For class definitions: Use 50-100 lines to get full class structure
   - If results show "Multiple fragments", increase contextLines to get continuous block

2. searchFunctions(functionName) - Find function definitions and declarations
   Parameters:
   - functionName: The exact or partial function name to search
   Examples:
   - searchFunctions with {"functionName": "buildSynthesisPrompt"}
   - searchFunctions with {"functionName": "executeAction"}
   Note: Results may show function signature + some body. For COMPLETE function, use searchPattern with high contextLines.

3. searchCSS(selector) - Find CSS selectors, classes, or IDs
   Parameters:
   - selector: The CSS selector to search (e.g., ".class-name", "#id", "element")
   Examples:
   - searchCSS with {"selector": ".chat-message"}
   - searchCSS with {"selector": "#main-container"}

4. searchHTML(element) - Find HTML elements and tags
   Parameters:
   - element: The HTML element or tag to search
   Examples:
   - searchHTML with {"element": "button"}
   - searchHTML with {"element": "div class=\"container\""}

5. searchImports(moduleName) - Find import/require statements
   Parameters:
   - moduleName: The module name to search for in imports
   Examples:
   - searchImports with {"moduleName": "electron"}
   - searchImports with {"moduleName": "langchain"}

6. analyzeFileStructure(fileName) - Get comprehensive file structure summary
   Parameters:
   - fileName: The exact file name to analyze
   Returns: Functions, classes, imports, exports, line count, file type
   Examples:
   - analyzeFileStructure with {"fileName": "reasoning-action-agent.js"}
   - analyzeFileStructure with {"fileName": "renderer.js"}
   Note: Use this FIRST to understand file organization, then use searchPattern for details.

7. listAvailableFiles() - List all uploaded files with metadata
   Parameters: None (no parameters required)
   Returns: File names, types, sizes, line counts
   Example:
   - listAvailableFiles with {}
   Note: Use this to discover what files are available before searching.

${sessionState.capabilities?.supportsWebSearch ? `8. webSearch(query, options) - Search the internet for real-time information
   Parameters:
   - query: The search query string
   - options: { maxResults: number (optional) }
   Examples:
   - webSearch with {"query": "LangChain agent implementation", "options": {"maxResults": 5}}
   
9. fetchWebPage(url, options) - Download and extract content from a webpage
   Parameters:
   - url: The full URL to fetch
   - options: { timeout: number (optional) }
   Examples:
   - fetchWebPage with {"url": "https://example.com/docs"}` : ''}

SEARCH STRATEGY GUIDELINES:
- START BROAD: Use analyzeFileStructure or listAvailableFiles to understand project structure
- BE SPECIFIC: Use searchPattern with file parameter to narrow down searches
- GET COMPLETE CONTEXT: Use contextLines 30-80 for function definitions (not just 3-5 lines)
- HANDLE FRAGMENTS: If results show "Multiple fragments from same file", it means snippets are separated by many lines
  → Increase contextLines or search for specific function name to get continuous block
- VERIFY COMPLETENESS: Check if code has balanced braces {}. If not, request higher contextLines
- AVOID REDUNDANCY: Don't search for the same information multiple times
- PLAN 2-3+ ACTIONS: Create comprehensive plan, not just one action

CONTEXT COMPLETENESS INDICATORS (Use these to plan contextLines):
- [Context: COMPLETE] = Full definition with balanced braces, sufficient lines
- [Context: PARTIAL - Multiple fragments] = Scattered references from different locations in same file
  → Need broader contextLines or different search approach
- [Context: PARTIAL - Incomplete snippets] = Truncated results, missing structure
  → Increase contextLines (try 50-80 for functions)
- [Context: INSUFFICIENT] = Very limited data
  → Try different search terms or broader pattern

USER QUERY: "${userQuery}"

${CRITICAL_INSTRUCTIONS}${webFocusNote}


[MANDATORY] Respond with this exact template:
REASONING: [Your comprehensive thought process - explain what you need to find and WHY multiple searches are necessary. Consider what contextLines values you'll need for each search.]

PLAN:
1. ACTION: <toolName> with {complete parameters including contextLines if applicable}
   WHY: <specific reason - what info you expect to get and why contextLines value chosen>
2. ACTION: <toolName> with {complete parameters including contextLines if applicable}
   WHY: <specific reason>
3. ACTION: <toolName> with {complete parameters including contextLines if applicable}
   WHY: <specific reason>
[Add more actions as needed - minimum 2-3 actions required for thorough research]

CURRENT THINKING: [What you expect to learn from these actions and how they will comprehensively answer the user's question]`;
  }

  
  detectUserLanguage(userQuery, sessionState) {
    // Check if language is already set in session
    if (sessionState && sessionState.language && sessionState.language !== 'autodetect') {
      return sessionState.language === 'indonesia' ? 'id' : 'en';
    }
    
    // If autodetect, proceed with language detection logic
    
    /**
     * Comprehensive code pattern detection
     * Extracts code blocks to prevent false language detection
     */
    const codePatterns = [
      // JavaScript/TypeScript
      /(?:function|const|let|var|class|interface|type|enum)\s+\w+/gi,
      /=>\s*[{(]/g,
      /(?:import|export|from|require)\s+.*?['"][^'"]*['"]/gi,
      /\.\w+\([^)]*\)/g,  // method calls
      /new\s+\w+\s*\(/gi,
      /(?:async|await|return|yield|throw)\s+/gi,
      
      // HTML/JSX/XML
      /<\/?[a-z][\s\S]*?>/gi,
      
      // Object/Array literals
      /\{[^{}]*:[^{}]*\}/g,
      /\[[^\]]*\]/g,
      
      // Common operators and syntax
      /===?|!==?|&&|\|\||<<|>>|[+\-*/%]=?/g,
      /\?\.|\.{3}|\?:/g,
      
      // URLs
      /https?:\/\/[^\s]+/gi,
      
      // File paths
      /[./][\w/.\\-]+\.\w{2,4}/g,
      
      // Regex patterns in code
      /\/[^/\n]+\/[gimuy]*/g,
    ];
    
    // Extract code sections
    let codeSections = [];
    codePatterns.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(userQuery)) !== null) {
        codeSections.push({
          start: match.index,
          end: match.index + match[0].length
        });
      }
    });
    
    // Merge overlapping sections
    codeSections.sort((a, b) => a.start - b.start);
    const mergedCodeSections = [];
    let current = null;
    
    for (const section of codeSections) {
      if (!current) {
        current = { ...section };
      } else if (section.start <= current.end + 5) { // 5 char tolerance
        current.end = Math.max(current.end, section.end);
      } else {
        mergedCodeSections.push(current);
        current = { ...section };
      }
    }
    if (current) mergedCodeSections.push(current);
    
    // Extract natural language text (non-code)
    let naturalTextSegments = [];
    let lastEnd = 0;
    
    for (const section of mergedCodeSections) {
      if (section.start > lastEnd) {
        const segment = userQuery.substring(lastEnd, section.start).trim();
        if (segment.length > 0) {
          naturalTextSegments.push(segment);
        }
      }
      lastEnd = section.end;
    }
    
    // Remaining text after last code section
    if (lastEnd < userQuery.length) {
      const segment = userQuery.substring(lastEnd).trim();
      if (segment.length > 0) {
        naturalTextSegments.push(segment);
      }
    }
    
    // If no natural text found, use original (likely no code)
    const naturalText = naturalTextSegments.length > 0 
      ? naturalTextSegments.join(' ') 
      : userQuery;
    
    const cleanQuery = naturalText.trim();
    
    // Calculate metrics
    const totalLength = userQuery.length;
    const naturalLength = cleanQuery.length;
    const codeDensity = 1 - (naturalLength / totalLength);
    
    
    // ===== PHASE 2: INDONESIAN DETECTION =====
    
    /**
     * ABSOLUTE Indonesian indicators (particles & slang)
     * These words NEVER appear in natural English
     * Single occurrence = GUARANTEED Indonesian user
     */
    const absoluteIndonesianIndicators = [
      // Particles (100% Indonesian, no English equivalent)
      'dong', 'sih', 'nih', 'deh', 'kok', 'lho', 'kan',
      
      // Pronouns (distinctly Indonesian)
      'gue', 'gw', 'lu', 'lo', 'ane', 'ente',
      
      // Slang negations
      'gak', 'nggak', 'ngga', 'ga', 'kaga',
      
      // Informal intensifiers
      'banget', 'bgt', 'pisan',
      
      // Polite forms
      'mas', 'mbak', 'bang', 'kak', 'pak', 'bu',
      
      // Common Indonesian-only words
      'gimana', 'kenapa', 'emang', 'udah', 'udh',
      'bikin', 'liat', 'kasih', 'makasih', 'tolong',
      
      // Abbreviations
      'yg', 'dgn', 'utk', 'krn', 'jd', 'tp', 'sm'
    ];
    
    /**
     * Strong Indonesian indicators
     * These words are uniquely Indonesian and rarely appear in English
     * Multiple occurrences strongly suggest Indonesian
     */
    const strongIndonesianIndicators = [
      // Question words
      'apa', 'bagaimana', 'dimana', 'kemana', 'darimana', 
      'kapan', 'mengapa', 'siapa',
      
      // Pronouns & particles
      'yang', 'dengan', 'untuk', 'dari', 'pada', 'kepada',
      'saya', 'aku', 'kamu', 'kami', 'kita', 'mereka',
      'nya', 'ku', 'mu',
      
      // Verbs & auxiliaries
      'adalah', 'akan', 'telah', 'sudah', 'sedang', 'belum',
      'bisa', 'dapat', 'harus', 'boleh', 'mau', 'ingin',
      
      // Common words
      'ini', 'itu', 'tersebut', 'dan', 'atau', 'tetapi',
      'juga', 'hanya', 'saja', 'bahkan', 'kalau', 'jika',
      'memang', 'sama', 'kayak', 'kaya',
      
      // Polite forms
      'mohon', 'terima kasih',
      
      // Action verbs
      'coba', 'lihat', 'ambil', 'taruh', 'simpen', 
      'hapus', 'ganti', 'buat',
      
      // Adjectives
      'bagus', 'jelek', 'baik', 'buruk', 'benar', 'salah',
      'besar', 'kecil', 'panjang', 'pendek', 'banyak', 'sedikit'
    ];
    
    /**
     * Common English words that might appear in Indonesian text
     * but should not count as English if Indonesian words are present
     */
    const ambiguousWords = new Set([
      'function', 'class', 'return', 'import', 'export',
      'component', 'props', 'state', 'hook', 'render',
      'data', 'user', 'api', 'error', 'success',
      'id', 'name', 'type', 'value', 'key',
      'is', 'in', 'on', 'at', 'to', 'for', 'of', 'with'
    ]);
    
    /**
     * Strong English indicators
     * Common English words that are distinctly English
     */
    const strongEnglishIndicators = [
      // Question words
      'what', 'how', 'why', 'when', 'where', 'who', 'which',
      
      // Common verbs
      'does', 'did', 'has', 'have', 'had', 'will', 'would',
      'should', 'could', 'can', 'may', 'might', 'must',
      
      // Pronouns
      'the', 'this', 'that', 'these', 'those',
      'your', 'yours', 'their', 'theirs', 'our', 'ours',
      
      // Prepositions & conjunctions
      'about', 'through', 'during', 'before', 'after',
      'above', 'below', 'between', 'among', 'into',
      'onto', 'upon', 'within', 'without',
      
      // Common phrases
      'please', 'thank', 'thanks', 'sorry', 'excuse',
      'want', 'need', 'make', 'help', 'know', 'think',
      'understand', 'explain', 'show', 'tell', 'give',
      
      // Adverbs
      'very', 'really', 'quite', 'just', 'only', 'also',
      'always', 'never', 'sometimes', 'often', 'usually',
      
      // Be verb forms
      'am', 'are', 'was', 'were', 'been', 'being'
    ];
    
    
    // ===== PHASE 3: SCORING SYSTEM =====
    
    const lowerQuery = cleanQuery.toLowerCase();
    let indonesianScore = 0;
    let englishScore = 0;
    
    // Check ABSOLUTE Indonesian indicators first (instant return)
    let hasAbsoluteIndonesian = false;
    
    for (const word of absoluteIndonesianIndicators) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(lowerQuery)) {
        hasAbsoluteIndonesian = true;
        break; // Found one = enough!
      }
    }
    
    // If absolute indicator found, immediately return Indonesian
    if (hasAbsoluteIndonesian) {
      return 'id';
    }
    
    // Count strong Indonesian indicators
    let hasStrongIndonesian = false;
    const foundIndonesianWords = [];
    
    for (const word of strongIndonesianIndicators) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerQuery.match(regex);
      if (matches) {
        const count = matches.length;
        indonesianScore += count * 3; // Strong weight
        hasStrongIndonesian = true;
        foundIndonesianWords.push(word);
      }
    }
    
    // Count strong English indicators (skip ambiguous words)
    const foundEnglishWords = [];
    
    for (const word of strongEnglishIndicators) {
      if (ambiguousWords.has(word)) continue;
      
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerQuery.match(regex);
      if (matches) {
        const count = matches.length;
        englishScore += count;
        foundEnglishWords.push(word);
      }
    }
    
    // Additional Indonesian patterns
    
    // Affixes detection (ber-, me-, ter-, ke-an, -kan, -nya)
    const affixPatterns = [
      /\b(ber|me|ter|pe)\w{3,}\b/g,    // prefix
      /\b\w{3,}(kan|nya|an|i)\b/g       // suffix
    ];
    
    affixPatterns.forEach(pattern => {
      const matches = lowerQuery.match(pattern);
      if (matches) {
        indonesianScore += matches.length * 1.5;
      }
    });
    
    // Repeated letters (common in Indonesian slang: gaksss, yaaaa)
    const repeatedPattern = /(\w)\1{2,}/g;
    const repeats = lowerQuery.match(repeatedPattern);
    if (repeats) {
      indonesianScore += repeats.length * 0.5;
    }
    
    
    // ===== PHASE 4: DECISION LOGIC =====
    
    /**
     * Critical Rule: Strong Indonesian word = Indonesian user
     * Indonesians often mix English technical terms with Indonesian
     * Example: "gimana cara bikin function ini?" → Indonesian
     */
    if (hasStrongIndonesian) {
      return 'id';
    }
    
    /**
     * If no strong indicators found, compare scores
     */
    if (indonesianScore === 0 && englishScore === 0) {
      // No clear signals, default to English
      return 'en';
    }
    
    // Adjust for code density
    // Heavy code might inflate English score due to keywords
    if (codeDensity > 0.5) {
      englishScore *= 0.7;
    }
    
    // Final decision
    return indonesianScore > englishScore ? 'id' : 'en';
  }

  
  parseReasoningResponse(response) {
    const plan = {
      reasoning: '',
      actions: [],
      thinking: ''
    };
    const reasoningMatch = response.match(/REASONING:\s*(.*?)(?=\n\nPLAN:|$)/s);
    if (reasoningMatch) {
      plan.reasoning = reasoningMatch[1].trim();
    }
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
          log(`Could not parse action parameters: ${cleaned}`);
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
        let reason = reasonMatch[1].trim();
        
        // CRITICAL FIX: Stop reason at next action or invalid content
        const stopPatterns = [
          /\n\d+\.\s*ACTION:/i,                    // Next numbered action: "2. ACTION:"
          /\n\s*ACTION:/i,                          // Next plain action: "ACTION:"
          /\n\s*SEARCH ACTION COMPLETED:/i,        // AI premature synthesis
          /\n\s*FINAL ANSWER:/i,                   // AI skipping to conclusion
          /\n\s*Based on these search results/i,   // AI continuing synthesis narrative
          /\nsekarang\s+kamu/i,                     // User query leaked into reason (Indonesian)
          /\nnow\s+you/i,                           // User query leaked into reason (English)
          /\n\n/                                     // Double newline = paragraph break = new section
        ];
        
        for (const pattern of stopPatterns) {
          const idx = reason.search(pattern);
          if (idx !== -1) {
            reason = reason.slice(0, idx).trim();
            break;
          }
        }
        
        // Clean up AI thinking tags and user query remnants
        reason = reason
          .replace(/<\/?think>/gi, '')           // Remove thinking tags
          .replace(/\nsekarang kamu.*/gi, '')    // Remove leaked Indonesian user queries
          .replace(/\nnow you.*/gi, '')          // Remove leaked English user queries
          .trim();
        
        return reason;
      }

      return text.trim();
    };

    const planSection = extractPlanSection();

    if (planSection) {
      // Updated regex to handle function names with optional parentheses: listAvailableFiles()
      const actionPattern = /(\d+)\.\s*ACTION:\s*[`*]?([A-Za-z0-9_]+(?:\(\))?)[`*]?\s*with\s*/gi;
      const matches = Array.from(planSection.matchAll(actionPattern));

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        // Remove parentheses from action type if present (normalize to function name only)
        const actionType = match[2].trim().replace(/\(\)$/, '');
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
    if (plan.actions.length === 0) {
      try {
        const tableMatch = response.match(/\n\s*\|\s*#\s*\|[\s\S]*?\n\s*\|[-\s|:]+\n([\s\S]*?)\n\s*\n/);
        if (tableMatch && tableMatch[1]) {
          const rows = tableMatch[1].trim().split(/\n+/);
          for (const row of rows) {
            const cols = row.split('|').map(c => c.trim()).filter((v,i) => v !== '' || i>0);
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
      }
    }
    
    // CRITICAL FIX: Parse plain ACTION format (without numbering or PLAN header)
    // Handles followup responses like: "ACTION: searchPattern with {...}\nWHY: ..."
    if (plan.actions.length === 0) {
      try {
        // Match ACTION without numbering: "ACTION: searchPattern with {...}"
        const plainActionPattern = /ACTION:\s*[`*]?([A-Za-z0-9_]+(?:\(\))?)[`*]?\s*with\s*/gi;
        const matches = Array.from(response.matchAll(plainActionPattern));
        
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const actionType = match[1].trim().replace(/\(\)$/, '');
          const blockStart = match.index ?? 0;
          const blockEnd = i + 1 < matches.length ? matches[i + 1].index : response.length;
          const block = response.slice(blockStart, blockEnd);
          
          const afterWith = block.slice(match[0].length).trim();
          const { paramsSource, remainder } = extractParameters(afterWith);
          const params = parseActionParams(paramsSource);
          const reason = extractReason(remainder);
          
          // Only add if params are valid
          if (params && Object.keys(params).length > 0) {
            plan.actions.push({
              type: actionType,
              params,
              reason,
              executed: false
            });
          }
        }
      } catch (e) {
        // Silent fail - fallback didn't work
      }
    }
    
    const thinkingMatch = response.match(/CURRENT THINKING:\s*(.*?)$/s);
    if (thinkingMatch) {
      plan.thinking = thinkingMatch[1].trim();
    }

    return plan;
  }

  
  async executeAction(action, sessionId) {
    const logHelper = { sessionId };
    log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
      `Starting action execution:\n  Type: ${action.type}\n  Params: ${JSON.stringify(action.params, null, 2)}`);

    try {
      const result = await this.searchEngine.executeSearchCommand(action.type, action.params);
      log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
        `Search engine returned: ${Array.isArray(result) ? result.length : 1} raw results`);
      
      const limitedResult = this.limitSearchResults(result, 100);
      const resultCount = Array.isArray(result) ? result.length : (result ? 1 : 0);

      log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
        `Action ${action.type} completed successfully:\n  Total results: ${resultCount}\n  Limited results: ${Array.isArray(limitedResult) ? limitedResult.length : 1}\n  Full result preview:\n${JSON.stringify(limitedResult, null, 2).substring(0, 1000)}...`);

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
      log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
        `Action ${action.type} failed with error:\n  Message: ${error.message}\n  Stack: ${error.stack}`);
      return {
        success: false,
        action: action.type,
        params: action.params,
        error: error.message,
        requiresFollowup: false
      };
    }
  }

  
  limitSearchResults(results, maxLines = 100) {
    if (!Array.isArray(results)) return results;

    // CRITICAL FIX: Increase maxLines for function searches
    // Functions can be 50-100 lines, need enough budget to show full context
    let totalLines = 0;
    const limitedResults = [];
    
    // Check if this is a function search result (has function keyword in first result)
    const isFunctionSearch = results.length > 0 && results[0].context && 
      /function\s+\w+|const\s+\w+\s*=\s*\(|class\s+\w+/.test(results[0].context);
    
    // Increase budget for function searches
    const bypassLineBudget = isFunctionSearch && results.length <= 10;
    const effectiveMaxLines = isFunctionSearch ? Math.max(maxLines, 800) : maxLines;
    
    for (const result of results) {
      const snippetSource = result.context || result.snippet || result.preview || result.text || result.content || '';
      const resultLines = typeof snippetSource === 'string' && snippetSource.length > 0
        ? snippetSource.split('\n').length
        : 1;

      if (bypassLineBudget || totalLines + resultLines <= effectiveMaxLines) {
        limitedResults.push(result);
        totalLines += resultLines;
      } else {
        // Only truncate if we already have at least 1 complete result
        if (limitedResults.length > 0) {
          limitedResults.push({
            ...result,
            context: `[TRUNCATED - Found ${results.length - limitedResults.length} more matches]`,
            truncated: true
          });
        } else {
          // If first result exceeds limit, still include it (don't lose data)
          limitedResults.push(result);
        }
        break;
      }
    }

    return limitedResults;
  }

  normalizeResultSnippet(result) {
    if (!result) return '';
    const raw = result.snippet || result.context || result.preview || result.text || result.content || '';
    if (typeof raw !== 'string') {
      return '';
    }
    
    // IMPROVED FORMATTING: Preserve line breaks and indentation for code readability
    // DON'T collapse whitespace - preserve code structure!
    const lines = raw.split('\n');
    const normalized = lines
      .filter(line => line.trim().length > 0)  // Remove empty lines
      .join('\n');
    
    // SMART LENGTH: For function definitions, allow MUCH longer snippets
    // Functions can be 50-100+ lines, need to show complete body
    const isFunctionSnippet = /^[\s>]*\d+:\s*(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+)/m.test(normalized);
    const maxLength = isFunctionSnippet ? 4000 : 1500; // 4000 chars for functions (100 lines), 1500 for others
    
    // DON'T truncate if close to limit - better to show complete function
    if (normalized.length <= maxLength * 1.1) {
      return normalized;
    }
    
    return normalized.slice(0, maxLength) + '\n... [truncated]';
  }

  /**
   * Analyze if search results contain complete/sufficient context
   * Returns 'COMPLETE', 'PARTIAL', or 'INSUFFICIENT'
   * 
   * FIXED: Now checks individual snippets AND their continuity
   * - Don't naively join all snippets (they might be from different locations!)
   * - Check if snippets are consecutive (adjacent line numbers)
   * - For function definitions, require ONE snippet with complete function
   */
  analyzeContextCompleteness(items = []) {
    if (items.length === 0) return 'INSUFFICIENT';
    
    // Extract line numbers from snippets to detect continuity
    const extractLineNumbers = (snippet) => {
      if (!snippet || typeof snippet !== 'string') return [];
      const lines = snippet.split('\n');
      const lineNumbers = [];
      
      for (const line of lines) {
        // Match patterns like "8642:" or ">8642:" at start of line
        const match = line.match(/^[\s>]*(\d+):/);
        if (match) {
          lineNumbers.push(parseInt(match[1], 10));
        }
      }
      return lineNumbers;
    };
    
    // Check each snippet individually for completeness
    let hasCompleteSnippet = false;
    let bestSnippetScore = 0;
    
    for (const item of items) {
      const raw = item.snippet || item.context || item.preview || item.text || item.content || '';
      if (typeof raw !== 'string' || raw.length < 30) continue;
      
      const lineNumbers = extractLineNumbers(raw);
      const lineCount = raw.split('\n').filter(l => l.trim().length > 0).length;
      
      // Check for function completeness in THIS snippet
      const hasFunctionKeyword = /function\s+\w+\s*\(/.test(raw);
      const hasArrowFunction = /\w+\s*=\s*\([^)]*\)\s*=>/.test(raw);
      const openBraceCount = (raw.match(/{/g) || []).length;
      const closeBraceCount = (raw.match(/}/g) || []).length;
      const hasBalancedBraces = openBraceCount > 0 && openBraceCount === closeBraceCount;
      
      // Check if snippet is truncated (ends mid-statement)
      const lastLine = raw.trim().split('\n').pop() || '';
      const endsWithIncompleteStatement = 
        lastLine.endsWith(',') || 
        lastLine.endsWith('{') ||
        lastLine.endsWith('(') ||
        /[a-zA-Z0-9_]$/.test(lastLine) && !lastLine.includes(';') && !lastLine.includes('}');
      
      // Score this snippet
      let score = 0;
      if (hasFunctionKeyword || hasArrowFunction) score += 3;
      if (hasBalancedBraces) score += 5;
      if (lineCount >= 10) score += 2;
      if (!endsWithIncompleteStatement) score += 2;
      if (lineNumbers.length >= 10) score += 1; // Has many consecutive lines
      
      // High score = complete snippet
      if (score >= 8) {
        hasCompleteSnippet = true;
      }
      
      bestSnippetScore = Math.max(bestSnippetScore, score);
    }
    
    // Check if snippets are consecutive (indicates they're from same block)
    const allLineNumbers = [];
    for (const item of items) {
      const raw = item.snippet || item.context || item.preview || item.text || item.content || '';
      if (typeof raw === 'string') {
        allLineNumbers.push(...extractLineNumbers(raw));
      }
    }
    
    allLineNumbers.sort((a, b) => a - b);
    let hasConsecutiveSnippets = false;
    if (allLineNumbers.length >= 2) {
      // Check if most line numbers are consecutive
      let consecutiveCount = 0;
      for (let i = 1; i < allLineNumbers.length; i++) {
        if (allLineNumbers[i] - allLineNumbers[i-1] <= 2) {
          consecutiveCount++;
        }
      }
      hasConsecutiveSnippets = consecutiveCount / (allLineNumbers.length - 1) > 0.7;
    }
    
    // COMPLETE: One snippet has complete function definition
    if (hasCompleteSnippet) {
      return 'COMPLETE';
    }
    
    // PARTIAL: Multiple snippets that might be consecutive
    if (hasConsecutiveSnippets && bestSnippetScore >= 5) {
      return 'PARTIAL';
    }
    
    // PARTIAL: Has some meaningful content
    if (bestSnippetScore >= 3) {
      return 'PARTIAL';
    }
    
    return 'INSUFFICIENT';
  }

  prepareActionSummary(actionHistory = []) {
    const summaries = [];
    const webSources = [];
    const seenUrls = new Set();

    actionHistory.forEach((entry, index) => {
      const action = entry.action || {};
      const result = entry.result || {};
      const header = `ACTION ${index + 1}: ${action.type || 'unknown'} with ${JSON.stringify(action.params || {})}`;

      if (!result.success) {
        const errorMessage = result.error || 'Unknown error';
        summaries.push(`${header}\nRESULT: FAILED - ${errorMessage}`);
        return;
      }

      // OPTIMIZATION: Use cached summary if available (from 2-tier summarization)
      if (entry.cachedSummary) {
        summaries.push(`${header}\nRESULTS:\n${entry.cachedSummary}`);
        
        // Extract URLs from cached summary for webSources
        const urlMatches = entry.cachedSummary.match(/\[(https?:\/\/[^\]]+)\]/g);
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.slice(1, -1); // Remove [ and ]
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              webSources.push({ url, snippet: `(cached from ${action.type})` });
            }
          });
        }
        return;
      }

      // SPECIAL HANDLING: listAvailableFiles returns array of file objects
      if (action.type === 'listAvailableFiles' && result.results && Array.isArray(result.results)) {
        const fileList = result.results.map(f => 
          `  - ${f.fileName} (${f.type}, ${f.lineCount.toLocaleString()} lines, ${f.sizeFormatted})`
        ).join('\n');
        
        summaries.push(`${header}\nRESULTS: Found ${result.results.length} files:\n${fileList}`);
        return;
      }

      // SPECIAL HANDLING: analyzeFileStructure returns object, not array
      if (action.type === 'analyzeFileStructure' && result.results && typeof result.results === 'object' && !Array.isArray(result.results)) {
        const structResult = result.results;
        const funcCount = structResult.structure?.functions?.length || 0;
        const classCount = structResult.structure?.classes?.length || 0;
        const importCount = structResult.structure?.imports?.length || 0;
        const lineCount = structResult.lineCount || 0;
        
        const summary = [
          `File: ${structResult.fileName}`,
          `Type: ${structResult.type}`,
          `Lines: ${lineCount.toLocaleString()}`,
          funcCount > 0 ? `Functions: ${funcCount}` : null,
          classCount > 0 ? `Classes: ${classCount}` : null,
          importCount > 0 ? `Imports: ${importCount}` : null,
        ].filter(Boolean).join(', ');
        
        // Include top 5 functions as examples
        const topFunctions = structResult.structure?.functions?.slice(0, 5) || [];
        const funcList = topFunctions.length > 0 
          ? '\n  Top functions:\n' + topFunctions.map(f => `    - Line ${f.line}: ${f.content}`).join('\n')
          : '';
        
        summaries.push(`${header}\nRESULTS: ${summary}${funcList}${funcCount > 5 ? `\n  ...and ${funcCount - 5} more functions` : ''}`);
        return;
      }

      const items = Array.isArray(result.results) ? result.results : [];
      if (items.length === 0) {
        summaries.push(`${header}\nRESULT: Tidak menemukan informasi relevan (0 hasil)`);
        return;
      }

      // OPTIMIZATION: Only include top 3-5 results, not all results (reduced from slice(0, 5))
      const topResults = items.slice(0, 3);
      const formattedItems = topResults.map((item, itemIndex) => {
        const label = item.fileName || item.source || item.url || `Item ${itemIndex + 1}`;
        const snippet = this.normalizeResultSnippet(item) || '(ringkasan tidak tersedia)';
        const urlNote = item.url ? ` [${item.url}]` : '';
        const errorNote = item.error ? ` [ERROR: ${item.error}]` : '';

        if (item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          webSources.push({ url: item.url, snippet });
        }

        // IMPROVED: Multi-line snippets get indentation for better readability
        const snippetLines = snippet.split('\n');
        if (snippetLines.length > 1) {
          const indentedSnippet = snippetLines.map((line, i) => 
            i === 0 ? line : `    ${line}`
          ).join('\n');
          return `  - ${label}${urlNote}${errorNote}:\n    ${indentedSnippet}`;
        } else {
          return `  - ${label}${urlNote}${errorNote}: ${snippet}`;
        }
      }).join('\n\n'); // Added extra newline between results

      // SMART CONTEXT DETECTION: Analyze if results provide complete context
      const completeness = this.analyzeContextCompleteness(items);
      let completenessNote = '';
      
      if (completeness === 'COMPLETE') {
        completenessNote = ' [✓ Context: COMPLETE - Contains full definition, no additional search needed]';
      } else if (completeness === 'PARTIAL') {
        // Check if snippets are from different locations
        const fileNames = new Set(items.map(item => item.fileName).filter(Boolean));
        if (fileNames.size === 1 && items.length > 1) {
          completenessNote = ' [⚠ Context: PARTIAL - Multiple fragments from same file, may need broader search]';
        } else {
          completenessNote = ' [⚠ Context: PARTIAL - Incomplete snippets, consider requesting more context]';
        }
      } else {
        completenessNote = ' [✗ Context: INSUFFICIENT - Very limited data]';
      }

      // Log optimization note
      const totalItems = items.length;
      if (totalItems > 3) {
        summaries.push(`${header}\nRESULTS: (Showing top 3 of ${totalItems} results)${completenessNote}\n${formattedItems}`);
      } else {
        summaries.push(`${header}\nRESULTS:${completenessNote}\n${formattedItems}`);
      }
    });

    return {
      summaryText: summaries.join('\n\n'),
      webSources
    };
  }

  
  shouldRequireFollowup(action, result) {
    // Always require followup if no results
    if (Array.isArray(result) && result.length === 0) {
      return true;
    }
    
    // CRITICAL FIX: Check completeness for search actions that return snippets
    // If context is PARTIAL or INSUFFICIENT, AI should request more data
    if (Array.isArray(result) && result.length > 0) {
      const completeness = this.analyzeContextCompleteness(result);
      
      // If PARTIAL or INSUFFICIENT, require followup so AI can request broader search
      if (completeness === 'PARTIAL' || completeness === 'INSUFFICIENT') {
        return true;
      }
    }
    
    // Too many results also needs followup for refinement
    if (Array.isArray(result) && result.length > 50) {
      return true;
    }
    
    return false;
  }

  
  buildFollowupPrompt(action, actionResult, originalPlan, actionIndex) {
    const resultSummary = actionResult.success 
      ? `Found ${actionResult.resultCount} results`
      : `Failed: ${actionResult.error}`;
    
    let resultsText = '';
    if (actionResult.success && actionResult.results) {
      if (Array.isArray(actionResult.results)) {
        // Handle different result types properly
        if (action.type === 'listAvailableFiles') {
          // File listing results have fileName, size, extension, lines
          resultsText = actionResult.results.map(r => 
            `FILE: ${r.fileName} (${r.size || 'unknown'} bytes, ${r.lines || '?'} lines)`
          ).join('\n');
        } else {
          // Search results have fileName, lineNumber, context
          resultsText = actionResult.results.map(r => 
            `FILE: ${r.fileName}:${r.lineNumber}\n${r.context}`
          ).join('\n---\n');
        }
      } else {
        resultsText = JSON.stringify(actionResult.results, null, 2);
      }
    }

    const followupPromptText = `SEARCH ACTION COMPLETED:
Action: ${action.type} with ${JSON.stringify(action.params)}
Result: ${resultSummary}

SEARCH RESULTS:
${resultsText}

REMAINING ACTIONS: ${originalPlan.actions.length - actionIndex - 1}

Based on these search results, continue your analysis. 

AVAILABLE CAPABILITIES for additional searches:
1. searchPattern(pattern, options) - Search for text/regex patterns across files
   Example: searchPattern with {"pattern": "functionName", "options": {"file": "specific.js", "contextLines": 5}}
   
2. searchFunctions(functionName) - Find function definitions
   Example: searchFunctions with {"functionName": "myFunction"}
   
3. searchCSS(selector) - Find CSS selectors
   Example: searchCSS with {"selector": ".my-class"}
   
4. searchHTML(element) - Find HTML elements
   Example: searchHTML with {"element": "div.container"}
   
5. searchImports(moduleName) - Find import/require statements
   Example: searchImports with {"moduleName": "express"}
   
6. analyzeFileStructure(fileName) - Get file outline/structure
   Example: analyzeFileStructure with {"fileName": "app.js"}
   
7. listAvailableFiles() - List all project files with metadata
   Example: listAvailableFiles with {}

DO NOT invent new capabilities like "searchInFile", "searchWithLines", "getFileContent" - use ONLY the capabilities listed above!

CRITICAL INSTRUCTIONS:
1. If the previous action returned 0 or very few results, you MUST try different search strategies
2. DO NOT give up easily - try alternative patterns, keywords, or approaches
3. Only stop searching if you have gathered SUFFICIENT information to answer the user's question comprehensively
4. If results are insufficient, request 1-2 MORE targeted actions with different approaches

DECISION POINT:
- If you have COMPLETE information: Provide your final analysis
- If information is INCOMPLETE or MISSING: Request additional specific searches

Format for additional searches:
ACTION: <searchType> with {"param": "value"}
WHY: <specific reason explaining why this different approach will help>

Remember: Quality answers require thorough research. Don't settle for incomplete information.`;

    return followupPromptText;
  }

  
  async makeAIRequest(prompt, sessionId) {
    const logHelper = { sessionId };
    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `AI Request initiated for session ${sessionId}\nPrompt length: ${prompt.length} chars\n---FULL PROMPT START---\n${prompt}\n---FULL PROMPT END---`);

    const sessionData = this.sessionState.get(sessionId);
    if (!sessionData || !sessionData.model) {
      log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
        `AI request failed: Session not properly initialized with model information`);
      return this.generateFallbackResponse(prompt);
    }

    const { provider, model, apiKey, baseUrl } = sessionData.model;
    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `Using AI model configuration:\n  Provider: ${provider}\n  Model: ${model}\n  Base URL: ${baseUrl}\n  API Key: ${apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET'}`);
    
    // Build messages array with conversation history
    const messages = [];
    
    // Add conversation history if available (optimized with sliding window + pruning)
    if (sessionData.conversationHistory && sessionData.conversationHistory.length > 0) {
      log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
        `Including ${sessionData.conversationHistory.length} previous messages for context`);
      
      // Optimize conversation history (sliding window 12 messages + pruning)
      const optimizedHistory = optimizeMessages(sessionData.conversationHistory, {
        windowSize: 12,
        keepFirst: true, // Keep initial context for better understanding
        prune: true,
        minLength: 15 // More lenient for RE+ACT agent
      });
      
      log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
        `Optimized conversation history from ${sessionData.conversationHistory.length} to ${optimizedHistory.length} messages`);
      
      // Convert from [role, content, metadata] format to {role, content} format
      // Skip empty AI messages (streaming) except the last one
      for (let i = 0; i < optimizedHistory.length; i++) {
        const [role, content, metadata] = optimizedHistory[i];
        
        // Skip empty AI messages unless it's the last message
        if (role === 'ai' && content === '' && i < optimizedHistory.length - 1) {
          continue;
        }
        
        if (role === 'user') {
          messages.push({ role: 'user', content: content || '' });
        } else if (role === 'ai' && content) {
          messages.push({ role: 'assistant', content: content });
        }
      }
      
      log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
        `Built ${messages.length} messages from optimized conversation history`);
    }
    
    // Add current prompt as user message
    messages.push({ role: 'user', content: prompt });
    
    const https = require('https');

    const url = new URL(`${baseUrl.replace(/\/+$/,'')}/chat/completions`);
    const bodyObj = {
      model,
      messages: messages,
      stream: false
    };

    const body = JSON.stringify(bodyObj);
    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `Request body with ${messages.length} messages:\n${JSON.stringify(bodyObj, null, 2)}`);
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://clustrix.local';
      headers['X-Title'] = 'Clustrix Desktop';
    } else if (provider === 'bigmodel') {
      headers['User-Agent'] = 'Clustrix/1.0';
      headers['Accept'] = 'application/json';
    }

    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `Request headers (sanitized):\n${JSON.stringify({...headers, Authorization: 'Bearer ***'}, null, 2)}`);

    const makeHttpRequest = () => new Promise((resolve, reject) => {
      const opts = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        protocol: url.protocol,
        headers
      };

      log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
        `HTTP request options:\n${JSON.stringify(opts, null, 2)}`);

      const req = https.request(opts, (res) => {
        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Received response with status: ${res.statusCode}`);
        
        let data = '';
        res.on('data', chunk => {
          data += chunk;
          log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
            `Received data chunk: ${chunk.length} bytes`);
        });
        res.on('end', () => {
          log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
            `Response complete. Total size: ${data.length} bytes\n---FULL RESPONSE START---\n${data}\n---FULL RESPONSE END---`);
          
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`HTTP ${res.statusCode}: ${data}`);
            error.statusCode = res.statusCode;
            error.responseBody = data;
            log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
              `HTTP error response:\n  Status: ${res.statusCode}\n  Body: ${data}`);
            reject(error);
            return;
          }
          resolve(data);
        });
      });

      req.on('error', (error) => {
        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `HTTP request error:\n  Message: ${error.message}\n  Code: ${error.code}\n  Stack: ${error.stack}`);
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
      log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
        `Attempt ${attempt}/${maxAttempts}: Sending HTTP request`);
      
      try {
        const responseText = await makeHttpRequest();
        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Parsing JSON response (${responseText.length} chars)`);
        
        const jsonResponse = JSON.parse(responseText);
        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Parsed JSON response:\n${JSON.stringify(jsonResponse, null, 2)}`);
        
        const content = jsonResponse?.choices?.[0]?.message?.content ||
                        jsonResponse?.message?.content ||
                        jsonResponse?.output_text || '';
        
        // CRITICAL FIX: Extract reasoning_content from GLM-4.6 thinking mode responses
        // Some AI models (like GLM-4.6) put ACTION requests in reasoning_content field
        const reasoningContent = jsonResponse?.choices?.[0]?.message?.reasoning_content || '';
        
        // Extract usage data - handle both OpenAI and Gemini formats
        let usage = jsonResponse?.usage || jsonResponse?.usageMetadata || null;
        
        // Normalize usage format if needed (convert from Gemini format to standard)
        if (usage && usage.promptTokenCount) {
          usage = {
            prompt_tokens: usage.promptTokenCount,
            completion_tokens: usage.candidatesTokenCount || 0,
            total_tokens: usage.totalTokenCount || 0
          };
        }
        
        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Extracted content (${content.length} chars) and usage:\n---AI CONTENT START---\n${content}\n---AI CONTENT END---\nUsage: ${JSON.stringify(usage)}`);
        
        if (reasoningContent) {
          log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
            `Found reasoning_content (${reasoningContent.length} chars):\n---REASONING CONTENT START---\n${reasoningContent}\n---REASONING CONTENT END---`);
        }
        
        return { content, reasoning_content: reasoningContent, usage };
      } catch (error) {
        lastError = error;
        const status = extractStatusCode(error);
        const shouldRetry = attempt < maxAttempts && isRetryable(error);

        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Attempt ${attempt} failed:\n  Status: ${status || 'N/A'}\n  Code: ${error.code || 'N/A'}\n  Message: ${error.message}\n  Should retry: ${shouldRetry}\n  Stack: ${error.stack}`);

        if (shouldRetry) {
          const backoff = baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 200);
          const delay = backoff + jitter;
          log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
            `Retrying in ${delay}ms (backoff: ${backoff}ms, jitter: ${jitter}ms)`);
          await sleep(delay);
          continue;
        }

        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Not retrying. Final error on attempt ${attempt}`);
        break;
      }
    }

    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `All ${maxAttempts} attempts failed. Last error:\n  Message: ${lastError?.message}\n  Code: ${lastError?.code}\n  Stack: ${lastError?.stack}\n  Response body: ${lastError?.responseBody || 'N/A'}`);
    
    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `Falling back to generated response`);
    
    return { content: this.generateFallbackResponse(prompt), usage: null };
  }

  
  generateFallbackResponse(prompt) {
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
    return `REASONING: Analyzing the uploaded files to understand the structure and identify potential issues.

PLAN:
1. ACTION: analyzeFileStructure with {"fileName": "*.html"}
   WHY: Understand the overall HTML structure

2. ACTION: searchPattern with {"pattern": "${lowerPrompt.includes('error') ? 'error|Error|ERROR' : '\\w+'}", "options": {"maxResults": 20}}
   WHY: Search for relevant patterns in the code

CURRENT THINKING: Will examine the file structure and search for relevant patterns to provide helpful analysis.`;
  }

  
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