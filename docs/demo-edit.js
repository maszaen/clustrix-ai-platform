// Line 1: Demo file untuk menunjukkan cara Kiro edit
// Line 2: File ini dibuat dengan fsWrite tool
// Line 3: 
// Line 4: Sekarang gue tambahin 20 lines
// Line 5:
// ============================================
// EDIT #1: Gue pake strReplace tool
// Tool ini butuh:
//   - path: "docs/demo-edit.js"
//   - oldStr: exact text yang mau diganti (harus PERSIS sama)
//   - newStr: text pengganti
// ============================================
function demoFunction() {
  // Line yang di-edit: function ini di-replace
  const a = 100;  // Changed from 1 to 100
  const b = 200;  // Changed from 2 to 200
  const c = 300;  // NEW LINE - ditambah
  return a + b + c; // Updated calculation
}

// Line 12: Space
// Line 13: Function kedua
function secondFunction() {
  // Line 15
  console.log("hello");
  console.log("world");
  return true; // Line 18
}

// Line 20: End of initial file

// ============================================
// EDIT #2: Append di akhir file
// Masih pake strReplace, tapi match line terakhir
// dan tambahin content baru setelahnya
// ============================================

// SUMMARY CARA KIRO EDIT:
// 
// 1. fsWrite - Buat file baru atau OVERWRITE seluruh file
//    Contoh: fsWrite({ path: "file.js", text: "content" })
//
// 2. strReplace - Edit sebagian file (FIND AND REPLACE)
//    Contoh: strReplace({ path: "file.js", oldStr: "old", newStr: "new" })
//    PENTING: oldStr harus EXACT MATCH, termasuk whitespace!
//
// 3. fsAppend - Tambah content di AKHIR file
//    Contoh: fsAppend({ path: "file.js", text: "new content" })
//
// KIRO TIDAK PAKE LINE NUMBERS!
// Kiro pake exact string matching (find and replace)
// Ini BEDA dari code agent yang pake line-based editing


// ============================================
// EDIT #3: Ini ditambah pake fsAppend
// fsAppend cuma bisa tambah di AKHIR file
// Ga bisa insert di tengah
// ============================================

/*
PERBANDINGAN:

┌─────────────────────────────────────────────────────────┐
│ KIRO (IDE Assistant)          │ CODE AGENT (Clustrix)   │
├───────────────────────────────┼─────────────────────────┤
│ strReplace (find & replace)   │ edit_file (line-based)  │
│ fsWrite (overwrite)           │ <set> tag dengan range  │
│ fsAppend (append only)        │ range={start, end}      │
│                               │ add={line} untuk insert │
├───────────────────────────────┼─────────────────────────┤
│ Match by EXACT STRING         │ Match by LINE NUMBER    │
│ Butuh context unik            │ Butuh baca file dulu    │
└───────────────────────────────┴─────────────────────────┘

Kenapa beda?
- Kiro: Interactive, bisa liat file langsung, string match reliable
- Code Agent: Autonomous, perlu precise control, line numbers lebih safe
*/
