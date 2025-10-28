const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Baca file renderer.js
const code = fs.readFileSync('renderer/renderer.js', 'utf-8');

// Parse jadi AST (Abstract Syntax Tree)
const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'] // sesuaiin kalo pake JSX/TS
});

// Storage buat hasil analisis
const analysis = {
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
      params: path.node.params.map(p => p.name),
      lines: path.node.loc.end.line - path.node.loc.start.line
    });
  },

  // Detect Classes
  ClassDeclaration(path) {
    const methods = [];
    path.traverse({
      ClassMethod(methodPath) {
        methods.push(methodPath.node.key.name);
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
      analysis.exports.push(name);
    }
  },

  // Detect Variables
  VariableDeclaration(path) {
    path.node.declarations.forEach(declaration => {
      analysis.variables.push({
        name: declaration.id.name,
        line: path.node.loc.start.line,
        kind: path.node.kind // const/let/var
      });
    });
  }
});

// Print hasil
console.log('\n📊 ANALYSIS RESULTS\n');
console.log(`Total Functions: ${analysis.functions.length}`);
console.log(`Total Classes: ${analysis.classes.length}`);
console.log(`Total Imports: ${analysis.imports.length}`);
console.log(`Total Variables: ${analysis.variables.length}\n`);

// Detail functions (sorted by size)
console.log('🔥 LARGEST FUNCTIONS (candidates for extraction):\n');
analysis.functions
  .sort((a, b) => b.lines - a.lines)
  .slice(0, 10)
  .forEach(fn => {
    console.log(`  ${fn.name}: ${fn.lines} lines (starts at line ${fn.line})`);
  });

// Detail classes
console.log('\n📦 CLASSES:\n');
analysis.classes.forEach(cls => {
  console.log(`  ${cls.name}: ${cls.lines} lines`);
  console.log(`    Methods: ${cls.methods.join(', ')}`);
});

// Save ke JSON
fs.writeFileSync('analysis-result.json', JSON.stringify(analysis, null, 2));
console.log('\n✅ Full report saved to: analysis-result.json');