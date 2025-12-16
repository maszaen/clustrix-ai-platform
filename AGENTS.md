Mobile app:
- always use reusable components/style/other.
- always code with comments for maintainable code.

JANGAN PERNAH COMMAND GIT, ANJING. KONTOL, IDIOT
JANGAN PERNAH COMMAND CHECKOUT, ANJING, IDIOT. KALAU DISURUH REVERT, YA REVERT MANUAL,ANJING. KONTOL. lu yang revert sendiri, babi. gausah nyerah anjing, pelajari konteksnya, apapun itu pelajari, gausah dikit dikit revert, idiot, pemalas
# Clustrix AI – Development Guide

Electron desktop AI chat. Main process handles IPC + backend services. Renderer manages UI state + streaming.


## Development Guidelines
- **Modular Development:** When developing new features/functions, ALWAYS create them in separate modular files or folders. NEVER add new features directly to main.js or renderer.js. Place backend features in `backend/` subdirectories, renderer features in `renderer/` subdirectories
- **Logging:** Use `log(context, level, fn, msg, details)` from `utils/logger.js` instead of console.log for structured logging
- **IPC Naming:** Follow `namespace:event` convention (examples: `chat:stream-start`, `sessions:load`, `sync:syncNow`)
- **Module System:** Renderer uses ES modules (`.mjs` extension), backend uses CommonJS (`.js` with `require`)
- **Context Isolation:** Never expose Node APIs directly to renderer process, always use preload.js bridge with contextBridge
- **State Management:** Use `AppState` accessors from `renderer/state/app-state.mjs` instead of global variables for state consistency
- **Error Handling:** Wrap all IPC handlers with try-catch blocks, log errors with proper context using logger utility
- **Testing:** Write Jest tests for new modules with target of 80%+ code coverage
- **Documentation:** Add JSDoc comments for all exported functions and complex logic blocks


## Build, Test, and Development Commands
- `npm run dev` (alias `npm start`) — fire up the desktop app with live reload; always run from the repo root.
- `npm run make` — build signed installers through `electron-builder`, outputs to `out/`.


## Code Analysis Tools
- `checker/analyze.js` - AST-based code analysis for JavaScript files. Use: `node checker/analyze.js <file-path>` to extract functions, variables, and imports from any JS file
- `checker/analyze-listener.js` - Event listener tracking with line-range support. Use: `node checker/analyze-listener.js <file-path> [start line] [end line]` to analyze event listeners in specific code ranges
- `checker/list-directory.js` - Check project directory structure. Use: `node checker/list-directory.js <directory or null>` or omit directory argument to check project root
- For all time changelog & version history: see `changelog/release-notes/` or you can see latest changelog by this command `node checker/changelog-check.js`


## File Structure Rules
- **Renderer modules:** Place in `renderer/` directory with `.mjs` extension (ES modules)
- **Backend services:** Organize in `backend/integration/`, `backend/data/`, `backend/sync/` by functional concern
- **IPC handlers:** Keep modular by concern (separate files for sessions, artifacts, chat, models, sync handlers)
- **Shared utilities:** Place in `utils/` directory for cross-process helper functions
- **Security:** Never commit `.env` files or sensitive credentials to version control


## Coding Style & Naming Conventions
Code uses CommonJS modules, 2-space indentation, semicolons, and `const` for imports. Favor `camelCase` for variables/functions, `PascalCase` for classes or services (`MultiAgentOrchestrator`, `DatabaseManager`), and prefix IPC channels (`agent:sync`, `search:web`) to avoid collisions. Reuse helpers from `utils/logger` rather than `console.log`, colocate feature flags near their handlers, and keep JSX-like fragments in renderer components small and memoized for performance. Run Prettier or ESLint locally only on touched lines to avoid noisy diffs.


## Storage
Data location: `${userData}/database/` (Windows: `AppData\Roaming\clustrix\database\`)
- **internal/clustrix.db** – Local SQLite database
- **sync/{userId}/clustrix.db** – Cloud-synced database per user
- **internal/ai-model.conf.json** – Model config (internal)
- **sync/{userId}/ai-model.conf.json** – Model config (cloud per user)

Root directory `${userData}/`:
- **sync-config.json** – Sync mode + OAuth tokens
- **app.log** – Application logging
- **current-profile-photo.jpg** – User avatar cache


## Architecture
- **Main Process (main.js):** Window lifecycle, IPC routing, LangChain service initialization, database manager, stream finalization tracking
- **Renderer (renderer.js + modules):** UI state management, session caching
  - Extracted utilities: `state/`, `cache/`, `markdown/`, `time/`, `files/`, `ids/`, `utils/` modules
  - Core: `core/md.js`, `core/title-gen.js`
- **Backend Services:** 
  - `backend/integration/` – LangChain integration with embeddings (OpenRouter/TF-IDF fallback), multi-agent research orchestration (planning, web search, scraping, synthesis), RE+ACT reasoning engine, file summarization, local embedding engine
  - `backend/data/` – SQLite database manager (sessions, messages, artifacts, projects with sync support and device tracking)
  - `backend/sync/` – Sync orchestration (internal/cloud mode switching, directory management, conflict resolution, smart incremental backups)
  - `backend/github/` – GitHub OAuth flow (browser-based authentication, token exchange, user profile fetching) + Gist storage service for encrypted cloud data
  - `backend/search/` – Web search via SerpAPI/Google Custom Search (query execution, image search, result parsing) + local desktop file indexing
  - `backend/debug/` – Testing utilities (mock AI responses with configurable scenarios, streaming chunk simulation with realistic delays)


## IPC Pattern
Channel naming follows `namespace:event` format:
- **Data operations:** sessions:load, sessions:save, artifacts:load, artifacts:save, projects:load, projects:save, models:load, models:save
- **Chat operations:** chat:stream, chat:titleSuggest
- **Sync operations:** sync:getConfig, sync:switchMode, sync:syncNow, sync:logout
- **Window operations:** window:minimize, window:maximize, window:close
- **Monitoring:** monitoring:getMetrics, monitoring:start, monitoring:stop