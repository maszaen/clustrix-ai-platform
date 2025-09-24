const path = require('path');
const fs = require('fs');

class DesktopSearchEngine {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.projectFiles = new Map();
    this.searchHistory = [];
    this.currentTodos = [];
    this.thinkingState = null;
  }

  loadProjectFiles(files) {
    console.log(`Loading ${files.length} files into search engine...`);
    this.projectFiles.clear();
    
    files.forEach(file => {
      this.projectFiles.set(file.name, {
        content: file.content,
        type: file.type,
        lines: file.content.split('\n')
      });
    });
    
    console.log(`Loaded ${this.projectFiles.size} files for searching`);
  }

  searchPattern(rawParams) {
    const params = this.normalizeCommandParams(rawParams);

    const patternInput = params.pattern ?? params.value ?? '';
    const pattern = String(patternInput || '');

    if (!pattern) {
      return [];
    }

    const options = (params && typeof params.options === 'object' && !Array.isArray(params.options))
      ? params.options
      : {};

    const caseSensitive = Boolean(options.caseSensitive);
    const flags = caseSensitive ? 'g' : 'gi';

    let regex;
    try {
      regex = new RegExp(pattern, flags);
    } catch (error) {
      console.warn(`searchPattern: invalid regex "${pattern}":`, error.message);
      return [];
    }

    const files = Array.isArray(options.files) && options.files.length > 0
      ? options.files
      : Array.from(this.projectFiles.keys());

    const numericContext = Number(options.contextLines);
    const contextLines = Number.isFinite(numericContext) && numericContext >= 0
      ? Math.floor(numericContext)
      : 2;

    const numericMax = Number(options.maxResults);
    const maxResults = Number.isFinite(numericMax) && numericMax > 0
      ? Math.floor(numericMax)
      : Infinity;

    const results = [];

    const buildContext = (lines, matchIndex) => {
      const start = Math.max(0, matchIndex - contextLines);
      const end = Math.min(lines.length, matchIndex + contextLines + 1);
      const snippet = [];

      for (let i = start; i < end; i++) {
        const prefix = i === matchIndex ? '>' : ' ';
        snippet.push(`${prefix}${i + 1}: ${lines[i]}`);
      }

      return snippet.join('\n');
    };

    outer: for (const fileName of files) {
      const fileData = this.projectFiles.get(fileName);
      if (!fileData || !fileData.content) {
        continue;
      }

      const lines = Array.isArray(fileData.lines)
        ? fileData.lines
        : String(fileData.content).split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        regex.lastIndex = 0;

        if (regex.test(line)) {
          const contextSnippet = buildContext(lines, lineIndex);
          results.push({
            fileName,
            lineNumber: lineIndex + 1,
            context: contextSnippet,
            match: line.trim(),
            snippet: contextSnippet
          });

          if (results.length >= maxResults) {
            break outer;
          }
        }
      }
    }

    return results;
  }

  searchFunctions(rawParams) {
    const params = this.normalizeCommandParams(rawParams);
    const functionName = params.functionName ?? params.value ?? '';

    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
      ? { ...params.options }
      : {};

    const defaultContext = 3;
    const defaultMaxResults = 50;

    const contextCandidate = Number(options.contextLines ?? defaultContext);
    options.contextLines = Number.isFinite(contextCandidate) && contextCandidate >= 0
      ? Math.floor(contextCandidate)
      : defaultContext;

    const maxCandidate = Number(options.maxResults ?? defaultMaxResults);
    const resolvedMaxResults = Number.isFinite(maxCandidate) && maxCandidate > 0
      ? Math.floor(maxCandidate)
      : defaultMaxResults;
    options.maxResults = resolvedMaxResults;

    const maxResults = resolvedMaxResults;

    const patterns = [
      `function\\s+${functionName || '\\w+'}`,
      `const\\s+${functionName || '\\w+'}\\s*=`,
      `let\\s+${functionName || '\\w+'}\\s*=`,
      `${functionName || '\\w+'}\\s*:\\s*function`,
      `def\\s+${functionName || '\\w+'}`,
      `function\\s*${functionName || '\\w+'}\\s*\\(`
    ];

    const aggregated = [];

    for (const pattern of patterns) {
      const matches = this.searchPattern({ pattern, options });
      aggregated.push(...matches);

      if (maxResults && aggregated.length >= maxResults) {
        break;
      }
    }

    const deduped = this.deduplicateResults(aggregated);
    return maxResults ? deduped.slice(0, maxResults) : deduped;
  }

  searchCSS(rawParams) {
    const params = this.normalizeCommandParams(rawParams);
    const selector = params.selector ?? params.value ?? '';

    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
      ? { ...params.options }
      : {};

    const defaultContext = 2;
    const defaultMaxResults = 30;

    const contextCandidate = Number(options.contextLines ?? defaultContext);
    options.contextLines = Number.isFinite(contextCandidate) && contextCandidate >= 0
      ? Math.floor(contextCandidate)
      : defaultContext;

    const maxCandidate = Number(options.maxResults ?? defaultMaxResults);
    const resolvedMaxResults = Number.isFinite(maxCandidate) && maxCandidate > 0
      ? Math.floor(maxCandidate)
      : defaultMaxResults;
    options.maxResults = resolvedMaxResults;

    const maxResults = resolvedMaxResults;

    const patterns = [
      `\\.${selector}\\s*{`,
      `#${selector}\\s*{`,
      `${selector}\\s*{`,
      `class\\s*=\\s*["'].*${selector}`,
      `id\\s*=\\s*["'].*${selector}`
    ];

    const aggregated = [];

    for (const pattern of patterns) {
      const matches = this.searchPattern({ pattern, options });
      aggregated.push(...matches);

      if (maxResults && aggregated.length >= maxResults) {
        break;
      }
    }

    const deduped = this.deduplicateResults(aggregated);
    return maxResults ? deduped.slice(0, maxResults) : deduped;
  }

  searchHTML(rawParams) {
    const params = this.normalizeCommandParams(rawParams);
    const element = params.element ?? params.value ?? '';

    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
      ? { ...params.options }
      : {};

    const defaultContext = 1;
    const defaultMaxResults = 50;

    const contextCandidate = Number(options.contextLines ?? defaultContext);
    options.contextLines = Number.isFinite(contextCandidate) && contextCandidate >= 0
      ? Math.floor(contextCandidate)
      : defaultContext;

    const maxCandidate = Number(options.maxResults ?? defaultMaxResults);
    const resolvedMaxResults = Number.isFinite(maxCandidate) && maxCandidate > 0
      ? Math.floor(maxCandidate)
      : defaultMaxResults;
    options.maxResults = resolvedMaxResults;

    const maxResults = resolvedMaxResults;

    const patterns = [
      `<${element}[^>]*>`,
      `</${element}>`,
      `<${element}\\s+[^>]*/>`,
      `${element}\\s*=`
    ];

    const aggregated = [];

    for (const pattern of patterns) {
      const matches = this.searchPattern({ pattern, options });
      aggregated.push(...matches);

      if (maxResults && aggregated.length >= maxResults) {
        break;
      }
    }

    const deduped = this.deduplicateResults(aggregated);
    return maxResults ? deduped.slice(0, maxResults) : deduped;
  }

  searchImports(rawParams) {
    const params = this.normalizeCommandParams(rawParams);
    const moduleName = params.moduleName ?? params.value ?? '';
    const modulePattern = moduleName || "[^'\"]+";

    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
      ? { ...params.options }
      : {};

    const defaultContext = 1;
    const defaultMaxResults = 30;

    const contextCandidate = Number(options.contextLines ?? defaultContext);
    options.contextLines = Number.isFinite(contextCandidate) && contextCandidate >= 0
      ? Math.floor(contextCandidate)
      : defaultContext;

    const maxCandidate = Number(options.maxResults ?? defaultMaxResults);
    const resolvedMaxResults = Number.isFinite(maxCandidate) && maxCandidate > 0
      ? Math.floor(maxCandidate)
      : defaultMaxResults;
    options.maxResults = resolvedMaxResults;

    const maxResults = resolvedMaxResults;

    const patterns = [
      `import.*${moduleName || '\\w+'}`,
      `require\\(['"]+${modulePattern}['"]+\\)`,
      `from\\s+${moduleName || '\\w+'}\\s+import`,
      `<script.*src.*${modulePattern}`,
      `<link.*href.*${modulePattern}`
    ];

    const aggregated = [];

    for (const pattern of patterns) {
      const matches = this.searchPattern({ pattern, options });
      aggregated.push(...matches);

      if (maxResults && aggregated.length >= maxResults) {
        break;
      }
    }

    const deduped = this.deduplicateResults(aggregated);
    return maxResults ? deduped.slice(0, maxResults) : deduped;
  }

  analyzeFileStructure(rawParams) {
    const params = this.normalizeCommandParams(rawParams);
    const fileName = params.fileName || params.value;
    const fileData = this.projectFiles.get(fileName);
    if (!fileData) return null;

    const analysis = {
      fileName,
      type: fileData.type,
      lineCount: fileData.lines.length,
      structure: {}
    };

    const ext = path.extname(fileName).toLowerCase();
    
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      analysis.structure = this.analyzeJavaScriptStructure(fileData.lines);
    } else if (['.html', '.htm'].includes(ext)) {
      analysis.structure = this.analyzeHTMLStructure(fileData.lines);
    } else if (['.css', '.scss', '.sass'].includes(ext)) {
      analysis.structure = this.analyzeCSSStructure(fileData.lines);
    }

    return analysis;
  }

  analyzeJavaScriptStructure(lines) {
    const structure = {
      imports: [],
      functions: [],
      classes: [],
      exports: [],
      variables: []
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (/^(import|const.*require|let.*require|var.*require)/.test(trimmed)) {
        structure.imports.push({ line: index + 1, content: trimmed });
      }
      
      if (/^(function|const.*=.*function|let.*=.*function|async\s+function)/.test(trimmed)) {
        structure.functions.push({ line: index + 1, content: trimmed });
      }
      
      if (/^class\s+\w+/.test(trimmed)) {
        structure.classes.push({ line: index + 1, content: trimmed });
      }
      
      if (/^export/.test(trimmed)) {
        structure.exports.push({ line: index + 1, content: trimmed });
      }
    });

    return structure;
  }

  analyzeHTMLStructure(lines) {
    const structure = {
      doctype: null,
      head: { title: null, scripts: [], stylesheets: [] },
      body: { forms: [], inputs: [], buttons: [], divs: [] }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim().toLowerCase();
      
      if (trimmed.includes('<!doctype')) {
        structure.doctype = { line: index + 1, content: line.trim() };
      }
      
      if (trimmed.includes('<title>')) {
        structure.head.title = { line: index + 1, content: line.trim() };
      }
      
      if (trimmed.includes('<script')) {
        structure.head.scripts.push({ line: index + 1, content: line.trim() });
      }
      
      if (trimmed.includes('<link') && trimmed.includes('stylesheet')) {
        structure.head.stylesheets.push({ line: index + 1, content: line.trim() });
      }
      
      if (trimmed.includes('<form')) {
        structure.body.forms.push({ line: index + 1, content: line.trim() });
      }
      
      if (trimmed.includes('<textarea')) {
        structure.body.inputs.push({ line: index + 1, content: line.trim(), type: 'textarea' });
      }
      
      if (trimmed.includes('<input')) {
        structure.body.inputs.push({ line: index + 1, content: line.trim(), type: 'input' });
      }
    });

    return structure;
  }

  analyzeCSSStructure(lines) {
    const structure = {
      selectors: [],
      classes: [],
      ids: [],
      mediaQueries: []
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (trimmed.includes('{') && !trimmed.startsWith('/*')) {
        const selector = trimmed.split('{')[0].trim();
        structure.selectors.push({ line: index + 1, selector });
        
        if (selector.includes('.')) {
          structure.classes.push({ line: index + 1, class: selector });
        }
        
        if (selector.includes('#')) {
          structure.ids.push({ line: index + 1, id: selector });
        }
      }
      
      if (trimmed.includes('@media')) {
        structure.mediaQueries.push({ line: index + 1, content: trimmed });
      }
    });

    return structure;
  }

  normalizeCommandParams(rawParams) {
    if (typeof rawParams === 'string') {
      const trimmed = rawParams.trim();
      if (trimmed.startsWith('{')) {
        try {
          return JSON.parse(trimmed);
        } catch (error) {
          // Fall through to treat as plain value string
        }
      }
      return { value: trimmed };
    }

    if (rawParams == null) {
      return {};
    }

    if (typeof rawParams !== 'object' || Array.isArray(rawParams)) {
      return { value: rawParams };
    }

    const params = { ...rawParams };

    if (typeof params.value === 'string') {
      const nested = params.value.trim();
      if (nested.startsWith('{')) {
        try {
          const parsedNested = JSON.parse(nested);
          Object.assign(params, parsedNested);
        } catch (error) {
          // keep original string value
        }
      }
    }

    if (typeof params.options === 'string') {
      const optionText = params.options.trim();
      if (optionText.startsWith('{')) {
        try {
          params.options = JSON.parse(optionText);
        } catch (error) {
          // leave options as string
        }
      }
    }

    return params;
  }

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      const file = result.fileName || result.file || result.source || 'unknown';
      const line = result.lineNumber || result.line || 0;
      const key = `${file}:${line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getCapabilities() {
    return {
      totalFiles: this.projectFiles.size,
      fileTypes: Array.from(new Set(Array.from(this.projectFiles.values()).map(f => f.type))),
      searchCommands: [
        'searchPattern(pattern, options)',
        'searchFunctions(functionName)',
        'searchCSS(selector)',
        'searchHTML(element)',
        'searchImports(moduleName)',
        'analyzeFileStructure(fileName)'
      ],
      searchHistory: this.searchHistory.length
    };
  }

  async executeSearchCommand(commandOrTool, providedParams = {}) {
    let commandName = '';
    let params = providedParams;

    if (typeof commandOrTool === 'string') {
      commandName = commandOrTool;
    } else if (commandOrTool && typeof commandOrTool === 'object') {
      commandName = commandOrTool.name
        || commandOrTool.command
        || commandOrTool.tool
        || commandOrTool.fn
        || commandOrTool.type
        || '';

      if (commandOrTool.params !== undefined) {
        params = commandOrTool.params;
      } else if (commandOrTool.arguments !== undefined) {
        params = commandOrTool.arguments;
      } else if (commandOrTool.value !== undefined && params === providedParams) {
        params = commandOrTool.value;
      }
    }

    if (!commandName && params && typeof params === 'object' && params.name) {
      commandName = params.name;
    }

    commandName = typeof commandName === 'string' ? commandName.trim() : '';
    if (!commandName) {
      return [];
    }

    const parenIndex = commandName.indexOf('(');
    if (parenIndex !== -1) {
      commandName = commandName.slice(0, parenIndex);
    }

    const normalizedName = commandName.replace(/[`*]/g, '').trim().toLowerCase();
    const nameMap = {
      searchpattern: 'searchPattern',
      searchfunctions: 'searchFunctions',
      searchcss: 'searchCSS',
      searchhtml: 'searchHTML',
      searchimports: 'searchImports',
      analyzefilestructure: 'analyzeFileStructure'
    };

    const methodName = nameMap[normalizedName] || commandName;

    const execute = () => {
      switch (methodName) {
        case 'searchPattern':
          return this.searchPattern(params);
        case 'searchFunctions':
          return this.searchFunctions(params);
        case 'searchCSS':
          return this.searchCSS(params);
        case 'searchHTML':
          return this.searchHTML(params);
        case 'searchImports':
          return this.searchImports(params);
        case 'analyzeFileStructure':
          return this.analyzeFileStructure(params);
        default:
          console.warn(`Unknown search command: ${commandName}`);
          return [];
      }
    };

    try {
      const result = await Promise.resolve(execute());
      this.searchHistory.push({
        command: methodName,
        params: this.normalizeCommandParams(params),
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      console.error(`Search command ${commandName} failed:`, error);
      throw error;
    }
  }
}

module.exports = DesktopSearchEngine;
