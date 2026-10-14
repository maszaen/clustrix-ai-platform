---
name: coding-verification
description: >
  Use when changing Clustrix coding-agent behavior, provider adapters, tools,
  cancellation or context handling. Preserves the desktop UI contract while
  adding focused, offline regression coverage.
---

# Coding-agent verification

1. Read the workspace `AGENTS.md` and scoped instructions. Follow them; this skill does not override user instructions.
2. Trace the public `backend/codes/code-agent.js` facade into `runtime/`. Keep provider wire formats separate from tools and UI presentation.
3. Reproduce the bug with an offline fixture before changing code. Do not use production keys or live paid model calls for unit tests.
4. For provider changes, verify both turns of a tool exchange, not just the first response. Keep call IDs, native reasoning/signatures and results paired.
5. For edit changes, cover stale reads, ambiguous matches, atomic rejection, newline preservation and intervening user changes.
6. For process changes, cover real exit codes, timeouts, cancellation, owned background jobs and bounded output. Linux tests do not prove Windows behavior.
7. For renderer/IPC changes, preserve command-card and approval event formats. Cancellation must settle the waiting promise and abort backend work.
8. Ask approval to run the appropriate repository commands:
   - `npm test -- --runInBand`
   - `npm run test:agent:coverage`
9. Report what actually ran, any failures and any manual Electron/live-provider checks still required. Do not claim a model-quality improvement without a controlled benchmark.

No scripts run automatically when this skill is loaded.
