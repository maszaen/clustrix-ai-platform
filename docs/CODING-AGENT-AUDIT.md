# Coding-agent audit & runtime modernization

**Date:** 2026-10-14

**Scope:** Desktop Codes agent, its provider/tool execution path, persistence and cancellation integration.

**Review status:** Implemented and offline-tested; manual Electron/Windows/live-provider validation still required. No claim of parity with Hermes, Antigravity or any other agent is made without benchmarking.

## Executive finding

Using the same model does **not** mean using the same coding agent. The application controls the model's tool protocol, instructions, available context, edit semantics, terminal feedback and recovery loop. This codebase had concrete weaknesses in each of those areas.

The change introduces a shared, provider-independent runtime as the default Codes path. It does not redesign screens, styling, navigation, command cards or approval controls. Ordinary chat, research agents and mobile provider stacks are outside this migration.

## Findings and disposition

| Priority | Existing evidence | Why it matters | Change |
|---|---|---|---|
| High | `code-agent.js::processCodeRequest` selected native APIs using `model.includes('claude'/'gemini')` | A Claude/Gemini model hosted on an OpenAI-compatible gateway could receive the wrong request protocol | Endpoint/provider-driven adapter selection; no model-name routing. Custom protocol override available |
| High | Four different execution loops in `code-agent*.js`, plus XML fallback for unrecognized models | Safety, tool behavior, history and fixes diverged by provider; unfamiliar models could lose native tools | One shared loop and registry; explicit legacy rollback, never automatic fallback after API errors |
| High | `codes-prompt-shared.js` requires one edit per turn, fresh reads, aggressive batching, and then says not to verify each edit | Contradictory operating instructions add latency and undermine tool use | Concise workflow; native read/search/edit; ordered batches; verify relevant outcomes |
| High | Native `edit_file` was converted into XML/line-number operations | Stale offsets can target the wrong text; shell creation followed by a second edit adds turns | Unique exact text replacement, revision guards, atomic validation of replacement batches, create-only file tool, diff and guarded undo |
| High | `context-manager.js::loadHistoryWithSummary` only accepted `assistant`, while renderer/database save assistant turns as `ai` | Earlier assistant answers could disappear from coding context | Normalize `ai` → `assistant`, ignore in-flight empty placeholders, deduplicate current user turn |
| High | `cancelCodeSession` did not abort provider requests or actually dispose provider-owned work; renderer controller fallback was a no-op | “Stop” could update UI without stopping underlying execution | AbortController through API calls, approval waits, processes and network tools; immediate interrupt wiring; renderer cancellation settles its promise |
| High | Dangerous-command checks in provider agents looked only at the first command line; unknown tools could be turned into shell commands | Regex classification is not a permission boundary and can miss compound commands | Allowlisted tools with local schema validation; explicit per-action approval for **every shell command**, web query and image upload; no unknown-tool shell fallback |
| Medium | Fixed 1.5–2 second sleeps between rounds, large output limits, duplicated prompts/memory | More wall time and context pollution without improving reasoning | No fixed inter-round sleep; transient-HTTP-only backoff; bounded file, command and model outputs |
| Medium | PowerShell-only terminal behavior and background-command heuristics | Shell assumptions fail on Linux/macOS; timeout/background lifecycle is ambiguous | POSIX shell or encoded PowerShell; explicit background flag, process IDs, status/wait/stop, foreground timeout requests owned-group termination and reports unconfirmed exits |
| Medium | Handwritten stream parsers, partial response acceptance, missing streaming usage | Incomplete tool arguments, wrong usage, lost non-ASCII text or provider reasoning state | UTF-8 SSE framing, completion checks, call-ID validation, usage normalization, native reasoning/signature round-trips |
| Medium | `image-tool.js` hardcoded old vision model names and guessed API type from model | New vision models can be rejected and gateway image calls misrouted | Shared provider transport for image analysis; validate image bytes and workspace path, not model-name age |
| Medium | No unified repository instructions or progressively loaded skills | Project conventions and reusable workflows are not consistently available | Root/scoped `AGENTS.md`; metadata catalogs from `.agents/skills`, `.claude/skills`, `.clustrix/skills`; explicit `load_skill` |
| Medium | Context limit/summarization logic coupled to old model names and destructive resets | Long tasks can lose recent execution state or overflow with tool output | Configurable budget with output reservation; whole call/result-group eviction; factual checkpoints in existing summary storage |
| Medium | Old “integration” tests used fictitious directories, incomplete mocks or live API/PowerShell assumptions | Passing-looking assertions did not establish a working model→tool→result round trip | Temporary workspaces, local HTTP/SSE fixtures for four protocols, real POSIX process tests, deterministic legacy shell fixtures |
| Medium | Legacy PowerShell sentinel could arrive before `EXIT_CODE` | Missing status was interpreted as successful exit code zero | Rollback path now waits for a complete exit-code line; split-chunk regression test |

## Architecture and review map

```
Existing renderer / preload / IPC
  -> code-agent.js (existing public facade + explicit rollback)
    -> runtime/agent.js          shared loop, approval, cancellation, budgets
       -> providers.js          OpenAI-compatible / Anthropic / Gemini / Responses
       -> tools.js              schemas, validation, allowlisted dispatch
       -> workspace.js          reads, listing, search, exact edits, create, undo
       -> processes.js          owned OS process lifecycle
       -> instructions.js       AGENTS.md and SKILL.md discovery
       -> context.js            chronological history and complete-group compaction
       -> checkpoints.js        bounded factual continuity, existing SQLite summaries
       -> network-tools.js      abortable search and image analysis
       -> presentation.js       existing command-card protocol, readable feedback
```

Only small integration edits are made in `main.js` and `renderer/renderer.js`; new capabilities live in modules. No new dependency or database schema migration is required. `checker/verify-agent-sqlite.js` provides an optional real-native persistence check. Old provider implementations remain for deliberate rollback.

### Important behavior changes

- A selected, existing **project workspace is required**. No silent fallback to the user's home directory.
- File edits use `old_text`/`new_text` or a `replacements` array, not line numbers. They reject ambiguous or stale content rather than “best guessing.” Replacements within one file validate before writing; multiple files are **not** one transaction.
- New files use exclusive creation. Undo snapshots are session-local, capped at 20 edits / 8 MiB, and refuse to overwrite newer changes. They are not a persistent version-control system.
- File operations reject traversal, outside-workspace symlink targets, `.git` access, invalid UTF-8 and binary data. This is practical path confinement, **not an adversarial OS filesystem sandbox**; concurrent hostile symlink swaps are not fully contained.
- Every shell invocation is approved using the existing Allow/Skip UI. Its complete command and cwd appear in the preceding command card. Approval expires after 15 minutes, matching the existing UI text. Non-streaming calls cannot request interactive approval and therefore fail closed for these actions.
- Shell cwd/environment do not persist between invocations. Commands inherit the app's OS permissions/environment. Background jobs intentionally persist after a successful response, until stop/cancel, workspace switch, shutdown or 30-minute session inactivity. Detached descendants can escape a normal process group: do not treat this as sandbox isolation.
- Tool calls are executed in declared order. Multiple calls can share one model round, but side effects are not blindly parallelized. Search queries can run concurrently.
- Search now returns deduplicated snippets and URLs using existing SerpAPI/Google settings. It does **not** silently scrape arbitrary result pages. This trades full-page scraping for predictable bounded, abortable behavior.
- No model-name allowlist is used. The selected model must actually support the requested protocol/tools/vision. Provider-specific unsupported features fail explicitly; protocol fixtures are not live-model certification.

## Context and efficiency decisions

Defaults are conservative: 32,768 estimated context tokens, 8,192 output tokens reserved, 2,048 safety margin, 80 iterations. Context estimation uses UTF-8 bytes divided by three; it is **not an exact tokenizer** and may over/underestimate for particular models.

- Schemas, native reasoning blocks and tool arguments count toward the estimate.
- Current user request stays intact. Older data is evicted as complete assistant/tool-result groups, never orphaned tool results.
- Huge recent rounds can be evicted too, with an explicit checkpoint. This is lossy; the agent must re-read missing detail.
- Checkpoints record task, checklist, recent tool outcomes and edited file names, not fabricated model-generated summaries. They are scoped to the canonical workspace and persisted in `conversation_summaries`.
- Recent chat history is bounded to 12 nonempty turns, 6,000 characters each. Older details not captured in the factual checkpoint can be lost. Full event-log replay and semantic long-term memory are future work.
- Tool feedback defaults to 16,000 characters, individual text files to 2 MiB, search scanning to 16 MiB, image uploads to 10 MiB, model responses to 8 MiB. Truncation is marked.
- Identical repeated failures and iteration exhaustion produce an explicit incomplete/paused result. No infinite XML repair loop; no fixed sleep after successful rounds.

## Validation

Commands:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --runInBand
npm run test:agent:coverage
npm run test:agent:sqlite # requires a matching native better-sqlite3 build
```

Dependencies were initially installed without Electron/native install scripts. `better-sqlite3` was subsequently built from source against the matching local Node 22 headers (`npm rebuild better-sqlite3 --build-from-source --nodedir=/usr/local`), after the normal prebuilt download/header fetch failed in the sandbox. No TLS verification was disabled. Tests use no paid API calls or production keys.

Final local run: **108 tests passed across 10 suites**, plus **one real SQLite integration check**. Modern runtime coverage: **91.19% statements, 84.13% branches, 97.69% functions, 96.76% lines**. The isolated runtime/facade gate passed 89 tests. Syntax checks passed for the runtime modules, facade, main-process glue, legacy terminal and renderer stream module. `--detectOpenHandles` reported no open-handle issue. The SQLite check uses the real database class, schema and native driver; only Electron's path-service import is stubbed, not storage. A non-blocking pre-existing `baseline-browser-mapping` data-age warning remains.

Covered: all four native wire formats over local HTTP; call/result pairing; fragmented UTF-8/CRLF SSE; opaque reasoning/signatures; partial-stream rejection; usage; transient retries; cancellation; safe edits; stale/ambiguous matches; CRLF/BOM; symlinks; malformed arguments; skills; checkpoints; real POSIX timeout/background lifecycle; renderer cancellation; legacy rollback interface.

**Not validated here:** packaged Electron UI, real API acceptance/quality, Windows taskkill/PowerShell execution, macOS process behavior, installer/signing. Windows command construction is unit-tested, not executed on Windows.

See [CODING-AGENT-RUNTIME.md](CODING-AGENT-RUNTIME.md) for settings, skills and manual acceptance steps.


## Second-pass hardening

- Invalid tool arguments such as JSON `null` now reach schema validation as recoverable tool errors instead of crashing presentation before dispatch.
- Renderer requests expose individual controllers. Completing/cancelling session A cannot clear or cancel session B; late chunks are ignored and throwing handlers stop their transport.
- Windows encoded commands are checked against the CreateProcess length limit. Taskkill spawn/nonzero failures fall back to the owned child with an explicit warning. A five-second termination deadline prevents indefinite Stop waits and preserves `running: true` if no close event was observed. These Windows failure paths are tested with child-process fixtures, not a real Windows host.
- Repeated process-status waits remove their listeners; they do not accumulate callbacks on a never-ending process promise.
- Undo refuses substituted symlinks; Windows device names, alternate data streams and trailing-dot/space aliases are rejected. Large diff previews have CPU/edit-distance budgets and announce omission without pretending the edit did not happen.
- Context eviction now removes complete older user-led turns so native APIs do not receive an assistant-first transcript. Repeated compaction emits one checkpoint, not duplicate checkpoint prefixes.
- Canonical workspace aliases preserve session state instead of resetting the terminal/undo history every turn. Model/API errors request cleanup of owned jobs.
- Real SQLite validation covers iteration writes, no duplicate renderer chat messages, checkpoint reload, `ai` role normalization, workspace isolation and foreign-key cleanup on session deletion.

## Deferred rather than silently claimed

1. OS-level sandboxing, per-project trust management and policy UI.
2. MCP servers, subagents, browser automation, LSP/semantic project indexing.
3. Provider-specific adaptive thinking/reasoning controls, exact tokenizers, automatic capability discovery.
4. Parallel read scheduling beyond ordered batched calls; durable full-fidelity event replay.
5. Unified modernization of ordinary chat, research, mobile and all dependency versions. Those stacks still have their own adapters.
6. A controlled same-model coding benchmark against the prior runtime or another product. Protocol correctness is not a measured coding-quality improvement.
