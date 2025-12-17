const LOG_PREFIX = '[streamdown-rn]';
export const logDebug = (...args) => {
    // Disabled - no debug logging
    return;
};
export const logStateSnapshot = (label, registry) => {
    logDebug(label, {
        stableBlocks: registry.blocks.map((block) => ({
            id: block.id,
            type: block.type,
            length: block.content.length,
            preview: block.content.slice(0, 40),
        })),
        activeBlock: registry.activeBlock
            ? {
                type: registry.activeBlock.type,
                length: registry.activeBlock.content.length,
                preview: registry.activeBlock.content.slice(0, 60),
            }
            : null,
    });
};
//# sourceMappingURL=logger.js.map