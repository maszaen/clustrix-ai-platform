const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
const result = dotenv.config({ path: envPath });

if (result.error && result.error.code !== 'ENOENT') {
  throw result.error;
}

const envDefinitions = [
  {
    defineKeys: ['process.env.GITHUB_CLIENT_ID'],
    sources: ['GITHUB_CLIENT_ID']
  },
  {
    defineKeys: ['process.env.GITHUB_CLIENT', 'process.env.GITHUB_CLIENT_SECRET'],
    sources: ['GITHUB_CLIENT_SECRET', 'GITHUB_CLIENT']
  },
  {
    defineKeys: ['process.env.GITHUB_CALLBACK_URL'],
    sources: ['GITHUB_CALLBACK_URL']
  }
];

const define = {};
const missing = [];

envDefinitions.forEach(({ defineKeys, sources }) => {
  const value = sources.map((key) => process.env[key]).find((val) => typeof val !== 'undefined');

  if (typeof value === 'undefined') {
    missing.push(...defineKeys);
  }

  defineKeys.forEach((defineKey) => {
    define[defineKey] = JSON.stringify(value ?? '');
  });
});

if (missing.length > 0) {
  console.warn('[build] Missing environment variables for:', missing.join(', '));
}

if (require.main === module) {
  console.log('[build] Loaded environment definitions:', define);
}

module.exports = { define };
