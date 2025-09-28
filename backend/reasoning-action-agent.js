

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
    log(`RE+ACT: Initializing session ${sessionId} with ${files.length} files`);
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
    
    log(`RE+ACT: Using ${processedFiles.length} files directly from session`);

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
    log(`RE+ACT: Processing query for session ${sessionId}`);
    
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
    log(`RE+ACT: Sending reasoning prompt to AI...`);
    
    const reasoningResponse = await this.makeAIRequest(reasoningPrompt, sessionId);
    const plan = this.parseReasoningResponse(reasoningResponse);
    log(`RE+ACT: AI generated plan with ${plan.actions.length} actions`);
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
      if (totalActionsExecuted >= MAX_ACTIONS) {
        log(`RE+ACT: Stopping execution after ${MAX_ACTIONS} actions to prevent infinite loops`);
        if (progressCallback) {
          progressCallback({
            type: 'thinking',
            content: `Stopped execution after ${MAX_ACTIONS} actions to prevent infinite loops`
          });
        }
        break;
      }
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
        const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, index);
        finalResponse = await this.makeAIRequest(followupPrompt, sessionId);
        const additionalPlan = this.parseReasoningResponse(finalResponse);
        if (additionalPlan.actions.length > 0 && totalActionsExecuted < MAX_ACTIONS) {
          const validActions = additionalPlan.actions.filter(action => {
            return action.type && action.params && Object.keys(action.params).length > 0;
          });
          
          if (validActions.length > 0) {
            log(`\nRE+ACT: AI requested ${validActions.length} additional actions`);
            if (progressCallback) {
              progressCallback({
                type: 'thinking',
                content: `\nAI requested ${validActions.length} additional actions, continuing analysis...`
              });
            }
            plan.actions.push(...validActions);
          } else {
            log(`RE+ACT: AI requested additional actions but all were invalid, stopping`);
            break;
          }
        }
      }
    }
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
    
    log(`RE+ACT: Completed processing with ${sessionState.actionHistory.length} actions executed`);
    
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

    return `You are an autonomous research assistant synthesizing findings from local project files and live internet research.

ACTION LOG:
${summaryText || 'Tidak ada aksi yang dieksekusi.'}

PRIMARY WEB SOURCES:
${webSourcesSection}

PROJECT FILE CONTEXT:
${fileList}

USER QUESTION:
"""${userQuery}"""

FINAL RESPONSE REQUIREMENTS:
- Jawab dalam bahasa pengguna (detected: ${userLanguage}).
- Sertakan <thinking>...</thinking> yang menjelaskan proses analisis internal sebelum jawaban akhir.
- Gabungkan bukti dari file lokal maupun sumber web; sebutkan nama file atau gunakan format markdown [Label](URL) saat mengutip tautan.
- Jika informasi masih kurang lengkap, jelaskan keterbatasannya dan sarankan langkah lanjutan yang realistis.
- Berikan rekomendasi atau next-step yang actionable bila relevan.`;
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

INSTRUCTIONS:
1. REASON about what information is required to answer the question${webFocusNote}
2. PLAN a sequence of search actions using the tools above (local file search and/or web research)
3. For each action specify:
   - Action type (e.g., "webSearch" atau "searchHTML")
   - Parameters in JSON (mis. {"query": "berita Nepal terbaru"})
   - Why this action helps progress the investigation

Respond with this exact template:
REASONING: [Your thought process]

PLAN:
1. ACTION: <toolName> with {...}
   WHY: <reason>
2. ACTION: <toolName> with {...}
   WHY: <reason>
[Tambah aksi lain bila perlu]

CURRENT THINKING: [Apa yang Anda harapkan dari langkah di atas dan bagaimana itu menjawab pertanyaan pengguna]`;
  }

  
  buildSynthesisPrompt(userQuery, sessionState, actionResults, userLanguage = 'en') {
    const fileList = sessionState.files.map(f => `- ${f.name} (${f.type})`).join('\n');
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
    log(`Executing ${action.type} with params:`, action.params);

    try {
      const result = await this.searchEngine.executeSearchCommand(action.type, action.params);
      const limitedResult = this.limitSearchResults(result, 100);
      const resultCount = Array.isArray(result) ? result.length : (result ? 1 : 0);

      log(`Action ${action.type} returned ${resultCount} result(s)`);

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
      log(`Action ${action.type} failed:`, error);
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

    return `You are an autonomous research assistant synthesizing findings from local project files and live internet research.

ACTION LOG:
${summaryText || 'Tidak ada aksi yang dieksekusi.'}

PRIMARY WEB SOURCES:
${webSourcesSection}

PROJECT FILE CONTEXT:
${fileList}

USER QUESTION:
"""${userQuery}"""

FINAL RESPONSE REQUIREMENTS:
- Jawab dalam bahasa pengguna (detected: ${userLanguage}).
- Sertakan <thinking>...</thinking> yang menjelaskan proses analisis internal sebelum jawaban akhir.
- Gabungkan bukti dari file lokal maupun sumber web; sebutkan nama file atau gunakan format markdown [Label](URL) saat mengutip tautan.
- Jika informasi masih kurang lengkap, jelaskan keterbatasannya dan sarankan langkah lanjutan yang realistis.
- Berikan rekomendasi atau next-step yang actionable bila relevan.`;
  }

  
  async makeAIRequest(prompt, sessionId) {
    log(`AI Request for session ${sessionId}:`, prompt.slice(0, 100) + '...');

    const sessionData = this.sessionState.get(sessionId);
    if (!sessionData || !sessionData.model) {
      log('AI request failed: Session not properly initialized with model information');
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
          log(`AI request attempt ${attempt} failed (${status || error.code || 'error'}). Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        log(`AI request attempt ${attempt} failed:`, error);
        break;
      }
    }

    log('AI request failed after retries:', lastError);
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