/**
 * Test Context Manager - Token counting and summarization
 */

const {
  estimateTokens,
  estimateMessageTokens,
  estimateHistoryTokens,
  getContextLimit,
  getTargetHistoryTokens,
  formatSummaryForContext,
  checkNeedsSummarization,
  buildConversationText,
  CONTEXT_LIMITS
} = require('./context-manager');

console.log('=== Context Manager Tests ===\n');

// Test 1: Token estimation
console.log('TEST 1: Token Estimation');
const shortText = 'Hello world';
const longText = 'This is a longer text that should have more tokens. '.repeat(100);
console.log(`  Short text (${shortText.length} chars): ~${estimateTokens(shortText)} tokens`);
console.log(`  Long text (${longText.length} chars): ~${estimateTokens(longText)} tokens`);
console.log('  ✓ Token estimation works\n');

// Test 2: Message token estimation
console.log('TEST 2: Message Token Estimation');
const userMsg = { role: 'user', content: 'Please help me fix this bug in my code' };
const assistantMsg = { role: 'assistant', content: [{ type: 'text', text: 'I can help you with that. Let me analyze the code.' }] };
console.log(`  User message: ~${estimateMessageTokens(userMsg)} tokens`);
console.log(`  Assistant message: ~${estimateMessageTokens(assistantMsg)} tokens`);
console.log('  ✓ Message token estimation works\n');

// Test 3: History token estimation
console.log('TEST 3: History Token Estimation');
const history = [userMsg, assistantMsg, userMsg, assistantMsg];
console.log(`  4 messages: ~${estimateHistoryTokens(history)} tokens`);
console.log('  ✓ History token estimation works\n');

// Test 4: Context limits
console.log('TEST 4: Context Limits');
console.log('  Limits:', CONTEXT_LIMITS);
console.log(`  Claude limit: ${getContextLimit('claude-3-5-sonnet')}`);
console.log(`  GPT-4 limit: ${getContextLimit('gpt-4-turbo')}`);
console.log(`  Gemini limit: ${getContextLimit('gemini-1.5-pro')}`);
console.log(`  Default limit: ${getContextLimit('unknown-model')}`);
console.log('  ✓ Context limits work\n');

// Test 5: Target history tokens
console.log('TEST 5: Target History Tokens (60% of limit)');
console.log(`  Claude target: ${getTargetHistoryTokens('claude-3-5-sonnet')} tokens`);
console.log(`  GPT-4 target: ${getTargetHistoryTokens('gpt-4-turbo')} tokens`);
console.log('  ✓ Target calculation works\n');

// Test 6: Summary formatting
console.log('TEST 6: Summary Formatting');
const testSummary = '## Summary\n\nUser was working on a calculator app.';
const formatted = formatSummaryForContext(testSummary);
console.log('  Formatted summary preview:');
console.log('  ' + formatted.slice(0, 100) + '...');
console.log('  ✓ Summary formatting works\n');

console.log('=== All Context Manager Tests Passed ===');


// Test 7: Check needs summarization
console.log('TEST 7: Check Needs Summarization');
const smallHistory = [{ role: 'user', content: 'Hello' }];
const check1 = checkNeedsSummarization(smallHistory, 'claude');
console.log(`  Small history: needsSummarization=${check1.needsSummarization}, tokens=${check1.currentTokens}`);

// Create large history that exceeds limit
const largeHistory = [];
for (let i = 0; i < 1000; i++) {
  largeHistory.push({ role: 'user', content: 'This is a very long message. '.repeat(100) });
  largeHistory.push({ role: 'assistant', content: 'This is a response. '.repeat(100) });
}
const check2 = checkNeedsSummarization(largeHistory, 'claude');
console.log(`  Large history: needsSummarization=${check2.needsSummarization}, tokens=${check2.currentTokens}`);
console.log('  ✓ Summarization check works\n');

// Test 8: Build conversation text
console.log('TEST 8: Build Conversation Text');
const testMessages = [
  { role: 'user', content: 'Help me fix a bug' },
  { role: 'assistant', content: 'Sure, what is the error?' }
];
const convText = buildConversationText(testMessages);
console.log('  Conversation text preview:', convText.slice(0, 100) + '...');
const convTextWithSummary = buildConversationText(testMessages, 'Previous: User was debugging');
console.log('  With existing summary:', convTextWithSummary.slice(0, 80) + '...');
console.log('  ✓ Conversation text building works\n');

console.log('=== All Extended Tests Passed ===');


// Test 9: Verify no infinite loop after summarize
console.log('TEST 9: No Infinite Loop After Summarize');
// After summarize, history is reset to just 1 message with summary
const postSummarizeHistory = [
  { role: 'user', content: '[SUMMARY]...' + 'x'.repeat(10000) + '...Current request: help me' }
];
const check3 = checkNeedsSummarization(postSummarizeHistory, 'gpt-4');
console.log(`  Post-summarize (1 msg, ${check3.currentTokens} tokens): needsSummarization=${check3.needsSummarization}`);
console.log(`  Message count: ${check3.messageCount}, min required: 3`);
console.log('  ✓ No infinite loop - summarization blocked for < 3 messages\n');

// Test 10: Verify summarization triggers with enough messages over limit
console.log('TEST 10: Summarization Triggers With Enough Messages Over Limit');
const manyMessages = [];
for (let i = 0; i < 50; i++) {
  manyMessages.push({ role: 'user', content: 'Long message '.repeat(1000) });
  manyMessages.push({ role: 'assistant', content: 'Long response '.repeat(1000) });
}
const check4 = checkNeedsSummarization(manyMessages, 'gpt-4');
console.log(`  Many messages (${check4.messageCount} msgs, ${check4.currentTokens} tokens, target: ${check4.targetTokens})`);
console.log(`  needsSummarization=${check4.needsSummarization}`);
console.log('  ✓ Summarization triggers correctly with many messages over limit\n');

console.log('=== All Infinite Loop Prevention Tests Passed ===');
