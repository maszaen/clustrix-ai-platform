const assert = require('assert');
const ReasoningActionAgent = require('../reasoning-action-agent');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

const agent = new ReasoningActionAgent({});

test('parses nested options objects without truncation', () => {
  const response = `REASONING: Check TODOs

PLAN:
1. ACTION: searchPattern with {"pattern":"TODO","options":{"contextLines":3,"files":["src/app.js","src/utils.js"]}}
   WHY: Locate pending work
2. ACTION: analyzeFileStructure with {"fileName":"src/app.js"}
   WHY: Inspect file structure

CURRENT THINKING: Working through actions`;

  const plan = agent.parseReasoningResponse(response);
  assert.strictEqual(plan.actions.length, 2);
  assert.strictEqual(plan.actions[0].params.pattern, 'TODO');
  assert.deepStrictEqual(plan.actions[0].params.options.files, ['src/app.js', 'src/utils.js']);
  assert.strictEqual(plan.actions[0].params.options.contextLines, 3);
  assert.strictEqual(plan.actions[0].reason, 'Locate pending work');
  assert.strictEqual(plan.actions[1].params.fileName, 'src/app.js');
  assert.strictEqual(plan.actions[1].reason, 'Inspect file structure');
});

test('parses multi-line JSON parameter blocks', () => {
  const response = `PLAN:
1. ACTION: searchPattern with {
  "pattern": "useEffect",
  "options": {
    "caseSensitive": false,
    "contextLines": 4
  }
}
WHY: Find hook usage

CURRENT THINKING: Done`;

  const plan = agent.parseReasoningResponse(response);
  assert.strictEqual(plan.actions.length, 1);
  assert.strictEqual(plan.actions[0].params.pattern, 'useEffect');
  assert.strictEqual(plan.actions[0].params.options.contextLines, 4);
  assert.strictEqual(plan.actions[0].params.options.caseSensitive, false);
  assert.strictEqual(plan.actions[0].reason, 'Find hook usage');
});

console.log('All tests passed.');
