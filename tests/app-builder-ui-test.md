# App Builder UI Integration Test Plan

## Overview
This document outlines the manual testing procedures for the App Builder UI integration in the Projects page.

## Test Setup
1. Start the application: `npm run dev`
2. Navigate to the Projects page
3. Verify the "Build an App" button appears in the header next to "New Project"

## Test Cases

### TC1: Modal Opening and Closing
**Steps:**
1. Click the "Build an App" button
2. Verify modal opens with fade-in animation
3. Verify phase indicator shows "Clarify" as active
4. Verify welcome message is displayed with 3 example prompts
5. Click the close button (X) in top-right
6. Verify modal closes smoothly

**Expected Result:** ✅ Modal opens/closes smoothly with proper animations

---

### TC2: Example Prompts
**Steps:**
1. Open App Builder modal
2. Click the first example prompt: "Build a todo app..."
3. Verify the text appears in the input textarea
4. Repeat for other example prompts

**Expected Result:** ✅ Example prompts populate the input field correctly

---

### TC3: Settings Panel
**Steps:**
1. Open App Builder modal
2. Click the settings gear icon (bottom-right)
3. Verify settings panel appears
4. Test "Browse" button for workspace path
5. Adjust max requests slider (10-200)
6. Toggle auto-approve checkbox
7. Close modal and reopen
8. Verify settings persisted

**Expected Result:** ✅ Settings panel works and persists values

---

### TC4: Chat Interface - Phase 1 (Clarify)
**Steps:**
1. Open App Builder modal
2. Type: "I want to build a React todo app"
3. Click Send or press Enter
4. Verify:
   - User message appears on the right (blue background)
   - Assistant response appears on the left (gray background)
   - Messages auto-scroll to bottom
   - Response is streamed (if AI configured)
   - Phase indicator remains on "Clarify"

**Expected Result:** ✅ Chat interface works with streaming responses

---

### TC5: Plan Generation - Phase 2 (Plan)
**Steps:**
1. Continue conversation until AI generates a JSON plan
2. Verify:
   - Phase indicator changes to "Plan" (active)
   - Chat container hides
   - Plan preview shows
   - Plan sections display: Project Info, Directories, Files, Commands
   - "Edit Plan" and "Approve & Build" buttons appear

**Expected Result:** ✅ Plan preview renders correctly from JSON

---

### TC6: Plan Editing
**Steps:**
1. In Plan Preview, click "Edit Plan"
2. Verify:
   - Phase indicator returns to "Clarify"
   - Chat interface shows again
   - New message appears: "Sure! What would you like to change..."
3. Make changes in chat
4. Verify plan updates accordingly

**Expected Result:** ✅ Plan editing workflow functions correctly

---

### TC7: Build Execution - Phase 3 (Build)
**Steps:**
1. In Plan Preview, click "Approve & Build"
2. Verify:
   - Phase indicator changes to "Build" (active)
   - Progress container shows
   - Progress bar appears (0%)
   - Progress logs area is visible
   - Stats show: "0/X steps • 0 succeeded • 0 failed"
   - Cancel button is visible

**Expected Result:** ✅ Build phase UI initializes correctly

---

### TC8: Progress Tracking
**Steps:**
1. During build execution, monitor progress updates
2. Verify:
   - Progress bar percentage increases
   - Phase name updates (e.g., "Creating directories...")
   - Logs appear in real-time
   - Success logs show in green
   - Error logs show in red
   - Stats update live (step counts)

**Expected Result:** ✅ Progress tracking updates in real-time

---

### TC9: Build Completion
**Steps:**
1. Wait for build to complete
2. Verify:
   - Progress bar reaches 100%
   - Final success message appears
   - Cancel button hides
   - "Done" button appears
   - Click "Done" to close modal

**Expected Result:** ✅ Build completion workflow functions properly

---

### TC10: Error Handling
**Steps:**
1. Test with invalid workspace path
2. Test with network disconnected (no AI response)
3. Test plan with invalid JSON
4. Verify error messages display appropriately

**Expected Result:** ✅ Errors are handled gracefully with user-friendly messages

---

### TC11: Keyboard Navigation
**Steps:**
1. Open modal
2. Press Tab to navigate through elements
3. Press Enter in textarea to send message
4. Press Escape to close modal (if implemented)

**Expected Result:** ✅ Keyboard navigation works smoothly

---

### TC12: Responsive Design
**Steps:**
1. Resize window to various sizes
2. Verify modal adapts properly
3. Check scrolling in all containers
4. Verify text wrapping and layout

**Expected Result:** ✅ UI is responsive and readable at all sizes

---

### TC13: Performance
**Steps:**
1. Send 20+ messages in chat
2. Generate plan with 50+ files
3. Monitor build with 100+ log entries
4. Verify:
   - No lag in UI
   - Smooth scrolling
   - Quick phase transitions

**Expected Result:** ✅ UI remains performant with large data

---

### TC14: Settings Persistence
**Steps:**
1. Set workspace path to "C:\Projects\MyApp"
2. Set max requests to 100
3. Enable auto-approve
4. Close app completely
5. Restart app and open App Builder
6. Verify all settings retained

**Expected Result:** ✅ Settings persist across app restarts

---

### TC15: Multiple Sessions
**Steps:**
1. Start a build
2. Close modal mid-build
3. Reopen modal
4. Verify state is maintained or reset appropriately

**Expected Result:** ✅ Session state handled correctly

---

## Visual Regression Checks

### Colors & Theming
- [ ] Modal background matches app theme
- [ ] Border colors consistent with design system
- [ ] Hover states visible on all interactive elements
- [ ] Active phase indicator uses primary color
- [ ] Completed phase indicators use success color

### Typography
- [ ] Font sizes appropriate and readable
- [ ] Font weights used for hierarchy
- [ ] Code blocks use monospace font
- [ ] Text color contrast meets accessibility standards

### Animations
- [ ] Modal fade-in smooth (200ms)
- [ ] Modal slide-up smooth (300ms)
- [ ] Button hover effects smooth
- [ ] Progress bar transitions smooth (300ms)
- [ ] Phase transitions smooth

### Layout
- [ ] Proper spacing between elements
- [ ] Consistent padding throughout
- [ ] Elements align correctly
- [ ] No text overflow issues
- [ ] Scrollbars styled consistently

---

## Integration Checks

### Backend Integration
- [ ] Settings save/load via IPC
- [ ] Plan validation works
- [ ] Build execution triggers backend
- [ ] Progress events received
- [ ] Approval requests handled

### Chat Streaming
- [ ] Messages stream correctly
- [ ] Markdown rendering works
- [ ] Code blocks highlighted
- [ ] Links clickable
- [ ] Math equations render (if applicable)

### File System
- [ ] Workspace browser shows correct directories
- [ ] Path validation works
- [ ] Invalid paths rejected
- [ ] File creation succeeds

---

## Performance Benchmarks
- Modal open time: < 100ms
- Phase transition time: < 200ms
- Plan rendering time: < 300ms (100 files)
- Scroll performance: 60 FPS
- Memory usage: Stable over 30min session

---

## Browser DevTools Checks
1. Open DevTools (Ctrl+Shift+I)
2. Check Console for errors
3. Monitor Network tab for failed requests
4. Use Performance profiler for lag
5. Check Memory tab for leaks

---

## Accessibility Checks
- [ ] All buttons have proper aria-labels
- [ ] Keyboard focus visible
- [ ] Screen reader friendly
- [ ] Color contrast > 4.5:1
- [ ] Interactive elements > 44x44px

---

## Test Summary Template

```
Date: __________
Tester: __________
Version: __________

Total Test Cases: 15
Passed: ___
Failed: ___
Blocked: ___
Not Tested: ___

Critical Issues:
1. 
2.

Minor Issues:
1.
2.

Notes:


Signature: __________
```

---

## Known Limitations
1. No undo/redo for plan edits (future enhancement)
2. Build cancellation may not stop all operations immediately
3. Large file previews may cause lag (implement lazy loading)
4. No build history/logs saved yet (future enhancement)

---

## Future Enhancements
- [ ] Save/resume build sessions
- [ ] Build templates library
- [ ] Version control integration
- [ ] Multi-project support
- [ ] Build history viewer
- [ ] Export build logs
- [ ] Custom prompt templates
