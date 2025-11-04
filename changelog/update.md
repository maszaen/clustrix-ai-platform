# **Changelog & Versioning Workflow**

**1. Check Existing Changelog**
- Check package.json version first
- Look for matching files in /changelog/release-notes/v*.md
- **If changelog exists** with version > package.json: Use that (developer-written, skip git diff) (e.g, in package json 1.0.0, but in changelog info is higher than package json, do `git diff HEAD`)
- **If not**: Use `git diff HEAD` to check what changed locally, then write those changes into the new changelog.

**2. Create/Update Changelog**
- Create new file: /changelog/release-notes/v<new-version>.md
- Follow the format below
- Increment version using **semantic versioning**:
  - **Major** (+?.0.0): Breaking changes, major refactors
  - **Minor** (+0.?.0): New features, non-breaking updates
  - **Patch** (+0.0.?): Bug fixes, small improvements

**3. Update Files**
- Update package.json → "version": "<new-version>"
- Update /.github/copilot-instructions.md **only if**:
  - Project structure changed significantly
  - New critical conventions added
  - Outdated information needs correction
- **Note:** Keep copilot-instructions.md focused on current project state, NOT changelogs

**4. Commit Changes**

Command:

git add -A

git commit -m "v<new-version>: <Changelog Title>

- <Key change 1>
- <Key change 2>
- <Key change 3>

> **Status:** ✓ Production Ready | Major/Minor/Patch Release"

---

### **Changelog Format Template**

File: /changelog/release-notes/v<version>.md

# Changelog v<version>: <Title>

## <Primary Section Name>
- <Change description with impact>
- <Another change>

## <Optional Secondary Section>
- <Module-specific updates>
- <Service updates>

## Code Quality
- <Refactoring improvements>
- <Documentation additions>
- <Architecture changes>

## Statistics
- X files modified, Y files created
- ~Z lines refactored/added
- <Key metric (e.g., bundle size reduction)>

> **Status:** ✓ Production Ready | _Major / Minor / Patch Release_

---

### **Example Changelog**

# Changelog v0.3.0: Modular Renderer Refactoring

## Architecture
- Extracted renderer logic into 9 single-responsibility modules
- Improved import management across renderer pipeline
- Established foundation for incremental refactoring (10-phase plan)

## Documentation
- Added JSDoc documentation for all extracted modules
- Updated project structure in copilot-instructions.md

## Code Quality
- Applied single-responsibility principle to renderer
- Better module organization and dependency management

## Statistics
- 8 files modified, 9 files created
- ~950 lines extracted into modular structure
- renderer.js reduced from 17,960 → ~17,000 lines
- Total refactoring plan: 10 phases over ~5 weeks

> **Status:** ✓ Production Ready | _Minor Release_