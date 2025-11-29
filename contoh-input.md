Saya akan cek folder script dan menjalankannya untuk melihat hasil parsing table.

<!--command-input-->
List-ProjectFiles -Depth 2 -Extensions "*.js,*.ts,*.py"
<!--/command-input-->
<!--command-output-->
Found 4 files:

/
  main.js           5.3 KB   147 lines
  tableHealer.js    5.3 KB   192 lines
  tableUtils.js     2.4 KB   96 lines

/script/
  autoHealTable.js    2.4 KB   75 lines
<!--/command-output-->

<!--command-input-->
node script/autoHealTable.js
<!--/command-input-->
<!--command-output-->
======================================================================
TABLE AUTO-HEALER - Production Script
======================================================================

📋 Example 1: Extra pipes and spacing chaos

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name ||Age  |City|
|-----||----|-----|
|Alice| 25|New York  ||
||Bob|30| LA|
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name   |      | Age        | City   |
|------|----|----------|------|
| Alice  | 25   | New York   |        |
|        | Bob  | 30         | LA     |
----------------------------------------------------------------------

✨ Table healed successfully!


======================================================================
📋 Example 2: Missing closing pipes

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name      | Age | City        | Status   |
|-----------|-----|-------------|----------|
| Alice     | 25  | New York    | Active
| Bob       | 30  | Los Angeles | Active   |
| Charlie   | 35  | Chicago     | Inactive |
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name      | Age   | City          | Status   |
|---------|-----|-------------|--------|
| Alice     | 25    | New York      | Active   |
| Bob       | 30    | Los Angeles   | Active   |
| Charlie   | 35    | Chicago       | Inactive |
----------------------------------------------------------------------

✨ Table healed successfully!


======================================================================
📋 Example 3: Missing leading pipes

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name      | Age | City        | Status   |
|-----------|-----|-------------|----------|
Alice     | 25  | New York    | Active   |
Bob       | 30  | Los Angeles | Active   |
Charlie   | 35  | Chicago     | Inactive |
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name      | Age   | City          | Status   |
|---------|-----|-------------|--------|
| Alice     | 25    | New York      | Active   |
| Bob       | 30    | Los Angeles   | Active   |
| Charlie   | 35    | Chicago       | Inactive |
----------------------------------------------------------------------

✨ Table healed successfully!


✅ All examples completed!

<!--/command-output-->

Output menunjukkan "passed" tapi hasilnya masih salah. Let me check the actual parsing logic:

<!--command-input-->
Show-FileWithLineNumbers -Path "tableHealer.js"
<!--/command-input-->
<!--command-output-->
/tableHealer.js [192 lines]
1:const {
2:    extractCells,
3:    isSeparatorRow,
4:    calculateColumnWidths,
5:    padCell,
6:    validateTableStructure,
7:    trimEmptyLines
8:} = require('./tableUtils');
9:
10:function parseTable(tableText) {
11:    const lines = tableText.split('\n').map(line => line.trim());
12:    const cleanedLines = trimEmptyLines(lines);
13:    
14:    const headerRow = [];
15:    const dataRows = [];
16:    let separatorIndex = -1;
17:    
18:    cleanedLines.forEach((line, idx) => {
19:        if (isSeparatorRow(line)) {
20:            separatorIndex = idx;
21:            return;
22:        }
23:        
24:        const cells = extractCells(line);
25:        
26:        if (idx === 0) {
27:            // For header, remove only consecutive empty cells (from double pipes ||)
28:            const filteredCells = [];
29:            let prevWasEmpty = false;
30:            cells.forEach(cell => {
31:                const isEmpty = cell.trim() === '';
32:                if (!isEmpty || !prevWasEmpty) {
33:                    filteredCells.push(cell.trim());
34:                }
35:                prevWasEmpty = isEmpty;
36:            });
37:            // Remove trailing empty cells
38:            while (filteredCells.length > 0 && filteredCells[filteredCells.length - 1] === '') {
39:                filteredCells.pop();
40:            }
41:            headerRow.push(...filteredCells);
42:        } else if (idx > separatorIndex || separatorIndex === -1) {
43:            // For data rows, keep all cells including empty ones (just trim whitespace)
44:            // Only remove consecutive empty cells from double pipes
45:            const filteredCells = [];
46:            let prevWasEmpty = false;
47:            cells.forEach(cell => {
48:                const isEmpty = cell.trim() === '';
49:                if (!isEmpty || !prevWasEmpty) {
50:                    filteredCells.push(cell.trim());
51:                }
52:                prevWasEmpty = isEmpty;
53:            });
54:            // Remove trailing empty cells
55:            while (filteredCells.length > 0 && filteredCells[filteredCells.length - 1] === '') {
56:                filteredCells.pop();
57:            }
58:            dataRows.push(filteredCells);
59:        }
60:    });
61:    
62:    return {
63:        header: headerRow,
64:        data: dataRows,
65:        separatorIndex,
66:        rawLines: cleanedLines
67:    };
68:}
69:
70:
71:// Smart split cells when column count doesn't match expected
72:function smartSplitCells(cells, expectedCount) {
73:    if (cells.length === expectedCount) {
74:        return cells;
75:    }
76:    
77:    if (cells.length > expectedCount) {
78:        // Too many cells, truncate
79:        return cells.slice(0, expectedCount);
80:    }
81:    // Too few cells, pad with empty cells (don't split existing cells)
82:    while (cells.length < expectedCount) {
83:        cells.push('');
84:    }
85:    return cells.slice(0, expectedCount);
86:}
87:
88:function normalizeTable(parsedTable) {
89:    const { header, data } = parsedTable;
90:    
91:    const columnCount = header.length || 0;
92:    
93:    const normalizedData = data.map(row => {
94:        // First, try smart split if column count doesn't match
95:        let normalized = smartSplitCells(row, columnCount);
96:        
97:        // Filter out empty cells at the end
98:        // But keep empty cells in the middle
99:        return normalized;
100:    });

[Showing 1-100 of 192 lines]
<!--/command-output-->

<!--command-input-->
Show-FileWithLineNumbers -Path "tableUtils.js"
<!--/command-input-->
<!--command-output-->
/tableUtils.js [96 lines]
1:function detectColumnCount(line) {
2:    const pipes = line.split('|').filter(cell => cell.trim() !== '');
3:    return pipes.length - 1;
4:}
5:
6:function extractCells(line) {
7:    let cleaned = line.trim();
8:    if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
9:    if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
10:    
11:    return cleaned.split('|').map(cell => cell.trim());
12:}
13:
14:function isSeparatorRow(line) {
15:    const cleaned = line.trim().replace(/\|/g, '').replace(/\s/g, '');
16:    return cleaned.split('').every(char => char === '-');
17:}
18:
19:function calculateColumnWidths(rows) {
20:    if (rows.length === 0) return [];
21:    
22:    const columnCount = Math.max(...rows.map(row => row.length));
23:    const widths = new Array(columnCount).fill(0);
24:    
25:    rows.forEach(row => {
26:        row.forEach((cell, idx) => {
27:            if (cell.length > widths[idx]) {
28:                widths[idx] = cell.length + 2;
29:            }
30:        });
31:    });
32:    
33:    return widths;
34:}
35:
36:function padCell(content, width) {
37:    const padding = width - content.length;
38:    if (padding <= 0) return content;
39:    
40:    return content + ' '.repeat(padding);
41:}
42:
43:function validateTableStructure(lines) {
44:    const result = {
45:        isValid: true,
46:        errors: [],
47:        warnings: []
48:    };
49:    
50:    if (lines.length < 2) {
51:        result.isValid = false;
52:        result.errors.push('Table must have at least header and separator');
53:        return result;
54:    }
55:    
56:    const hasSeparator = lines.some(line => isSeparatorRow(line));
57:    if (!hasSeparator) {
58:        result.warnings.push('No separator row found');
59:    }
60:    
61:    const columnCounts = lines
62:        .filter(line => !isSeparatorRow(line))
63:        .map(line => extractCells(line).length);
64:    
65:    const uniqueCounts = [...new Set(columnCounts)];
66:    if (uniqueCounts.length > 1) {
67:        result.warnings.push(`Inconsistent column counts: ${uniqueCounts.join(', ')}`);
68:    }
69:    
70:    return result;
71:}
72:
73:function trimEmptyLines(lines) {
74:    let start = 0;
75:    let end = lines.length - 1;
76:    
77:    while (start < lines.length && lines[start].trim() === '') {
78:        start++;
79:    }
80:    
81:    while (end > 0 && lines[end].trim() === '') {
82:        end--;
83:    }
84:    
85:    return lines.slice(start, end + 1);
86:}
87:
88:module.exports = {
89:    detectColumnCount,
90:    extractCells,
91:    isSeparatorRow,
92:    calculateColumnWidths,
93:    padCell,
94:    validateTableStructure,
95:    trimEmptyLines
96:};
<!--/command-output-->

Saya lihat masalahnya. Untuk example 1:
- Input: `| Name ||Age  |City|` - ada double pipe `||`
- Expected: Name, Age, City (3 kolom)
- Actual output: Name, (empty), Age, City (4 kolom)

Logika saat ini menghapus consecutive empty cells tapi masih memproduksi kolom kosong. Mari saya test dulu dengan input spesifik:

<!--command-input-->
node -e "const {extractCells} = require('./tableUtils'); console.log(extractCells('| Name ||Age  |City|'));"
<!--/command-input-->
<!--command-output-->
[ 'Name', '', 'Age', 'City' ]
<!--/command-output-->

Oke jadi `extractCells` menghasilkan `['Name', '', 'Age', 'City']`. Logic di `parseTable` seharusnya menghapus empty cell itu, tapi sepertinya tidak bekerja dengan baik. Mari saya perbaiki:

<!--command-input-->
Show-FileWithLineNumbers -Path "tableHealer.js" -StartLine 26 -EndLine 42
<!--/command-input-->
<!--command-output-->
/tableHealer.js [192 lines]
26:        if (idx === 0) {
27:            // For header, remove only consecutive empty cells (from double pipes ||)
28:            const filteredCells = [];
29:            let prevWasEmpty = false;
30:            cells.forEach(cell => {
31:                const isEmpty = cell.trim() === '';
32:                if (!isEmpty || !prevWasEmpty) {
33:                    filteredCells.push(cell.trim());
34:                }
35:                prevWasEmpty = isEmpty;
36:            });
37:            // Remove trailing empty cells
38:            while (filteredCells.length > 0 && filteredCells[filteredCells.length - 1] === '') {
39:                filteredCells.pop();
40:            }
41:            headerRow.push(...filteredCells);
42:        } else if (idx > separatorIndex || separatorIndex === -1) {

[Showing 26-42 of 192 lines]
<!--/command-output-->

Masalahnya adalah logika "remove consecutive empty" ini masih memasukkan empty cell pertama. Seharusnya kita remove SEMUA empty cells dari double pipes. Mari fix:

<!--command-input-->
Edit file: tableHealer.js
<!--/command-input-->
<!--command-output-->
File: tableHealer.js
Total lines changed from 192 to 183 lines)

diff --git a/tableHealer.js b/tableHealer.js
index 40c7d2b..37e5a65 100644
--- a/tableHealer.js
+++ b/tableHealer.js
@@ -22,25 +22,16 @@ function parseTable(tableText) {
         }
         
         const cells = extractCells(line);
         
         if (idx === 0) {
-            // For header, remove only consecutive empty cells (from double pipes ||)
-            const filteredCells = [];
-            let prevWasEmpty = false;
-            cells.forEach(cell => {
-                const isEmpty = cell.trim() === '';
-                if (!isEmpty || !prevWasEmpty) {
-                    filteredCells.push(cell.trim());
-                }
-                prevWasEmpty = isEmpty;
-            });
-            // Remove trailing empty cells
-            while (filteredCells.length > 0 && filteredCells[filteredCells.length - 1] === '') {
-                filteredCells.pop();
-            }
+            // For header, remove ALL empty cells (from double pipes || or extra pipes)
+            const filteredCells = cells
+                .map(cell => cell.trim())
+                .filter(cell => cell !== '');
             headerRow.push(...filteredCells);
+
         } else if (idx > separatorIndex || separatorIndex === -1) {
             // For data rows, keep all cells including empty ones (just trim whitespace)
             // Only remove consecutive empty cells from double pipes
             const filteredCells = [];
             let prevWasEmpty = false;


Auto updated memory snippet:
[21-37] tableHealer.js
21:            return;
22:        }
23:        
24:        const cells = extractCells(line);
25:        
26:        if (idx === 0) {
27:            // For header, remove ALL empty cells (from double pipes || or extra pipes)
28:            const filteredCells = cells
29:                .map(cell => cell.trim())
30:                .filter(cell => cell !== '');
31:            headerRow.push(...filteredCells);
32:
33:        } else if (idx > separatorIndex || separatorIndex === -1) {
34:            // For data rows, keep all cells including empty ones (just trim whitespace)
35:            // Only remove consecutive empty cells from double pipes
36:            const filteredCells = [];
37:            let prevWasEmpty = false;
<!--/command-output-->

Sekarang untuk data rows juga perlu diperbaiki. Untuk data rows, kita perlu align dengan jumlah kolom header. Tapi masalahnya di example 1:
- Row 1: `|Alice| 25|New York  ||` → seharusnya: Alice, 25, New York
- Row 2: `||Bob|30| LA|` → seharusnya: (empty), Bob, 30, LA (ini ada empty leading cell yang valid)

Wait, saya perlu liat expected output lagi. Dari script output:

```
| Name   |      | Age        | City   |
```

Ini 4 kolom! Berarti ada kolom kosong di tengah. Berarti interpretasinya:
- Header memang ada 4 kolom karena `||` = kolom kosong
- Tapi kenapa? Let me check the script untuk liat expected output:

<!--command-input-->
Show-FileWithLineNumbers -Path "script/autoHealTable.js"
<!--/command-input-->
<!--command-output-->
/script/autoHealTable.js [75 lines]
1:const { healTable } = require('../tableHealer');
2:
3:/**
4: * Auto-heal broken markdown table
5: * @param {string} brokenTable - Broken markdown table text
6: * @returns {string} - Fixed/healed markdown table text
7: */
8:function autoHealTable(brokenTable) {
9:    console.log('?? Auto-healing table...');
10:    console.log('\n?? INPUT (Broken Table):');
11:    console.log('-'.repeat(70));
12:    console.log(brokenTable);
13:    console.log('-'.repeat(70));
14:    
15:    try {
16:        const healedTable = healTable(brokenTable);
17:        
18:        console.log('\n? OUTPUT (Healed Table):');
19:        console.log('-'.repeat(70));
20:        console.log(healedTable);
21:        console.log('-'.repeat(70));
22:        console.log('\n? Table healed successfully!\n');
23:        
24:        return healedTable;
25:    } catch (error) {
26:        console.error('? Error healing table:', error.message);
27:        console.log('\n??  Returning original table...\n');
28:        return brokenTable;
29:    }
30:}
31:
32:module.exports = { autoHealTable };
33:
34:// Example usage (run this file directly to test)
35:if (require.main === module) {
36:    console.log('='.repeat(70));
37:    console.log('TABLE AUTO-HEALER - Production Script');
38:    console.log('='.repeat(70));
39:    console.log();
40:    
41:    // Example 1: Extra pipes and spacing chaos
42:    const example1 = `| Name ||Age  |City|
43:|-----||----|-----|
44:|Alice| 25|New York  ||
45:||Bob|30| LA|`;
46:
47:    console.log('?? Example 1: Extra pipes and spacing chaos\n');
48:    const result1 = autoHealTable(example1);
49:    
50:    console.log('\n' + '='.repeat(70));
51:    
52:    // Example 2: Missing closing pipes
53:    const example2 = `| Name      | Age | City        | Status   |
54:|-----------|-----|-------------|----------|
55:| Alice     | 25  | New York    | Active
56:| Bob       | 30  | Los Angeles | Active   |
57:| Charlie   | 35  | Chicago     | Inactive |`;
58:
59:    console.log('?? Example 2: Missing closing pipes\n');
60:    const result2 = autoHealTable(example2);
61:    
62:    console.log('\n' + '='.repeat(70));
63:    
64:    // Example 3: Missing leading pipes
65:    const example3 = `| Name      | Age | City        | Status   |
66:|-----------|-----|-------------|----------|
67:Alice     | 25  | New York    | Active   |
68:Bob       | 30  | Los Angeles | Active   |
69:Charlie   | 35  | Chicago     | Inactive |`;
70:
71:    console.log('?? Example 3: Missing leading pipes\n');
72:    const result3 = autoHealTable(example3);
73:    
74:    console.log('\n? All examples completed!\n');
75:}
<!--/command-output-->

OK, jadi yang diharapkan itu:

**Example 1:**
Input:
```
| Name ||Age  |City|
|-----||----|-----|
|Alice| 25|New York  ||
||Bob|30| LA|
```

Expected hasil: 3 kolom (Name, Age, City) karena:
- `||` di header = typo/extra pipe, bukan kolom kosong
- `||` di akhir row = trailing empty, remove
- `||` di awal row = leading empty, remove
- Final: Alice/25/New York dan Bob/30/LA dalam format yang rapi

Tapi output saat ini ada 4 kolom dengan kolom kosong. Ini salah. Mari saya test lagi setelah fix header:

<!--command-input-->
node script/autoHealTable.js
<!--/command-input-->
<!--command-output-->
======================================================================
TABLE AUTO-HEALER - Production Script
======================================================================

📋 Example 1: Extra pipes and spacing chaos

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name ||Age  |City|
|-----||----|-----|
|Alice| 25|New York  ||
||Bob|30| LA|
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name   | Age   | City       |
|------|-----|----------|
| Alice  | 25    | New York   |
|        | Bob   | 30         |
----------------------------------------------------------------------

✨ Table healed successfully!


======================================================================
📋 Example 2: Missing closing pipes

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name      | Age | City        | Status   |
|-----------|-----|-------------|----------|
| Alice     | 25  | New York    | Active
| Bob       | 30  | Los Angeles | Active   |
| Charlie   | 35  | Chicago     | Inactive |
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name      | Age   | City          | Status   |
|---------|-----|-------------|--------|
| Alice     | 25    | New York      | Active   |
| Bob       | 30    | Los Angeles   | Active   |
| Charlie   | 35    | Chicago       | Inactive |
----------------------------------------------------------------------

✨ Table healed successfully!


======================================================================
📋 Example 3: Missing leading pipes

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name      | Age | City        | Status   |
|-----------|-----|-------------|----------|
Alice     | 25  | New York    | Active   |
Bob       | 30  | Los Angeles | Active   |
Charlie   | 35  | Chicago     | Inactive |
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name      | Age   | City          | Status   |
|---------|-----|-------------|--------|
| Alice     | 25    | New York      | Active   |
| Bob       | 30    | Los Angeles   | Active   |
| Charlie   | 35    | Chicago       | Inactive |
----------------------------------------------------------------------

✨ Table healed successfully!


✅ All examples completed!

<!--/command-output-->

Masih salah! Example 1:
- Expected: Alice | 25 | New York dan Bob | 30 | LA
- Actual: Alice | 25 | New York dan (empty) | Bob | 30

Masalahnya di data row. Row `||Bob|30| LA|` menghasilkan `['', 'Bob', '30', 'LA']` (4 cells), tapi header cuma 3. Logika saat ini remove trailing empty tapi keep leading empty.

Untuk row ini, seharusnya jadi Bob | 30 | LA (shift left karena leading empty bukan kolom yang valid). Let me check data row logic:

<!--command-input-->
Show-FileWithLineNumbers -Path "tableHealer.js" -StartLine 33 -EndLine 60
<!--/command-input-->
<!--command-output-->
/tableHealer.js [183 lines]
33:        } else if (idx > separatorIndex || separatorIndex === -1) {
34:            // For data rows, keep all cells including empty ones (just trim whitespace)
35:            // Only remove consecutive empty cells from double pipes
36:            const filteredCells = [];
37:            let prevWasEmpty = false;
38:            cells.forEach(cell => {
39:                const isEmpty = cell.trim() === '';
40:                if (!isEmpty || !prevWasEmpty) {
41:                    filteredCells.push(cell.trim());
42:                }
43:                prevWasEmpty = isEmpty;
44:            });
45:            // Remove trailing empty cells
46:            while (filteredCells.length > 0 && filteredCells[filteredCells.length - 1] === '') {
47:                filteredCells.pop();
48:            }
49:            dataRows.push(filteredCells);
50:        }
51:    });
52:    
53:    return {
54:        header: headerRow,
55:        data: dataRows,
56:        separatorIndex,
57:        rawLines: cleanedLines
58:    };
59:}
60:

[Showing 33-60 of 183 lines]
<!--/command-output-->

Hmm, masalahnya adalah: untuk data rows kita perlu remove empty cells juga TAPI hanya jika mereka melebihi expected column count. Atau lebih sederhana: remove leading/trailing empty cells yang muncul dari extra pipes.

Let me think... Strategi terbaik adalah:
1. Header: remove ALL empty cells
2. Data rows: JUGA remove ALL empty cells, tapi HANYA jika jumlah cells > jumlah header
3. Jika ada legitimate empty cell (misal middle column kosong), itu tetap di keep karena jumlah cells = jumlah header

Wait, tapi itu kompleks. Lebih baik: remove ALL empty cells di leading/trailing, keep empty cells di middle:

<!--command-input-->
Edit file: tableHealer.js
<!--/command-input-->
<!--command-output-->
File: tableHealer.js
Total lines changed from 183 to 190 lines)

diff --git a/tableHealer.js b/tableHealer.js
index 37e5a65..48d139e 100644
--- a/tableHealer.js
+++ b/tableHealer.js
@@ -29,27 +29,34 @@ function parseTable(tableText) {
                 .map(cell => cell.trim())
                 .filter(cell => cell !== '');
             headerRow.push(...filteredCells);
 
         } else if (idx > separatorIndex || separatorIndex === -1) {
-            // For data rows, keep all cells including empty ones (just trim whitespace)
-            // Only remove consecutive empty cells from double pipes
-            const filteredCells = [];
-            let prevWasEmpty = false;
-            cells.forEach(cell => {
-                const isEmpty = cell.trim() === '';
-                if (!isEmpty || !prevWasEmpty) {
-                    filteredCells.push(cell.trim());
-                }
-                prevWasEmpty = isEmpty;
-            });
+            // For data rows, remove leading and trailing empty cells (from extra pipes)
+            // but keep empty cells in the middle (legitimate empty columns)
+            const trimmedCells = cells.map(cell => cell.trim());
+            
+            // Remove leading empty cells
+            let startIdx = 0;
+            while (startIdx < trimmedCells.length && trimmedCells[startIdx] === '') {
+                startIdx++;
+            }
+            
             // Remove trailing empty cells
-            while (filteredCells.length > 0 && filteredCells[filteredCells.length - 1] === '') {
-                filteredCells.pop();
+            let endIdx = trimmedCells.length - 1;
+            while (endIdx >= 0 && trimmedCells[endIdx] === '') {
+                endIdx--;
             }
+            
+            // Extract non-empty range (includes middle empty cells)
+            const filteredCells = startIdx <= endIdx 
+                ? trimmedCells.slice(startIdx, endIdx + 1)
+                : [];
+            
             dataRows.push(filteredCells);
         }
+
     });
     
     return {
         header: headerRow,
         data: dataRows,


Auto updated memory snippet:
[28-62] tableHealer.js
28:            const filteredCells = cells
29:                .map(cell => cell.trim())
30:                .filter(cell => cell !== '');
31:            headerRow.push(...filteredCells);
32:
33:        } else if (idx > separatorIndex || separatorIndex === -1) {
34:            // For data rows, remove leading and trailing empty cells (from extra pipes)
35:            // but keep empty cells in the middle (legitimate empty columns)
36:            const trimmedCells = cells.map(cell => cell.trim());
37:            
38:            // Remove leading empty cells
39:            let startIdx = 0;
40:            while (startIdx < trimmedCells.length && trimmedCells[startIdx] === '') {
41:                startIdx++;
42:            }
43:            
44:            // Remove trailing empty cells
45:            let endIdx = trimmedCells.length - 1;
46:            while (endIdx >= 0 && trimmedCells[endIdx] === '') {
47:                endIdx--;
48:            }
49:            
50:            // Extract non-empty range (includes middle empty cells)
51:            const filteredCells = startIdx <= endIdx 
52:                ? trimmedCells.slice(startIdx, endIdx + 1)
53:                : [];
54:            
55:            dataRows.push(filteredCells);
56:        }
57:
58:    });
59:    
60:    return {
61:        header: headerRow,
62:        data: dataRows,
<!--/command-output-->

<!--command-input-->
node script/autoHealTable.js
<!--/command-input-->
<!--command-output-->
======================================================================
TABLE AUTO-HEALER - Production Script
======================================================================

📋 Example 1: Extra pipes and spacing chaos

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name ||Age  |City|
|-----||----|-----|
|Alice| 25|New York  ||
||Bob|30| LA|
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name   | Age   | City       |
|------|-----|----------|
| Alice  | 25    | New York   |
| Bob    | 30    | LA         |
----------------------------------------------------------------------

✨ Table healed successfully!


======================================================================
📋 Example 2: Missing closing pipes

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name      | Age | City        | Status   |
|-----------|-----|-------------|----------|
| Alice     | 25  | New York    | Active
| Bob       | 30  | Los Angeles | Active   |
| Charlie   | 35  | Chicago     | Inactive |
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name      | Age   | City          | Status   |
|---------|-----|-------------|--------|
| Alice     | 25    | New York      | Active   |
| Bob       | 30    | Los Angeles   | Active   |
| Charlie   | 35    | Chicago       | Inactive |
----------------------------------------------------------------------

✨ Table healed successfully!


======================================================================
📋 Example 3: Missing leading pipes

🔧 Auto-healing table...

📥 INPUT (Broken Table):
----------------------------------------------------------------------
| Name      | Age | City        | Status   |
|-----------|-----|-------------|----------|
Alice     | 25  | New York    | Active   |
Bob       | 30  | Los Angeles | Active   |
Charlie   | 35  | Chicago     | Inactive |
----------------------------------------------------------------------

✅ OUTPUT (Healed Table):
----------------------------------------------------------------------
| Name      | Age   | City          | Status   |
|---------|-----|-------------|--------|
| Alice     | 25    | New York      | Active   |
| Bob       | 30    | Los Angeles   | Active   |
| Charlie   | 35    | Chicago       | Inactive |
----------------------------------------------------------------------

✨ Table healed successfully!


✅ All examples completed!

<!--/command-output-->

Perfect! Sekarang Example 1 sudah benar:
- Header: Name | Age | City (3 kolom)
- Row 1: Alice | 25 | New York ✅
- Row 2: Bob | 30 | LA ✅

Example 2 & 3 juga sudah benar semua. Table parsing sekarang sudah bener!

Perfect! Sekarang Example 1 sudah benar:
- Header: Name | Age | City (3 kolom)
- Row 1: Alice | 25 | New York ✅
- Row 2: Bob | 30 | LA ✅

Example 2 & 3 juga sudah benar semua. Table parsing sekarang sudah bener!

