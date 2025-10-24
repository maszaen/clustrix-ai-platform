# Clustrix AI – Codebase Or- `renderer/md.worker.js` uses custom markdown parser from `md.js` for all markdown processing.entation

## High-Level Overview
Clustrix is a desktop chat assistant built with Electron. The main process (`main.js`) boots logging, manages the application window, mediates IPC, and wires a LangChain-powered backend to the renderer UI. The renderer (assets under `renderer/`) handles session state, streaming UI, markdown rendering, artifacts management, and project workflows. A preload script (`preload.js`) exposes a hardened IPC bridge.

## Main Process Responsibilities
- Initializes structured logging to `${userData}/app.log` and respects the `CLUSTrix_DEBUG` flag (`utils/logger.js`).
- Instantiates `ClustrixLangChainService` and `MultiAgentOrchestrator` to provide embeddings, file summarization, reasoning agents, and web search orchestration (`backend/langchain-service.js`, `backend/langchain-agents.js`).
- Serves persistent data through IPC (`sessions:*`, `artifacts:*`, `projects:*`, `models:*`) and manages model configuration in `${userData}/database/internal or cloud/ai-model.conf.json`.
- Streams chat completions via `chat:stream-start`, relaying chunk/done/error events back to the renderer, and handles auxiliary features like insult detection prompts, continue placeholders, and thinking-mode updates.
- Supports file ingestion (Docx via Mammoth, spreadsheets via a bundled XLSX module) and exposes OS dialogs.

## Backend Services
- `backend/langchain-service.js` supplies embeddings (OpenRouter when keys exist, otherwise TF-IDF style vectors), maintains a vector memory store, and runs local summarization/embedding fallbacks.
- `backend/langchain-agents.js` orchestrates research flows: planning prompts, optional SerpAPI/Google search via `backend/web-search.js`, scraping, and synthesis.
- Additional helpers include `desktop-search-engine.js` for local indexing, `file-summarizer.js` for structured summaries, `reasoning-action-agent.js` for RE+ACT style executions, and `local-embedding-engine.js` for offline embeddings.

## Renderer & UX
- `renderer/renderer.js` owns application state: multi-session chat history, drafts, project data, artifacts, selection modes, and markdown test sessions.
- Handles streaming UI/UX (thinking logs, resume banners, autoscroll, spacers), attachment workflows, code artifact highlighting, and perfect-scrollbar styling.
- Uses `renderer/data.js` for canned UI data, `renderer/style.css` for theming (dark/light), and `renderer/md.worker.js` for Markdown processing.
- `public/` contains custom textarea scrollbar logic (`rolling/`), images, and static assets referenced by the renderer.

## Third-Party Package Imports
- Runtime packages are served through Electron custom protocols. `protocol.handle('pkg')` maps `pkg://<module>/...` requests to files under `node_modules`, so browser contexts can load libraries without breaking CSP (`main.js`).
- MathJax is exposed via the `mjx://` protocol. Requests to `mjx://mathjax/...` resolve to `node_modules/mathjax`, and font lookups like `mathjax/mathjax-newcm-font` are rewritten to `@mathjax/…` so both the core and font packages work offline (`main.js`).
- The renderer boots MathJax with `<script defer id="MathJax-script" src="mjx://startup.js"></script>` and a `MathJax.loader.paths` mapping that points both `mathjax` and `@mathjax` namespaces to the `mjx://` protocol (`renderer/index.html`). Fonts and other assets are pulled through the same handler.
- `renderer/md.worker.js` dynamically pulls Markdown-It with `self.importScripts('../node_modules/markdown-it/dist/markdown-it.min.js')`, matching the renderer’s fallback `<script src="pkg://markdown-it/dist/markdown-it.min.js"></script>` when the worker is unavailable.

## IPC Bridge
`preload.js` exposes a whitelisted `window.api` API: session/artifact/project persistence, chat streaming controls, model configuration, logging passthrough, window chrome commands, and shell helpers. Streaming callbacks receive chunk events and support cancellation.

## Data & Storage Contracts
- Persistent JSON stores (sessions, projects, artifacts, models) reside in `app.getPath('userData')`.
- Uploaded files are tracked per session for summarization and agent context.
- Vector memory is serialized to `vector_data.json`; session memory lives in `session_memory.json` when LangChain is enabled.

## Development Guardrails
- Default scripts run through Electron Forge (`npm run start|dev|make`). Only run `npm run dev` when explicitly requested.
- Prefer the structured `log()` utilities over `console.log` when instrumenting new code.
- Maintain IPC channel naming conventions (`namespace:event`), ensure preload surface stays minimal, and respect context isolation.
