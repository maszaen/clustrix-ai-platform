# Test Cases for Research Agent Fix

## Test Setup
Upload file "UAS PKN.docx" (atau file serupa) ke chat session.

---

## Test Case 1: Simple Author Query (Minimal Action Prevention)

**Input:**
```
Siapa yang membuat file ini?
```

**Expected Behavior:**
1. AI creates initial plan with 1-2 actions
2. If only 1 action created, system auto-adds complementary action
3. Minimum 2 actions executed
4. Response includes actual data from file

**Success Criteria:**
- ✅ At least 2 actions executed
- ✅ Response contains author name from file content
- ✅ No speculative "analysis" without data

---

## Test Case 2: Failed Action Fallback

**Input:**
```
Apa isi file ini?
```

**Expected Behavior:**
1. AI might try `analyzeFileStructure` first
2. If it returns 0 results, auto-fallback triggers
3. System adds `searchPattern` with broad pattern
4. Response based on actual search results

**Success Criteria:**
- ✅ If first action fails (0 results), fallback action added
- ✅ Minimum 2 total actions (original + fallback)
- ✅ Response contains actual file content

---

## Test Case 3: Complex Analysis Query

**Input:**
```
Kenapa file "UAS PKN.docx" mungkin hanya dapat nilai B? Apa yang perlu diperbaiki untuk mendapat nilai A?
```

**Expected Behavior:**
1. AI creates comprehensive plan with 3+ actions
2. Multiple different search strategies used
3. If early actions fail, followup encourages more searches
4. Final response based on concrete findings

**Success Criteria:**
- ✅ Minimum 3 actions executed
- ✅ Multiple different search patterns used
- ✅ Response includes specific findings from file
- ✅ Recommendations based on actual content analysis

---

## Test Case 4: Followup After Insufficient Results

**Input:**
First query:
```
Cari informasi tentang "analisis teori" di file ini
```

Then followup:
```
Coba cari lagi dengan kata kunci berbeda
```

**Expected Behavior:**
1. First query executes 2+ actions
2. If results insufficient, system/AI should try alternatives
3. Followup prompt encourages more thorough search
4. Different search patterns attempted

**Success Criteria:**
- ✅ Different patterns tried across queries
- ✅ No premature "I can't find anything" response
- ✅ At least 3-4 total unique search attempts

---

## Test Case 5: Web Search Combination (if configured)

**Input:**
```
Cari informasi tentang struktur makalah PKN yang baik, lalu bandingkan dengan file yang saya upload
```

**Expected Behavior:**
1. AI creates plan with both web search and file search
2. Minimum 3-4 actions (web + multiple file searches)
3. Synthesis combines external knowledge with file analysis

**Success Criteria:**
- ✅ Both web and file search executed
- ✅ Minimum 3 actions
- ✅ Response synthesizes both sources

---

## Validation Checklist

After running tests, verify in logs:

### Log Markers to Check:
```
✅ "AI only created 1 action. Encouraging more thorough research"
   → Confirms single-action prevention triggered

✅ "Action X returned 0 results. Auto-triggering additional search strategies"
   → Confirms fallback mechanism triggered

✅ "Added complementary X action to ensure thorough research"
   → Confirms quality enhancement working

✅ "AI requested X additional actions"
   → Confirms followup prompt encouraging deeper research
```

### Action Count Verification:
```bash
# Check log for action counts
Get-Content app.log | Select-String "Actions: \d+" 

# Expected: Most queries should show "Actions: 2" or higher
```

### Result Quality Check:
```bash
# Check for "0 hasil" frequency
Get-Content app.log | Select-String "0 hasil"

# Expected: Should be rare, and followed by fallback actions
```

---

## Regression Tests

Ensure fix doesn't break existing good behavior:

### RT-1: AI Already Creates Good Plan
**Input:** Complex query that naturally prompts 3+ actions

**Expected:** System doesn't interfere, lets AI plan proceed

**Success:** No "WARNING: AI only created 1 action" log

---

### RT-2: Web-Only Query (No Files)
**Input:** "Cari berita terbaru tentang AI"

**Expected:** Web search actions only, no file fallbacks

**Success:** System doesn't add file-based fallback actions

---

### RT-3: Multiple Files Scenario
**Input:** Query about patterns across multiple uploaded files

**Expected:** Actions target different files appropriately

**Success:** Search actions distributed across files

---

## Debugging Failed Tests

If tests fail, check:

1. **Log file location:** `app.log` should contain detailed execution logs
2. **Action parsing:** Look for "Parsed plan" entries
3. **Fallback trigger:** Search for "Auto-triggering" messages
4. **Quality check:** Search for "WARNING: AI only created"

Example debug command:
```bash
Get-Content app.log | Select-String "REASONING_ACTION_AGENT" -Context 2
```

---

## Expected Improvements vs Old Behavior

| Scenario | Old Behavior | New Behavior |
|----------|--------------|--------------|
| Single action plan | Accepted as-is | Auto-enhanced with +1 action |
| First action fails (0 results) | AI decides next step | Auto-fallback triggered |
| Insufficient info after 1-2 actions | AI might give up | Followup encourages more searches |
| Simple queries | Often just 1 action | Minimum 2 actions ensured |

---

## Notes

- All tests assume file is properly uploaded and accessible
- Logs should be enabled (CLUSTrix_DEBUG=true recommended)
- Test with different AI models to ensure consistency
- Monitor token usage - more actions = more tokens
