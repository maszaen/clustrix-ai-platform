/**
 * AI Reasoning + Action (RE+ACT) Orchestrator
 * Enables AI to perform multi-step analysis with desktop search capabilities
 */

const DesktopSearchEngine = require('./desktop-search-engine');

class ReasoningActionAgent {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.searchEngine = new DesktopSearchEngine(langchainService);
    this.sessionState = new Map();

    this.supportedActions = new Set([
      'searchPattern',
      'searchFunctions',
      'searchCSS',
      'searchHTML',
      'searchImports',
      'analyzeFileStructure',
      'readFile',
      'readFileRange',
      'listProjectFiles',
    ]);

    this.primaryParamKeys = {
      searchPattern: 'pattern',
      searchFunctions: 'functionName',
      searchCSS: 'selector',
      searchHTML: 'element',
      searchImports: 'moduleName',
      analyzeFileStructure: 'fileName',
      readFile: 'fileName',
      readFileRange: 'fileName',
      listProjectFiles: 'glob',
    };
  }

  /**
   * Initialize with project files for current session
   */
  initializeSession(sessionId, files, modelInfo = {}) {
    console.log(`🧠 RE+ACT: Initializing session ${sessionId} with ${files.length} files`);

    this.searchEngine.loadProjectFiles(files);

    const capabilities = this.searchEngine.getCapabilities();
    this.sessionState.set(sessionId, {
      files,
      capabilities,
      model: modelInfo,
      runs: [],
      lastRun: null,
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

    const runState = this.createRunState(sessionState, userQuery);

    const reasoningPrompt = this.buildReasoningPrompt(userQuery, sessionState);
    console.log(`🤔 RE+ACT: Sending reasoning prompt to AI...`);
    let reasoningResponse = await this.makeAIRequest(reasoningPrompt, sessionId);

    let plan = this.parseReasoningResponse(reasoningResponse);
    runState.plan = plan;

    this.emitPlanThinking(plan, runState, progressCallback);

    if (plan.actions.length === 0) {
      const reprompt = this.buildEmptyPlanReprompt(userQuery, plan, sessionState);
      if (reprompt) {
        console.log('RE+ACT: Empty plan detected, requesting reformatted plan');
        reasoningResponse = await this.makeAIRequest(reprompt, sessionId);
        plan = this.parseReasoningResponse(reasoningResponse);
        runState.plan = plan;
        this.emitPlanThinking(plan, runState, progressCallback, { mode: 'append' });
      }
    }

    console.log(`📋 RE+ACT: AI generated plan with ${plan.actions.length} actions`);

    const MAX_ACTIONS = 10;
    let totalActionsExecuted = 0;
    let finalResponse = reasoningResponse;
    let actionIndex = 0;

    while (actionIndex < plan.actions.length && totalActionsExecuted < MAX_ACTIONS) {
      const action = plan.actions[actionIndex];
      if (!this.validateAction(action)) {
        actionIndex += 1;
        continue;
      }

      console.log(`RE+ACT: Executing action ${actionIndex + 1}/${plan.actions.length}: ${action.type}`);

      const actionResult = await this.executeAction(action, sessionId);

      const historyEntry = {
        action,
        result: actionResult,
        timestamp: new Date().toISOString(),
      };
      runState.actionHistory.push(historyEntry);
      sessionState.lastRun = runState;

      totalActionsExecuted += 1;

      if (progressCallback) {
        progressCallback({
          type: 'action_result',
          data: {
            action: action.type,
            params: action.params,
            success: Boolean(actionResult.success),
            actionIndex,
            resultCount: Array.isArray(actionResult.results)
              ? actionResult.results.length
              : actionResult.resultCount || 0,
            results: Array.isArray(actionResult.results) ? actionResult.results : [],
          },
        });
      }

      const narrationEntries = await this.requestActionNarration(
        userQuery,
        runState,
        action,
        actionResult,
        plan,
        sessionId,
      );
      this.emitThinkingEntries(narrationEntries, runState, progressCallback, {
        stage: 'action',
        actionIndex,
      });

      if (actionIndex < plan.actions.length - 1 || actionResult.requiresFollowup) {
        const followupPrompt = this.buildFollowupPrompt(action, actionResult, plan, runState, userQuery);
        finalResponse = await this.makeAIRequest(followupPrompt, sessionId);
        const additionalPlan = this.parseReasoningResponse(finalResponse);

        if (additionalPlan.thinkingLog.length > 0) {
          this.emitThinkingEntries(additionalPlan.thinkingLog, runState, progressCallback, {
            stage: 'plan-update',
            actionIndex,
          });
        }

        if (additionalPlan.actions.length > 0 && totalActionsExecuted < MAX_ACTIONS) {
          const validActions = additionalPlan.actions.filter((candidate) => this.validateAction(candidate));
          if (validActions.length > 0) {
            console.log(`RE+ACT: AI requested ${validActions.length} additional actions`);
            plan.actions.splice(actionIndex + 1, 0, ...validActions);
          }
        }
      }

      actionIndex += 1;
    }

    if (runState.actionHistory.length > 0) {
      const synthesisPrompt = this.buildSynthesisPrompt(userQuery, runState.actionHistory, sessionState, runState);
      finalResponse = await this.makeAIRequest(synthesisPrompt, sessionId);

      const summaryEntries = await this.requestActionNarration(
        userQuery,
        runState,
        { type: 'finalize', params: {} },
        { success: true, resultCount: runState.actionHistory.length, results: [] },
        plan,
        sessionId,
        true,
      );
      this.emitThinkingEntries(summaryEntries, runState, progressCallback, {
        stage: 'summary',
      });
    }

    if (typeof finalResponse === 'string') {
      const hasText = finalResponse.trim().length > 0;
      const looksLikePlanOnly =
        hasText &&
        /(^|\n)\s*PLAN\s*:|^\s*\*\*REASONING\*\*|^REASONING:/i.test(finalResponse) &&
        !/FINAL ANSWER|JAWABAN AKHIR|KESIMPULAN|SOLUTION|SOLUSI/i.test(finalResponse);

      if (!hasText || looksLikePlanOnly) {
        const planText = typeof plan === 'string' ? plan : JSON.stringify(plan);
        const ctx = Array.isArray(sessionState.files)
          ? sessionState.files.map((f) => `${f.name}\n${f.content}`).join('\n\n')
          : '';
        const finalPrompt = [
          'Selesaikan permintaan pengguna berdasarkan rencana berikut dan konteks proyek.',
          'Rencana:',
          String(planText || ''),
          'Konteks:',
          ctx,
          'Berikan jawaban akhir yang langsung bisa dipakai, bukan rencana.',
        ].join('\n\n');
        const synthesized = await this.makeAIRequest(finalPrompt, sessionId);
        finalResponse = typeof synthesized === 'string' ? synthesized : (synthesized && synthesized.content) || '';
      }
    }

    runState.completedAt = new Date().toISOString();
    sessionState.runs.push(runState);

    return {
      finalResponse,
      plan,
      actionHistory: runState.actionHistory,
      thinkingLog: runState.thinkingLog,
      actionsExecuted: runState.actionHistory.length,
      searchResults: runState.actionHistory.map((entry) => entry.result),
    };
  }

  createRunState(sessionState, userQuery) {
    return {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userQuery,
      startedAt: new Date().toISOString(),
      plan: null,
      actionHistory: [],
      thinkingLog: [],
      previousThinking: [],
    };
  }

  emitThinkingEntries(entries, runState, progressCallback, meta = {}) {
    if (!entries || entries.length === 0) return;

    for (const rawEntry of entries) {
      const entry = this.normalizeThinkingEntry(rawEntry, meta);
      if (!entry.text) continue;

      runState.thinkingLog.push(entry);

      if (progressCallback) {
        progressCallback({
          type: 'thinking_log',
          entry,
        });
      }
    }
  }

  emitPlanThinking(plan, runState, progressCallback, meta = {}) {
    if (!plan) return;
    const planEntries = Array.isArray(plan.thinkingLog) ? plan.thinkingLog : [];
    const entriesToEmit = planEntries.length > 0
      ? planEntries
      : (Array.isArray(plan.actions) ? plan.actions.map((action, index) => this.buildFallbackPlanEntry(action, index)) : []);

    this.emitThinkingEntries(entriesToEmit, runState, progressCallback, {
      stage: 'plan',
      ...meta,
    });
  }

  buildFallbackPlanEntry(action, index) {
    if (!action || !action.type) {
      return `plan step ${index + 1}: preparing next investigation`;
    }

    const preview = this.previewParamsForLog(action.params);
    return `plan step ${index + 1}: ${action.type}${preview}`;
  }

  previewParamsForLog(params) {
    if (!params || typeof params !== 'object') return '';

    const entries = Object.entries(params)
      .filter(([key]) => key !== 'executed')
      .map(([key, value]) => `${key}=${this.previewValueForLog(value)}`)
      .slice(0, 2);

    return entries.length ? ` (${entries.join(', ')})` : '';
  }

  previewValueForLog(value) {
    if (value == null) return 'null';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const preview = value.slice(0, 2).map((item) => this.previewValueForLog(item)).join(', ');
      const suffix = value.length > 2 ? ', …' : '';
      return `[${preview}${suffix}]`;
    }

    try {
      const str = JSON.stringify(value);
      return str.length > 60 ? `${str.slice(0, 57)}...` : str;
    } catch (error) {
      return String(value);
    }
  }

  normalizeThinkingEntry(entry, meta = {}) {
    if (!entry) return { text: '' };

    if (typeof entry === 'string') {
      return {
        id: `think-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: entry.trim(),
        stage: meta.stage || 'plan',
        actionIndex: meta.actionIndex ?? null,
        createdAt: new Date().toISOString(),
      };
    }

    const text = (entry.text || entry.content || '').toString().trim();
    return {
      id: entry.id || `think-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      stage: entry.stage || meta.stage || 'plan',
      actionIndex: entry.actionIndex ?? meta.actionIndex ?? null,
      createdAt: entry.createdAt || new Date().toISOString(),
    };
  }

  validateAction(action) {
    if (!action || !action.type) return false;
    const normalizedType = action.type.trim();
    if (!this.supportedActions.has(normalizedType)) {
      console.warn(`RE+ACT: Unsupported action type '${normalizedType}', skipping`);
      return false;
    }
    if (!action.params || typeof action.params !== 'object') {
      console.warn(`RE+ACT: Missing parameters for action '${normalizedType}'`);
      return false;
    }
    return true;
  }

  /**
   * Build initial reasoning prompt
   */
  buildReasoningPrompt(userQuery, sessionState) {
    const fileList = sessionState.files.map((f) => `- ${f.name} (${f.type})`).join('\n');

    return `You are an AI assistant with powerful desktop search capabilities. The user has uploaded project files and needs help.

USER FILES:
${fileList}

AVAILABLE SEARCH CAPABILITIES:
- searchPattern(pattern, options?): Search for text patterns across all files (like grep)
- searchFunctions(functionName): Find function definitions
- searchCSS(selector): Find CSS selectors, classes, IDs
- searchHTML(element): Find HTML elements and tags
- searchImports(moduleName): Find import/require statements
- analyzeFileStructure(fileName): Get detailed file structure analysis
- readFile(fileName) / readFileRange(fileName, startLine, endLine)

USER QUERY: "${userQuery}"

INSTRUCTIONS:
1. REASON about what the user is asking and what information you need.
2. PLAN the actions you will take using any of these accepted formats:
   - Numbered list: \`1. ACTION: searchPattern with {"pattern": "foo"}\`
   - Bulleted list: \`- searchHTML("button") // reason\`
   - Inline call: \`searchCSS selector="button.primary"\`
   - Markdown table with columns (#, ACTION, PARAMETERS, WHY)
   - JSON array: \`[{"action": "searchPattern", "params": {...}, "why": "..."}]\`
3. ALWAYS include parameters for each action using JSON, key=value pairs, or function-call syntax.
4. Provide a THINKING_LOG section as bullet points describing the narrative of your planned investigation (dynamic first-person notes like "read app.js from 400-500").
5. Do not answer the question yet; focus on planning the investigation.

Respond in this format:
REASONING: [Your analysis of the problem]

PLAN:
1. ACTION: searchHTML with {"element": "textarea"}
   WHY: Need to find textarea elements

2. searchCSS("textarea")
   WHY: Check if styles hide the textarea

THINKING_LOG:
- created todos 0/6
- now i check the file, i found 4 files in here
- read app.js from 400 to 500
`;
  }

  /**
   * Parse AI's reasoning response to extract action plan
   */
  parseReasoningResponse(response) {
    const plan = {
      reasoning: '',
      actions: [],
      thinkingLog: [],
    };

    if (!response || typeof response !== 'string') {
      return plan;
    }

    const reasoningMatch = response.match(/REASONING:\s*([\s\S]*?)(?=\n\s*(PLAN|THINKING LOG|CURRENT THINKING)\s*:|$)/i);
    if (reasoningMatch) {
      plan.reasoning = reasoningMatch[1].trim();
    }

    const planSectionMatch = response.match(/PLAN\s*:\s*([\s\S]*?)(?=\n\s*(THINKING[_\s]+LOG|CURRENT[_\s]+THINKING)\s*:|$)/i);
    const planSection = planSectionMatch ? planSectionMatch[1].trim() : '';
    plan.actions = this.parsePlanSection(planSection);

    const thinkingMatch = response.match(/(?:THINKING[_\s]+LOG|CURRENT[_\s]+THINKING)\s*:\s*([\s\S]*)$/i);
    if (thinkingMatch) {
      plan.thinkingLog = this.parseThinkingSection(thinkingMatch[1]);
    }

    return plan;
  }

  parsePlanSection(sectionText) {
    if (!sectionText) return [];

    const trimmed = sectionText.trim();
    if (!trimmed) return [];

    const codeBlockMatch = trimmed.match(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const jsonPlan = this.tryParseJsonPlan(codeBlockMatch[1]);
      if (jsonPlan && jsonPlan.length) {
        return jsonPlan;
      }
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const jsonPlan = this.tryParseJsonPlan(trimmed);
      if (jsonPlan && jsonPlan.length) {
        return jsonPlan;
      }
    }

    const tableMatch = trimmed.match(/\|\s*#\s*\|[\s\S]*?\n([\s\S]*)/);
    if (tableMatch) {
      const rows = tableMatch[1]
        .split(/\n+/)
        .map((row) => row.trim())
        .filter(Boolean);
      const actions = [];
      for (const row of rows) {
        const cols = row.split('|').map((col) => col.trim());
        if (cols.length < 3) continue;
        const actionCell = cols[1].replace(/[*`]/g, '').trim();
        const paramsCell = cols[2].replace(/[*`]/g, '').trim();
        const reasonCell = (cols[3] || '').trim();
        const parsed = this.parsePlanEntry(`${actionCell} ${paramsCell} WHY: ${reasonCell}`);
        if (parsed) actions.push(parsed);
      }
      if (actions.length) {
        return actions;
      }
    }

    const lines = trimmed.split(/\n+/);
    const entries = [];
    let buffer = [];

    const flush = () => {
      if (buffer.length === 0) return;
      const entryText = buffer.join(' ').trim();
      if (entryText) {
        entries.push(entryText);
      }
      buffer = [];
    };

    for (const line of lines) {
      const normalized = line.trim();
      if (!normalized) {
        flush();
        continue;
      }

      if (this.isPlanEntryStart(normalized)) {
        flush();
        buffer.push(normalized);
      } else {
        buffer.push(normalized);
      }
    }
    flush();

    const actions = [];
    for (const entry of entries) {
      const parsed = this.parsePlanEntry(entry);
      if (parsed) actions.push(parsed);
    }
    return actions;
  }

  isPlanEntryStart(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    if (/^\d+[\)\].\-\s]/.test(trimmed)) return true;
    if (/^[-*]\s*/.test(trimmed)) return true;
    if (/^ACTION\b/i.test(trimmed)) return true;

    const actionMatch = trimmed.match(/^([A-Za-z_][\w]*)\s*(\(|\{|\bwith\b|=|:)/);
    if (actionMatch && this.supportedActions.has(actionMatch[1])) {
      return true;
    }

    return false;
  }

  parsePlanEntry(entryText) {
    const text = entryText.trim();
    if (!text) return null;

    let reason = '';
    let actionPart = text;
    const reasonMatch = text.match(/\b(?:WHY|REASON)\s*:\s*(.*)$/i);
    if (reasonMatch) {
      reason = reasonMatch[1].trim();
      actionPart = text.slice(0, reasonMatch.index).trim();
    }

    let type = '';
    let paramsText = '';

    const actionWithKeyword = actionPart.match(/ACTION\s*[:\-]?\s*([A-Za-z0-9_]+)(?:\s*(?:with|:))?\s*(.*)/i);
    if (actionWithKeyword) {
      type = actionWithKeyword[1].trim();
      paramsText = actionWithKeyword[2] ? actionWithKeyword[2].trim() : '';
    } else {
      const functionLike = actionPart.match(/^[\-\*\s\d\.\)]*([A-Za-z_][\w]*)\s*(.*)$/);
      if (functionLike) {
        type = functionLike[1].trim();
        paramsText = functionLike[2] ? functionLike[2].trim() : '';
      }
    }

    if (!type) return null;

    const params = this.normalizeParameters(type, paramsText);

    return {
      type,
      params,
      reason,
      executed: false,
    };
  }

  normalizeParameters(actionType, paramsText) {
    if (!paramsText || !paramsText.trim()) {
      return {};
    }

    let text = paramsText.trim();
    text = text.replace(/^with\s*/i, '').trim();
    text = text.replace(/^[:\-]\s*/, '').trim();

    const codeBlockMatch = text.match(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    if (text.startsWith('{') || text.startsWith('[')) {
      const parsed = this.parseJsonLike(text);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }

    const functionCallMatch = text.match(/^\((.*)\)$/);
    if (functionCallMatch) {
      return this.parseFunctionArgs(actionType, functionCallMatch[1]);
    }

    const directFunctionCall = text.match(/^(.*)\((.*)\)$/);
    if (directFunctionCall && this.supportedActions.has(directFunctionCall[1])) {
      return this.parseFunctionArgs(actionType, directFunctionCall[2]);
    }

    const keyValueParams = this.parseKeyValueParams(text);
    if (keyValueParams) {
      return keyValueParams;
    }

    if (/^['"`].*['"`]$/.test(text)) {
      const primaryKey = this.primaryParamKeys[actionType] || 'value';
      return { [primaryKey]: this.stripQuotes(text) };
    }

    if (text.split(/[\s,]+/).length === 1) {
      const primaryKey = this.primaryParamKeys[actionType] || 'value';
      return { [primaryKey]: this.stripQuotes(text) };
    }

    return { value: text };
  }

  parseJsonPlanArray(jsonValue) {
    if (!Array.isArray(jsonValue)) return [];
    const actions = [];
    for (const item of jsonValue) {
      if (!item) continue;
      const type = item.action || item.type || item.name;
      if (!type) continue;
      const params =
        item.params || item.parameters || item.args || item.arguments || this.normalizeParameters(type, '');
      actions.push({
        type,
        params,
        reason: item.why || item.reason || item.explanation || '',
        executed: false,
      });
    }
    return actions;
  }

  tryParseJsonPlan(text) {
    const parsed = this.parseJsonLike(text);
    if (!parsed) return [];
    if (Array.isArray(parsed)) {
      return this.parseJsonPlanArray(parsed);
    }
    if (Array.isArray(parsed.actions)) {
      return this.parseJsonPlanArray(parsed.actions);
    }
    return [];
  }

  parseThinkingSection(sectionText) {
    if (!sectionText) return [];
    const trimmed = sectionText.trim();
    if (!trimmed) return [];

    const codeBlockMatch = trimmed.match(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const json = this.parseJsonLike(codeBlockMatch[1]);
      if (Array.isArray(json)) {
        return json.map((item) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && item.text
              ? item.text
              : JSON.stringify(item),
        );
      }
    }

    if (trimmed.startsWith('[')) {
      const json = this.parseJsonLike(trimmed);
      if (Array.isArray(json)) {
        return json.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
      }
    }

    const lines = trimmed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines
      .map((line) => line.replace(/^[-*\d\.\)\s]+/, '').trim())
      .filter(Boolean);
  }

  parseJsonLike(text) {
    const cleaned = text
      .trim()
      .replace(/,\s*(?=[}\]])/g, '')
      .replace(/([\{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":');

    const attempts = [cleaned, cleaned.replace(/'/g, '"')];

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  parseFunctionArgs(actionType, argsText) {
    const args = this.splitArguments(argsText);
    if (args.length === 0) return {};

    const primaryKey = this.primaryParamKeys[actionType] || 'value';
    const params = {};

    if (actionType === 'searchPattern') {
      params.pattern = this.convertLiteral(args[0]);
      if (args[1]) {
        params.options = this.parseJsonLike(args[1]) || this.parseKeyValueParams(args[1]) || this.convertLiteral(args[1]);
      }
      return params;
    }

    if (actionType === 'readFileRange') {
      params.fileName = this.convertLiteral(args[0]);
      if (args[1]) params.startLine = Number(this.convertLiteral(args[1]));
      if (args[2]) params.endLine = Number(this.convertLiteral(args[2]));
      return params;
    }

    params[primaryKey] = this.convertLiteral(args[0]);
    if (args[1]) {
      params.options = this.parseJsonLike(args[1]) || this.parseKeyValueParams(args[1]) || this.convertLiteral(args[1]);
    }
    return params;
  }

  splitArguments(argsText) {
    const args = [];
    let current = '';
    let depth = 0;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];
      const prev = argsText[i - 1];

      if (inQuotes) {
        current += char;
        if (char === quoteChar && prev !== '\\') {
          inQuotes = false;
          quoteChar = '';
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inQuotes = true;
        quoteChar = char;
        current += char;
        continue;
      }

      if (char === '{' || char === '[' || char === '(') {
        depth += 1;
        current += char;
        continue;
      }

      if (char === '}' || char === ']' || char === ')') {
        depth -= 1;
        current += char;
        continue;
      }

      if (char === ',' && depth === 0) {
        if (current.trim()) {
          args.push(current.trim());
        }
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  parseKeyValueParams(text) {
    const params = {};
    let index = 0;
    const length = text.length;

    const skipWhitespace = () => {
      while (index < length && /[\s,;]+/.test(text[index])) index += 1;
    };

    const readValue = () => {
      let value = '';
      let depth = 0;
      let inQuotes = false;
      let quoteChar = '';

      while (index < length) {
        const char = text[index];
        const prev = text[index - 1];

        if (inQuotes) {
          value += char;
          if (char === quoteChar && prev !== '\\') {
            inQuotes = false;
            quoteChar = '';
          }
          index += 1;
          continue;
        }

        if (char === '"' || char === "'" || char === '`') {
          inQuotes = true;
          quoteChar = char;
          value += char;
          index += 1;
          continue;
        }

        if (char === '{' || char === '[' || char === '(') {
          depth += 1;
          value += char;
          index += 1;
          continue;
        }

        if (char === '}' || char === ']' || char === ')') {
          depth -= 1;
          value += char;
          index += 1;
          continue;
        }

        if ((char === ',' || char === ';') && depth === 0) {
          index += 1;
          break;
        }

        if (/\s/.test(char) && depth === 0) {
          const lookahead = text.slice(index).trimStart();
          const keyMatch = lookahead.match(/^([A-Za-z_][\w]*)\s*(=|:)/);
          if (keyMatch) {
            break;
          }
        }

        value += char;
        index += 1;
      }

      return value.trim();
    };

    while (index < length) {
      skipWhitespace();
      const keyMatch = text.slice(index).match(/^([A-Za-z_][\w]*)/);
      if (!keyMatch) break;
      const key = keyMatch[1];
      index += key.length;
      skipWhitespace();

      if (text[index] !== ':' && text[index] !== '=') {
        return null;
      }
      index += 1;
      skipWhitespace();

      const rawValue = readValue();
      if (!rawValue) {
        params[key] = '';
        continue;
      }

      params[key] = this.convertLiteral(rawValue);
    }

    return Object.keys(params).length ? params : null;
  }

  convertLiteral(value) {
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return this.parseJsonLike(trimmed) || trimmed;
    }

    if (/^['"`].*['"`]$/.test(trimmed)) {
      return this.stripQuotes(trimmed);
    }

    return trimmed;
  }

  stripQuotes(value) {
    const trimmed = value.trim();
    if (/^['"`].*['"`]$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  async requestActionNarration(userQuery, runState, action, actionResult, plan, sessionId, isSummary = false) {
    try {
      const prompt = this.buildActionNarrationPrompt(userQuery, runState, action, actionResult, plan, isSummary);
      const response = await this.makeAIRequest(prompt, sessionId);
      return this.extractNarrationEntries(response);
    } catch (error) {
      console.warn('RE+ACT: Failed to generate narration entry', error);
      return [];
    }
  }

  buildActionNarrationPrompt(userQuery, runState, action, actionResult, plan, isSummary = false) {
    const recentLog = runState.thinkingLog.slice(-5).map((entry) => `- ${entry.text}`).join('\n');
    const actionDescription = `${action.type} ${JSON.stringify(action.params)}`;
    const resultSummary = actionResult.success
      ? `Success with ${Array.isArray(actionResult.results) ? actionResult.results.length : actionResult.resultCount || 0} results`
      : `Failed: ${actionResult.error || 'unknown error'}`;

    return `You are maintaining a THINKING_LOG for an AI agent investigating project files.
User query: ${userQuery}
Latest plan steps:
${plan.actions
  .map((step, idx) => `${idx + 1}. ${step.type} ${JSON.stringify(step.params || {})}`)
  .join('\n')}

Recent log entries:
${recentLog || '(none yet)'}

$${isSummary ? 'FINAL SUMMARY' : 'EXECUTED ACTION'}:
- Action: ${actionDescription}
- Result: ${resultSummary}

Write one or two short, first-person bullet log entries describing what you just did or what you will do next. The style should be dynamic, referencing specific files/lines when possible (e.g., "read app.js from 400-500" or "found renderSession in state.js line 655").

Respond using either plain text lines or JSON array of strings. Do not add headers.`;
  }

  extractNarrationEntries(response) {
    if (!response) return [];
    if (typeof response !== 'string') {
      return [];
    }

    const trimmed = response.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      const parsed = this.parseJsonLike(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item : item && item.text ? item.text : JSON.stringify(item)))
          .filter(Boolean);
      }
    }

    return trimmed
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d\.\)\s]+/, '').trim())
      .filter(Boolean);
  }

  buildFollowupPrompt(action, actionResult, plan, runState, userQuery) {
    const resultSummary = actionResult.success
      ? `Found ${Array.isArray(actionResult.results) ? actionResult.results.length : actionResult.resultCount || 0} results`
      : `Failed: ${actionResult.error}`;

    let resultsText = '';
    if (actionResult.success && actionResult.results) {
      if (Array.isArray(actionResult.results)) {
        resultsText = actionResult.results
          .map((r) => `FILE: ${r.fileName}:${r.lineNumber}\n${r.context || r.snippet || ''}`)
          .join('\n---\n');
      } else {
        resultsText = JSON.stringify(actionResult.results, null, 2);
      }
    }

    const historySummary = runState.actionHistory
      .map((entry, idx) => `${idx + 1}. ${entry.action.type} -> ${entry.result.success ? 'success' : 'failed'}`)
      .join('\n');

    return `SEARCH ACTION COMPLETED:
Action: ${action.type} with ${JSON.stringify(action.params)}
Result: ${resultSummary}

SEARCH RESULTS:
${resultsText}

PREVIOUS ACTIONS:
${historySummary}

User question: ${userQuery}

If you need more information, propose additional actions using any of the supported formats (numbered list, bullet, inline function call, JSON array, or markdown table). If you have enough evidence to answer, summarize your findings in prose without asking for new actions.`;
  }

  buildSynthesisPrompt(userQuery, actionHistory, sessionState, runState) {
    const searchSummary = actionHistory
      .map((h, i) => {
        const result = h.result.success
          ? `${h.result.resultCount} results`
          : `Failed: ${h.result.error}`;
        return `${i + 1}. ${h.action.type}: ${result}`;
      })
      .join('\n');

    const allResults = actionHistory
      .filter((h) => h.result.success && h.result.results)
      .map((h) => {
        const actionType = h.action.type;
        const results = Array.isArray(h.result.results)
          ? h.result.results
              .map((r) => `${r.fileName}:${r.lineNumber} - ${(r.context || r.snippet || '').substring(0, 300)}`)
              .join('\n')
          : JSON.stringify(h.result.results, null, 2);
        return `${actionType.toUpperCase()} RESULTS:\n${results}`;
      })
      .join('\n\n---\n\n');

    const thinkingNarrative = runState.thinkingLog
      .map((entry) => `- ${entry.text}`)
      .join('\n');

    return `Based on the search analysis performed, provide a comprehensive answer to the user's question.

ORIGINAL QUESTION: "${userQuery}"

SEARCH ACTIONS PERFORMED:
${searchSummary}

THINKING LOG:
${thinkingNarrative}

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
   * Execute a single action
   */
  async executeAction(action, sessionId) {
    console.log(`Executing ${action.type} with params:`, action.params);

    try {
      const result = await this.searchEngine.executeSearchCommand(action.type, action.params);

      const limitedResult = this.limitSearchResults(result, 100);

      action.executed = true;

      return {
        success: true,
        action: action.type,
        params: action.params,
        resultCount: Array.isArray(result) ? result.length : 1,
        results: limitedResult,
        requiresFollowup: this.shouldRequireFollowup(action, result),
      };
    } catch (error) {
      console.error(`Action ${action.type} failed:`, error);
      return {
        success: false,
        action: action.type,
        params: action.params,
        error: error.message,
        requiresFollowup: false,
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
      const context = result.context || result.snippet || '';
      const resultLines = context ? context.split('\n').length : 1;

      if (totalLines + resultLines <= maxLines) {
        limitedResults.push(result);
        totalLines += resultLines;
      } else {
        limitedResults.push({
          ...result,
          context: `[TRUNCATED - Found ${results.length - limitedResults.length} more matches]`,
          truncated: true,
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
    if (Array.isArray(result) && result.length === 0) {
      return true;
    }

    if (Array.isArray(result) && result.length > 50) {
      return true;
    }

    return false;
  }

  buildEmptyPlanReprompt(userQuery, plan, sessionState) {
    if (!plan || (plan.actions && plan.actions.length > 0)) return null;

    return `Your previous response did not produce executable actions. Rewrite the PLAN section so that it contains valid actions using the accepted formats (numbered steps, bullet list, inline function calls, JSON array, or markdown table). Include parameters for each action. Also provide a THINKING_LOG with dynamic narration.

USER QUESTION: ${userQuery}
FILES AVAILABLE: ${sessionState.files.map((f) => f.name).join(', ')}`;
  }

  /**
   * Make AI request (integrated with existing LangChain service)
   */
  async makeAIRequest(prompt, sessionId) {
    try {
      console.log(`AI Request for session ${sessionId}:`, prompt.slice(0, 100) + '...');

      const sessionData = this.sessionState.get(sessionId);
      if (!sessionData || !sessionData.model) {
        throw new Error('Session not properly initialized with model information');
      }

      const { provider, model, apiKey, baseUrl } = sessionData.model;

      const url = new URL(`${baseUrl.replace(/\/+$/, '')}/chat/completions`);
      const bodyObj = {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      };

      const body = JSON.stringify(bodyObj);
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
          headers,
        };

        const req = https.request(opts, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
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
      const content =
        jsonResponse?.choices?.[0]?.message?.content ||
        jsonResponse?.message?.content ||
        jsonResponse?.output_text ||
        '';

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
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('textarea') && lowerPrompt.includes('not')) {
      return `REASONING: The user is reporting an issue with textarea elements not appearing or functioning properly.

PLAN:
1. ACTION: searchHTML with {"element": "textarea"}
   WHY: Need to check if textarea elements exist in the HTML files

2. ACTION: searchCSS with {"selector": "textarea"}
   WHY: Check for CSS rules that might be hiding or styling textarea elements

3. searchPattern("display\\s*:\\s*none", {"maxResults": 20})
   WHY: Look for CSS rules that might be hiding elements

THINKING_LOG:
- created todos 0/3
- read templates/app.html to inspect textarea usage
- check styles.css around display rules`;
    }

    return `REASONING: Analyzing the uploaded files to understand the structure and identify potential issues.

PLAN:
1. ACTION: analyzeFileStructure with {"fileName": "*.html"}
   WHY: Understand the overall HTML structure

2. ACTION: searchPattern with {"pattern": "${lowerPrompt.includes('error') ? 'error|Error|ERROR' : '\\w+'}", "options": {"maxResults": 20}}
   WHY: Search for relevant patterns in the code

THINKING_LOG:
- created todos 0/2
- list project files to map the structure
- inspect matching files for the requested pattern`;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const sessionState = this.sessionState.get(sessionId);
    if (!sessionState) return null;

    return {
      filesLoaded: sessionState.files.length,
      actionsExecuted: sessionState.lastRun ? sessionState.lastRun.actionHistory.length : 0,
      searchHistory: this.searchEngine.searchHistory.length,
      capabilities: sessionState.capabilities,
    };
  }
}

module.exports = ReasoningActionAgent;
