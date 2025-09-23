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

  async searchPattern(raw) {
  let input = raw;
  if (typeof raw === "string") {
    try { input = JSON.parse(raw); } catch {}
  }
  const pattern = typeof input === "object" && input?.pattern ? String(input.pattern) : String(raw || "");
  const options = typeof input === "object" && input?.options ? input.options : {};
  const files = Array.isArray(options.files) && options.files.length ? options.files : Array.from(this.projectFiles.keys());
  const caseSensitive = !!options.caseSensitive;
  const flags = caseSensitive ? "g" : "gi";
  let rx;
  try { rx = new RegExp(pattern, flags); } catch { return []; }
  const results = [];
  for (const fileName of files) {
    const fileData = this.projectFiles.get(fileName);
    if (!fileData || !fileData.content) continue;
    const lines = fileData.lines || fileData.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rx.lastIndex = 0;
      if (rx.test(line)) {
        results.push({
          file: fileName,
          line: i + 1,
          snippet: line.slice(0, 400),
        });
      }
    }
  }
  return results;
}

  searchFunctions(params) {
    const functionName = params.functionName || params.value;
    const patterns = [
      `function\\s+${functionName || '\\w+'}`,
      `const\\s+${functionName || '\\w+'}\\s*=`,
      `let\\s+${functionName || '\\w+'}\\s*=`,
      `${functionName || '\\w+'}\\s*:\\s*function`,
      `def\\s+${functionName || '\\w+'}`,  // Python
      `function\\s*${functionName || '\\w+'}\\s*\\(`
    ];

    const results = [];
    patterns.forEach(pattern => {
        const matches = this.searchPattern({
            pattern: pattern, 
            options: { maxResults: 50, contextLines: 3 }
        });
        results.push(...matches);
    });

    return this.deduplicateResults(results);
  }

  searchCSS(params) {
    const selector = params.selector || params.value;
    const patterns = [
      `\\.${selector}\\s*{`,
      `#${selector}\\s*{`,
      `${selector}\\s*{`, 
      `class\\s*=\\s*["'].*${selector}`, 
      `id\\s*=\\s*["'].*${selector}`     
    ];

    const results = [];
    patterns.forEach(pattern => {
      const matches = this.searchPattern({
        pattern: pattern, 
        options: { maxResults: 30, contextLines: 2 }
      });
      results.push(...matches);
    });

    return this.deduplicateResults(results);
  }

  searchHTML(params) {
    const element = params.element || params.value;
    const patterns = [
      `<${element}[^>]*>`,        
      `</${element}>`,            
      `<${element}\\s+[^>]*/>`,   
      `${element}\\s*=`,          
    ];

    const results = [];
    patterns.forEach(pattern => {
      const matches = this.searchPattern({
        pattern: pattern, 
        options: { maxResults: 50, contextLines: 1 }
      });
      results.push(...matches);
    });

    return this.deduplicateResults(results);
  }

  searchImports(params) {
    const moduleName = params.moduleName || params.value;
    const modulePattern = moduleName || '[^\'"]+';
    const patterns = [
      `import.*${moduleName || '\\w+'}`,
      `require\\(['"]+${modulePattern}['"]+\\)`,
      `from\\s+${moduleName || '\\w+'}\\s+import`,
      `<script.*src.*${modulePattern}`,
      `<link.*href.*${modulePattern}`,
    ];

    const results = [];
    patterns.forEach(pattern => {
      const matches = this.searchPattern({
        pattern: pattern, 
        options: { maxResults: 30, contextLines: 1 }
      });
      results.push(...matches);
    });

    return this.deduplicateResults(results);
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

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = `${result.fileName}:${result.lineNumber}`;
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

  async executeSearchCommand(cmd) {
  const v = cmd?.value;
  let parsed = v;
  if (typeof v === "string") {
    try { parsed = JSON.parse(v); } catch {}
  }
  const name = cmd?.name || cmd?.tool || cmd?.fn || "";
  if (!name) return [];
  if (name === "searchPattern") {
    const out = await this.searchPattern(parsed || v);
    return Array.isArray(out) ? out : [];
  }
  if (name === "searchHTML") {
    const out = await this.searchHTML(parsed || v);
    return Array.isArray(out) ? out : [];
  }
  if (name === "searchFunctions") {
    const out = await this.searchFunctions(parsed || v);
    return Array.isArray(out) ? out : [];
  }
  if (name === "searchImports") {
    const out = await this.searchImports(parsed || v);
    return Array.isArray(out) ? out : [];
  }
  if (name === "searchCSS") {
    const out = await this.searchCSS(parsed || v);
    return Array.isArray(out) ? out : [];
  }
  if (name === "analyzeFileStructure") {
    const out = await this.analyzeFileStructure(parsed || v);
    return Array.isArray(out) ? out : [];
  }
  return [];
}
}

module.exports = DesktopSearchEngine;