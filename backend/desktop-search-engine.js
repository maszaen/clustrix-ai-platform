const path = require('path');

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

  searchPattern(raw) {
    let input = raw;
    if (typeof raw === 'string') {
      try {
        input = JSON.parse(raw);
      } catch (error) {
        input = raw;
      }
    }

    const pattern = typeof input === 'object' && input?.pattern != null
      ? String(input.pattern)
      : typeof raw === 'string'
        ? raw
        : '';
    const options = typeof input === 'object' && input?.options ? input.options : {};
    const fileOption = options?.files;
    const files = Array.isArray(fileOption) && fileOption.length
      ? Array.from(new Set(fileOption.map(String)))
      : typeof fileOption === 'string' && fileOption.trim()
        ? [fileOption.trim()]
        : Array.from(this.projectFiles.keys());
    const caseSensitive = Boolean(options.caseSensitive);
    const flags = caseSensitive ? 'g' : 'gi';
    let rx;
    try {
      rx = new RegExp(pattern, flags);
    } catch (error) {
      return [];
    }

    const contextLines = Number.isInteger(options.contextLines) && options.contextLines >= 0
      ? options.contextLines
      : 0;
    const maxResults = Number.isInteger(options.maxResults) && options.maxResults > 0
      ? options.maxResults
      : Infinity;
    const snippetLength = Number.isInteger(options.snippetLength) && options.snippetLength > 0
      ? options.snippetLength
      : 400;

    const results = [];

    for (const fileName of files) {
      const fileData = this.projectFiles.get(fileName);
      if (!fileData || !Array.isArray(fileData.lines)) continue;

      const { lines } = fileData;

      for (let i = 0; i < lines.length; i++) {
        const line = typeof lines[i] === 'string' ? lines[i] : '';
        rx.lastIndex = 0;

        if (rx.test(line)) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length, i + contextLines + 1);
          const context = lines.slice(start, end).join('\n');

          results.push({
            fileName,
            lineNumber: i + 1,
            context
          });

          if (results.length >= maxResults) {
            return this.deduplicateResults(results, { maxResults, snippetLength });
          }
        }
      }
    }

    return this.deduplicateResults(results, { maxResults, snippetLength });
  }

  async searchFunctions(params) {
    const functionName = params.functionName || params.value;
    const patterns = [
      `function\\s+${functionName || '\\w+'}`,
      `const\\s+${functionName || '\\w+'}\\s*=`,
      `let\\s+${functionName || '\\w+'}\\s*=`,
      `${functionName || '\\w+'}\\s*:\\s*function`,
      `def\\s+${functionName || '\\w+'}`,
      `function\\s*${functionName || '\\w+'}\\s*\\(`
    ];

    const options = { maxResults: 50, contextLines: 3 };
    const results = [];

    for (const pattern of patterns) {
      const matches = await this.searchPattern({
        pattern,
        options
      });
      results.push(...matches);

      if (results.length >= options.maxResults) {
        break;
      }
    }

    return this.deduplicateResults(results, options);
  }

  async searchCSS(params) {
    const selector = params.selector || params.value;
    const patterns = [
      `\\.${selector}\\s*{`,
      `#${selector}\\s*{`,
      `${selector}\\s*{`,
      `class\\s*=\\s*['\"].*${selector}`,
      `id\\s*=\\s*['\"].*${selector}`
    ];

    const options = { maxResults: 30, contextLines: 2 };
    const results = [];

    for (const pattern of patterns) {
      const matches = await this.searchPattern({
        pattern,
        options
      });
      results.push(...matches);

      if (results.length >= options.maxResults) {
        break;
      }
    }

    return this.deduplicateResults(results, options);
  }

  async searchHTML(params) {
    const element = params.element || params.value;
    const patterns = [
      `<${element}[^>]*>`,
      `</${element}>`,
      `<${element}\\s+[^>]*/>`,
      `${element}\\s*=`,
    ];

    const options = { maxResults: 50, contextLines: 1 };
    const results = [];

    for (const pattern of patterns) {
      const matches = await this.searchPattern({
        pattern,
        options
      });
      results.push(...matches);

      if (results.length >= options.maxResults) {
        break;
      }
    }

    return this.deduplicateResults(results, options);
  }

  async searchImports(params) {
    const moduleName = params.moduleName || params.value;
    const modulePattern = moduleName || "[^'\"]+";
    const patterns = [
      `import.*${moduleName || '\\w+'}`,
      `require\\(['\"]+${modulePattern}['\"]+\\)`,
      `from\\s+${moduleName || '\\w+'}\\s+import`,
      `<script.*src.*${modulePattern}`,
      `<link.*href.*${modulePattern}`,
    ];

    const options = { maxResults: 30, contextLines: 1 };
    const results = [];

    for (const pattern of patterns) {
      const matches = await this.searchPattern({
        pattern,
        options
      });
      results.push(...matches);

      if (results.length >= options.maxResults) {
        break;
      }
    }

    return this.deduplicateResults(results, options);
  }

  analyzeFileStructure(params) {
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

  deduplicateResults(results, options = {}) {
    const maxResults = Number.isInteger(options.maxResults) && options.maxResults > 0
      ? options.maxResults
      : Infinity;
    const maxSnippetLength = Number.isInteger(options.snippetLength) && options.snippetLength > 0
      ? options.snippetLength
      : 400;

    const seen = new Set();
    const deduped = [];

    for (const result of results) {
      if (!result || typeof result !== 'object') continue;

      const fileName = result.fileName || result.file;
      const rawLine = result.lineNumber ?? result.line;
      const lineNumber = Number.isInteger(rawLine) ? rawLine : parseInt(rawLine, 10);
      const rawContext = typeof result.context === 'string'
        ? result.context
        : typeof result.snippet === 'string'
          ? result.snippet
          : '';

      if (!fileName || Number.isNaN(lineNumber)) continue;

      const key = `${fileName}:${lineNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const context = String(rawContext);
      const snippet = context.length > maxSnippetLength
        ? context.slice(0, maxSnippetLength)
        : context;

      deduped.push({
        fileName,
        lineNumber,
        context,
        snippet
      });

      if (deduped.length >= maxResults) {
        break;
      }
    }

    return deduped;
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

  async executeSearchCommand(command, rawParams = null) {
    let name = '';
    let params = rawParams;

    if (typeof command === 'string') {
      name = command;
    } else if (command && typeof command === 'object') {
      name = command.name || command.tool || command.fn || command.type || '';
      if (Object.prototype.hasOwnProperty.call(command, 'value')) {
        params = command.value;
      } else if (Object.prototype.hasOwnProperty.call(command, 'params')) {
        params = command.params;
      }
    }

    if (typeof params === 'string') {
      try {
        params = JSON.parse(params);
      } catch (error) {
        if (name !== 'searchPattern') {
          params = { value: params };
        }
      }
    }

    if (params === undefined || params === null) {
      params = {};
    } else if (typeof params !== 'object') {
      params = name === 'searchPattern' ? String(params) : { value: params };
    }

    name = typeof name === 'string' ? name : '';
    if (!name) {
      return [];
    }

    switch (name) {
      case 'searchPattern': {
        const results = await this.searchPattern(params);
        return Array.isArray(results) ? results : [];
      }
      case 'searchHTML': {
        const results = await this.searchHTML(params);
        return Array.isArray(results) ? results : [];
      }
      case 'searchFunctions': {
        const results = await this.searchFunctions(params);
        return Array.isArray(results) ? results : [];
      }
      case 'searchImports': {
        const results = await this.searchImports(params);
        return Array.isArray(results) ? results : [];
      }
      case 'searchCSS': {
        const results = await this.searchCSS(params);
        return Array.isArray(results) ? results : [];
      }
      case 'analyzeFileStructure':
        return await this.analyzeFileStructure(params);
      default:
        return [];
    }
  }
}

module.exports = DesktopSearchEngine;
