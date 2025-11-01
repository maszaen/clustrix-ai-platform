const path = require('path');
const fs = require('fs');

class FileSummarizer {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.summaryCache = new Map();
    this.summaryFile = path.join(langchainService.app.getPath('userData'), 'file_summaries.json');
    this.loadSummaryCache();
  }

  loadSummaryCache() {
    try {
      if (fs.existsSync(this.summaryFile)) {
        const data = fs.readFileSync(this.summaryFile, 'utf-8');
        const summaries = JSON.parse(data);
        Object.entries(summaries).forEach(([key, value]) => {
          this.summaryCache.set(key, value);
        });
        console.log(`Loaded ${this.summaryCache.size} file summaries from cache`);
      }
    } catch (error) {
      console.error('Error loading summary cache:', error);
    }
  }

  saveSummaryCache() {
    try {
      const summaries = Object.fromEntries(this.summaryCache);
      fs.writeFileSync(this.summaryFile, JSON.stringify(summaries, null, 2));
    } catch (error) {
      console.error('Error saving summary cache:', error);
    }
  }

  generateCacheKey(fileName, content) {
    const contentHash = require('crypto')
      .createHash('md5')
      .update(content)
      .digest('hex');
    return `${fileName}:${contentHash}`;
  }

  shouldSummarize(content, fileName) {
    const tokenEstimate = content.length / 4; // Rough token estimation
    const fileType = path.extname(fileName).toLowerCase();
    
    if (tokenEstimate > 1500) return true;
    if (['.js', '.py', '.java', '.cpp', '.cs', '.php'].includes(fileType) && tokenEstimate > 800) {
      return true;
    }
    if (['.md', '.txt', '.doc', '.docx'].includes(fileType) && tokenEstimate > 1000) {
      return true;
    }
    
    return false;
  }

  createSmartSummary(content, fileName) {
    const fileType = path.extname(fileName).toLowerCase();
    const lines = content.split('\n');
    
    if (['.js', '.py', '.java', '.cpp', '.cs', '.php', '.ts'].includes(fileType)) {
      return this.extractCodeStructure(content, fileName, fileType);
    } else if (['.md', '.txt', '.doc', '.docx'].includes(fileType)) {
      return this.extractDocumentStructure(content, fileName);
    } else if (['.json', '.xml', '.yml', '.yaml'].includes(fileType)) {
      return this.extractDataStructure(content, fileName, fileType);
    } else {
      return this.extractGenericStructure(content, fileName);
    }
  }

  extractCodeStructure(content, fileName, fileType) {
    const lines = content.split('\n');
    const structure = {
      imports: [],
      classes: [],
      functions: [],
      exports: [],
      constants: [],
      comments: []
    };

    const patterns = {
      '.js': {
        import: /^(import|const|require)\s+.*?from|=\s*require/,
        function: /^(function|const|let|var)\s+\w+.*?[=\(]|^async\s+function/,
        class: /^class\s+\w+/,
        export: /^export\s+(default\s+)?/,
        comment: /^\/\/|^\/\*|\*\//
      },
      '.py': {
        import: /^(import|from)\s+\w+/,
        function: /^def\s+\w+/,
        class: /^class\s+\w+/,
        comment: /^#/
      },
      '.java': {
        import: /^import\s+\w+/,
        function: /^\s*(public|private|protected).*?\w+\s*\(/,
        class: /^(public\s+)?class\s+\w+/,
        comment: /^\/\/|^\/\*/
      }
    };

    const langPatterns = patterns[fileType] || patterns['.js'];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (langPatterns.import && langPatterns.import.test(trimmed)) {
        structure.imports.push({ line: index + 1, content: trimmed });
      }
      
      if (langPatterns.function && langPatterns.function.test(trimmed)) {
        structure.functions.push({ line: index + 1, content: trimmed });
      }
      
      if (langPatterns.class && langPatterns.class.test(trimmed)) {
        structure.classes.push({ line: index + 1, content: trimmed });
      }
      
      if (langPatterns.export && langPatterns.export.test(trimmed)) {
        structure.exports.push({ line: index + 1, content: trimmed });
      }
      
      if (trimmed.includes('const ') && trimmed.includes('=') && !trimmed.includes('(')) {
        structure.constants.push({ line: index + 1, content: trimmed });
      }
      
      if (langPatterns.comment && langPatterns.comment.test(trimmed) && trimmed.length > 10) {
        structure.comments.push({ line: index + 1, content: trimmed });
      }
    });

    let summary = `**${fileName}** (${fileType.slice(1).toUpperCase()} Code File)\n\n`;
    
    if (structure.imports.length > 0) {
      summary += `**Dependencies** (${structure.imports.length}):\n`;
      structure.imports.slice(0, 5).forEach(imp => {
        summary += `- L${imp.line}: ${imp.content}\n`;
      });
      if (structure.imports.length > 5) {
        summary += `- ... and ${structure.imports.length - 5} more dependencies\n`;
      }
      summary += '\n';
    }
    
    if (structure.classes.length > 0) {
      summary += `**Classes** (${structure.classes.length}):\n`;
      structure.classes.forEach(cls => {
        summary += `- L${cls.line}: ${cls.content}\n`;
      });
      summary += '\n';
    }
    
    if (structure.functions.length > 0) {
      summary += `**Functions** (${structure.functions.length}):\n`;
      structure.functions.slice(0, 8).forEach(func => {
        summary += `- L${func.line}: ${func.content}\n`;
      });
      if (structure.functions.length > 8) {
        summary += `- ... and ${structure.functions.length - 8} more functions\n`;
      }
      summary += '\n';
    }
    
    if (structure.exports.length > 0) {
      summary += `**Exports** (${structure.exports.length}):\n`;
      structure.exports.forEach(exp => {
        summary += `- L${exp.line}: ${exp.content}\n`;
      });
      summary += '\n';
    }

    if (structure.constants.length > 0) {
      summary += `**Configuration** (${structure.constants.length}):\n`;
      structure.constants.slice(0, 5).forEach(conf => {
        summary += `- L${conf.line}: ${conf.content}\n`;
      });
      summary += '\n';
    }

    summary += `**File Stats**: ${lines.length} lines, ${content.length} characters`;

    return {
      content: summary,
      originalSize: content.length,
      summarySize: summary.length,
      compressionRatio: Math.round((1 - summary.length / content.length) * 100),
      method: 'smart-extraction',
      createdAt: new Date().toISOString(),
      structure: structure
    };
  }

  extractDocumentStructure(content, fileName) {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    const structure = {
      headings: [],
      paragraphs: [],
      lists: [],
      codeBlocks: [],
      important: []
    };

    let inCodeBlock = false;
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#')) {
        structure.headings.push({ line: index + 1, content: trimmed, level: trimmed.match(/^#+/)[0].length });
      }
      else if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        if (!inCodeBlock) {
          structure.codeBlocks.push({ line: index + 1, content: 'Code block detected' });
        }
      }
      else if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) {
        structure.lists.push({ line: index + 1, content: trimmed });
      }
      else if (trimmed.includes('**') || trimmed.match(/^[A-Z\s]+:/) || trimmed.includes('IMPORTANT')) {
        structure.important.push({ line: index + 1, content: trimmed });
      }
      else if (!inCodeBlock && trimmed.length > 50) {
        structure.paragraphs.push({ line: index + 1, content: trimmed.slice(0, 100) + (trimmed.length > 100 ? '...' : '') });
      }
    });

    let summary = `**${fileName}** (Document)\n\n`;
    
    if (structure.headings.length > 0) {
      summary += `**Structure** (${structure.headings.length} sections):\n`;
      structure.headings.forEach(heading => {
        const indent = '  '.repeat(heading.level - 1);
        summary += `${indent}- ${heading.content}\n`;
      });
      summary += '\n';
    }
    
    if (structure.important.length > 0) {
      summary += `**Key Points** (${structure.important.length}):\n`;
      structure.important.slice(0, 5).forEach(imp => {
        summary += `- L${imp.line}: ${imp.content}\n`;
      });
      summary += '\n';
    }
    
    if (structure.lists.length > 0) {
      summary += `**Lists Found**: ${structure.lists.length} list items\n\n`;
    }
    
    if (structure.codeBlocks.length > 0) {
      summary += `**Code Examples**: ${structure.codeBlocks.length} code blocks\n\n`;
    }
    
    if (structure.paragraphs.length > 0) {
      summary += `**Content Preview**:\n`;
      structure.paragraphs.slice(0, 3).forEach(para => {
        summary += `- L${para.line}: ${para.content}\n`;
      });
    }

    summary += `\n**Document Stats**: ${lines.length} lines, ${content.length} characters`;

    return {
      content: summary,
      originalSize: content.length,
      summarySize: summary.length,
      compressionRatio: Math.round((1 - summary.length / content.length) * 100),
      method: 'document-parsing',
      createdAt: new Date().toISOString(),
      structure: structure
    };
  }

  extractDataStructure(content, fileName, fileType) {
    let structure = {};
    let summary = `**${fileName}** (${fileType.slice(1).toUpperCase()} Data File)\n\n`;
    
    try {
      if (fileType === '.json') {
        const data = JSON.parse(content);
        structure = this.analyzeJSONStructure(data);
        
        summary += `**JSON Structure**:\n`;
        if (structure.topLevelKeys) {
          summary += `- Keys: ${structure.topLevelKeys.join(', ')}\n`;
        }
        if (structure.arrayCount > 0) {
          summary += `- Arrays: ${structure.arrayCount} found\n`;
        }
        if (structure.objectCount > 0) {
          summary += `- Objects: ${structure.objectCount} found\n`;
        }
        if (structure.maxDepth > 0) {
          summary += `- Max depth: ${structure.maxDepth} levels\n`;
        }
        
      } else {
        const lines = content.split('\n');
        const tags = lines.filter(line => line.includes('<') || line.includes(':')).slice(0, 10);
        
        summary += `**Data Structure**:\n`;
        summary += `- Format: ${fileType.slice(1).toUpperCase()}\n`;
        summary += `- Lines: ${lines.length}\n`;
        if (tags.length > 0) {
          summary += `- Key elements:\n`;
          tags.forEach(tag => {
            summary += `  - ${tag.trim()}\n`;
          });
        }
      }
      
    } catch (error) {
      summary += `**Parsing Note**: Could not parse as ${fileType.slice(1).toUpperCase()}, treating as text\n`;
    }
    
    summary += `\n**File Stats**: ${content.length} characters`;

    return {
      content: summary,
      originalSize: content.length,
      summarySize: summary.length,
      compressionRatio: Math.round((1 - summary.length / content.length) * 100),
      method: 'data-parsing',
      createdAt: new Date().toISOString(),
      structure: structure
    };
  }

  analyzeJSONStructure(obj, depth = 0) {
    const analysis = {
      topLevelKeys: [],
      arrayCount: 0,
      objectCount: 0,
      maxDepth: depth
    };
    
    if (Array.isArray(obj)) {
      analysis.arrayCount++;
      if (obj.length > 0) {
        const childAnalysis = this.analyzeJSONStructure(obj[0], depth + 1);
        analysis.maxDepth = Math.max(analysis.maxDepth, childAnalysis.maxDepth);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      analysis.objectCount++;
      const keys = Object.keys(obj);
      
      if (depth === 0) {
        analysis.topLevelKeys = keys;
      }
      
      for (const key of keys.slice(0, 5)) { 
        const childAnalysis = this.analyzeJSONStructure(obj[key], depth + 1);
        analysis.arrayCount += childAnalysis.arrayCount;
        analysis.objectCount += childAnalysis.objectCount;
        analysis.maxDepth = Math.max(analysis.maxDepth, childAnalysis.maxDepth);
      }
    }
    
    return analysis;
  }

  extractGenericStructure(content, fileName) {
    const lines = content.split('\n');
    const words = content.split(/\s+/).length;
    const firstLines = lines.slice(0, 10).filter(line => line.trim().length > 0);
    
    let summary = `**${fileName}** (Generic File)\n\n`;
    summary += `**Content Preview**:\n`;
    
    firstLines.forEach((line, index) => {
      summary += `Line ${index + 1}: ${line.slice(0, 80)}${line.length > 80 ? '...' : ''}\n`;
    });
    
    summary += `\n**File Stats**: ${lines.length} lines, ${words} words, ${content.length} characters`;
    
    return {
      content: summary,
      originalSize: content.length,
      summarySize: summary.length,
      compressionRatio: Math.round((1 - summary.length / content.length) * 100),
      method: 'generic-extraction',
      createdAt: new Date().toISOString()
    };
  }

  createFallbackSummary(content, fileName) {
    const fileType = path.extname(fileName).toLowerCase();
    let summary = '';

    if (['.js', '.py', '.java', '.cpp', '.cs', '.php', '.ts'].includes(fileType)) {
      const lines = content.split('\n');
      const imports = lines.filter(line => 
        line.trim().startsWith('import') || 
        line.trim().startsWith('require') || 
        line.trim().startsWith('from') ||
        line.trim().startsWith('#include')
      ).slice(0, 5);

      const functions = lines.filter(line => 
        line.includes('function ') || 
        line.includes('def ') || 
        line.includes('class ') ||
        line.includes('async ') ||
        line.includes('export ')
      ).slice(0, 8);

      summary = `**File**: ${fileName}\n\n`;
      if (imports.length > 0) {
        summary += `**Dependencies**:\n${imports.map(imp => `- ${imp.trim()}`).join('\n')}\n\n`;
      }
      if (functions.length > 0) {
        summary += `**Key Components**:\n${functions.map(func => `- ${func.trim()}`).join('\n')}\n\n`;
      }
      summary += `**Size**: ${content.length} characters, ${lines.length} lines`;

    } else {
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const firstParagraphs = lines.slice(0, 5).join('\n');
      
      summary = `**File**: ${fileName}\n\n**Content Preview**:\n${firstParagraphs}\n\n**Size**: ${content.length} characters`;
    }

    return {
      content: summary,
      originalSize: content.length,
      summarySize: summary.length,
      compressionRatio: Math.round((1 - summary.length / content.length) * 100),
      method: 'pattern-extraction',
      createdAt: new Date().toISOString()
    };
  }

  async getSummary(fileName, content) {
    const cacheKey = this.generateCacheKey(fileName, content);
    
    if (this.summaryCache.has(cacheKey)) {
      console.log(`Using cached summary for ${fileName}`);
      return this.summaryCache.get(cacheKey);
    }

    if (!this.shouldSummarize(content, fileName)) {
      console.log(`📄 File ${fileName} doesn't need summarization`);
      return {
        content: content,
        originalSize: content.length,
        summarySize: content.length,
        compressionRatio: 0,
        method: 'no-compression',
        createdAt: new Date().toISOString()
      };
    }

    console.log(`🔄 Creating smart local summary for ${fileName}...`);
    const summary = this.createSmartSummary(content, fileName);
    
    this.summaryCache.set(cacheKey, summary);
    this.saveSummaryCache();
    
    return summary;
  }

  async processFiles(files) {
    const results = [];
    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;

    for (const file of files) {
      const summary = await this.getSummary(file.name, file.content);
      
      results.push({
        name: file.name,
        type: file.type,
        originalContent: file.content,
        optimizedContent: summary.content,
        originalSize: summary.originalSize,
        optimizedSize: summary.summarySize,
        compressionRatio: summary.compressionRatio,
        method: summary.method
      });

      totalOriginalSize += summary.originalSize;
      totalOptimizedSize += summary.summarySize;
    }

    const totalCompressionRatio = Math.round((1 - totalOptimizedSize / totalOriginalSize) * 100);

    console.log(`File processing complete: ${files.length} files`);
    console.log(`Size optimization: ${totalOriginalSize} → ${totalOptimizedSize} chars (${totalCompressionRatio}% reduction)`);

    return {
      files: results,
      stats: {
        fileCount: files.length,
        totalOriginalSize,
        totalOptimizedSize,
        totalCompressionRatio,
        tokenSavings: Math.round((totalOriginalSize - totalOptimizedSize) / 4)
      }
    };
  }

  clearCache() {
    this.summaryCache.clear();
    if (fs.existsSync(this.summaryFile)) {
      fs.unlinkSync(this.summaryFile);
    }
    console.log('Summary cache cleared');
  }

  getCacheStats() {
    return {
      entriesCount: this.summaryCache.size,
      cacheFile: this.summaryFile,
      exists: fs.existsSync(this.summaryFile)
    };
  }
}

module.exports = FileSummarizer;