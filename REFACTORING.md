# Renderer Modularization Plan

## Context
- `checker/results/analysis-result.json` flags multiple renderer functions well over 200 lines, notably `setupEventListeners` (~2k LOC) and `createStreamHandler` (~750 LOC), signaling urgent decomposition needs.
- `checker/results/listener.json` shows more than 200 delegated DOM listeners bound inside `setupEventListeners`, confirming the UI layer mixes global events, page routing, and feature logic in a single file.
- `renderer/renderer.js` (≈18k LOC) co-locates global state (`state`, cached sets, modal refs), streaming orchestration, page renderers, and modal controllers, making the module brittle and hard to test.

## Modularization Objectives
- Separate persistent renderer state management, stream orchestration, and DOM presenters into focused modules with explicit APIs.
- Reduce `renderer/renderer.js` to a composition entrypoint that wires page-level controllers and shared services.
- Enable Jest coverage on renderer helpers by exporting pure functions from new modules.

## Proposed Workstreams

1. **State & Services Extraction**
   - Introduce `renderer/state/sessionStore.js` to encapsulate `state`, draft caches, and dirty-session tracking currently defined at `renderer/renderer.js:1-44`.
   - Move cache helpers (`SessionCacheEntry`, `getCachedSession`, `cacheSession`, etc., lines 46-200) into `renderer/services/sessionCache.js` with explicit load/invalidate APIs.
   - Extract modal state (`confirmationModal`, `confirmationConfirmBtn`, etc., lines 32-40) into a lightweight `ModalController` service shared across pages.

2. **Streaming & Messaging Pipeline**
   - Relocate `createStreamHandler`, `startStream`, and related queue utilities (lines 11k-13k) into `renderer/services/streamManager.js` that exposes lifecycle hooks for UI components.
   - Isolate markdown/worker helpers (lines 304-700) in `renderer/services/markdownRenderer.js` to keep renderer entrypoint DOM-free.
   - Provide integration tests that mock stream events to validate handler sequencing.

3. **Page-Level Controllers**
   - Create `renderer/pages/chatsController.js`, `projectsController.js`, and `artifactsController.js` to hold render + listener logic for each screen (`renderChatsPage`, `setupChatsPageListeners`, `setupProjectsPageListeners`, etc.).
   - Each controller exports `init()` returning teardown handles so the entrypoint can manage lifecycle when switching tabs.
   - Split oversized DOM event switches into smaller action handlers (e.g., per menu, per bulk action) to improve readability and testability.

4. **Entry Point Simplification**
   - Refactor `initializeApp` (lines 16k+) so `renderer/renderer.js` only bootstraps services, instantiates controllers, and registers top-level IPC/bridge hooks.
   - Move global keyboard shortcuts and shared overlays out of `setupEventListeners` (lines 14090+) into dedicated modules (`keyboardShortcuts.js`, `searchOverlay.js`) that `initializeApp` composes.

5. **Testing & Tooling**
   - Add renderer unit specs under `tests/renderer/` for extracted modules (state store, cache service, keyboard shortcuts).
   - Update lint/prettier configs if needed to cover new subdirectories without formatting the entire legacy file.

## Suggested Sequence
1. Extract session state + cache services with shims that keep existing consumers working.
2. Port streaming pipeline and markdown helpers; backfill targeted tests.
3. Slice chats/projects/artifacts controllers, migrating listeners and DOM templates gradually.
4. Clean up remaining globals, ensuring `renderer/renderer.js` becomes a thin orchestrator.
5. Remove legacy exports and update documentation/diagrams once all modules integrate.

## Risks & Mitigations
- **Tight coupling:** Introduce adapter layers during extraction so IPC bridges still receive expected payloads.
- **Event leakages:** Provide teardown functions for page controllers to avoid duplicate listeners highlighted in `listener.json`.
- **Regression surface:** Lean on existing smoke flows (`npm run dev`, chat/project navigation) and add focused Jest coverage for new modules before deleting legacy code paths.

## Recent Progress
- Centralized renderer state via `renderer/state/sessionStore.js` and `renderer/state/projectsStore.js`, exposing setters/getters so renderer functions no longer own raw globals.
- Added `renderer/pages/chatsController.js` and wired renderer bootstrap to consume controller APIs while preserving existing call sites through thin wrappers.
- Landed `renderer/pages/projectsController.js` and pointed renderer wrappers to the controller so the projects UI no longer lives in `renderer.js`.
- Introduced `renderer/services/messageComposer.js` to host persona + project message builders, wiring renderer/bootstrap to the shared API.

## Next Up
- Audit the remaining project helpers (instruction editors, file pills, staging helpers) and decide what belongs in the controller vs. a reusable service.
- Fold chat-side message construction onto `messageComposer` so both flows share the same persona/system prompt logic.
- Once controllers stabilize, trim the `window.DEBUG` helpers to use the exported APIs instead of touching internal arrays directly.
