const { performWebSearch, scrapeUrls } = require('./web-search');

class ClustrixAgentSystem {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.researchAgent = new DynamicResearchAgent(langchainService);
  }

  async processWithAgent(userMessage, sessionId, session, options = {}) {
    return this.researchAgent.process(userMessage, sessionId, session, options);
  }
}

class DynamicResearchAgent {
  constructor(langchainService) {
    this.langchainService = langchainService;
  }

  async process(userMessage, sessionId, session, options = {}) {
    const {
      model,
      apiKey,
      provider,
      baseUrl,
      searchApiConfig,
      progressCallback,
      logHelper,
      maxQueries = 3,
      maxSearchResults = 5,
    } = options;

    if (!model || !apiKey || !baseUrl) {
      throw new Error('DynamicResearchAgent requires model, apiKey, and baseUrl.');
    }

    const uploadedFiles = Array.isArray(session?.uploadedFiles)
      ? session.uploadedFiles
      : [];

    const fileContext = this.buildFileContext(uploadedFiles);

      progressCallback({
        type: 'thinking_log',
        entry: {
          text: '• Reviewing relevant project file summaries.',
          stage: 'context',
        },
      });

    const planningPrompt = this.buildPlanningPrompt(userMessage, fileContext.summaryText);
    const planningResponse = await this.invokeLLM(planningPrompt, {
      model,
      apiKey,
      provider,
      baseUrl,
    }, sessionId);

    const plan = this.parsePlanningResponse(planningResponse);
    this.emitPlanThinking(plan, progressCallback);

    let combinedFindings = [];
    if (plan.queries.length > 0 && searchApiConfig) {
        progressCallback({
          type: 'thinking_log',
          entry: {
            text: '• Running advanced web search based on plan.',
            stage: 'web-search',
          },
        });

      const limitedQueries = plan.queries.slice(0, maxQueries);
      const searchResults = await performWebSearch(limitedQueries, searchApiConfig, logHelper);

      if (Array.isArray(searchResults) && searchResults.length > 0) {
        const topResults = searchResults.slice(0, maxSearchResults);
        const scrapedContent = await scrapeUrls(topResults.map((r) => r.link), logHelper);

        combinedFindings = topResults
          .map((result, index) => ({
            title: result.title,
            url: result.link,
            snippet: result.snippet || '',
            content: scrapedContent[index] || '',
          }))
          .filter((item) => (item.content && item.content.trim()) || (item.snippet && item.snippet.trim()));

        if (progressCallback) {
          progressCallback({
            type: 'thinking_log',
            entry: {
              text: `• Combining ${combinedFindings.length} online findings for final synthesis.`,
              stage: 'web-search',
            },
          });
        }
      } else if (progressCallback) {
        progressCallback({
          type: 'thinking_log',
          entry: {
            text: '• Pencarian web tidak menemukan hasil yang kuat, menggunakan konteks internal.',
            stage: 'web-search',
          },
        });
      }
    } else if (logHelper) {
      logHelper('RESEARCH_AGENT', 'process', 'Skipping web search due to missing queries or config.', {
        queryCount: plan.queries.length,
        hasConfig: Boolean(searchApiConfig),
      });
    }

    if (progressCallback) {
      progressCallback({
        type: 'thinking_log',
        entry: {
          text: '• Synthesizing final answer based on findings.',
          stage: 'synthesis',
        },
      });
    }

    const synthesisPrompt = this.buildSynthesisPrompt({
      userMessage,
      fileContext,
      plan,
      findings: combinedFindings,
    });

    const finalResponse = await this.invokeLLM(synthesisPrompt, {
      model,
      apiKey,
      provider,
      baseUrl,
    }, sessionId);

    return finalResponse;
  }

  buildFileContext(files, options = {}) {
    const {
      maxFiles = 4,
      maxPointsPerFile = 5,
    } = options;

    if (!Array.isArray(files) || files.length === 0) {
      return {
        summaryText: '',
        entries: [],
      };
    }

    const entries = [];

    for (const file of files.slice(0, maxFiles)) {
      if (!file || typeof file.content !== 'string') continue;
      const points = this.extractBulletSnippets(file.content, maxPointsPerFile);
      if (points.length === 0) continue;

      entries.push({
        fileName: file.name || 'untitled',
        snippets: points,
      });
    }

    const summaryText = entries
      .map((entry) => {
        const bullets = entry.snippets.map((snippet) => `- ${snippet}`).join('\n');
        return `# ${entry.fileName}\n${bullets}`;
      })
      .join('\n\n');

    return {
      summaryText,
      entries,
    };
  }

  extractBulletSnippets(content, maxPoints = 5) {
    if (!content || typeof content !== 'string') return [];

    const lines = content.split(/\r?\n/);
    const results = [];

    for (let i = 0; i < lines.length && results.length < maxPoints; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const bulletMatch = line.match(/^\s*(?:[-*+•]|\d+[.)])\s+(.*)/);
      if (!bulletMatch) continue;

      const bulletText = bulletMatch[1].trim();
      const paragraphLines = [];
      let j = i + 1;

      while (j < lines.length) {
        const nextLine = lines[j];
        if (!nextLine || !nextLine.trim()) {
          if (paragraphLines.length === 0) {
            j += 1;
            continue;
          }
          break;
        }
        if (/^\s*(?:[-*+•]|\d+[.)])\s+/.test(nextLine)) {
          break;
        }
        paragraphLines.push(nextLine.trim());
        if (paragraphLines.join(' ').length > 280) {
          break;
        }
        j += 1;
      }

      const paragraphText = paragraphLines.join(' ');
      const combined = paragraphText ? `${bulletText} — ${paragraphText}` : bulletText;
      results.push(this.normalizeWhitespace(combined).slice(0, 420));
      i = j - 1;
    }

    if (results.length === 0) {
      const fallbackParagraphs = content
        .split(/\n\s*\n/)
        .map((paragraph) => this.normalizeWhitespace(paragraph))
        .filter((paragraph) => paragraph.length > 0)
        .slice(0, maxPoints);

      return fallbackParagraphs.map((paragraph) => paragraph.slice(0, 420));
    }

    return results;
  }

  normalizeWhitespace(text) {
    if (!text) return '';
    return String(text).replace(/\s+/g, ' ').trim();
  }

  buildPlanningPrompt(userMessage, contextSummary) {
    const contextSection = contextSummary && contextSummary.trim()
      ? contextSummary
      : 'No file summary available. Focus on understanding the user request.';

    return `You are Clustrix Research Planner, a research agent that plans work steps before providing answers.

PROJECT CONTEXT (limited summary):
${contextSection}

USER REQUEST:
"""
${userMessage}
"""

TASK:
1. Write one line bullet point title summarizing research focus (use "•" symbol at start of line).
2. Create "FILE INSIGHTS:" section with 2-5 points about file context above.
3. Create "WEB SEARCH QUERIES:" section with 2-4 priority search queries (no automatic numbering from model, use "-" or "•").
4. (Optional) Add "PLAN NOTES:" section with important notes if needed.
5. Avoid table, JSON, or code formats. Only plain text with headings like example.
6. Do not answer user question now; only plan.

Follow this example format:
• Research focus title
FILE INSIGHTS:
- context point
WEB SEARCH QUERIES:
- first query
PLAN NOTES:
- additional note
`;
  }

  parsePlanningResponse(text) {
    const plan = {
      title: '',
      fileInsights: [],
      queries: [],
      notes: [],
    };

    if (!text || typeof text !== 'string') {
      return plan;
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return plan;
    }

    plan.title = lines[0].replace(/^[-•\s]+/, '').trim();

    let section = 'fileInsights';

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^FILE INSIGHTS/i.test(line)) {
        section = 'fileInsights';
        continue;
      }
      if (/^WEB SEARCH QUERIES/i.test(line)) {
        section = 'queries';
        continue;
      }
      if (/^(PLAN NOTES|NOTES)/i.test(line)) {
        section = 'notes';
        continue;
      }

      const value = line.replace(/^[-•\d.)\s]+/, '').trim();
      if (!value) continue;

      if (section === 'fileInsights') {
        plan.fileInsights.push(value);
      } else if (section === 'queries') {
        plan.queries.push(value.replace(/^"|"$/g, ''));
      } else {
        plan.notes.push(value);
      }
    }

    return plan;
  }

  emitPlanThinking(plan, progressCallback) {
    if (typeof progressCallback !== 'function') return;

    if (plan.title) {
      progressCallback({
        type: 'thinking_log',
        entry: {
          text: `• ${plan.title}`,
          stage: 'plan-title',
        },
      });
    }

    plan.fileInsights.forEach((insight) => {
      progressCallback({
        type: 'thinking_log',
        entry: {
          text: insight,
          stage: 'context',
        },
      });
    });

    plan.queries.forEach((query) => {
      progressCallback({
        type: 'thinking_log',
        entry: {
          text: `Rencana pencarian: ${query}`,
          stage: 'web-search-plan',
        },
      });
    });

    plan.notes.forEach((note) => {
      progressCallback({
        type: 'thinking_log',
        entry: {
          text: note,
          stage: 'plan-note',
        },
      });
    });
  }

  buildSynthesisPrompt({ userMessage, fileContext, plan, findings }) {
    const contextSection = fileContext.summaryText && fileContext.summaryText.trim()
      ? fileContext.summaryText
      : 'Tidak ada ringkasan file yang tersedia.';

    const insightSection = plan.fileInsights.length > 0
      ? plan.fileInsights.map((insight) => `- ${insight}`).join('\n')
      : '- Tidak ada insight khusus dari file.';

    const findingsSection = Array.isArray(findings) && findings.length > 0
      ? findings
          .map((item, index) => {
            const title = item.title || `Sumber ${index + 1}`;
            const snippet = this.normalizeWhitespace(item.snippet || '').slice(0, 240);
            const extract = this.normalizeWhitespace(item.content || '').slice(0, 700);
            const pieces = [
              `Judul: ${title}`,
              `URL: ${item.url}`,
            ];
            if (snippet) pieces.push(`Ringkasan awal: ${snippet}`);
            if (extract) pieces.push(`Isi: ${extract}`);
            return pieces.join('\n');
          })
          .join('\n\n')
      : 'Tidak ada temuan web tambahan yang dapat digunakan.';

    return `You are Clustrix Research Agent that must compose the final answer based on file summary and web search results.

PLANNING STEPS:
Title: ${plan.title || 'Not available'}
Key insights:
${insightSection}

SELECTED FILE SUMMARY:
${contextSection}

LATEST WEB FINDINGS:
${findingsSection}

USER QUESTION:
"""
${userMessage}
"""

OUTPUT INSTRUCTIONS:
- Answer the user's question directly with an easy-to-understand structure.
- If the user speaks Indonesian, use Indonesian; if unclear, use neutral English.
- Include references to web sources using markdown link format: [Source Name](URL).
- Combine information from internal context and web results without copying raw text.
- Emphasize next steps or practical recommendations when relevant.
- Do not use JSON or table formats in the final answer.
`;
  }

  async invokeLLM(prompt, options, sessionId) {
    const {
      model,
      apiKey,
      provider,
      baseUrl,
    } = options;

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const url = new URL(endpoint);

    const bodyObj = {
      model,
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
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

    return new Promise((resolve, reject) => {
      const https = require('https');
      const requestOptions = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        protocol: url.protocol,
        headers,
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`LLM request failed (${res.statusCode}): ${data}`));
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const message = parsed?.choices?.[0]?.message?.content;
            resolve(typeof message === 'string' ? message.trim() : '');
          } catch (error) {
            reject(new Error(`Failed to parse LLM response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`LLM request error: ${error.message}`));
      });

      req.write(body);
      req.end();
    });
  }
}

class MultiAgentOrchestrator {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.agentSystem = new ClustrixAgentSystem(langchainService);
  }

  async processComplexRequest(userMessage, sessionId, session, model, apiKey, options = {}) {
    return this.agentSystem.processWithAgent(userMessage, sessionId, session, {
      ...options,
      model,
      apiKey,
    });
  }
}

module.exports = {
  ClustrixAgentSystem,
  MultiAgentOrchestrator,
};
