# Edit Operations Guide - Clustrix Code Agent

## Overview

Code agent menggunakan **line-based editing** dengan `<set>` tag, bukan find-and-replace. Ini lebih reliable karena:
- Exact positioning (ga ambigu)
- Support insert, replace, delete dalam satu syntax
- Ga perlu escape special characters

---

## Tool Structure per Agent

### 1. Claude Agent
```json
{
  "name": "edit_file",
  "input": {
    "file": "src/app.js",
    "range": { "start": 10, "end": 15 },
    "content": "// new code here\nconsole.log('hello');"
  }
}
```

### 2. OpenAI-Style Agent (GLM, Deepseek, etc)
```json
{
  "name": "edit_file",
  "arguments": {
    "file": "src/app.js",
    "range": { "start": 10, "end": 15 },
    "content": "// new code here\nconsole.log('hello');"
  }
}
```

### 3. Gemini Agent
```json
{
  "name": "edit_file",
  "args": {
    "file": "src/app.js",
    "range_start": 10,
    "range_end": 15,
    "content": "// new code here\nconsole.log('hello');"
  }
}
```

---

## Operations

### 1. REPLACE (Ganti lines)
Hapus line 10-15, ganti dengan content baru.

**Tool call:**
```json
{
  "file": "src/app.js",
  "range": { "start": 10, "end": 15 },
  "content": "function newCode() {\n  return true;\n}"
}
```

**Generated `<set>` command:**
```xml
<set file="src/app.js" range={10, 15}>
<![CDATA[
function newCode() {
  return true;
}
]]>
</set>
```

**Result:** Lines 10-15 dihapus, diganti dengan 3 lines baru.

---

### 2. INSERT (Sisipkan sebelum line)
Sisipkan content SEBELUM line 25 (line 25 dst geser ke bawah).

**Tool call:**
```json
{
  "file": "src/app.js",
  "insertBefore": 25,
  "content": "// This is inserted\nconst x = 1;"
}
```

**Generated `<set>` command:**
```xml
<set file="src/app.js" add={25}>
<![CDATA[
// This is inserted
const x = 1;
]]>
</set>
```

**Result:** 2 lines baru disisipkan sebelum line 25.

---

### 3. APPEND (Tambah di akhir file)
Tambahkan content di akhir file.

**Tool call:**
```json
{
  "file": "src/app.js",
  "append": true,
  "content": "\n// End of file\nexport default app;"
}
```

**Generated `<set>` command:**
```xml
<set file="src/app.js" range={-1}>
<![CDATA[

// End of file
export default app;
]]>
</set>
```

**Result:** Content ditambahkan di akhir file.

---

### 4. DELETE (Hapus lines)
Hapus line 10-15 tanpa replacement.

**Tool call:**
```json
{
  "file": "src/app.js",
  "range": { "start": 10, "end": 15 },
  "content": ""
}
```

**Generated `<set>` command:**
```xml
<set file="src/app.js" range={10, 15}>
<![CDATA[
]]>
</set>
```

**Result:** Lines 10-15 dihapus.

---

## Kenapa Bukan Find-and-Replace?

| Aspect | Line-Based | Find-Replace |
|--------|-----------|--------------|
| Precision | ✅ Exact line numbers | ❌ Bisa match multiple |
| Ambiguity | ✅ Tidak ambigu | ❌ "which occurrence?" |
| Special chars | ✅ CDATA handles all | ❌ Need escaping |
| Large edits | ✅ Replace whole blocks | ❌ Complex patterns |
| Verification | ✅ Show-FileWithLineNumbers | ❌ Hard to verify |

---

## Best Practice untuk Agent

1. **SELALU baca file dulu** dengan `Show-FileWithLineNumbers`
2. **Catat line numbers** yang mau di-edit
3. **Verify setelah edit** dengan baca ulang file
4. **Satu edit per operasi** - jangan gabung multiple edits

---

## Common Errors

### "Line X is outside of file bounds"
- File lebih pendek dari yang dikira
- Solution: Baca ulang file, check total lines

### "range end must be >= start"
- `end` lebih kecil dari `start`
- Solution: Pastikan `start <= end`

### "File not found"
- Path salah atau file belum dibuat
- Solution: Buat file dulu dengan `New-Item`

---

## Flow Diagram

```
User Request
     │
     ▼
┌─────────────────┐
│ Show-FileWith   │
│ LineNumbers     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Identify lines  │
│ to edit         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Call edit_file  │
│ with range      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Verify changes  │
│ (optional)      │
└─────────────────┘
```
