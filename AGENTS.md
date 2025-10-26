# Repository Guidelines

## Project Structure & Module Organization
Electron boots from `main.js`, preload bridges live in `preload.js`, and AI orchestration plus data services are grouped under `backend/`. Renderer UI state, panels, and hooks belong in `renderer/`, while static assets and preview imagery sit in `public/`. Shared helpers (logging, message optimization, migrations) are inside `utils/`, vendored binaries stay in `local_modules/`, and automated scenarios land in `tests/`. Keep generated installers under `out/`, and manage local secrets via `.env` so sensitive keys never enter version control.

## Build, Test, and Development Commands
- `npm install` — install Electron, LangChain, and native modules after cloning.
- `npm run dev` (alias `npm start`) — fire up the desktop app with live reload; always run from the repo root.
- `npm run make` — build signed installers through `electron-builder`, outputs to `out/`.
- `npm run package` — create unpacked artifacts for manual smoke tests.
- `npm test`, `npm run test:watch`, `npm test -- file-summarizer.test.js` — execute the Jest suite once, in watch mode, or for a single spec file.

## Coding Style & Naming Conventions
Code uses CommonJS modules, 2-space indentation, semicolons, and `const` for imports. Favor `camelCase` for variables/functions, `PascalCase` for classes or services (`MultiAgentOrchestrator`, `DatabaseManager`), and prefix IPC channels (`agent:sync`, `search:web`) to avoid collisions. Reuse helpers from `utils/logger` rather than `console.log`, colocate feature flags near their handlers, and keep JSX-like fragments in renderer components small and memoized for performance. Run Prettier or ESLint locally only on touched lines to avoid noisy diffs.

## Testing Guidelines
Jest backs every automated check. Place backend specs under `tests/backend`, renderer suites under `tests/renderer`, and name files `*.test.js` so they remain auto-discoverable. Target the coverage pillars described in `README.md`: unit tests for backend services, IPC integration tests, and the evolving E2E harness. Each new feature should ship with at least one regression test plus a note in the PR body outlining how to exercise it (`npm test`, manual conversation flow, etc.).

## Commit & Pull Request Guidelines
History favors short conventional commits (`feat: add research agent logs`, `fix: parser timeout`). Keep messages imperative and scoped in lowercase. Pull requests should include: a concise summary, linked issue, checklist of validation steps, and before/after screenshots for renderer or UX tweaks. Call out schema or config migrations explicitly so reviewers can verify `chat_data.db` compatibility and trigger backup routines before merging.
