const assert = require('assert');
const ReasoningActionAgent = require('../reasoning-action-agent');

function createAgent() {
  const fakeService = {
    // minimal stub for DesktopSearchEngine dependencies
    getAvailableProvider: () => null,
  };
  return new ReasoningActionAgent(fakeService);
}

function extractActions(response) {
  const agent = createAgent();
  return agent.parseReasoningResponse(response);
}

(function testNumberedActions() {
  const result = extractActions(`
REASONING: Investigate button handler

PLAN:
1. ACTION: searchPattern with {"pattern": "handleClick", "options": {"maxResults": 5}}
   WHY: Find the handler definition

2. searchCSS("button.primary")
   WHY: Inspect CSS affecting the button

THINKING_LOG:
- created todos 0/2
- read app.js from 120 to 200
`);

  assert.strictEqual(result.actions.length, 2, 'should parse two actions');
  assert.strictEqual(result.actions[0].type, 'searchPattern');
  assert.deepStrictEqual(result.actions[0].params, {
    pattern: 'handleClick',
    options: { maxResults: 5 },
  });
  assert.strictEqual(result.actions[1].type, 'searchCSS');
  assert.deepStrictEqual(result.actions[1].params, { selector: 'button.primary' });
  assert.deepStrictEqual(result.thinkingLog, [
    'created todos 0/2',
    'read app.js from 120 to 200',
  ]);
})();

(function testBulletAndKeyValueActions() {
  const result = extractActions(`
REASONING: Need to locate form submission logic

PLAN:
- searchPattern("submit", {"maxResults": 3})
  WHY: find submit handlers
- searchHTML element="form"
  WHY: inspect form markup

THINKING_LOG:
- now i check the file, i found 4 files in here
- read forms.js from 10 to 80
`);

  assert.strictEqual(result.actions.length, 2, 'bullet list should produce actions');
  assert.strictEqual(result.actions[0].type, 'searchPattern');
  assert.deepStrictEqual(result.actions[0].params.pattern, 'submit');
  assert.strictEqual(result.actions[1].type, 'searchHTML');
  assert.deepStrictEqual(result.actions[1].params, { element: 'form' });
})();

(function testInlineKeyValue() {
  const result = extractActions(`
REASONING: Verify styles for disabled buttons

PLAN:
1. searchCSS selector="button[disabled]"
   WHY: review disabled button styles
2. searchPattern pattern="isDisabled" options={"maxResults": 2}
   WHY: find helper usage

THINKING_LOG:
- search renderSession()
`);

  assert.strictEqual(result.actions.length, 2, 'inline key=value entries should be parsed');
  assert.deepStrictEqual(result.actions[0].params, { selector: 'button[disabled]' });
  assert.deepStrictEqual(result.actions[1].params.pattern, 'isDisabled');
  assert.deepStrictEqual(result.actions[1].params.options, { maxResults: 2 });
})();

(function testJsonPlan() {
  const response = [
    'REASONING: Explore HTML structure',
    '',
    'PLAN:',
    '```json',
    '[',
    '  {"action": "searchHTML", "params": {"element": "button"}, "why": "find buttons"},',
    '  {"action": "analyzeFileStructure", "params": {"fileName": "app.js"}, "why": "inspect module"}',
    ']',
    '```',
    '',
    'THINKING_LOG:',
    '- list project files first',
    '- analyze modules',
    '',
  ].join('\n');

  const result = extractActions(response);

  assert.strictEqual(result.actions.length, 2, 'JSON array plan should be parsed');
  assert.strictEqual(result.actions[0].type, 'searchHTML');
  assert.deepStrictEqual(result.actions[0].params, { element: 'button' });
  assert.strictEqual(result.actions[1].type, 'analyzeFileStructure');
  assert.deepStrictEqual(result.actions[1].params, { fileName: 'app.js' });
})();

console.log('All ReasoningActionAgent plan parsing tests passed.');
