import { INITIAL_INCOMPLETE_STATE, updateTagState } from '../incomplete';
import { detectBlockType, detectPartialBlockType, BLOCK_PATTERNS } from './blockPatterns';
import { finalizeBlock } from './finalizeBlock';
import { isCodeBlockClosed, isComponentClosed } from './blockClosers';
import { logDebug } from './logger';
export function processLines(args) {
    const normalizedArgs = consumeLeadingBlocks(args);
    return (handleExplicitClosingBlocks(normalizedArgs) ??
        handleHeadingBlock(normalizedArgs) ??
        handleParagraphBoundary(normalizedArgs) ??
        handleDoubleNewline(normalizedArgs) ??
        handleActiveBlock(normalizedArgs));
}
function handleExplicitClosingBlocks({ registry, fullText, activeContent, tagState, }) {
    const currentType = registry.activeBlock?.type;
    if (currentType === 'codeBlock') {
        if (isCodeBlockClosed(activeContent)) {
            const block = finalizeBlock(activeContent, 'codeBlock', registry.blockCounter, registry.activeBlock.startPos);
            return {
                blocks: [...registry.blocks, block],
                activeBlock: null,
                activeTagState: INITIAL_INCOMPLETE_STATE,
                cursor: fullText.length,
                blockCounter: registry.blockCounter + 1,
            };
        }
        return updateActiveBlock(registry, activeContent, tagState, fullText);
    }
    if (currentType === 'component') {
        if (isComponentClosed(activeContent)) {
            const block = finalizeBlock(activeContent, 'component', registry.blockCounter, registry.activeBlock.startPos);
            return {
                blocks: [...registry.blocks, block],
                activeBlock: null,
                activeTagState: INITIAL_INCOMPLETE_STATE,
                cursor: fullText.length,
                blockCounter: registry.blockCounter + 1,
            };
        }
        return updateActiveBlock(registry, activeContent, tagState, fullText);
    }
    return null;
}
function handleHeadingBlock({ registry, fullText, activeContent, tagState, }) {
    if (registry.activeBlock?.type !== 'heading')
        return null;
    const newlineIndex = activeContent.indexOf('\n');
    if (newlineIndex === -1)
        return null;
    const headingContent = activeContent.slice(0, newlineIndex).trimEnd();
    const remainder = activeContent.slice(newlineIndex + 1);
    logDebug('finalizing heading block', {
        headingContent,
        remainderPreview: remainder.slice(0, 40),
    });
    const headingBlock = finalizeBlock(headingContent, 'heading', registry.blockCounter, registry.activeBlock.startPos);
    const normalizedRemainder = normalizeBlockContent(remainder, headingBlock.endPos + 1);
    if (!normalizedRemainder.content.trim()) {
        return {
            blocks: [...registry.blocks, headingBlock],
            activeBlock: null,
            activeTagState: INITIAL_INCOMPLETE_STATE,
            cursor: fullText.length,
            blockCounter: registry.blockCounter + 1,
        };
    }
    const detectedNext = detectBlockType(normalizedRemainder.content.split('\n')[0]);
    return {
        blocks: [...registry.blocks, headingBlock],
        activeBlock: {
            type: detectedNext?.type || 'paragraph',
            content: normalizedRemainder.content,
            startPos: normalizedRemainder.startPos,
        },
        activeTagState: tagState,
        cursor: fullText.length,
        blockCounter: registry.blockCounter + 1,
    };
}
function handleParagraphBoundary({ registry, fullText, activeContent, tagState, }) {
    if (registry.activeBlock?.type !== 'paragraph')
        return null;
    const lastNewlineIndex = activeContent.lastIndexOf('\n');
    if (lastNewlineIndex === -1 ||
        lastNewlineIndex >= activeContent.length - 1) {
        return null;
    }
    const lastLine = activeContent.slice(lastNewlineIndex + 1);
    const detectedNext = detectBlockType(lastLine);
    if (!detectedNext || detectedNext.type === 'paragraph')
        return null;
    const paragraphContent = activeContent.slice(0, lastNewlineIndex).trimEnd();
    const normalizedRemainder = normalizeBlockContent(activeContent.slice(lastNewlineIndex + 1), registry.activeBlock.startPos + lastNewlineIndex + 1);
    const blocks = paragraphContent
        ? [
            ...registry.blocks,
            finalizeBlock(paragraphContent, 'paragraph', registry.blockCounter, registry.activeBlock.startPos),
        ]
        : registry.blocks;
    const blockCounter = registry.blockCounter + (paragraphContent ? 1 : 0);
    return {
        blocks,
        activeBlock: {
            type: detectedNext.type,
            content: normalizedRemainder.content,
            startPos: normalizedRemainder.startPos,
        },
        activeTagState: tagState,
        cursor: fullText.length,
        blockCounter,
    };
}
function handleDoubleNewline({ registry, fullText, activeContent, tagState, activeStartPos, }) {
    if (!activeContent.includes('\n\n'))
        return null;
    // === Smart Segment Merging ===
    // Prevents splitting inside active code blocks
    let rawSegments = activeContent.split(/\n\n+/);
    let rawSeparators = activeContent.match(/\n\n+/g) ?? [];
    
    const segments = [];
    const separators = [];
    
    let currentSegment = rawSegments[0];
    
    for (let i = 0; i < rawSegments.length - 1; i++) {
        // If current segment has unbalanced code fences, it means the \n\n split 
        // happened inside a code block. We must merge firmly.
        if (!isCodeBlockBalanced(currentSegment)) {
            // Merge with next separator and segment
            currentSegment = currentSegment + rawSeparators[i] + rawSegments[i + 1];
        } else {
            // Balanced - safe to split
            segments.push(currentSegment);
            separators.push(rawSeparators[i]);
            currentSegment = rawSegments[i + 1];
        }
    }
    // Push the final segment (accumulated or single)
    segments.push(currentSegment);
    
    let offset = 0;
    let blocks = [...registry.blocks];
    let blockCounter = registry.blockCounter;
    const baseStart = registry.activeBlock?.startPos !== undefined
        ? registry.activeBlock.startPos
        : activeStartPos;
    
    // Track list accumulation - don't split lists on \n\n
    let accumulatedListContent = '';
    let listStartPos = 0;
    let listType = null; // 'ordered' or 'unordered'
    
    // Helper to check if a segment starts with a list marker
    const isListSegment = (segment) => {
        const firstLine = segment.split('\n')[0];
        if (BLOCK_PATTERNS.orderedList.test(firstLine)) return 'ordered';
        if (BLOCK_PATTERNS.unorderedList.test(firstLine)) return 'unordered';
        return null;
    };
    
    // Helper to finalize accumulated list
    const finalizeAccumulatedList = () => {
        if (accumulatedListContent) {
            blocks = [
                ...blocks,
                finalizeBlock(accumulatedListContent.trimEnd(), 'list', blockCounter, listStartPos),
            ];
            blockCounter++;
            accumulatedListContent = '';
            listType = null;
        }
    };
    
    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i].trimEnd();
        if (!segment) {
            offset += segments[i].length + separators[i].length;
            continue;
        }
        
        // Process segment - may contain multiple blocks if starts with single-line block
        const processedBlocks = processSegment(segment, baseStart + offset);
        
        for (const pb of processedBlocks) {
            if (pb.isList) {
                // This block is a list
                if (listType === null) {
                    listType = pb.listType;
                    listStartPos = pb.startPos;
                    accumulatedListContent = pb.content;
                } else if (listType === pb.listType) {
                    accumulatedListContent += '\n\n' + pb.content;
                } else {
                    finalizeAccumulatedList();
                    listType = pb.listType;
                    listStartPos = pb.startPos;
                    accumulatedListContent = pb.content;
                }
            } else {
                // Not a list - finalize accumulated list first, then add this block
                finalizeAccumulatedList();
                blocks = [...blocks, pb.block];
                blockCounter++;
            }
        }
        
        offset += segments[i].length + separators[i].length;
    }
    
    // Helper: Process a segment that may contain multiple blocks
    // e.g., "---\n### Header\nlist items" -> [hr, heading, list]
    function processSegment(segment, startPos) {
        const result = [];
        let remaining = segment;
        let currentPos = startPos;
        
        while (remaining.trim()) {
            const firstLine = remaining.split('\n')[0];
            const detected = detectBlockType(firstLine);
            
            // Check if first line is a single-line block (hr, heading)
            // Headings are ALWAYS single-line (# Title) - content after is separate
            const isSingleLineBlock = 
                detected?.type === 'horizontalRule' ||
                detected?.type === 'heading';
            
            if (isSingleLineBlock) {
                // Extract just this line as a block
                result.push({
                    isList: false,
                    block: finalizeBlock(firstLine, detected.type, blockCounter + result.length, currentPos),
                });
                
                // Move to next line
                const newlineIdx = remaining.indexOf('\n');
                if (newlineIdx === -1) {
                    break; // No more content
                }
                currentPos += newlineIdx + 1;
                remaining = remaining.slice(newlineIdx + 1).trimStart();
                continue;
            }
            
            // Check if this is a list segment
            const segmentListType = isListSegment(remaining);
            if (segmentListType) {
                result.push({
                    isList: true,
                    listType: segmentListType,
                    content: remaining,
                    startPos: currentPos,
                });
                break;
            }
            
            // Regular block - finalize entire remaining content
            const type = detected?.type || 'paragraph';
            result.push({
                isList: false,
                block: finalizeBlock(remaining, type, blockCounter + result.length, currentPos),
            });
            break;
        }
        
        return result;
    }
    
    // Handle remainder (last segment) using same logic
    const remainder = segments[segments.length - 1];
    const remainderStart = baseStart + offset;
    const normalizedRemainder = normalizeBlockContent(remainder, remainderStart);
    
    if (!normalizedRemainder.content.trim()) {
        // No remainder content
        finalizeAccumulatedList();
        return {
            blocks,
            activeBlock: null,
            activeTagState: INITIAL_INCOMPLETE_STATE,
            cursor: fullText.length,
            blockCounter,
        };
    }
    
    // Process remainder with same logic
    const remainderBlocks = processSegment(normalizedRemainder.content, normalizedRemainder.startPos);
    
    // Process all but last block (they are finalized)
    for (let i = 0; i < remainderBlocks.length - 1; i++) {
        const pb = remainderBlocks[i];
        if (pb.isList) {
            if (listType === null) {
                listType = pb.listType;
                listStartPos = pb.startPos;
                accumulatedListContent = pb.content;
            } else if (listType === pb.listType) {
                accumulatedListContent += '\n\n' + pb.content;
            } else {
                finalizeAccumulatedList();
                listType = pb.listType;
                listStartPos = pb.startPos;
                accumulatedListContent = pb.content;
            }
            // Finalize this list since more blocks follow
            finalizeAccumulatedList();
        } else {
            finalizeAccumulatedList();
            blocks = [...blocks, pb.block];
            blockCounter++;
        }
    }
    
    // Last block becomes active (or merged with accumulated list)
    const lastBlock = remainderBlocks[remainderBlocks.length - 1];
    if (!lastBlock) {
        finalizeAccumulatedList();
        return {
            blocks,
            activeBlock: null,
            activeTagState: INITIAL_INCOMPLETE_STATE,
            cursor: fullText.length,
            blockCounter,
        };
    }
    
    if (lastBlock.isList) {
        if (listType === null || listType === lastBlock.listType) {
            // Merge with accumulated list as active block
            const mergedContent = accumulatedListContent 
                ? accumulatedListContent + '\n\n' + lastBlock.content
                : lastBlock.content;
            return {
                blocks,
                activeBlock: {
                    type: 'list',
                    content: mergedContent,
                    startPos: listStartPos || lastBlock.startPos,
                },
                activeTagState: tagState,
                cursor: fullText.length,
                blockCounter,
            };
        } else {
            // Different list type - finalize accumulated, new list as active
            finalizeAccumulatedList();
            return {
                blocks,
                activeBlock: {
                    type: 'list',
                    content: lastBlock.content,
                    startPos: lastBlock.startPos,
                },
                activeTagState: tagState,
                cursor: fullText.length,
                blockCounter,
            };
        }
    } else {
        // Non-list block - finalize accumulated list, this becomes active
        finalizeAccumulatedList();
        return {
            blocks,
            activeBlock: {
                type: lastBlock.block.type,
                content: lastBlock.block.content,
                startPos: lastBlock.block.startPos,
            },
            activeTagState: tagState,
            cursor: fullText.length,
            blockCounter,
        };
    }
}
function handleActiveBlock({ registry, fullText, activeContent, tagState, activeStartPos, }) {
    if (!registry.activeBlock) {
        const { normalizedContent, trimmedChars } = trimLeadingWhitespace(activeContent);
        const normalizedLines = normalizedContent.split('\n');
        // Use partial detection for immediate type recognition
        const partialDetected = detectPartialBlockType(normalizedContent);
        const completeDetected = detectBlockType(normalizedLines[0]);
        const detected = completeDetected || partialDetected;
        const updatedRegistry = {
            ...registry,
            activeBlock: {
                type: detected?.type || 'paragraph',
                content: normalizedContent,
                startPos: activeStartPos + trimmedChars,
            },
            activeTagState: tagState,
            cursor: fullText.length,
        };
        return processLines({
            registry: updatedRegistry,
            fullText,
            lines: normalizedLines,
            activeContent: normalizedContent,
            tagState,
            activeStartPos: activeStartPos + trimmedChars,
        });
    }
    return updateActiveBlock(registry, activeContent, tagState, fullText);
}
function updateActiveBlock(registry, content, tagState, fullText) {
    if (!registry.activeBlock) {
        return {
            ...registry,
            activeBlock: null,
            activeTagState: tagState,
            cursor: fullText.length,
        };
    }
    // Re-detect type on each update using partial detection
    // This allows type to change as more characters arrive
    // e.g., "#" → heading, "# " → heading (confirmed), "# Hello" → heading
    const partialDetected = detectPartialBlockType(content);
    const firstLine = content.split('\n')[0];
    const completeDetected = detectBlockType(firstLine);
    // Prefer complete detection, fall back to partial, then keep current type
    const newType = completeDetected?.type
        ?? partialDetected?.type
        ?? registry.activeBlock.type;
    return {
        ...registry,
        activeBlock: {
            ...registry.activeBlock,
            content,
            type: newType,
        },
        activeTagState: tagState,
        cursor: fullText.length,
    };
}
function trimLeadingWhitespace(content) {
    const match = content.match(/^([\r\n]+)/);
    if (!match) {
        return { normalizedContent: content, trimmedChars: 0 };
    }
    return {
        normalizedContent: content.slice(match[0].length),
        trimmedChars: match[0].length,
    };
}
function normalizeBlockContent(content, startPos) {
    const { normalizedContent, trimmedChars } = trimLeadingWhitespace(content);
    return {
        content: normalizedContent,
        startPos: startPos + trimmedChars,
    };
}
function consumeLeadingBlocks(args) {
    if (args.registry.activeBlock) {
        return args;
    }
    let content = args.activeContent;
    let startPos = args.activeStartPos;
    let blocks = [...args.registry.blocks];
    let blockCounter = args.registry.blockCounter;
    while (true) {
        const { normalizedContent, trimmedChars } = trimLeadingWhitespace(content);
        content = normalizedContent;
        startPos += trimmedChars;
        if (!content) {
            return {
                ...args,
                registry: { ...args.registry, blocks, blockCounter },
                activeContent: '',
                tagState: INITIAL_INCOMPLETE_STATE,
                lines: [''],
                activeStartPos: startPos,
            };
        }
        const newlineIndex = content.indexOf('\n');
        if (newlineIndex === -1) {
            break;
        }
        const firstLine = content.slice(0, newlineIndex);
        const detected = detectBlockType(firstLine);
        if (!detected || detected.type !== 'heading') {
            break;
        }
        const headingBlock = finalizeBlock(firstLine.trimEnd(), 'heading', blockCounter, startPos);
        blocks = [...blocks, headingBlock];
        blockCounter++;
        content = content.slice(newlineIndex + 1);
        startPos += newlineIndex + 1;
    }
    return {
        ...args,
        registry: { ...args.registry, blocks, blockCounter },
        activeContent: content,
        lines: content.split('\n'),
        tagState: updateTagState(INITIAL_INCOMPLETE_STATE, content),
        activeStartPos: startPos,
    };
}

/**
 * Check if code block fences are balanced in a text segment.
 * Returns true if balanced (or no blocks), false if unbalanced (inside a block).
 */
function isCodeBlockBalanced(text) {
    const regex = /^(`{3,}|~{3,})/gm;
    let match;
    let inBlock = false;
    let fenceChar = null;
    let fenceLen = 0;
    
    while ((match = regex.exec(text)) !== null) {
        const marker = match[1];
        const char = marker[0];
        const len = marker.length;
        
        if (!inBlock) {
            inBlock = true;
            fenceChar = char;
            fenceLen = len;
        } else {
            // Check if closing fence matches opener
            // Allow closing fence to be longer than opener (CommonMark spec)
            if (char === fenceChar && len >= fenceLen) {
                inBlock = false;
                fenceChar = null;
                fenceLen = 0;
            }
        }
    }
    
    return !inBlock;
}

