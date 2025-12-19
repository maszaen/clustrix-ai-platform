import { INITIAL_REGISTRY } from '../types';
import { updateTagState, INITIAL_INCOMPLETE_STATE } from '../incomplete';
import { logDebug, logStateSnapshot } from './logger';
import { processLines } from './processLines';
import { finalizeBlock } from './finalizeBlock';
import { detectBlockType } from './blockPatterns';

const SPLITTER_VERSION = 'char-level-v1';

/**
 * FAST PATH: Process complete content in optimized batch mode.
 * 
 * Processes full content through processLines in one pass,
 * preserving \n\n context needed for proper list accumulation.
 */
function processBatchContent(fullText) {
    logDebug('processBatchContent (fast path)', { length: fullText.length });
    
    const trimmed = fullText.trim();
    if (!trimmed) {
        return INITIAL_REGISTRY;
    }
    
    // Process full content through processLines to preserve \n\n context
    // This ensures handleDoubleNewline can properly merge list items
    const lines = trimmed.split('\n');
    const newTagState = updateTagState(INITIAL_INCOMPLETE_STATE, trimmed);
    
    let result = processLines({
        registry: INITIAL_REGISTRY,
        fullText: trimmed,
        lines,
        activeContent: trimmed,
        tagState: newTagState,
        activeStartPos: 0,
    });
    
    // Finalize any remaining active block
    if (result.activeBlock && result.activeBlock.content.trim()) {
        const { activeBlock } = result;
        const type = activeBlock.type || 'paragraph';
        const stableBlock = finalizeBlock(activeBlock.content, type, result.blockCounter, activeBlock.startPos);
        result = {
            blocks: [...result.blocks, stableBlock],
            activeBlock: null,
            activeTagState: INITIAL_INCOMPLETE_STATE,
            cursor: fullText.length,
            blockCounter: result.blockCounter + 1,
        };
    }
    
    return {
        ...result,
        cursor: fullText.length,
    };
}

/**
 * Process new content character-by-character OR batch mode.
 *
 * @param registry - Current registry state
 * @param fullText - Full content string
 * @param isComplete - If true, use fast batch processing (for saved messages)
 */
export function processNewContent(registry, fullText, isComplete = false) {
    logDebug('processNewContent', {
        previousCursor: registry.cursor,
        incomingLength: fullText.length,
        isComplete,
    });
    logStateSnapshot('state.before', registry);
    attachGlobalVersion();
    
    // FAST PATH: For complete content, skip char-by-char processing
    // This is orders of magnitude faster for loading saved messages
    if (isComplete && registry.cursor === 0) {
        const result = processBatchContent(fullText);
        logStateSnapshot('state.after (batch)', result);
        return result;
    }
    
    if (fullText.length <= registry.cursor) {
        return registry;
    }
    
    // Process each new character individually to ensure consistent
    // block boundary detection regardless of chunk size
    let currentRegistry = registry;
    for (let i = registry.cursor; i < fullText.length; i++) {
        // Process content up to position i+1 (one character at a time)
        currentRegistry = processSingleCharacter(currentRegistry, fullText, i + 1);
    }
    logStateSnapshot('state.after', currentRegistry);
    return currentRegistry;
}

/**
 * Process content up to a specific position (single character increment).
 * This is the core of character-level processing.
 */
function processSingleCharacter(registry, fullText, endPos) {
    // Only process if we have new content
    if (endPos <= registry.cursor) {
        return registry;
    }
    const newContent = fullText.slice(registry.cursor, endPos);
    const activeContent = registry.activeBlock
        ? registry.activeBlock.content + newContent
        : newContent;
    const newTagState = updateTagState(registry.activeTagState, activeContent);
    const lines = activeContent.split('\n');
    // Create a virtual "fullText" that only goes up to endPos
    // This ensures cursor is set correctly for this character
    const virtualFullText = fullText.slice(0, endPos);
    return processLines({
        registry,
        fullText: virtualFullText,
        lines,
        activeContent,
        tagState: newTagState,
        activeStartPos: registry.activeBlock?.startPos ?? registry.cursor,
    });
}

export function resetRegistry() {
    return INITIAL_REGISTRY;
}

/**
 * Finalize the active block into a stable block.
 * Call this when streaming is complete to ensure the last block is properly memoized.
 */
export function finalizeActiveBlock(registry) {
    if (!registry.activeBlock || !registry.activeBlock.content.trim()) {
        return registry;
    }
    const { activeBlock } = registry;
    const type = activeBlock.type || 'paragraph';
    const stableBlock = finalizeBlock(activeBlock.content, type, registry.blockCounter, activeBlock.startPos);
    return {
        blocks: [...registry.blocks, stableBlock],
        activeBlock: null,
        activeTagState: INITIAL_INCOMPLETE_STATE,
        cursor: registry.cursor,
        blockCounter: registry.blockCounter + 1,
    };
}

function attachGlobalVersion() {
    const target = typeof globalThis !== 'undefined'
        ? globalThis
        : typeof global !== 'undefined'
            ? global
            : undefined;
    if (!target)
        return;
    target.__streamdown = {
        ...(target.__streamdown || {}),
        splitterVersion: SPLITTER_VERSION,
    };
}
