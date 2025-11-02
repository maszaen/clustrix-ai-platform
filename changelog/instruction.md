Changelog record instruction:
- Cek local changes yg terbaru, lalu bandingkan dengan remote commit terbaru.
- Semua changelog dicatat di release-notes dengan format konsisten.
- Tambahkan versi +0.0.5, termasuk di package json.
- Lalu commit dengan title yang sesuai.
- Update /.github/copilot-instructions.md jika perlu (hanya jika ada informasi penting projek, atau update informasi project yang sudah usang)
- notes: copilot-instructions.md hanya berisi instruction dan informasi projek singkat.

Format release-notes (example):
Changelog v?.?.?: <**Changelog title**>

<**Changes section **>
- <List all changes>
- ...

<**Another changes section**>
- <List all changes>
- ...

**Code Quality:**
- Improved module organization with single-responsibility principle (example)
- Better import management across renderer (example)
- JSDoc documentation for all extracted modules (example)
- Foundation for incremental refactoring (example)

**Statistics:**
- 8 files changed, 9 files created (refactoring documentation) (example)
- ~950 lines extracted to modular structure (example)
- renderer.js reduced from 17,960 to ~17,000 lines (removed imports) (example)
- Total refactoring plan: 10 phases over ~5 weeks (example)

> **Status:** ✓ Production Ready or Checkpoint | _Major or Minor or Checkpoint Release_