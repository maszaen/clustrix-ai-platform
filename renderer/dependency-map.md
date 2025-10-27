# Renderer Global Dependency Map

Generated during Phase 0 to catalog mutable globals in `renderer/renderer.js`.

Total mutable globals: 61

## Category Overview
- **Array** (6): welcomeScreenStagedFiles, projectMessageStagedFiles, searchStatusQueue, codeArtifacts, projectsData, searchMatches
- **Flag** (16): collapsed, isAdvancedSearch, isProcessingQueue, isChatsSelectMode, isProjectsSelectMode, justSentMessage, mermaidInitialized, isConfirmationProcessing, saveScheduled, artifactsListenersAdded, isUserScrolledUp, autoScrollEnabled, scrollDetectionCooldown, userHasScrolledUp, isStreamingActive, isNavigatingHistory
- **Map** (1): sessionDrafts
- **Nullable Ref** (23): current, onlineResumeTimer, projectsDocumentListener, currentProject, previousWebSearchState, confirmationModal, confirmationTitleEl, confirmationMessageEl, confirmationConfirmBtn, confirmationCancelBtn, confirmationCloseBtn, confirmationModalOptions, markdownWorker, _cachedScroller, cooldownTimeout, debouncedScrollTimeout, debouncedAIScrollTimeout, currentResponseSpacer, markdownRendererInstance, searchOverlay, searchInput, searchResults, searchDebounceTimer
- **Object** (2): state, aiMessageHeightData
- **Other** (11): loadedSessionCount, loadedChatPageCount, loadedProjectSessionCount, workerMessageId, currentPageState, lastUserScrollTime, lastContentHeight, lastAIScrollTime, consecutiveScrollSkips, currentMatchIndex, currentSearchId
- **Set** (2): selectedChatIds, selectedProjectIds

## Detailed Listing
| Name | Line | Category | Initializer | Notes |
| --- | --- | --- | --- | --- |
| `state` | 1 | Object | `{` |  |
| `welcomeScreenStagedFiles` | 10 | Array | `[]` |  |
| `projectMessageStagedFiles` | 11 | Array | `[]` |  |
| `current` | 12 | Nullable Ref | `null` |  |
| `collapsed` | 13 | Flag | `false` |  |
| `loadedSessionCount` | 14 | Other | `0` |  |
| `loadedChatPageCount` | 15 | Other | `0` |  |
| `loadedProjectSessionCount` | 16 | Other | `0` |  |
| `isAdvancedSearch` | 17 | Flag | `false` |  |
| `onlineResumeTimer` | 18 | Nullable Ref | `null` |  |
| `searchStatusQueue` | 19 | Array | `[]` |  |
| `isProcessingQueue` | 20 | Flag | `false` |  |
| `sessionDrafts` | 21 | Map | `new Map()` |  |
| `projectsDocumentListener` | 22 | Nullable Ref | `null` |  |
| `codeArtifacts` | 23 | Array | `[]` |  |
| `isChatsSelectMode` | 24 | Flag | `false` |  |
| `selectedChatIds` | 25 | Set | `new Set()` |  |
| `isProjectsSelectMode` | 26 | Flag | `false` |  |
| `selectedProjectIds` | 27 | Set | `new Set()` |  |
| `justSentMessage` | 28 | Flag | `false` |  |
| `currentProject` | 29 | Nullable Ref | `null` |  |
| `projectsData` | 30 | Array | `[]` |  |
| `mermaidInitialized` | 31 | Flag | `false` |  |
| `previousWebSearchState` | 32 | Nullable Ref | `null` | Track websearch state before entering project |
| `confirmationModal` | 33 | Nullable Ref | `null` |  |
| `confirmationTitleEl` | 34 | Nullable Ref | `null` |  |
| `confirmationMessageEl` | 35 | Nullable Ref | `null` |  |
| `confirmationConfirmBtn` | 36 | Nullable Ref | `null` |  |
| `confirmationCancelBtn` | 37 | Nullable Ref | `null` |  |
| `confirmationCloseBtn` | 38 | Nullable Ref | `null` |  |
| `confirmationModalOptions` | 39 | Nullable Ref | `null` |  |
| `isConfirmationProcessing` | 40 | Flag | `false` |  |
| `saveScheduled` | 44 | Flag | `false` |  |
| `markdownWorker` | 305 | Nullable Ref | `null` |  |
| `workerMessageId` | 306 | Other | `0` |  |
| `currentPageState` | 721 | Other | `"welcome"` |  |
| `artifactsListenersAdded` | 4461 | Flag | `false` |  |
| `_cachedScroller` | 5021 | Nullable Ref | `null` |  |
| `isUserScrolledUp` | 7591 | Flag | `false` |  |
| `lastUserScrollTime` | 7592 | Other | `0` |  |
| `autoScrollEnabled` | 7593 | Flag | `true` |  |
| `scrollDetectionCooldown` | 7594 | Flag | `false` | NEW: Cooldown flag |
| `cooldownTimeout` | 7595 | Nullable Ref | `null` | NEW: Cooldown timer |
| `lastContentHeight` | 7597 | Other | `0` |  |
| `debouncedScrollTimeout` | 7623 | Nullable Ref | `null` |  |
| `debouncedAIScrollTimeout` | 7637 | Nullable Ref | `null` |  |
| `lastAIScrollTime` | 7638 | Other | `0` |  |
| `consecutiveScrollSkips` | 7639 | Other | `0` |  |
| `userHasScrolledUp` | 7680 | Flag | `false` |  |
| `isStreamingActive` | 7681 | Flag | `false` | Track if AI is currently streaming |
| `currentResponseSpacer` | 7752 | Nullable Ref | `null` |  |
| `aiMessageHeightData` | 7755 | Object | `{` |  |
| `markdownRendererInstance` | 8346 | Nullable Ref | `null` |  |
| `searchOverlay` | 13364 | Nullable Ref | `null` |  |
| `searchMatches` | 13365 | Array | `[]` |  |
| `currentMatchIndex` | 13366 | Other | `-1` |  |
| `searchInput` | 13367 | Nullable Ref | `null` |  |
| `searchResults` | 13368 | Nullable Ref | `null` |  |
| `searchDebounceTimer` | 13369 | Nullable Ref | `null` |  |
| `currentSearchId` | 13678 | Other | `0` |  |
| `isNavigatingHistory` | 18090 | Flag | `false` | Flag to prevent recursive pushes |