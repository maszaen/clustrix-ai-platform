# Codes Agent Fix - Context Amnesia Bug

## Problem Summary

The codes agent was repeating the same failed commands over and over, showing no learning from previous attempts. Analysis of `response-copy.md` revealed the AI tried `Select-String "Stay once"` 15+ times despite it failing every time.

## Root Cause

**Context Amnesia** - The agent was using a stateless single-turn conversation model:

```javascript
// OLD CODE (BROKEN)
const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userPrompt },  // ← Always the same!
];
```

**Problems:**
1. AI received the SAME user prompt every iteration
2. No conversation history maintained
3. AI couldn't see its own previous responses/reasoning
4. Only command outputs were visible (as text in system prompt)

## Solution

Converted to **stateful multi-turn conversation** by:

1. **Maintaining conversation history** in session state
2. **Sending full conversation thread** to AI each iteration
3. **Storing assistant responses** so AI can see its own reasoning
4. **Adding execution feedback** as user messages

## Changes Made

### 1. Added conversation history to session state
```javascript
state = {
  commandHistory: [],
  conversationHistory: [], // NEW: Track full conversation
  terminal: null,
  // ...
};
```

### 2. Modified `runAgentIteration()` to use conversation history
```javascript
if (iteration === 0) {
  // First iteration: initialize
  messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  state.conversationHistory = [...messages];
} else {
  // Subsequent: use full history
  state.conversationHistory[0] = { role: 'system', content: systemPrompt };
  messages = [...state.conversationHistory];
}

// Store assistant's response
state.conversationHistory.push({
  role: 'assistant',
  content: response.content,
});
```

### 3. Added execution feedback to conversation
```javascript
// After command execution
const feedbackMessage = `Command executed:
\`\`\`powershell
${parsed.command}
\`\`\`

Output:
\`\`\`
${truncateOutput(output)}
\`\`\`
Exit Code: ${exitCode}`;

state.conversationHistory.push({
  role: 'user',
  content: feedbackMessage,
});
```

### 4. Added system messages to conversation
- User skip events
- Loop breaker warnings
- Timeout notifications

## Expected Behavior After Fix

**Before:**
- AI: tries `Select-String "Stay once"` → fails
- AI: tries `Select-String "Stay once"` → fails (again!)
- AI: tries `Select-String "Stay once"` → fails (again!!)
- ... repeats 15+ times

**After:**
- AI: tries `Select-String "Stay once"` → fails
- AI: sees its previous attempt failed, tries different approach
- AI: uses proper line numbering command
- AI: succeeds in 2-3 iterations

## Benefits

1. **Learning from mistakes** - AI sees what it already tried
2. **Better context** - Full conversation thread provides reasoning chain
3. **Faster convergence** - No repeated failed attempts
4. **Smarter decisions** - AI can reference its own previous analysis

## Testing Recommendations

1. Test with the original scenario from `response-copy.md`
2. Verify AI doesn't repeat failed commands
3. Check conversation history grows properly
4. Ensure memory doesn't grow unbounded (consider trimming old messages)

## Future Improvements

Consider adding:
- Conversation history trimming (keep last N messages)
- Token usage optimization (summarize old messages)
- Explicit reflection prompts ("What did you learn from the last attempt?")
