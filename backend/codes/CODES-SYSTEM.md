# Codes Agent Editing Pipeline

This document describes the new `<set>`-based editing system used by the Codes agent.

## Overview

* **Parser** – `applySetOperations` in `backend/codes/edit-operations.js` extracts `<set>` blocks from the `<cmd>` payload.
* **Validator** – ranges, CDATA integrity, and workspace boundaries are checked before any files are touched.
* **Executor** – edits are applied sequentially to each affected file using in-memory arrays, then persisted to disk.
* **Reporter** – unified diffs and memory snippets are generated so the agent sees exactly what changed.
* **History** – every edit pushes a `{ file, start, end, before, after, timestamp }` entry into `state.editHistory` for future rollback tools.

## Supported Operations

| Operation | Syntax Example | Notes |
|-----------|----------------|-------|
| Replace | `<set file="a.js" range={20, 24}>…</set>` | Start & end required. Content replaces inclusive range. |
| Delete | `<set file="a.js" range={20, 24}><![CDATA[]]></set>` | Empty CDATA removes the range. |
| Insert | `<set file="a.js" range={15}>…</set>` | Inserts before line 15. |
| Append | `<set file="a.js" range={-1}>…</set>` | Appends to EOF. |

Multiple `<set>` blocks can be bundled within a single `<cmd>` response. Mixing other commands or plain text is rejected.

## Validation Flow

1. `<set>` extraction – ensures no additional text remains after removing the matched tags.
2. Attribute parsing – `file="…"` and `range={…}` are mandatory. Missing values throw immediately.
3. Range checks – start is ≥1 (or -1 for append) and end ≥ start for replacements/deletions.
4. Bounds checks – ranges may not exceed the current line count.
5. Workspace guard – resolved absolute paths must stay inside the configured workspace root.
6. CDATA verification – malformed or unbalanced sections raise a descriptive error.

If any step fails the command is rejected before modifying files.

## Diff & Memory Output

* Diffs come from `git diff --no-index -U5` executed against temporary snapshots.
* Snippets provide ±5 lines of context around each change. For deletions the context collapses to the nearest surviving line.
* Prior memory for the edited file is cleared and replaced with the new snippet(s) to keep line numbers aligned.

Example output:

```
File: backend/codes/edit-operations.js (120 lines → 125 lines)

@@ -40,6 +40,11 @@
 …

Updated Memory Snippet:
[38-50] backend/codes/edit-operations.js
38: function applySetOperations() {
39:   // …
```

## State Updates

* `state.memories` – refreshed with new snippet ranges post-edit.
* `state.editHistory` – capped at the most recent 100 entries to limit memory growth.
* Command history still records the raw `<set>` payload alongside the formatted diff output.

## Testing

* Jest: `backend/codes/__tests__/edit-operations.test.js` exercises replacements, inserts, deletes, appends, and validation failures.
* PowerShell: `backend/codes/test-codes-agent.ps1` mirrors the same checks for manual regression testing in Windows shells.

