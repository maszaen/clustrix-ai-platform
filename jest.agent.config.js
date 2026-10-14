/** Isolated quality gate for the modern coding runtime and its public integration contract. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/backend/codes/runtime/__tests__/**/*.test.js', '**/backend/codes/__tests__/code-agent*.test.js'],
  collectCoverageFrom: ['backend/codes/runtime/*.js'],
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
  testTimeout: 15000,
  clearMocks: true,
};
