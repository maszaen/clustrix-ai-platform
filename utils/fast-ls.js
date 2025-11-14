#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

const DEFAULT_EXTENSIONS = ['.js', '.ts', '.css', '.scss'];
const DEFAULT_IGNORE_DIRS = ['node_modules', '.git', '.svn', '.hg'];
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_CONCURRENCY = Math.min(32, Math.max(4, os.cpus().length * 2));

/**
 * Parse CLI arguments into an options object.
 * @returns {{ root: string, extensions: string[], depth: number, ignore: string[], absolute: boolean, concurrency: number, sort: boolean, json: boolean, stats: boolean }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    root: process.cwd(),
    extensions: DEFAULT_EXTENSIONS,
    depth: DEFAULT_MAX_DEPTH,
    ignore: DEFAULT_IGNORE_DIRS,
    absolute: false,
    concurrency: DEFAULT_CONCURRENCY,
    sort: false,
    json: false,
    stats: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--root':
      case '-r':
        options.root = path.resolve(args[++i] ?? options.root);
        break;
      case '--extensions':
      case '-e':
        options.extensions = normalizeExtensions(args[++i]);
        break;
      case '--depth':
      case '-d':
        options.depth = parseDepth(args[++i]);
        break;
      case '--ignore':
      case '-i':
        options.ignore = normalizeList(args[++i]);
        break;
      case '--absolute':
      case '-a':
        options.absolute = true;
        break;
      case '--concurrency':
      case '-c':
        options.concurrency = parseConcurrency(args[++i]);
        break;
      case '--sort':
        options.sort = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--stats':
        options.stats = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Normalize a comma-separated extension list.
 * @param {string|undefined} value
 * @returns {string[]}
 */
function normalizeExtensions(value) {
  if (!value) {
    return DEFAULT_EXTENSIONS;
  }

  return value
    .split(',')
    .map(ext => ext.trim())
    .filter(Boolean)
    .map(ext => (ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
}

/**
 * Normalize a comma-separated string list.
 * @param {string|undefined} value
 * @returns {string[]}
 */
function normalizeList(value) {
  if (!value) {
    return DEFAULT_IGNORE_DIRS;
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Parse a depth value.
 * @param {string|undefined} value
 * @returns {number}
 */
function parseDepth(value) {
  if (!value) {
    return DEFAULT_MAX_DEPTH;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(`Invalid depth: ${value}. Depth must be a non-negative integer.`);
    process.exit(1);
  }

  return parsed;
}

function parseConcurrency(value) {
  if (!value) {
    return DEFAULT_CONCURRENCY;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`Invalid concurrency: ${value}. Concurrency must be a positive integer.`);
    process.exit(1);
  }

  return parsed;
}

/**
 * Print usage information.
 */
function printHelp() {
  console.log(
    `Fast file lister\n\n` +
      `Usage: node utils/fast-ls.js [options]\n\n` +
      `Options:\n` +
      `  -r, --root <path>         Root directory to scan (default: current directory)\n` +
      `  -e, --extensions <list>   Comma-separated list of extensions (default: ${DEFAULT_EXTENSIONS.join(',')})\n` +
      `  -d, --depth <number>      Maximum depth to traverse (default: ${DEFAULT_MAX_DEPTH})\n` +
      `  -i, --ignore <list>       Comma-separated directories to ignore (default: ${DEFAULT_IGNORE_DIRS.join(',')})\n` +
      `  -a, --absolute            Output absolute paths instead of relative\n` +
      `  -c, --concurrency <num>   Concurrent directory reads (default: ${DEFAULT_CONCURRENCY})\n` +
      `      --sort                Sort results after traversal (slower)\n` +
      `      --json                Emit JSON array of matches (implies --sort)\n` +
      `      --stats               Print traversal timing to stderr\n` +
      `  -h, --help                Show this help message\n`
  );
}

/**
 * Collect files matching the extensions within the depth limit.
 * @param {string} rootDir
 * @param {number} maxDepth
 * @param {string[]} extensions
 * @param {string[]} ignoreDirs
 * @returns {string[]}
 */
async function collectMatchingFiles(options, onMatch) {
  const { root, depth: maxDepth, extensions, ignore, concurrency } = options;
  const queue = [{ dir: root, depth: 0 }];
  const normalizedExtensions = new Set(extensions.map(ext => ext.toLowerCase()));
  const ignoreSet = new Set(ignore);
  let active = 0;

  return new Promise(resolve => {
    const next = () => {
      if (queue.length === 0 && active === 0) {
        resolve();
        return;
      }

      while (queue.length > 0 && active < concurrency) {
        const { dir, depth } = queue.pop();
        active++;

        fs.promises
          .readdir(dir, { withFileTypes: true })
          .then(entries => {
            for (const entry of entries) {
              const entryName = entry.name;

              if (entry.isDirectory()) {
                if (ignoreSet.has(entryName)) {
                  continue;
                }

                if (depth < maxDepth) {
                  queue.push({ dir: path.join(dir, entryName), depth: depth + 1 });
                }
              } else if (entry.isFile()) {
                const ext = path.extname(entryName).toLowerCase();
                if (normalizedExtensions.has(ext)) {
                  onMatch(path.join(dir, entryName));
                }
              }
            }
          })
          .catch(() => {
            // Swallow errors for unreadable directories
          })
          .finally(() => {
            active--;
            next();
          });
      }
    };

    next();
  });
}

function main() {
  const options = parseArgs();
  const { root, absolute } = options;

  let stats;
  try {
    stats = fs.statSync(root);
  } catch (err) {
    console.error(`Cannot access root directory "${root}": ${err.message}`);
    process.exit(1);
  }

  if (!stats.isDirectory()) {
    console.error(`Root path "${root}" is not a directory.`);
    process.exit(1);
  }

  const collected = [];
  const shouldCollect = options.sort || options.json;
  const start = options.stats ? performance.now() : null;

  const handleMatch = file => {
    const outputPath = absolute ? file : path.relative(root, file);

    if (shouldCollect) {
      collected.push(outputPath);
    } else {
      process.stdout.write(`${outputPath}\n`);
    }
  };

  collectMatchingFiles(options, handleMatch).then(() => {
    if (shouldCollect) {
      const finalList = options.sort || options.json ? collected.sort((a, b) => a.localeCompare(b)) : collected;
      const payload = options.json ? JSON.stringify(finalList, null, 2) : finalList.join('\n');
      if (payload) {
        process.stdout.write(`${payload}${options.json ? '\n' : ''}`);
      }
    }

    if (options.stats && start !== null) {
      const durationMs = performance.now() - start;
      process.stderr.write(`Scanned in ${durationMs.toFixed(2)}ms\n`);
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  collectMatchingFiles,
  normalizeExtensions,
  normalizeList,
  parseDepth,
  parseConcurrency
};
