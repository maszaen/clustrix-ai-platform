function parseTable(tableText) {
    const lines = tableText.split('\n').map(line => line.trim());
    const cleanedLines = trimEmptyLines(lines);
    const headerRow = [];
    const dataRows = [];
    let separatorIndex = -1;
    cleanedLines.forEach((line, idx) => {
        if (isSeparatorRow(line)) {
            separatorIndex = idx;
            return;
        }
        const cells = extractCells(line);
        if (idx === 0) {
            // Filter out empty cells from header (caused by double pipes)
            const filteredCells = cells.filter(cell => cell.trim() !== '');
            // Also try to split header cells that contain multiple values
            const expandedHeader = [];
            filteredCells.forEach(cell => {
                const parts = cell.trim().split(/\s+/);
                // If cell contains multiple words that look like column names, split them
                if (parts.length > 1 && parts.every(p => p.length > 0)) {
                    expandedHeader.push(...parts);
                } else {
                    expandedHeader.push(cell.trim());
                }
            });
            headerRow.push(...expandedHeader);
        } else if (idx > separatorIndex || separatorIndex === -1) {
            dataRows.push(cells);
        }
    });
    return {
        header: headerRow,
        data: dataRows,
        separatorIndex,
        rawLines: cleanedLines
    };
}
// Smart split cells when column count doesn't match expected
function smartSplitCells(cells, expectedCount, options = {}) {
    if (cells.length === expectedCount) {
        return cells;
    }
    if (cells.length > expectedCount) {
        // Too many cells, truncate
        return cells.slice(0, expectedCount);
    }
    // Too few cells, try to split cells with multiple values
    let result = [...cells];
    
    // Try to split cells that contain multiple space-separated values
    let i = 0;
    while (i < result.length && result.length < expectedCount) {
        const cell = result[i].trim();
        
        // Check if cell contains multiple words/numbers separated by spaces
        if (cell.includes(' ')) {
            // Split by spaces
            const parts = cell.split(/\s+/).filter(p => p.length > 0);
            
            // Calculate how many more cells we need
            const needed = expectedCount - result.length;
            
            // Only split if we can improve the situation
            if (parts.length > 1 && parts.length - 1 <= needed) {
                result.splice(i, 1, ...parts);
                i += parts.length; // Skip the newly created cells
                continue;
            }
        }
        i++;
    }
    
    // Pad with empty cells if still not enough
    while (result.length < expectedCount) {
        result.push('');
    }
    return result.slice(0, expectedCount);
}
