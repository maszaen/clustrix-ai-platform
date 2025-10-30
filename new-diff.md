diff --git a/backend/reasoning-action-agent.js b/backend/reasoning-action-agent.js
index 91614ba..9789dac 100644
--- a/backend/reasoning-action-agent.js
+++ b/backend/reasoning-action-agent.js
@@ -96,11 +96,35 @@ class ReasoningActionAgent {
     // Store conversation history in session state
     sessionState.conversationHistory = existingMessages;
     sessionState.language = language;
+    sessionState.sessionId = sessionId; // Store sessionId for helper methods
     log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
       `Stored ${existingMessages.length} previous messages in session state for context, language: ${language}`);
-    
+
     const usageBreakdown = [];
-    
+    sessionState.usageBreakdown = usageBreakdown; // Store reference for triage
+
+    // NEW: Pre-search triage to avoid unnecessary web searches
+    const triageDecision = await this.triageSearchNeed(userQuery, sessionState);
+
+    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
+      `Search triage result: needsWebSearch=${triageDecision.needsWebSearch}, confidence=${triageDecision.confidence}, reasoning="${triageDecision.reasoning}"`);
+
+    // Temporarily disable web search if not needed (high confidence)
+    const originalWebCapability = sessionState.capabilities.supportsWebSearch;
+    if (!triageDecision.needsWebSearch && triageDecision.confidence > 0.7) {
+      sessionState.capabilities.supportsWebSearch = false;
+
+      log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
+        `Web search disabled for this query (confidence: ${triageDecision.confidence}): ${triageDecision.reasoning}`);
+
+      if (progressCallback) {
+        progressCallback({
+          type: 'thinking',
+          content: `Triage: ${triageDecision.reasoning} (focusing on ${sessionState.files.length > 0 ? 'file analysis' : 'general knowledge'})`
+        });
+      }
+    }
+
     if (progressCallback) {
       progressCallback({
         type: 'searching',
@@ -494,7 +518,15 @@ class ReasoningActionAgent {
         });
       }
       finalResponse = typeof synthesized === "string" ? synthesized : "";
-    }    return {
+    }
+
+    // Restore original web capability
+    sessionState.capabilities.supportsWebSearch = originalWebCapability;
+
+    log(logHelper, 'REASONING_ACTION_AGENT', 'processWithReasoningAction',
+      `Query processing complete. Web capability restored to: ${originalWebCapability}`);
+
+    return {
       response: finalResponse,
       actionsExecuted: sessionState.actionHistory.length,
       searchResults: sessionState.actionHistory.map(h => h.result),
@@ -1037,7 +1069,221 @@ CURRENT THINKING: [What you expect to learn from these actions and how they will
     return indonesianScore > englishScore ? 'id' : 'en';
   }
 
-  
+  /**
+   * Decide if web search is actually needed for this query
+   * Returns: { needsWebSearch: boolean, reasoning: string, confidence: number }
+   */
+  async triageSearchNeed(userQuery, sessionState) {
+    const logHelper = { sessionId: sessionState.sessionId || 'unknown' };
+    const hasFiles = sessionState.files && sessionState.files.length > 0;
+    const hasWebCapability = sessionState.capabilities?.supportsWebSearch;
+
+    log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+      `Triaging search need for query: "${userQuery.substring(0, 100)}..." (hasFiles: ${hasFiles}, hasWebCapability: ${hasWebCapability})`);
+
+    // FAST RULES: No AI call needed
+
+    // Rule 1: No web capability = no web search possible
+    if (!hasWebCapability) {
+      log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+        'Fast rule: Web search not configured');
+      return { needsWebSearch: false, reasoning: 'Web search not configured', confidence: 1.0 };
+    }
+
+    // Rule 2: User explicitly mentions uploaded files
+    const fileKeywords = ['file', 'uploaded', 'document', 'kode', 'code', 'script', 'di file', 'dari file', 'dalam file', 'file ini', 'file yang'];
+    const mentionsFiles = fileKeywords.some(kw => userQuery.toLowerCase().includes(kw));
+    if (hasFiles && mentionsFiles) {
+      log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+        'Fast rule: Query explicitly about uploaded files');
+      return { needsWebSearch: false, reasoning: 'Query explicitly about uploaded files', confidence: 0.9 };
+    }
+
+    // Rule 3: User explicitly requests web search
+    const webKeywords = ['cari di internet', 'search online', 'google', 'web search', 'latest', 'terbaru', 'news', 'berita', 'current', 'sekarang', 'hari ini', 'bulan ini'];
+    const explicitWeb = webKeywords.some(kw => userQuery.toLowerCase().includes(kw));
+    if (explicitWeb) {
+      log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+        'Fast rule: User explicitly requested web search');
+      return { needsWebSearch: true, reasoning: 'User explicitly requested web search', confidence: 1.0 };
+    }
+
+    // Rule 4: No files uploaded AND query needs external info = likely web search
+    if (!hasFiles) {
+      const needsExternalInfo = /what is|apa itu|explain|jelaskan|how to|bagaimana|cara|research|analisis|comparison|compare|bandingkan/i.test(userQuery);
+      if (needsExternalInfo) {
+        log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+          'Fast rule: No local files, query needs external information');
+        return { needsWebSearch: true, reasoning: 'No local files, query needs external information', confidence: 0.8 };
+      }
+    }
+
+    // Rule 5: Has files, but query about current/external topic
+    if (hasFiles) {
+      const externalTopics = ['latest', 'terbaru', '2024', '2025', 'current', 'news', 'trend', 'sekarang'];
+      const isExternal = externalTopics.some(kw => userQuery.toLowerCase().includes(kw));
+      if (isExternal) {
+        log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+          'Fast rule: Query about current/external information despite having files');
+        return { needsWebSearch: true, reasoning: 'Query about current/external information', confidence: 0.7 };
+      }
+    }
+
+    // FALLBACK: Use lightweight AI triage for ambiguous cases
+    log(logHelper, 'REASONING_ACTION_AGENT', 'triageSearchNeed',
+      'Fast rules inconclusive, using AI triage');
+    return await this.aiTriageSearchNeed(userQuery, sessionState);
+  }
+
+  /**
+   * AI-powered triage for ambiguous cases
+   * Uses lightweight prompt (< 500 tokens)
+   */
+  async aiTriageSearchNeed(userQuery, sessionState) {
+    const logHelper = { sessionId: sessionState.sessionId || 'unknown' };
+    const hasFiles = sessionState.files && sessionState.files.length > 0;
+    const fileList = hasFiles
+      ? sessionState.files.map(f => f.name).slice(0, 5).join(', ') + (sessionState.files.length > 5 ? '...' : '')
+      : 'none';
+
+    const triagePrompt = `Quick triage decision. Response MUST be valid JSON only, no other text.
+
+User uploaded files: ${fileList}
+User query: "${userQuery}"
+
+Decide: Does this query NEED web search, or can it be answered from uploaded files or general knowledge?
+
+Respond ONLY with JSON (no markdown, no explanation):
+{"needsWebSearch": true/false, "reasoning": "brief reason", "confidence": 0.0-1.0}
+
+Examples:
+- "Analyze my code" → {"needsWebSearch": false, "reasoning": "Query about uploaded files", "confidence": 0.9}
+- "Latest React 19 features" → {"needsWebSearch": true, "reasoning": "Needs current information", "confidence": 0.95}
+- "What is JWT?" → {"needsWebSearch": false, "reasoning": "General knowledge question", "confidence": 0.7}
+
+Your response:`;
+
+    try {
+      log(logHelper, 'REASONING_ACTION_AGENT', 'aiTriageSearchNeed',
+        `Sending AI triage request (${triagePrompt.length} chars)`);
+
+      const result = await this.makeAIRequest(triagePrompt, sessionState.sessionId || 'triage');
+
+      log(logHelper, 'REASONING_ACTION_AGENT', 'aiTriageSearchNeed',
+        `Received AI triage response: ${result.content}`);
+
+      // Try to extract JSON from response (might have markdown code blocks)
+      let jsonText = result.content.trim();
+      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
+      if (jsonMatch) {
+        jsonText = jsonMatch[0];
+      }
+
+      const decision = JSON.parse(jsonText);
+
+      // Record usage
+      if (result.usage && sessionState.usageBreakdown) {
+        sessionState.usageBreakdown.push({
+          stage: 'search-triage',
+          usage: result.usage,
+          provider: sessionState.model?.provider,
+          model: sessionState.model?.model,
+        });
+      }
+
+      log(logHelper, 'REASONING_ACTION_AGENT', 'aiTriageSearchNeed',
+        `AI triage decision: ${JSON.stringify(decision)}`);
+
+      return decision;
+    } catch (e) {
+      log(logHelper, 'REASONING_ACTION_AGENT', 'aiTriageSearchNeed',
+        `Triage failed (${e.message}), defaulting to allow search`);
+      // Fallback: If triage fails, err on the side of allowing search
+      return { needsWebSearch: true, reasoning: 'Triage failed, allowing search', confidence: 0.5 };
+    }
+  }
+
+  /**
+   * Assess if web search results are relevant to the query
+   * Returns: 0.0-1.0 score
+   */
+  assessWebResultRelevance(results, params) {
+    if (!Array.isArray(results) || results.length === 0) {
+      return 0.0;
+    }
+
+    const query = params.query || params.q || '';
+    if (!query) return 0.5; // Can't assess without query
+
+    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
+    if (queryTerms.length === 0) return 0.5;
+
+    let totalRelevance = 0;
+
+    results.forEach(result => {
+      const title = (result.title || '').toLowerCase();
+      const snippet = (result.snippet || result.preview || '').toLowerCase();
+      const content = (result.content || '').toLowerCase();
+      const combined = `${title} ${snippet} ${content}`;
+
+      // Count how many query terms appear in result
+      const matchCount = queryTerms.filter(term => combined.includes(term)).length;
+      const matchRatio = matchCount / queryTerms.length;
+
+      totalRelevance += matchRatio;
+    });
+
+    return Math.min(totalRelevance / results.length, 1.0);
+  }
+
+  /**
+   * Validate if an action is necessary or redundant
+   */
+  validateActionNecessity(action, actionHistory, userQuery) {
+    // Rule 1: Don't repeat exact same search
+    const duplicate = actionHistory.find(h =>
+      h.action.type === action.type &&
+      JSON.stringify(h.action.params) === JSON.stringify(action.params)
+    );
+    if (duplicate) {
+      return {
+        necessary: false,
+        reason: 'Duplicate search - already executed with same parameters'
+      };
+    }
+
+    // Rule 2: Don't web search if we have > 15 web results already
+    if (['webSearch', 'fetchWebPage'].includes(action.type)) {
+      const webResultCount = actionHistory
+        .filter(h => ['webSearch', 'fetchWebPage'].includes(h.action.type))
+        .reduce((sum, h) => sum + (h.result?.resultCount || 0), 0);
+
+      if (webResultCount >= 15) {
+        return {
+          necessary: false,
+          reason: `Already have ${webResultCount} web results - sufficient for analysis`
+        };
+      }
+    }
+
+    // Rule 3: Don't search for file structure multiple times
+    if (action.type === 'analyzeFileStructure') {
+      const alreadyAnalyzed = actionHistory.find(h =>
+        h.action.type === 'analyzeFileStructure' &&
+        h.action.params.fileName === action.params.fileName
+      );
+      if (alreadyAnalyzed && alreadyAnalyzed.result?.success) {
+        return {
+          necessary: false,
+          reason: `File ${action.params.fileName} already analyzed`
+        };
+      }
+    }
+
+    return { necessary: true, reason: 'Action is necessary' };
+  }
+
+
   parseReasoningResponse(response) {
     const plan = {
       reasoning: '',
@@ -1344,10 +1590,36 @@ CURRENT THINKING: [What you expect to learn from these actions and how they will
       const result = await this.searchEngine.executeSearchCommand(action.type, action.params);
       log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
         `Search engine returned: ${Array.isArray(result) ? result.length : 1} raw results`);
-      
-      const limitedResult = this.limitSearchResults(result, 100);
+
       const resultCount = Array.isArray(result) ? result.length : (result ? 1 : 0);
 
+      // NEW: Check relevance for web actions to enable early stop
+      if (['webSearch', 'fetchWebPage'].includes(action.type)) {
+        const relevanceScore = this.assessWebResultRelevance(result, action.params);
+
+        log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
+          `Web search relevance assessment: score=${relevanceScore.toFixed(2)}, resultCount=${resultCount}`);
+
+        // If very low relevance and we have 0 results, mark as requires followup = false
+        // This prevents AI from retrying with different queries endlessly
+        if (relevanceScore < 0.3 && resultCount === 0) {
+          log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
+            `Low relevance (${relevanceScore.toFixed(2)}) + 0 results = stopping search attempts`);
+
+          return {
+            success: false,
+            action: action.type,
+            params: action.params,
+            resultCount: 0,
+            results: [],
+            error: 'No relevant results found for query',
+            requiresFollowup: false  // ← Stop retry attempts
+          };
+        }
+      }
+
+      const limitedResult = this.limitSearchResults(result, 100);
+
       log(logHelper, 'REASONING_ACTION_AGENT', 'executeAction',
         `Action ${action.type} completed successfully:\n  Total results: ${resultCount}\n  Limited results: ${Array.isArray(limitedResult) ? limitedResult.length : 1}\n  Full result preview:\n${JSON.stringify(limitedResult, null, 2).substring(0, 1000)}...`);
 
diff --git a/backend/web-search.js b/backend/web-search.js
index e9cae73..6fc7796 100644
--- a/backend/web-search.js
+++ b/backend/web-search.js
@@ -26,8 +26,9 @@ async function performWebSearch(queries, config, logHelper, options = {}) {
   const provider = config.provider || 'serpapi';
   const includeImages = options.includeImages !== false;
   const imageCount = options.imageCount || 2;
-  
-  log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Starting search with provider ${provider}.`, { queries, includeImages });
+  const resultCount = options.resultCount || 5;  // Dynamic result count with default 5
+
+  log(logHelper, 'WEB_SEARCH', 'performWebSearch', `Starting search with provider ${provider}.`, { queries, includeImages, resultCount });
 
   if (provider === 'google') {
     if (!config.googleApiKey || !config.googleCseId) {
@@ -95,7 +96,7 @@ async function performWebSearch(queries, config, logHelper, options = {}) {
           snippet: item.snippet,
         }))
         .filter((item) => item.link && !item.link.includes('youtube.com'))
-        .slice(0, 5);
+        .slice(0, resultCount);
 
       const imageResults = imageResponse && Array.isArray(imageResponse.items)
         ? imageResponse.items.slice(0, imageCount).map((item) => ({
@@ -152,7 +153,7 @@ async function performWebSearch(queries, config, logHelper, options = {}) {
         snippet: item.snippet,
       }))
       .filter((item) => item.link && !item.link.includes('youtube.com'))
-      .slice(0, 5);
+      .slice(0, resultCount);
 
     const imageResults = imageResponse && Array.isArray(imageResponse.images_results)
       ? imageResponse.images_results.slice(0, imageCount).map((item) => ({
@@ -173,17 +174,28 @@ async function performWebSearch(queries, config, logHelper, options = {}) {
   }
 }
 
-async function scrapeUrls(urls, logHelper) {
+async function scrapeUrls(urls, logHelper, resultCount = 5) {
   if (!Array.isArray(urls) || urls.length === 0) {
     log(logHelper, 'WEB_SEARCH', 'scrapeUrls', 'No URLs to scrape.');
     return [];
   }
 
-  const MAX_CHARS_PER_PAGE = 2000;
+  // Smart optimization: adjust scraping parameters based on result count
+  // For many sources: prioritize speed with shorter content per page
+  // For few sources: prioritize depth with more content per page
+  const MAX_CHARS_PER_PAGE = resultCount > 10 ? 1500 : 2000;
+  const SCRAPE_TIMEOUT = resultCount > 10 ? 3000 : 5000;
+
+  log(logHelper, 'WEB_SEARCH', 'scrapeUrls', `Smart scraping: ${urls.length} URLs with optimized settings`, {
+    resultCount,
+    charsPerPage: MAX_CHARS_PER_PAGE,
+    timeout: SCRAPE_TIMEOUT
+  });
+
   const scrapePromises = urls.map(async (url) => {
     try {
       const controller = new AbortController();
-      const timeout = setTimeout(() => controller.abort(), 5000);
+      const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT);
       const response = await fetch(url, { signal: controller.signal });
       clearTimeout(timeout);
 
diff --git a/main.js b/main.js
index 4f7b4a4..e3ad8d3 100644
--- a/main.js
+++ b/main.js
@@ -4135,8 +4135,37 @@ ipcMain.handle('chat:title', async (_evt, payload) => {
     }
   }
 });
+
+/**
+ * Extract explicit source count from user query using NLP patterns
+ * @param {string} query - User query text
+ * @returns {number|null} - Requested count or null if not found
+ */
+function extractRequestedSourceCount(query) {
+  const patterns = [
+    /minimal\s+(\d+)\s+(sumber|source|sources|artikel|link|links|url|urls|website|websites|halaman|pages)/i,
+    /(?:at\s+least|setidaknya|paling\s+sedikit)\s+(\d+)\s+(sumber|source|sources|artikel|link|links)/i,
+    /(\d+)\s+(sumber|source|sources|artikel|link|links|referensi|references)/i,
+    /cari\s+(\d+)\s+(sumber|source|artikel|link)/i,
+    /(\d+)\s+case\s+stud(?:y|ies)/i,
+    /butuh\s+(\d+)\s+(sumber|artikel|referensi)/i,
+    /find\s+(\d+)\s+(sources?|articles?|links?)/i,
+  ];
+
+  for (const pattern of patterns) {
+    const match = query.match(pattern);
+    if (match) {
+      const num = parseInt(match[1], 10);
+      if (num >= 3 && num <= 50) {  // Sanity check: reasonable range
+        return Math.min(num, 20);  // Cap at 20 for API safety
+      }
+    }
+  }
+  return null;  // Let AI decide
+}
+
 const TRIAGE_SYSTEM_PROMPT = `You are a reasoning agent. Your first task is to analyze the user's query and decide if it requires real-time internet access. The current date is ${new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric' })}. Respond ONLY with a single JSON object. Do not add any text before or after it.
-JSON format: {"requires_search": boolean, "reasoning": "string", "user_prompt": "string", "search_queries": ["string", ...], "summary_key": "string", "image_count": number}
+JSON format: {"requires_search": boolean, "reasoning": "string", "user_prompt": "string", "search_queries": ["string", ...], "summary_key": "string", "image_count": number, "result_count": number}
 Set "requires_search" to true if the query is about recent events (relative to the current date), specific facts, or explicitly asks to search. Otherwise, set it to false.
 "user_prompt" MUST be the exact original user query.
 "summary_key" MUST be a very short, 2-4 word summary of the user's query in English.
@@ -4147,7 +4176,14 @@ If "requires_search" is true, provide 1-3 effective Google search queries releva
 - 1-2: Minimal images for context (news, articles, general info)
 - 3-5: Moderate images (tutorials, explanations with visual aids, travel info)
 - 6-10: High visual content (image search, wallpapers, design inspiration, photo galleries, art, memes, visual references)
-Analyze the query intent to decide the appropriate image_count.`;
+Analyze the query intent to decide the appropriate image_count.
+
+"result_count" determines how many web results to fetch (3-20):
+- 3-5: Quick fact check, simple questions, brief answers
+- 6-10: Standard research, comparisons, general analysis
+- 11-15: Comprehensive analysis, multiple perspectives needed, detailed research
+- 16-20: Deep research, academic queries, case studies, extensive source requirements
+IMPORTANT: If user explicitly mentions a number (e.g., "10 sources", "minimal 15 sumber", "5 artikel"), use that exact number. Otherwise, analyze the query complexity and depth required to decide the appropriate result_count.`;
 
 async function runWebSearchChat(event, payload) {
   const { reqId, messages } = payload;
@@ -4201,22 +4237,37 @@ async function runWebSearchChat(event, payload) {
 
     event.sender.send('chat-update', { type: 'SEARCHING', messageIndex: payload.aiMessageIndex, data: { summarizedQuery: decision.search_queries[0] } });
     
-    const imageCount = typeof decision.image_count === 'number' && decision.image_count >= 0 
-      ? Math.min(Math.floor(decision.image_count), 10) 
+    const imageCount = typeof decision.image_count === 'number' && decision.image_count >= 0
+      ? Math.min(Math.floor(decision.image_count), 10)
       : 2;
     const includeImages = imageCount > 0;
-    
-    logHelper('WEB_CHAT', 'performWebSearch', 'Memulai pencarian di internet...', { 
-      queries: decision.search_queries, 
-      imageCount, 
-      includeImages 
+
+    // Hybrid approach for result count: Explicit > AI > Default
+    const explicitCount = extractRequestedSourceCount(userQuery);
+    const aiSuggestedCount = decision.result_count;
+    const resultCount = explicitCount
+      || (typeof aiSuggestedCount === 'number' && aiSuggestedCount >= 3 ? Math.min(Math.floor(aiSuggestedCount), 20) : null)
+      || 5;
+
+    logHelper('WEB_CHAT', 'runWebSearchChat', 'Result count determined via hybrid approach', {
+      explicit: explicitCount,
+      ai_suggested: aiSuggestedCount,
+      final: resultCount,
+      source: explicitCount ? 'user_explicit' : (aiSuggestedCount ? 'ai_decision' : 'default')
+    });
+
+    logHelper('WEB_CHAT', 'performWebSearch', 'Memulai pencarian di internet...', {
+      queries: decision.search_queries,
+      imageCount,
+      includeImages,
+      resultCount
     });
     
     const searchResults = await performWebSearch(
-      decision.search_queries, 
-      payload.searchApiConfig, 
+      decision.search_queries,
+      payload.searchApiConfig,
       logHelper,
-      { includeImages, imageCount }
+      { includeImages, imageCount, resultCount }
     );
     
     if (searchResults.length === 0) {
@@ -4253,8 +4304,8 @@ async function runWebSearchChat(event, payload) {
       } 
     });
     
-    logHelper('WEB_CHAT', 'scrapeUrls', 'Memulai scraping...', { urls: urlsToScrape });
-    const scrapedContent = await scrapeUrls(urlsToScrape);
+    logHelper('WEB_CHAT', 'scrapeUrls', 'Memulai scraping...', { urls: urlsToScrape, resultCount });
+    const scrapedContent = await scrapeUrls(urlsToScrape, logHelper, resultCount);
     const nonEmptyContent = scrapedContent.filter(c => c.trim().length > 10);
 
     if (nonEmptyContent.length === 0) {
