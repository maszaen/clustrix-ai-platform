Changelog v34.6.4: **Modular Architecture Refactoring - Phase 1 & Planning**

**Renderer Utilities Extraction (Phase 1):**
- Extracted session caching logic to `renderer/cache/session-cache.mjs`
  - Session cache entry management with LRU eviction
  - Configurable expiry and max cache size
  - Cache statistics and debugging utilities
- Extracted text utilities to `renderer/text/sanitize.mjs`
  - HTML escaping with safe DOM-based approach
  - Leading whitespace cleanup for text processing
- Extracted file utilities to `renderer/files/file-utils.mjs`
  - File extension parsing and categorization
  - Dynamic file icon generation with accessibility attributes
- Extracted ID generation to `renderer/ids/id-utils.mjs`
  - Session ID generation with timestamp and randomization
- Extracted time utilities to `renderer/time/time-utils.mjs`
  - Relative time formatting (seconds to years)
  - ISO timestamp generation
  - Session naming utilities
- Consolidated markdown utilities to `renderer/markdown/markdown.mjs`
  - HTML escaping and text cleaning
  - Invisible content removal
  - Custom markdown formatting with fallbacks
  - Thinking text rendering
- Extracted syntax highlighting to `renderer/markdown/highlight.mjs`
  - Highlight.js integration
  - Language detection and mapping
- Extracted message formatting to `renderer/markdown/message-format.mjs`
  - User message formatting with markdown support
- Extracted timing utilities to `renderer/utils/timing.mjs`
  - Debounce and throttle functions with cleanup

**Refactoring Planning (Phases 2-10):**
- Created comprehensive refactoring plan for 10 phases
- Dependency graph with visual flow and timeline
- Phase 2 execution guide for state management extraction
- State management template with accessor functions
- ~5 week estimated timeline to complete all phases
- Expected 55% code reduction after completion

**Documentation Created:**
- `REFACTORING_PLAN.md` - Detailed 10-phase roadmap
- `REFACTORING_DEPENDENCY_GRAPH.md` - Visual dependencies and execution flow
- `PHASE_2_EXECUTION_GUIDE.md` - Step-by-step guide for Phase 2
- `REFACTORING_SUMMARY.md` - Executive summary and progress tracking
- `QUICK_REFERENCE_CARD.md` - Handy reference for all phases
- `renderer/state/app-state.mjs` - Template for Phase 2 state management

**Code Quality:**
- Improved module organization with single-responsibility principle
- Better import management across renderer
- JSDoc documentation for all extracted modules
- Foundation for incremental refactoring

**Statistics:**
- 8 files changed, 9 files created (refactoring documentation)
- ~950 lines extracted to modular structure
- renderer.js reduced from 17,960 to ~17,000 lines (removed imports)
- Total refactoring plan: 10 phases over ~5 weeks

> **Status:** ✓ Phase 1 Complete | Phase 2 Ready | _Refactoring Release_


Changelog v34.5.9: **Graceful Window Close & Stream Finalization**

**Window Management & Tray Icon:**
- Custom Ctrl+W shortcut for window close with 60-second graceful shutdown
- System tray icon support for minimized state management
- Tray context menu with "Open Clustrix AI" and "Quit Now" options
- Window restore functionality from tray (click or double-click)
- Skip taskbar when minimized to tray

**Stream Finalization Tracking:**
- New IPC handlers: `stream:finalizing-start` and `stream:finalizing-complete`
- Active stream tracking functions: `trackActiveStream()` and `untrackActiveStream()`
- Proper cleanup flow with finalization counter to prevent premature app exit
- Close request evaluation with timeout-based retry logic (60 seconds)

**Renderer/Frontend Improvements:**
- Stream finalization notifications from renderer to main process
- Wrapped finalize function with try-finally for robust error handling
- Proper error logging for finalization failures
- Code formatting consistency improvements in stream handler

**Backend Enhancements:**
- `main.js`: Added Tray and Menu module imports from Electron
- Stream cancellation now uses proper untracking mechanism
- Enhanced close event handlers with active stream detection
- Before-quit event handler for clean shutdown state

**IPC Bridge Updates:**
- `preload.js`: Exposed `notifyFinalizingStart()` and `notifyFinalizingComplete()`
- Secure IPC surface expansion for stream lifecycle events

**Code Quality:**
- Improved error handling with structured try-catch-finally patterns
- Better state management for pending close requests
- Consistent logging across stream lifecycle events

**Statistics:**
- 3 files changed: `main.js`, `preload.js`, `renderer/renderer.js`
- ~400 insertions (+), ~150 deletions (-)
- 2 commits (Add custom close shortcut, Fix UI break during session switch)

> **Status:** ✓ Production Ready | _Stability Release_


Changelog v34.5.0: **Major Architecture Restructure & Perplexity Integration**

**Backend Reorganization:**
- Backend restructured into organized subdirectories: `data/`, `github/`, `integration/`, `search/`, `sync/`, `debug/`
- Removed legacy migration scripts (directory-migrator, json-to-sqlite-migrator)
- Moved website assets: `host/` → `client/`

**Perplexity AI Integration:**
- Full support for _Perplexity sonar_ models with web search capabilities
- Search results displayed as **horizontal scroll cards** with citations
- **Cost tracking** in usage button format: `$0.0050 | 381 tokens (19 Input + 362 Output)`
- Perplexity _blocked in project sessions_ (web search only, not reasoning)
- Non-streaming mode for cost optimization

**UI/UX Enhancements:**
- Model list redesign with improved responsive layout
- **Thinking parser detection** for stream body analysis
- UI debugger tools (3 checkpoint iterations)
- Enhanced `perplexity-search-container` CSS with card styling
- Cost indicator with gradient background

**Code Updates:**
- `main.js`: Perplexity request handler, token usage with costs
- `renderer.js`: Thinking type discrimination (normal vs perplexity_search)
- `renderer/style.css`: +466 lines for search cards and cost display
- `preload.js`: Enhanced IPC bridge security
- New modules: `thinking-parser.js`, `chunk-simulator.js`, `response-debugger.js`
- New: `isPerplexityModel()` detection in langchain-helpers

**Documentation:**
- `PERPLEXITY_INTEGRATION.md` - Complete integration guide
- `docs/ai-stream.md`, `docs/debug-markdown.md`, `docs/difference-debug-mode.md`

**Statistics:**
- 61 files changed, 6053 insertions (+), 3030 deletions (-)
- 11 commits from baseline

> **Status:** ✓ Production Ready | _Major Release_


Changelog v32.3.5:
- PDF upload support
- Chat area UI overflow fix
- Added "Learn More" menu with comprehensive guides and documentation


Changelog v32.0.5:
- _Better parser_
- _AI prompt recommendation every response_
- _Web search include images for preview_
- _Database optimization_
- _Add cloud backup (using your github private repo)_
- _Add mermaid flowchart preview in every mermaid codeblocks_
- _Performance improvements, and removing redundant code_
- _and other updates not mentioned..._