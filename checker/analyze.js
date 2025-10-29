const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Parse command line arguments
const targetFile = process.argv[2] || 'renderer/renderer.js';

// Validate file existence
if (!fs.existsSync(targetFile)) {
  console.error(`❌ Error: File not found: ${targetFile}`);
  console.log('\nUsage: node checker/analyze.js [file-path]');
  console.log('Example: node checker/analyze.js renderer/pages/projectsController.js');
  process.exit(1);
}

console.log(`\n🔍 Analyzing: ${targetFile}\n`);

// Read target file
const code = fs.readFileSync(targetFile, 'utf-8');

// Parse to AST (Abstract Syntax Tree)
let ast;
try {
  ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript', 'decorators-legacy']
  });
} catch (error) {
  console.error('❌ Parse error:', error.message);
  process.exit(1);
}

// Storage for analysis results
const analysis = {
  file: targetFile,
  fileSize: code.length,
  totalLines: code.split('\n').length,
  functions: [],
  classes: [],
  imports: [],
  exports: [],
  variables: []
};

// Traverse AST
traverse(ast, {
  // Detect Functions
  FunctionDeclaration(path) {
    analysis.functions.push({
      name: path.node.id.name,
      line: path.node.loc.start.line,
      params: path.node.params.map(p => p.name || p.type),
      lines: path.node.loc.end.line - path.node.loc.start.line
    });
  },

  // Detect Arrow Functions assigned to variables
  VariableDeclarator(path) {
    if (path.node.init && 
        (path.node.init.type === 'ArrowFunctionExpression' || 
         path.node.init.type === 'FunctionExpression')) {
      analysis.functions.push({
        name: path.node.id.name,
        line: path.node.loc.start.line,
        params: path.node.init.params.map(p => p.name || p.type),
        lines: path.node.init.loc.end.line - path.node.init.loc.start.line,
        type: 'arrow/expression'
      });
    }
  },

  // Detect Classes
  ClassDeclaration(path) {
    const methods = [];
    path.traverse({
      ClassMethod(methodPath) {
        methods.push({
          name: methodPath.node.key.name,
          kind: methodPath.node.kind, // constructor/method/get/set
          lines: methodPath.node.loc.end.line - methodPath.node.loc.start.line
        });
      }
    });

    analysis.classes.push({
      name: path.node.id.name,
      line: path.node.loc.start.line,
      methods: methods,
      lines: path.node.loc.end.line - path.node.loc.start.line
    });
  },

  // Detect Imports
  ImportDeclaration(path) {
    analysis.imports.push({
      source: path.node.source.value,
      specifiers: path.node.specifiers.map(s => s.local.name)
    });
  },

  // Detect Exports
  ExportNamedDeclaration(path) {
    if (path.node.declaration) {
      const name = path.node.declaration.id?.name || 
                   path.node.declaration.declarations?.[0]?.id?.name;
      if (name) analysis.exports.push(name);
    }
  },

  ExportDefaultDeclaration(path) {
    analysis.exports.push('default');
  },

  // Detect Variables (excluding function assignments)
  VariableDeclaration(path) {
    path.node.declarations.forEach(declaration => {
      if (declaration.init && 
          declaration.init.type !== 'ArrowFunctionExpression' &&
          declaration.init.type !== 'FunctionExpression') {
        analysis.variables.push({
          name: declaration.id.name,
          line: path.node.loc.start.line,
          kind: path.node.kind // const/let/var
        });
      }
    });
  }
});

// Print results
console.log('📊 ANALYSIS RESULTS\n');
console.log(`File: ${analysis.file}`);
console.log(`Size: ${analysis.fileSize} bytes | Lines: ${analysis.totalLines}`);
console.log(`\nFunctions: ${analysis.functions.length}`);
console.log(`Classes: ${analysis.classes.length}`);
console.log(`Imports: ${analysis.imports.length}`);
console.log(`Exports: ${analysis.exports.length}`);
console.log(`Variables: ${analysis.variables.length}\n`);

// Detail functions (sorted by size)
if (analysis.functions.length > 0) {
  console.log('🔥 LARGEST FUNCTIONS (refactor candidates):\n');
  analysis.functions
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10)
    .forEach(fn => {
      const tag = fn.lines > 50 ? '🚨' : fn.lines > 30 ? '⚠️' : '✅';
      console.log(`  ${tag} ${fn.name}: ${fn.lines} lines (L${fn.line})`);
    });
}

// Detail classes
if (analysis.classes.length > 0) {
  console.log('\n📦 CLASSES:\n');
  analysis.classes.forEach(cls => {
    console.log(`  ${cls.name}: ${cls.lines} lines (L${cls.line})`);
    console.log(`    Methods (${cls.methods.length}):`);
    cls.methods.forEach(m => {
      console.log(`      - ${m.name} (${m.kind}): ${m.lines} lines`);
    });
  });
}

// Complexity warnings
const complexFunctions = analysis.functions.filter(f => f.lines > 50);
if (complexFunctions.length > 0) {
  console.log(`\n⚠️  ${complexFunctions.length} function(s) exceed 50 lines - consider refactoring`);
}

// Create results directory if needed
const resultsDir = 'results';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Save to JSON with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = path.join(
  resultsDir, 
  `analysis-${path.basename(targetFile, path.extname(targetFile))}-${timestamp}.json`
);

fs.writeFileSync(outputFile, JSON.stringify(analysis, null, 2));
console.log(`\n✅ Full report saved to: ${outputFile}`);