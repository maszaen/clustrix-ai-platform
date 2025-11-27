const fs = require('fs');
const path = require('path');
const { applyPatch } = require('./backend/codes/edit-operations');

const workspacePath = 'h:\\VSCode\\Clustrix-AI-Platform';
const testFile = 'test_patch_repro.js';

// Simulate a patch with slightly different indentation/whitespace in context
// This mimics the "extra space" issue the user complained about, to verify robustness
const patchContent = `*** Begin Patch
*** Update File: ${testFile}
@@ -38,7 +38,7 @@
     };
 }
 // Smart split cells when column count doesn't match expected
-function smartSplitCells(cells, expectedCount) {
+function smartSplitCells(cells, expectedCount, options = {}) {
     if (cells.length === expectedCount) {
         return cells;
     }
*** End Patch`;

async function run() {
  try {
    console.log('Parsing patch...');
    const { parsePatch } = require('./backend/codes/edit-operations');
    const ops = parsePatch(patchContent);
    console.log('Parsed operations:', JSON.stringify(ops, null, 2));

    console.log('Applying patch...');
    const result = await applyPatch(patchContent, { workspacePath });
    console.log('Patch applied successfully:', JSON.stringify(result, null, 2));
    
    // Verify file content changed
    const content = fs.readFileSync(path.join(workspacePath, testFile), 'utf8');
    if (content.includes('function smartSplitCells(cells, expectedCount, options = {})')) {
        console.log('VERIFICATION PASSED: File content updated correctly.');
    } else {
        console.error('VERIFICATION FAILED: File content NOT updated.');
        process.exit(1);
    }
    
  } catch (error) {
    console.error('Patch failed:', error.message);
    process.exit(1);
  }
}

run();
