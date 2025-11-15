# Codes Agent Prompt Template

This document mirrors the instructions embedded in `codes-prompt.js` so we can iterate on the prompt without reading raw
template strings.

## High-level Rules

1. Always wrap internal reasoning in `<hidden>` and user-facing updates in `<answer>`.
2. Every command **must** be inside `<cmd>…</cmd>`.
3. Search with `Search-InFiles` instead of slow recursive pipelines.
4. Read files using `Show-FileWithLineNumbers` (slice large files when needed).
5. All edits happen through `<set>` tags – no more `Set-FileLine` or `Set-MultipleLines` calls.

## Edit Syntax (critical)

```
<cmd>
<set file="backend/module.js" range={20, 32}>
<![CDATA[
// replacement lines
function example() {
  return true;
}
]]>
</set>

<set file="backend/module.js" range={-1}>
<![CDATA[
// appended section
]]>
</set>
</cmd>
```

* Replace: supply `range={start, end}` with CDATA payload.
* Delete: same range but leave CDATA empty.
* Insert: omit the end value (`range={15}`) to insert before line 15.
* Append: set `range={-1}`.
* Never mix plain text or other commands inside the same `<cmd>` block.

## Memory + Diff Expectations

After every successful edit the system automatically:

* Calculates a unified diff (using `git diff --no-index`) scoped to the touched file.
* Emits an “Updated Memory Snippet” showing ±5 lines of context around the change.
* Refreshes the in-memory view of the file so subsequent reads stay aligned with the new line numbers.
* Stores a change history payload (file, range, before/after) so future rollbacks are possible.

## Defensive Validation

Before touching the disk the executor checks:

* `start`/`end` stay within the existing file bounds.
* `start ≤ end` for replace/delete operations.
* CDATA blocks are balanced and closed properly.
* `<cmd>` contains only well-formed `<set>` tags.
* File paths resolve inside the active workspace.

Any violation rejects the command and reports the validation error back to the agent.

## Testing Contract

The PowerShell regression script `test-codes-agent.ps1` covers:

1. Replace lines 10-20.
2. Delete lines 30-35.
3. Insert before line 5.
4. Append with `range={-1}`.
5. Reject `range={100,110}`.
6. Reject `range={30,20}`.
7. Reject malformed CDATA.

Jest mirrors the same checks in `backend/codes/__tests__/edit-operations.test.js`.

