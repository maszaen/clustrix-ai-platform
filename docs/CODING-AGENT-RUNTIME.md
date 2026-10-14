# Modern Codes runtime: maintainer guide

The new runtime is the **default** behind the existing Codes UI. Select a project workspace and a tool-capable model as usual. No new screen, package dependency or schema migration is required. Windows native file tools also reject reserved device names, alternate data streams and trailing-dot/space aliases.

Read [the audit](CODING-AGENT-AUDIT.md) for evidence, tradeoffs and unvalidated areas.

## Provider compatibility

| Configuration | Protocol |
|---|---|
| OpenRouter, DeepSeek, BigModel, generic compatible/local endpoint | OpenAI Chat Completions |
| Anthropic provider / `api.anthropic.com` / endpoint ending `/messages` | Anthropic Messages |
| Gemini or Google provider / native Google host | Gemini `streamGenerateContent` |
| URL ending `/responses` or explicit `protocol: "responses"` | OpenAI Responses |
| URL ending `/chat/completions` or `/openai` | OpenAI Chat Completions even if model is Claude/Gemini |

Explicit protocol overrides take precedence. Known OpenRouter URLs remain OpenAI-compatible. Custom native proxies should select the matching provider or a protocol override. Model IDs are passed through; routing never infers protocol from words in the model name.

Supported protocol overrides: `openai`, `anthropic`, `gemini`, `responses`.

The transport supports HTTP local providers, HTTPS, URL query parameters, UTF-8 SSE, abort, bounded response accumulation, usage, and up to two retries for transient HTTP statuses **before** consuming any response. It does not retry partially streamed answers/tool calls, authentication errors or invalid schemas. A server/model without native tools or SSE is not silently switched to XML mode.

### Advanced settings / rollback without adding UI

The runtime reads the existing SQLite setting **`codes.agent`**. No keys go into this setting. For development/review, use the existing Electron renderer DevTools bridge:

```js
await window.api.sessions.save({
  isIncremental: true,
  sessions: [],
  settings: {
    'codes.agent': {
      runtime: 'modern',
      contextWindow: 32768,
      maxOutputTokens: 8192,
      maxIterations: 80,
      providers: {
        openrouter: { contextWindow: 65536 },
        // Use the provider ID from your model configuration:
        custom: { protocol: 'openai', streamUsage: false, outputTokenField: 'max_tokens' }
      }
    }
  }
});
```

**Keep `isIncremental: true` and `sessions: []` exactly as shown for a settings-only update.** The existing full-save API removes sessions omitted from a non-incremental payload. Do not use a full-save call for this operation. Settings can also be set from trusted backend code with `db.saveSetting('codes.agent', value)`.

- Options are application settings, not executable config from a repository.
- A provider override merges over the global options.
- `contextWindow` is an estimate budget, not a promise that the upstream model accepts that many tokens. Set it to the selected model's documented capacity, leaving the output reservation intact.
- `maxOutputTokens` controls native output limits. OpenAI's own host uses `max_completion_tokens`; compatible gateways default to `max_tokens`. Override `outputTokenField` for a custom server that requires the other field.
- `streamUsage: false` omits `stream_options` for older compatible servers. Usage will then depend on what the server actually sends; missing usage is not guessed.
- Default approval is per exact shell/network action. This patch does not add an “approve everything” setting.

**Rollback:** cancel active runs, save the same incremental payload with `settings: { 'codes.agent': { runtime: 'legacy' } }`, then restart the app to dispose old jobs. Only the exact value `legacy` selects the previous implementation. Set the value back to `{ runtime: 'modern' }` (or `{}`) and restart to return. Legacy mode retains the old provider limitations; it is not a fix for a misconfigured endpoint.

## Workspace tools

- `list_files`: bounded traversal; skips VCS, dependencies, common build folders and symlinks.
- `search_files`: bounded **literal** search with file/line results. Narrow `directory`; use an approved shell command for regex/gitignore-aware `rg` behavior. Native traversal uses its own skip list, not a full `.gitignore` parser.
- `read_file`: numbered ranges (200 default, 400 max), total lines, next range, revision hash and scoped `AGENTS.md`.
- `edit_file`: exact unique text replacement. Example:

  ```json
  {
    "file": "src/example.js",
    "replacements": [
      { "old_text": "const retries = 0;", "new_text": "const retries = 3;" },
      { "old_text": "timeout: 100", "new_text": "timeout: 1000" }
    ]
  }
  ```

  Read the file first. `expected_revision` may specify a known read hash explicitly. No regex or fuzzy match; include more context when an occurrence is ambiguous. An intervening user change fails safely. Successful edits return a unified diff and undo ID. Large diff previews may hit the 100 ms / 2,000 edit-distance computation budget; the result explicitly says the edit was applied but its preview was omitted. Replacement batches are validated sequentially in memory, then written atomically to that file.
- `create_file`: create only; refuses an existing path.
- `undo_edit`: revert an in-memory edit only if current file contents still equal its output. IDs do not survive app restart/idle eviction.
- `show_history`: current session's edit IDs and owned processes.
- `update_checklist`: structured `pending`, `in_progress`, `completed` tasks.

Files must be valid UTF-8. LF/CRLF and BOM are preserved for edits. Do not use native text tools for binary or non-UTF-8 files. Read limits are intentional; the agent should ask for a smaller range, not assume an omitted middle is empty.

## Terminal lifecycle

```json
{"command":"npm test","cwd":".","timeout_ms":120000}
```

Foreground timeout is capped at ten minutes and requests termination of the owned process group/tree instead of silently detaching work. Termination confirmation is bounded to five seconds: if no process close is observed, the result keeps `running: true` and reports `termination_error`. Do not retry work that may still be running. A direct-child fallback reports `termination_warning` because descendants might remain. Windows uses Unicode-encoded PowerShell; other platforms use `/bin/sh`. Working directory and shell variables **do not persist**. Windows encoded commands that exceed the command-line limit are rejected before spawn; create a script file with native file tools and run that file instead.

For a server or watcher:

```json
{"command":"npm run dev","cwd":".","background":true}
```

Keep the returned `process_id`. Use `process_status` with `wait_ms` up to 30,000 to avoid a busy polling loop, and `stop_process` to stop it. IDs only address this session's jobs. Output is bounded; this is not a full terminal log archive or interactive PTY.

Shell commands run with the user's application permissions and inherited environment. Review commands before approval. Native path confinement does **not** constrain an approved shell script to the workspace. A future OS sandbox is still needed for untrusted-repository execution.

## Repository instructions and skills

The system loads workspace-root `AGENTS.md`. A `read_file` result also includes `AGENTS.md` files along its directory path. For a new directory, inspect its nearest ancestor instructions before creating code.

Place a skill in any supported project-local location:

```
.agents/skills/<skill>/SKILL.md
.claude/skills/<skill>/SKILL.md
.clustrix/skills/<skill>/SKILL.md
```

Example:

```markdown
---
name: api-verification
description: >
  Use when changing API endpoints or adding regression tests.
---

1. Read the relevant endpoint and existing tests.
2. Add a minimal regression test before changing behavior.
3. Use project-native validation commands after approval.
4. Report the commands run and any unverified behavior.
```

Discovery loads **metadata only**, capped at 50 skills; bodies are loaded by `load_skill` using the exact catalog name, e.g. `.agents/skills/api-verification`. The parser supports simple quoted/plain descriptions and folded/literal description blocks. This is not a general YAML interpreter or full external skill-marketplace implementation.

Relative references in a skill are relative to its own directory. Scripts/assets can be inspected through regular tools; scripts never run automatically. Instructions and skills cannot override the user's request or bypass shell approval. Outside-workspace skill symlinks are rejected.

This repository includes `.agents/skills/coding-verification/SKILL.md` as a working example.

## Persistence and UI contract

- Chat message ownership stays with the renderer, preventing duplicate saves. Stored `ai` roles are normalized to `assistant` when constructing model history.
- Tool iterations use the existing `code_iterations` table. Factual continuity checkpoints use `conversation_summaries` and are marked with a versioned runtime prefix and workspace.
- Provider reasoning/signatures are retained in-memory within a tool loop, not dumped into UI or saved as hidden chain-of-thought.
- Command cards still use `<!--command-input-->` and `<!--command-output-->` markers.
- Approval still uses the existing `confirmation-required` JSON event and iteration-based `codes:confirm-command` IPC.
- The visible Stop path now calls actual cancellation through per-request controllers, without cross-session cancellation races. Cancelled renderer promises settle even after preload listeners are detached.
- Native search/image calls require approval because data leaves the device. Image capability is tested by the selected endpoint/model, not an obsolete name allowlist.

## Manual acceptance checklist before release

Use a disposable copy of a small project, not a valuable working tree.

1. Start Electron normally after installing its native dependencies. Open Codes and select that project.
2. Test one tool-capable model through each configured real provider: list/read, small edit, create a file, run a focused test after approval, final answer.
3. Specifically test an OpenRouter-hosted Claude/Gemini to confirm requests stay on the gateway.
4. Approve and skip terminal commands; make sure Skip performs no mutation. Test cancellation while streaming, awaiting approval, and executing a long command.
5. Run a background server, inspect/wait, stop it, and verify no process remains. Repeat on Windows and macOS, not only Linux.
6. Edit a file externally between read and edit; expect a stale-read error and no clobber.
7. Add a skill, start a new request, load it and verify no script executes without approval.
8. Continue a session after restarting the app. Verify previous `ai` messages and a workspace-matched checkpoint are available; undo/process IDs should not pretend to survive restart.
9. Test a sufficiently long task to trigger context compaction. Ensure the active request survives and partial work is not presented as tested success.
10. Test configured search and a small screenshot with a vision-capable model. Verify results, citations and data-approval prompts.
11. Compare old/new agents on the **same clean project, prompt, model ID and sampling configuration**. Track task/test success, edit retries, tool rounds, elapsed time, input/output tokens, and approval count. Repeat tasks; do not infer quality from one demo.

## Automated tests

```sh
npm test -- --runInBand              # all tests, including renderer and legacy rollback regressions
npm run test:codes -- --runInBand    # all backend Codes tests
npm run test:agent:coverage         # isolated modern runtime + facade quality gate
npm run test:agent:sqlite           # optional real native database contract check
```

The runtime gate requires 80% statements/lines/functions and 70% branches. It does not pretend that the entire legacy application meets those coverage thresholds. Local HTTP/SSE fixtures and process tests do not require provider credentials, paid API calls, Electron GUI, SQLite native bindings or PowerShell installation.

### Native SQLite check

`test:agent:sqlite` is separate from the portable offline suite and fails (rather than silently skipping) if the native driver is unavailable. Build/install `better-sqlite3` for the Node executable running the check. In this Linux sandbox, matching headers were already available, so this command worked without a network download:

```sh
npm rebuild better-sqlite3 --build-from-source --nodedir=/usr/local
npm run test:agent:sqlite
```

Do not assume `/usr/local` is the correct header location on another machine. A Node-native build is **not** proof that the Electron ABI works: rebuild dependencies for Electron as usual before launching/packaging the desktop app. The check uses actual SQLite persistence in a temporary directory, with only Electron's path lookup stubbed. It creates no user database and deletes its fixtures afterward.
