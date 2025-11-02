# Refactoring Dependency Graph

## Visual Roadmap

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 2: State Management                      │
│                 (renderer/state/app-state.mjs)                    │
│                         ⏱️ 2-3 days                               │
│                    Foundation for all UI logic                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ├── depends on ────────────┐
                         │                          │
        ┌────────────────▼──────────────┐   ┌──────▼──────────────┐
        │   PHASE 3: DOM Management     │   │  PHASE 4: Streaming  │
        │  (renderer/dom/dom-manager)   │   │    (Chat Logic)      │
        │         ⏱️ 2 days             │   │     ⏱️ 3-4 days      │
        │                               │   │                      │
        └────────────────┬──────────────┘   └─────────┬────────────┘
                         │                            │
                         └─────────────┬──────────────┘
                                       │
                                       ├── depends on ────────────┐
                                       │                          │
                    ┌──────────────────▼────────────┐   ┌─────────▼──────────┐
                    │  PHASE 5: File & Artifact    │   │  PHASE 6: Search & │
                    │      Management              │   │     Projects        │
                    │      ⏱️ 2-3 days             │   │    ⏱️ 2-3 days      │
                    │                              │   │                    │
                    └──────────────────┬───────────┘   └─────────┬──────────┘
                                       │                        │
                                       └────────────┬───────────┘
                                                    │
                              ┌─────────────────────▼────────────────┐
                              │     PHASE 1: Already Complete ✅      │
                              │    (Utilities extracted in Phase 1)   │
                              │  - time-utils, markdown, sanitize     │
                              └────────────────┬────────────────────┘
                                               │
                       ┌───────────────────────▼──────────────────┐
                       │                                          │
              ┌────────▼──────────┐                      ┌────────▼────────┐
              │    PHASE 7: Main  │                      │   PHASE 8: Main  │
              │    IPC Handlers   │                      │  Stream Routing  │
              │   ⏱️ 3 days       │                      │   ⏱️ 3-4 days    │
              │                   │                      │                  │
              └────────┬──────────┘                      └────────┬─────────┘
                       │                                         │
                       └────────────────┬──────────────────────┘
                                        │
                         ┌──────────────▼────────────┐
                         │   PHASE 9: Window Mgmt   │
                         │  ⏱️ 2 days               │
                         │                          │
                         └──────────────┬───────────┘
                                        │
                         ┌──────────────▼────────────┐
                         │  PHASE 10: Backend Utils │
                         │   ⏱️ 2 days              │
                         │                          │
                         └──────────────────────────┘
```

## Dependency Matrix

| Phase | Depends On | Can Start After | Priority |
|-------|-----------|-----------------|----------|
| 2 | None (standalone) | Now ⭐ | CRITICAL |
| 3 | Phase 2 (optional) | Anytime | HIGH |
| 4 | Phase 2 | ~Day 3 | HIGH |
| 5 | Phase 1 | ~Day 5 | MEDIUM |
| 6 | Phase 2, 3 | ~Day 7 | MEDIUM |
| 7 | Phase 1 | ~Day 9 | MEDIUM |
| 8 | Phase 7 | ~Day 12 | HIGH |
| 9 | None | Anytime | LOW |
| 10 | Phase 8 | ~Day 18 | LOW |

## Parallel Work Opportunities

```
Week 1:
┌─ Day 1-2: Phase 2 (State)
├─ Day 3-4: Phase 3 (DOM) [dapat parallel dengan Phase 2]
└─ Day 5-6: Phase 4 (Streaming) [dapat parallel dengan Phase 3]

Week 2:
┌─ Day 7-8: Phase 5 (File/Artifact)
├─ Day 9-10: Phase 6 (Search/Project) [dapat parallel dengan Phase 5]
└─ Day 11-12: Phase 7 (IPC) [dapat parallel dengan Phase 6]

Week 3:
├─ Day 13-15: Phase 8 (Stream Orchestration)
├─ Day 16: Phase 9 (Window Mgmt) [dapat parallel dengan Phase 8]
└─ Day 17-18: Phase 10 (Utils)
```

## Risk Assessment

### Low Risk ✅
- Phase 2 (new module, no dependencies)
- Phase 9 (isolated window logic)
- Phase 10 (consolidating existing functions)

### Medium Risk ⚠️
- Phase 3 (refactoring existing cache)
- Phase 5, 6 (extracting from middle of renderer.js)
- Phase 7 (reorganizing IPC handlers)

### High Risk 🔴
- Phase 4 (complex streaming logic, many edge cases)
- Phase 8 (core routing logic, easy to break)

## Testing Strategy per Phase

### Phase 2: State Management
```bash
# Test state updates and getters
npm test -- renderer/state/app-state.test.js

# Manual: Check console for state changes
# renderer/renderer.js calls to state functions
```

### Phase 3: DOM Management
```bash
# Test DOM queries and cache
npm test -- renderer/dom/dom-manager.test.js

# Manual: Open DevTools, check DOM operations
# Verify cache hits/misses in console
```

### Phase 4: Streaming
```bash
# Test streaming orchestrator
npm test -- renderer/chat/stream-orchestrator.test.js

# Manual: Send messages, check streaming works
# Verify markdown renders correctly
# Check thinking mode displays
```

### Phases 5-10
```bash
# Similar pattern: unit tests + manual integration tests
npm test -- [module].test.js
npm run dev  # Full integration test
```

## Quick Start Commands

```bash
# Start Phase 2 (recommended)
npm run dev

# After Phase 2, before Phase 3:
git checkout -b phase-3-dom-management
npm run start

# Running tests
npm test
npm test -- --coverage

# Measuring code size reduction
wc -l renderer/renderer.js main.js
```

## Migration Checklist Template

Copy-paste ini untuk setiap phase:

```markdown
## Phase X Execution

### Pre-refactoring
- [ ] Create feature branch: `git checkout -b phase-X-[name]`
- [ ] Create new module file(s)
- [ ] Write JSDoc comments
- [ ] Identify all functions to extract

### Extraction
- [ ] Move functions to new module
- [ ] Update imports in source file
- [ ] Update all references throughout codebase
- [ ] Remove old code

### Testing
- [ ] `npm run dev` - Check for console errors
- [ ] Manual testing: [test scenarios]
- [ ] Create unit tests: `[module].test.js`
- [ ] Run full test suite: `npm test`

### Verification
- [ ] No TypeErrors or import errors
- [ ] All features working as before
- [ ] Code size reduced as expected
- [ ] Performance not degraded

### Finalization
- [ ] Code review self-checklist
- [ ] Update documentation
- [ ] Commit with: `git commit -m "refactor: Phase X - [description]"`
- [ ] Update this roadmap with completion date
```

## Estimated Completion Timeline

| Phase | Start | Duration | End | Status |
|-------|-------|----------|-----|--------|
| 1 ✅ | Oct 30 | 1 day | Nov 3 | DONE |
| 2 ⭐ | Nov 3 | 2-3 days | Nov 6 | **START HERE** |
| 3 | Nov 6 | 2 days | Nov 8 | - |
| 4 | Nov 8 | 3-4 days | Nov 12 | - |
| 5 | Nov 12 | 2-3 days | Nov 15 | - |
| 6 | Nov 15 | 2-3 days | Nov 18 | - |
| 7 | Nov 18 | 3 days | Nov 21 | - |
| 8 | Nov 21 | 3-4 days | Nov 25 | - |
| 9 | Nov 25 | 2 days | Nov 27 | - |
| 10 | Nov 27 | 2 days | Nov 29 | - |
| **TOTAL** | **Nov 3** | **~5 weeks** | **~Dec 8** | - |

## Decision Points

### Should I Skip Any Phase?

- ❌ Don't skip Phase 2 (foundation)
- ❌ Don't skip Phase 7 (IPC handlers are too messy)
- ❌ Don't skip Phase 8 (streaming is complex)
- ✅ Can skip Phase 9 if window management is stable
- ✅ Can skip Phase 10 if current utils work fine

### Should I Parallelize?

Phases that can run in parallel (after dependencies met):
- Phase 3 + Phase 4 (both depend on Phase 2 optionally)
- Phase 5 + Phase 6 (independent)
- Phase 9 can start anytime

But recommendation: **Do serially first time** for better understanding

## Rollback Strategy

If something breaks:

```bash
# Quick rollback
git revert HEAD

# Or revert to last stable
git reset --hard [last-stable-commit]

# Or keep branch and try different approach
git checkout -b phase-X-attempt-2
```

---

**Next Step:** Start Phase 2 after reviewing this plan! 🚀
