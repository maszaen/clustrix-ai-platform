# Unreleased — 2026-10-14: Coding runtime modernization

- Default Codes execution now uses a shared native-tool runtime across OpenAI-compatible gateways, Anthropic, Gemini and OpenAI Responses.
- Added revision-guarded exact edits, bounded native file tools, explicit process lifecycle, scoped repository instructions and on-demand project skills.
- Added abortable model/search/image requests, action-scoped approval, usage accounting, context budgets and durable factual checkpoints.
- Fixed stored `ai` history normalization, real cancellation wiring, renderer promise settlement and legacy PowerShell split-status handling.
- Preserved existing UI layout, command-card/approval formats and database schema. Legacy runtime remains an explicit rollback option.
- Added offline protocol integration and regression tests. See [audit](docs/CODING-AGENT-AUDIT.md) and [runtime guide](docs/CODING-AGENT-RUNTIME.md).
- Hardened cross-session cancellation, Windows termination failure reporting, path aliases, malformed tool input and context eviction.
- Verified real SQLite persistence/reopen via `npm run test:agent:sqlite`; full offline suite: 108 passing tests.
- Release validation pending: real Electron/Windows/macOS, Electron-native ABI and live providers. No performance/quality parity claim.

---

# Changelog v35.3.0: Code Agent Integration & UI Enhancements

## Features
- **Code Agent Backend:** Added comprehensive code agent system in `backend/codes/` with AI-powered code generation, execution, and session management
- **Codes Page UI:** Integrated codes page with dropdown menus, workspace validation, and interactive elements
- **PowerShell Session Support:** Added PowerShell session handling for Windows environments
- **Code Title Indicator:** Added dynamic code title generation and display

## Code Quality
- **Comprehensive Testing:** Added full test suite for code agent (integration and unit tests) with 80%+ coverage target
- **Jest Configuration:** Updated jest.config.js for better test organization and backend testing
- **AppState Management:** Introduced centralized AppState with event listeners for better state consistency in renderer
- **Styling Improvements:** Enhanced send button with loading states, animations, and interrupt functionality
- **Project File Display:** Added styling for project file names and sizes with proper text wrapping

## Architecture
- **Modular Code Agent:** Separated code agent logic into modular files (code-agent.js, codes-prompt.js, powershell-session.js)
- **Renderer Refactoring:** Simplified renderer.js with AppState integration and removed redundant code
- **IPC Integration:** Added IPC handlers for codes operations and session management

## Statistics
- 16 files modified, 2,572 insertions, 1,927 deletions
- New: backend/codes/ module with agent, prompts, and tests
- Enhanced: renderer UI with codes page, styling, and state management
- Updated: jest config and package.json dependencies

> **Status:** ✓ Production Ready | _Minor Release_</content>
<parameter name="filePath">h:\VSCode\Clustrix-AI-Platform\changelog\release-notes\v35.3.0.md