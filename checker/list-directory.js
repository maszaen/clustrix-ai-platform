#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Directory Lister Script
 * 
 * Scans and lists directory structure with special handling rules
 * MODE_ROOT: Scan from project root with depth policies
 * MODE_DIRECT: Scan specified directory with full recursion
 */

// Constants
const SKIP_FOLDERS = ['node_modules'];
const SHALLOW_FOLDERS = ['.github', '.vscode', '.claude', 'out', 'dist', '.git'];
const LIMITED_DEPTH_FOLDERS = { 'local_modules': 1 };

// ASCII tree characters
const BRANCH = '├─ ';
const LAST_BRANCH = '└─ ';
const VERTICAL = '│  ';
const SPACE = '   ';

// Special folders that should not print their contents
const printAsNameOnly = (folderName) => SHALLOW_FOLDERS.includes(folderName);

/**
 * Recursively scan directory with depth control
 * @param {string} dir - Directory path to scan
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum depth to traverse (-1 for unlimited)
 * @param {boolean} isRootMode - Whether running in root mode
 * @param {string[]} prefixes - Prefix stack for tree formatting
 * @returns {string} Formatted directory structure
 */
function scanDirectory(dir, depth = 0, maxDepth = -1, isRootMode = true, prefixes = []) {
  let output = '';

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    // Separate directories and files, then sort
    const dirs = entries
      .filter(entry => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const files = entries
      .filter(entry => entry.isFile())
      .sort((a, b) => a.name.localeCompare(b.name));

    // Combine all entries for tree display
    const allEntries = [...dirs, ...files];
    const totalEntries = allEntries.length;

    // Process all entries
    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      const isLast = i === totalEntries - 1;
      const prefix = isLast ? LAST_BRANCH : BRANCH;
      const nextPrefix = isLast ? SPACE : VERTICAL;
      
      const isDir = entry.isDirectory();
      const name = isDir ? entry.name : entry.name;
      const displayName = isDir ? name : name;

      // Root mode special handling for directories
      if (isRootMode && depth === 0 && isDir) {
        // Skip node_modules entirely
        if (SKIP_FOLDERS.includes(name)) {
          continue;
        }

        // Handle shallow folders (print name only, no contents)
        if (printAsNameOnly(name)) {
          output += prefixes.join('') + prefix + name + '\n';
          continue;
        }

        // Handle limited depth folders (local_modules)
        if (name in LIMITED_DEPTH_FOLDERS) {
          output += prefixes.join('') + prefix + name + '\n';
          const limitedDepth = LIMITED_DEPTH_FOLDERS[name];
          try {
            const subEntries = fs.readdirSync(path.join(dir, name), { withFileTypes: true });
            const subDirs = subEntries
              .filter(entry => entry.isDirectory())
              .sort((a, b) => a.name.localeCompare(b.name));

            for (let j = 0; j < subDirs.length; j++) {
              const isLastSub = j === subDirs.length - 1;
              const subPrefix = isLastSub ? LAST_BRANCH : BRANCH;
              const newPrefixes = [...prefixes, nextPrefix];
              output += newPrefixes.join('') + subPrefix + subDirs[j].name + '\n';
            }
          } catch (err) {
            // Silent fail on read error
          }
          continue;
        }
      }

      // Print directory or file
      output += prefixes.join('') + prefix + displayName + '\n';

      // Recurse into directories
      if (isDir && (maxDepth === -1 || depth < maxDepth)) {
        const fullPath = path.join(dir, name);
        
        // Check if this is a shallow folder in root mode
        const isShallowFolder = isRootMode && depth === 0 && printAsNameOnly(name);
        const isLimitedFolder = isRootMode && depth === 0 && name in LIMITED_DEPTH_FOLDERS;
        
        if (!isShallowFolder && !isLimitedFolder) {
          try {
            const newPrefixes = [...prefixes, nextPrefix];
            output += scanDirectory(fullPath, depth + 1, maxDepth, false, newPrefixes);
          } catch (err) {
            // Silent fail on recursion error
          }
        }
      }
    }
  } catch (err) {
    // Silent fail on directory read error
  }

  return output;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  let scanPath;
  let scanTarget;
  let isRootMode = false;

  if (args.length === 0) {
    // MODE_ROOT: Scan from current working directory
    isRootMode = true;
    scanPath = process.cwd();
    scanTarget = 'root';
  } else {
    // MODE_DIRECT: Scan specified directory
    scanPath = args[0];
    scanTarget = path.basename(scanPath);

    // Validate target directory exists and is a directory
    try {
      const stats = fs.statSync(scanPath);
      if (!stats.isDirectory()) {
        console.error(`\nError: "${scanPath}" is not a directory.\n`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`\nError: Cannot access "${scanPath}": ${err.message}\n`);
      process.exit(1);
    }
  }

  // Generate directory structure
  const directoryStructure = scanDirectory(scanPath, 0, -1, isRootMode, []);

  // Print to console with tree style
  const timestamp = new Date().toISOString();
  console.log('\n' + scanTarget);
  console.log(directoryStructure);

  // Ensure results directory exists
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    try {
      fs.mkdirSync(resultsDir, { recursive: true });
    } catch (err) {
      console.error(`Error: Failed to create results directory: ${err.message}\n`);
      process.exit(1);
    }
  }

  // Generate output file with timestamp
  const epochTimestamp = Date.now();
  const fileName = `directory-${scanTarget}-${epochTimestamp}.md`;
  const filePath = path.join(resultsDir, fileName);

  // Format file content with markdown
  const fileContent = `# Directory Structure - ${scanTarget}

**Generated:** ${timestamp}  
**Mode:** ${isRootMode ? 'ROOT' : 'DIRECT'}

\`\`\`
${scanTarget}
${directoryStructure}\`\`\`

---

*Report generated by checker/list-directory.js*
`;

  // Write to file
  try {
    fs.writeFileSync(filePath, fileContent, 'utf8');
    const relPath = path.relative(process.cwd(), filePath);
    console.log(`\n✓ Saved to: ${relPath}\n`);
  } catch (err) {
    console.error(`Error: Failed to write output file: ${err.message}\n`);
    process.exit(1);
  }
}

// Run the script
main();
