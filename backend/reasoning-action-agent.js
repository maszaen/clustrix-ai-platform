

const DesktopSearchEngine = require('./desktop-search-engine');
const { log } = require('../utils/logger');

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

  
  async processWithReasoningAction(userQuery, sessionId, existingMessages = [], progressCallback = null, systemPrompt = null) {
    const logHelper = { sessionId };
    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction', 
      `Starting query processing\nQuery: "${userQuery}"\nSession: ${sessionId}`);
    
    const sessionState = this.sessionState.get(sessionId);
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not initialized`);
    }
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
    
    const reasoningResponse = await this.makeAIRequest(reasoningPrompt, sessionId);
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
    const MAX_ACTIONS = 10;
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
      if (index < plan.actions.length - 1 || actionResult.requiresFollowup) {
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Building followup prompt for action ${index + 1}`);
        
        const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, index);
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Followup prompt built (${followupPrompt.length} chars):\n---FOLLOWUP PROMPT START---\n${followupPrompt}\n---FOLLOWUP PROMPT END---`);
        
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Sending followup prompt to AI`);
        
        finalResponse = await this.makeAIRequest(followupPrompt, sessionId);
        log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
          `Received followup response (${finalResponse.length} chars):\n---FOLLOWUP RESPONSE START---\n${finalResponse}\n---FOLLOWUP RESPONSE END---`);
        
        const additionalPlan = this.parseReasoningResponse(finalResponse);
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
      
      finalResponse = await this.makeAIRequest(synthesisPrompt, sessionId);
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

  
  buildSynthesisPrompt(userQuery, actionHistory, sessionState) {
    const { summaryText, webSources } = this.prepareActionSummary(actionHistory);
    const hasFiles = Array.isArray(sessionState.files) && sessionState.files.length > 0;
    const fileList = hasFiles
      ? sessionState.files.slice(0, 20).map(f => `- ${f.name} (${f.type})`).join('\n')
      : '- Tidak ada file lokal yang tersedia untuk sesi ini.';
    const webSourcesSection = webSources.length > 0
      ? webSources.slice(0, 6).map((item, idx) => `${idx + 1}. ${item.url} -> ${item.snippet || '(ringkasan tidak tersedia)'}`).join('\n')
      : 'Tidak ada sumber web yang berhasil diambil.';
    const userLanguage = this.detectUserLanguage(userQuery);
    
    // Count total results from all actions
    const totalResults = actionHistory.reduce((sum, entry) => {
      return sum + (entry.result?.resultCount || 0);
    }, 0);
    
    // Determine confidence level based on results
    const hasGoodData = totalResults > 50;
    const confidenceInstruction = hasGoodData
      ? 'IMPORTANT: You have extensive data from the files. Be CONFIDENT and COMPREHENSIVE in your analysis. Provide detailed insights based on the data you found. Do NOT use disclaimers like "keterbatasan" or "perlu verifikasi" - you have direct access to the content.'
      : 'You have some data from the files. Provide analysis based on what you found, and suggest specific additional searches if more information is needed.';

    return `You are an expert research assistant with FULL ACCESS to project files and comprehensive search results.

ACTION LOG:
${summaryText || 'Tidak ada aksi yang dieksekusi.'}

PRIMARY WEB SOURCES:
${webSourcesSection}

PROJECT FILE CONTEXT:
${fileList}

TOTAL DATA GATHERED: ${totalResults} results from ${actionHistory.length} search actions

USER QUESTION:
"""${userQuery}"""

${confidenceInstruction}

RESPONSE REQUIREMENTS:
- Jawab dalam bahasa pengguna (detected: ${userLanguage})
- Sertakan <thinking>...</thinking> untuk proses analisis internal
- BE COMPREHENSIVE: Extract and present ALL relevant information you found
- BE CONFIDENT: You have direct access to file content - present findings authoritatively
- Cite specific details: line numbers, section names, actual content from files
- DO NOT say "kemungkinan", "mungkin", "tampaknya" if you have concrete data
- DO NOT add disclaimers about "keterbatasan" or "perlu membuka file" - you already have the data
- If data is truly insufficient (< 10 results), then suggest specific additional searches

STRUCTURE YOUR RESPONSE:
1. Direct findings from the files (be specific and detailed)
2. Analysis and insights (comprehensive, not speculative)
3. Only if truly needed: actionable next steps (but prefer giving complete answer now)

Remember: You have ${totalResults} pieces of data. Use them confidently!`;
  }

  
  buildReasoningPrompt(userQuery, sessionState) {
    const hasFiles = Array.isArray(sessionState.files) && sessionState.files.length > 0;
    const fileList = hasFiles
      ? sessionState.files.map(f => `- ${f.name} (${f.type})`).join('\n')
      : '- (Tidak ada file proyek yang tersedia, gunakan riset web sebagai sumber utama)';

    const capabilityLines = [
      '- searchPattern(pattern, options): Cari pola teks di seluruh file (mirip grep)',
      '- searchFunctions(functionName): Temukan definisi fungsi',
      '- searchCSS(selector): Temukan selector, class, atau ID CSS',
      '- searchHTML(element): Temukan elemen dan tag HTML',
      '- searchImports(moduleName): Temukan pernyataan import/require',
      '- analyzeFileStructure(fileName): Ringkas struktur file secara detail'
    ];

    if (sessionState.capabilities?.supportsWebSearch) {
      capabilityLines.push(
        '- webSearch(query, options): Lakukan pencarian internet real-time dan ambil hasil terbaru',
        '- fetchWebPage(url, options): Unduh konten halaman web untuk dianalisis'
      );
    }

    const webFocusNote = !hasFiles
      ? '\nFOKUS: Tidak ada file lokal, jadi rencanakan minimal satu tindakan research menggunakan webSearch/fetchWebPage untuk mendapatkan informasi yang relevan.'
      : '';

    return `You are an autonomous research agent with access to project files and live internet tools.

USER FILES:
${fileList}

AVAILABLE CAPABILITIES:
${capabilityLines.join('\n')}

USER QUERY: "${userQuery}"

CRITICAL INSTRUCTIONS:
1. REASON thoroughly about what information is required to answer the question${webFocusNote}
2. PLAN a comprehensive sequence of search actions - BE THOROUGH, NOT MINIMAL
3. You MUST create AT LEAST 2-3 different search actions to gather sufficient information
4. DO NOT create just 1 action - that's insufficient for quality research
5. For each action specify:
   - Action type (e.g., "webSearch" atau "searchHTML")
   - Parameters in JSON (mis. {"query": "berita Nepal terbaru"})
   - Why this action helps progress the investigation

IMPORTANT: If you're analyzing files, use MULTIPLE different search patterns to find relevant information. Don't rely on just one search.

Respond with this exact template:
REASONING: [Your comprehensive thought process - explain what you need to find and WHY multiple searches are necessary]

PLAN:
1. ACTION: <toolName> with {...}
   WHY: <reason>
2. ACTION: <toolName> with {...}
   WHY: <reason>
3. ACTION: <toolName> with {...}
   WHY: <reason>
[Add more actions as needed - minimum 2-3 actions required]

CURRENT THINKING: [Apa yang Anda harapkan dari langkah di atas dan bagaimana itu menjawab pertanyaan pengguna secara lengkap]`;
  }

  
  detectUserLanguage(userQuery) {
    const query = userQuery.toLowerCase();
    if (/\b(apa|bagaimana|dimana|kapan|mengapa|siapa|yang|dan|atau|dengan|untuk|dari|pada|ke|di)\b/.test(query) ||
        /[àâäéèêëïîôöùûüÿç]/.test(query) === false &&
        /[ñ¿¡]/.test(query) === false &&
        query.includes('yang') || query.includes('untuk') || query.includes('dengan')) {
      return 'id';
    }
    if (/\b(le|la|les|du|de|des|et|à|un|une|dans|sur|avec|pour|par|mais|ou|si|nous|vous|ils|elles)\b/.test(query) ||
        /[àâäéèêëïîôöùûüÿç]/.test(query)) {
      return 'fr';
    }
    if (/\b(el|la|los|las|de|del|en|con|por|para|como|que|es|son|está|están|y|o|si|no|muy|más)\b/.test(query) ||
        /[ñ¿¡]/.test(query)) {
      return 'es';
    }
    if (/\b(der|die|das|den|dem|des|und|mit|für|auf|ist|sind|war|waren|sein|haben|hatte)\b/.test(query) ||
        /[äöüß]/.test(query)) {
      return 'de';
    }
    return 'en';
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

    let totalLines = 0;
    const limitedResults = [];
    
    for (const result of results) {
      const snippetSource = result.context || result.snippet || result.preview || result.text || result.content || '';
      const resultLines = typeof snippetSource === 'string' && snippetSource.length > 0
        ? snippetSource.split('\n').length
        : 1;

      if (totalLines + resultLines <= maxLines) {
        limitedResults.push(result);
        totalLines += resultLines;
      } else {
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

  normalizeResultSnippet(result) {
    if (!result) return '';
    const raw = result.snippet || result.context || result.preview || result.text || result.content || '';
    if (typeof raw !== 'string') {
      return '';
    }
    return raw.replace(/\s+/g, ' ').trim().slice(0, 280);
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

      const items = Array.isArray(result.results) ? result.results : [];
      if (items.length === 0) {
        summaries.push(`${header}\nRESULT: Tidak menemukan informasi relevan (0 hasil)`);
        return;
      }

      const formattedItems = items.slice(0, 5).map((item, itemIndex) => {
        const label = item.fileName || item.source || item.url || `Item ${itemIndex + 1}`;
        const snippet = this.normalizeResultSnippet(item) || '(ringkasan tidak tersedia)';
        const urlNote = item.url ? ` [${item.url}]` : '';
        const errorNote = item.error ? ` [ERROR: ${item.error}]` : '';

        if (item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          webSources.push({ url: item.url, snippet });
        }

        return `  - ${label}${urlNote}${errorNote}: ${snippet}`;
      }).join('\n');

      summaries.push(`${header}\nRESULTS:\n${formattedItems}`);
    });

    return {
      summaryText: summaries.join('\n\n'),
      webSources
    };
  }

  
  shouldRequireFollowup(action, result) {
    if (Array.isArray(result) && result.length === 0) {
      return true;
    }
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
        resultsText = actionResult.results.map(r => 
          `FILE: ${r.fileName}:${r.lineNumber}\n${r.context}`
        ).join('\n---\n');
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
    
    const https = require('https');

    const url = new URL(`${baseUrl.replace(/\/+$/,'')}/chat/completions`);
    const bodyObj = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    };

    const body = JSON.stringify(bodyObj);
    log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
      `Request body:\n${JSON.stringify(bodyObj, null, 2)}`);
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://clustrix.local';
      headers['X-Title'] = 'Clustrix Desktop';
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
        
        log(logHelper, 'REASONING_ACTION_AGENT', 'makeAIRequest',
          `Extracted content (${content.length} chars):\n---AI CONTENT START---\n${content}\n---AI CONTENT END---`);
        
        return content;
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
    
    return this.generateFallbackResponse(prompt);
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