Changelog record instruction:
- Record all changelogs in /changelog/release-notes/* with a consistent format.
- Use `git diff HEAD` to check local changes that are not yet included in the latest changelog entry.
- Increment the version number (e.g., +0.0.? or +0.?.0 or +?.0.0) depending on the scope and impact of the change (use semantic versioning), and update the "version" column in package.json accordingly.
- Do `git add -A`, and `git commit -m '<Commit the changelog and updated files with an appropriate title>'`.
- Update /.github/copilot-instructions.md if necessary (only when there are important project updates or outdated information).
- Notes: copilot-instructions.md should contain only essential project information and instructions — not changelogs or historical updates.

Format release-notes (example):
Changelog v?.?.?: <**Changelog Title**>

<**Changes Section**>
- <List all major/minor changes>
- <Optional additional notes>

<**Another Section (if needed)**>
- <List of specific module or service updates>
- ...

**Code Quality:**
- Improved module organization using the single-responsibility principle (example)
- Better import management across renderer (example)
- Added JSDoc documentation for extracted modules (example)
- Established foundation for incremental refactoring (example)

**Statistics:**
- 8 files modified, 9 files created (refactoring & documentation) (example)
- ~950 lines extracted into modular structure (example)
- renderer.js reduced from 17,960 → ~17,000 lines (import cleanup) (example)
- Total refactoring plan: 10 phases over ~5 weeks (example)

> **Status:** ✓ Production Ready | _Major / Minor / Checkpoint Release_

Recommended commit messages:
<v?.?.?>: <Changelog title>.\n
- <min 1-4 detailed list of changes (summarized)>\n
> **Status:** ✓ Production Ready | _Major / Minor / Checkpoint Release_