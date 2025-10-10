# Fix: Response Disappears After Manual Stop & Refresh

## Issue Description
Ketika AI response di-stop secara manual (menggunakan tombol Interrupt), response akan terhenti dengan baik. Namun, ketika session di-refresh, response yang sudah di-stop tadi tidak muncul, hanya menampilkan loader/thinking indicator saja. Ini terjadi karena message belum disimpan ke disk.

## Root Cause
Di event handler tombol "Send/Interrupt" (line ~14040-14166 di `renderer/renderer.js`), ketika user meng-interrupt streaming:

1. ✅ Stream di-stop dengan `controller.cancel()`
2. ✅ Message di-update di memory: `session.messages[messageIndex] = ["ai", partial]`
3. ✅ UI di-render dengan partial response
4. ❌ **TIDAK ADA** `save()` call untuk persist ke disk

Sedangkan di fungsi `finalize()` yang dipanggil saat stream selesai normal, ada `await save()` yang menyimpan message.

## Solution
**File:** `renderer/renderer.js`

### Change 1: Make Event Handler Async
**Line:** ~14040

```javascript
// BEFORE
$("#send").addEventListener("click", () => {

// AFTER
$("#send").addEventListener("click", async () => {
```

### Change 2: Preserve modelInfo When Stopping
**Line:** ~14067-14080

```javascript
// BEFORE
const partial = (st.fullResponse || "").trim();
session.messages[messageIndex] = ["ai", partial];

// AFTER
const partial = (st.fullResponse || "").trim();

// Get modelInfo from existing message before updating
const existingMessageData = session.messages[messageIndex];
const modelInfo = existingMessageData && Array.isArray(existingMessageData)
  ? existingMessageData[2]
  : null;

session.messages[messageIndex] = ["ai", partial, modelInfo];

// Track updated message for incremental save
if (!session._newMessages) {
  session._newMessages = [];
}
session._newMessages.push([messageIndex, ["ai", partial, modelInfo]]);
```

### Change 3: Save After Interrupt
**Line:** ~14178-14185

```javascript
// BEFORE
if (interrupted) updateInputState();

// AFTER
if (interrupted) {
  // Save immediately after interrupt to ensure partial response is persisted
  try {
    await save();
    log("STREAM", 2, "interrupt:save", "Saved session after manual interrupt");
  } catch (err) {
    log("STREAM", 3, "interrupt:save", "Failed to save after interrupt", { error: err.message });
  }
  updateInputState();
}
```

## Test Scenarios

### Scenario 1: Stop During Streaming
1. Start a new chat and ask AI a question
2. While AI is responding, click the "Interrupt" button (or send button during streaming)
3. Verify partial response is displayed
4. Press F5 to refresh the app
5. ✅ **Expected:** Partial response should still be visible (not just loader)

### Scenario 2: Stop Immediately After Start
1. Start a new chat and ask AI a question
2. Click interrupt button immediately (while still showing "thinking")
3. Verify "Response interrupted by user" message appears
4. Press F5 to refresh the app
5. ✅ **Expected:** Interrupted message should be visible

### Scenario 3: Stop and Continue
1. Start a new chat and ask AI a question
2. Stop during response (partial content visible)
3. Click "Continue" button
4. Let the continuation finish completely
5. Press F5 to refresh
6. ✅ **Expected:** Full response (original + continuation) should be visible

### Scenario 4: Multiple Stop-Continue Cycles
1. Ask a question
2. Stop → Continue → Stop → Continue
3. Press F5 after each action
4. ✅ **Expected:** At every refresh, the current state should be preserved

## Technical Details

### Why This Fix Works
1. **Preserves modelInfo:** Metadata seperti provider, model name, thinking data tidak hilang
2. **Immediate persistence:** Message langsung disimpan ke disk setelah interrupt
3. **Incremental save tracking:** Menggunakan `_newMessages` untuk efisiensi
4. **Error handling:** Graceful fallback jika save gagal (dengan logging)

### Related Code
- `finalize()` function: Handles normal stream completion with save
- `streamManager.stopStream()`: Cleans up stream state
- `save()` function: Persists sessions to disk
- Session loading: Hydrates messages from disk on refresh

## Impact
- ✅ **Bug fixed:** Partial responses persist after refresh
- ✅ **No breaking changes:** Existing functionality unchanged
- ✅ **Better UX:** Users don't lose work if they accidentally refresh
- ✅ **Consistent behavior:** Stop button now behaves like natural stream end

## Date
October 10, 2025
