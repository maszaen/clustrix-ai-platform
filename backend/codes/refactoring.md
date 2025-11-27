Apply patch specification:

Your patch language is a stripped‑down, file‑oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high‑level envelope:

*** Begin Patch
[ one or more file sections ]
*** End Patch

Within that envelope, you get a sequence of file operations.
You MUST include a header to specify the action you are taking.
Each operation starts with one of three headers:

*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).
*** Delete File: <path> - remove an existing file. Nothing follows.
*** Update File: <path> - patch an existing file in place (optionally with a rename).

May be immediately followed by *** Move to: <new path> if you want to rename the file.
Then one or more "hunks", each introduced by @@ (optionally followed by a hunk header).
Within a hunk each line starts with:
+ for inserted text,
- for removed text, or
  space ( ) for context.
At the end of a truncated hunk you can emit *** End of File.

Patch := Begin { FileOp } End
Begin := "*** Begin Patch" NEWLINE
End := "*** End Patch" NEWLINE
FileOp := AddFile | DeleteFile | UpdateFile
AddFile := "*** Add File: " path NEWLINE { "+" line NEWLINE }
DeleteFile := "*** Delete File: " path NEWLINE
UpdateFile := "*** Update File: " path NEWLINE [ MoveTo ] { Hunk }
MoveTo := "*** Move to: " newPath NEWLINE
Hunk := "@@" [ header ] NEWLINE { HunkLine } [ "*** End of File" NEWLINE ]
HunkLine := (" " | "-" | "+") text NEWLINE

A full patch can combine several operations:

*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
*** Move to: src/main.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch

It is important to remember:
- All commands should inside the cmd
- in your response, cmd tag only one, no more.
- You must include a header with your intended action (Add/Delete/Update)
- You must prefix new lines with `+` even when creating a new file

You can invoke apply_patch like:

<cmd>
*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
*** Move to: src/main.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch
</cmd>

IMPORTANT (refactoring):

1. SEARCH COMMAND ENHANCEMENT:
- Sekarang search command bisa lebih dari satu file (misalnya 2 file atau lebih)
- Efektif untuk search, tidak boros iteration
- Refactor codes-prompt.js dan code-agent.js untuk mendukung multi-file search
- Format: search <pattern> in <file1> <file2> <file3>

2. OUTPUT REFACTORING:
- Refaktor cara kirim chunk dan md.js untuk penerimaan edit command baru serta proses shortening.
- Tag cmd diparsing menjadi tag <!--command-input--></!--command-input-->
- Untuk edit operation, kirim setiap operasi `***` sebagai command-input terpisah
- Jumlah tag command-input = jumlah operasi `***`, bukan mengikuti tag cmd

3. COMMAND INPUT TRANSFORMATION:

Untuk command biasa:
Input:
<cmd>the command</cmd>

Output:
<!--command-input-->the command</!--command-input-->

Renderer output:
<!--command-input-->the processing of shortening command</!--command-input-->

Untuk edit command (PENTING):
Input:
<cmd>
*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
*** Move to: src/main.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch
</cmd>

Output (split per operation):
<!--command-input-->
Create file hello.txt
</!--command-input-->
<!--command-input-->
Update file src/app.py (move to src/main.py)
- Modify function greet
</!--command-input-->
<!--command-input-->
Delete file obsolete.txt
</!--command-input-->

4. PARSING LOGIC:
- Parser harus detect `*** Begin Patch` sebagai trigger edit mode
- Split berdasarkan header `*** Add File:`, `*** Update File:`, `*** Delete File:`
- Setiap operasi dikonversi ke command-input terpisah dengan summary yang human-readable
- Parser harus handle `*** Move to:` sebagai bagian dari update operation

5. RENDERER BEHAVIOR:
- Setiap command-input di-render secara streaming
- Show progress untuk setiap operasi
- Summary format:
  - Add: "Create file <path>"
  - Update: "Update file <path>" (+ " (move to <newpath>)" jika ada rename)
  - Delete: "Delete file <path>"
- Show line changes untuk update operations (misal: "- Modify function greet")

6. MD.JS REFACTORING:
- Refactor parser untuk handle multiple command-input tags
- Implement state machine untuk track patch operations
- Handle streaming untuk large patches
- Add validation untuk patch syntax

7. CODE-AGENT.JS REFACTORING:
- Implement patch parser yang robust
- Apply operations secara atomic (rollback jika gagal)
- Add file existence validation
- Handle move operations correctly
- Implement proper error handling dan reporting

8. CODES-PROMPT.JS REFACTORING:
- Update prompt untuk generate patch format yang benar
- Add examples untuk multi-file search
- Add validation rules untuk patch syntax
- Include error handling guidelines

9. ERROR HANDLING:
- Validate patch syntax sebelum apply
- Check file existence untuk update/delete operations
- Prevent overwrite untuk add operations (file already exists)
- Proper rollback mechanism jika operation gagal
- Clear error messages dengan suggestion untuk fix

10. TESTING REQUIREMENTS:
- Test single file operations (add, update, delete)
- Test multi-file patches
- Test move operations
- Test large file patches
- Test error scenarios
- Test rollback mechanism
```

---

## Penjelasan Lengkap:

### Konsep Utama

**1. Perubahan Output Format**
Yang paling krusial di sini adalah perubahan cara parsing command. Sebelumnya mungkin lu kirim satu tag `<cmd>` langsung jadi satu `<!--command-input-->`, tapi sekarang untuk edit operations, setiap operasi file (`*** Add File`, `*** Update File`, `*** Delete File`) harus di-split jadi command-input terpisah.

**Kenapa?** Biar user bisa liat progress per-file operation secara real-time, bukan nunggu semua selesai baru muncul. Lebih informative dan better UX.

**2. Multi-file Search**
Ini optimasi buat search command. Daripada lu search satu-satu file (boros iteration), sekarang bisa langsung specify multiple files dalam satu command. Misalnya:
```
search "function processCommand" in codes-prompt.js code-agent.js
```

**3. Patch Parser Logic**
Parser harus detect:
- `*** Begin Patch` → trigger edit mode
- Split per header (`*** Add File:`, dll)
- Extract path, content, dan operations
- Convert ke human-readable summary
- Handle special case kayak `*** Move to:`

**4. Atomic Operations**
Ini penting banget bro. Semua file operations harus atomic — artinya kalau ada yang gagal, rollback semua. Jangan sampe half-done yang bikin sistem broken.

**5. Command Input Transformation Flow**
```
User input: <cmd>patch content</cmd>
    ↓
Parser detect: is it edit operation?
    ↓ (yes)
Split by *** headers
    ↓
For each operation:
  - Extract metadata (path, action)
  - Generate summary
  - Wrap in <!--command-input-->
    ↓
Send to renderer streaming
    ↓
Renderer shows progress real-time