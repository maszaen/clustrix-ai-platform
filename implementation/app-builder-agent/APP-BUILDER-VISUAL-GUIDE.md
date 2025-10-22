# App Builder UI - Visual Guide

## 🎨 UI Components Overview

### 1. Projects Page Header
```
┌─────────────────────────────────────────────────────────┐
│  Projects                                    [🎨][🔨]  │
│                                          New    Build   │
│                                         Project  an App │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- "Build an App" button with grid icon (🔨)
- Positioned next to "New Project" button
- Uses `.header-actions` flexbox layout

---

### 2. App Builder Modal - Phase 1: Clarify

```
┌──────────────────────────────────────────────────────────────────┐
│  App Builder                                                  ✕  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ● Clarify ────── ○ Plan ────── ○ Build                       │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  👤 Assistant:                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 👋 Hi! I'm your App Builder assistant...                   │ │
│  │                                                             │ │
│  │ Tell me what you'd like to build:                          │ │
│  │ 1. Clarify requirements                                    │ │
│  │ 2. Create detailed plan                                    │ │
│  │ 3. Execute and build                                       │ │
│  │                                                             │ │
│  │ Try one of these examples:                                 │ │
│  │ ┌─────────────────────────────────────────────────────┐   │ │
│  │ │ Build a todo app with React, localStorage, and... │   │ │
│  │ └─────────────────────────────────────────────────────┘   │ │
│  │ ┌─────────────────────────────────────────────────────┐   │ │
│  │ │ Create a blog with Next.js, Markdown support...    │   │ │
│  │ └─────────────────────────────────────────────────────┘   │ │
│  │ ┌─────────────────────────────────────────────────────┐   │ │
│  │ │ Make an Express API with authentication and...     │   │ │
│  │ └─────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Tell me what you want to build...                    [📤] │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                           [⚙️]  │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Phase indicator at top (Clarify active)
- Welcome message with instructions
- 3 example prompts (clickable buttons)
- Chat input with send button
- Settings gear icon (bottom-right)

---

### 3. Chat Conversation

```
┌──────────────────────────────────────────────────────────────────┐
│  App Builder                                                  ✕  │
├──────────────────────────────────────────────────────────────────┤
│   ● Clarify ────── ○ Plan ────── ○ Build                       │
├──────────────────────────────────────────────────────────────────┤
│  👤 Assistant:                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Hi! What would you like to build?                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                                             👨 You:              │
│                     ┌────────────────────────────────────────┐  │
│                     │ I want a React todo app with dark mode │  │
│                     └────────────────────────────────────────┘  │
│                                                                  │
│  👤 Assistant:                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Great choice! Let me ask a few questions:                  │ │
│  │ 1. Do you want TypeScript or JavaScript?                   │ │
│  │ 2. Should tasks persist (localStorage)?                    │ │
│  │ 3. Any additional features? (search, filters, etc.)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Your message...                                      [📤] │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- User messages: right-aligned, blue background
- Assistant messages: left-aligned, gray background
- Auto-scroll to latest message
- Markdown rendering in messages
- Streaming text support

---

### 4. App Builder Modal - Phase 2: Plan Preview

```
┌──────────────────────────────────────────────────────────────────┐
│  App Builder                                                  ✕  │
├──────────────────────────────────────────────────────────────────┤
│   ✓ Clarify ────── ● Plan ────── ○ Build                       │
├──────────────────────────────────────────────────────────────────┤
│  📋 React Todo App           [Edit Plan] [✅ Approve & Build]   │
│                                                                  │
│  Project Info:                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ {                                                           │ │
│  │   "name": "react-todo-app",                                │ │
│  │   "description": "Todo app with dark mode",                │ │
│  │   "techStack": ["React", "CSS", "localStorage"]            │ │
│  │ }                                                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Directories to Create:                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ src                                                         │ │
│  │ src/components                                              │ │
│  │ public                                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Files to Create (5):                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ src/App.js                                                  │ │
│  │ src/components/TodoList.js                                  │ │
│  │ src/components/TodoItem.js                                  │ │
│  │ src/App.css                                                 │ │
│  │ package.json                                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Commands to Run (2):                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ npm install react react-dom                                │ │
│  │ npm start                                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Clarify phase marked completed (✓)
- Plan phase active (●)
- Project name as header
- Edit Plan button (returns to chat)
- Approve & Build button (starts execution)
- Collapsible plan sections:
  - Project Info (JSON)
  - Directories list
  - Files list with paths
  - Commands list

---

### 5. App Builder Modal - Phase 3: Build Progress

```
┌──────────────────────────────────────────────────────────────────┐
│  App Builder                                                  ✕  │
├──────────────────────────────────────────────────────────────────┤
│   ✓ Clarify ────── ✓ Plan ────── ● Build                       │
├──────────────────────────────────────────────────────────────────┤
│  🚀 Building...                                                  │
│  5/12 steps • 4 succeeded • 1 failed                            │
│                                                                  │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░  42%                                   │
│                                                                  │
│  Current Phase: Creating files...                                │
│                                                                  │
│  Build Logs:                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ Created directory: src                                   │ │
│  │ ✅ Created directory: src/components                        │ │
│  │ ✅ Created directory: public                                │ │
│  │ ✅ Created file: src/App.js                                 │ │
│  │ ✅ Created file: src/components/TodoList.js                 │ │
│  │ ⚠️  Skipped: src/components/TodoItem.js (already exists)   │ │
│  │ 🔄 Creating file: src/App.css...                           │ │
│  │                                                             │ │
│  │                                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                                      [Cancel Build] [Done]      │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Both Clarify and Plan phases completed (✓)
- Build phase active (●)
- Progress stats: steps / succeeded / failed
- Animated progress bar (0-100%)
- Current phase name
- Real-time scrolling log viewer
  - Success logs in green (✅)
  - Error logs in red (❌)
  - Info logs in default color (🔄)
- Cancel Build button
- Done button (appears when complete)

---

### 6. Settings Panel

```
┌────────────────────────────────┐
│  ⚙️ Settings                  │
├────────────────────────────────┤
│  Workspace Path:               │
│  ┌──────────────────┬────────┐ │
│  │ C:\Projects\...  │ Browse │ │
│  └──────────────────┴────────┘ │
│  Where files will be created   │
│                                │
│  Max Requests:                 │
│  ┌──────────────────────────┐ │
│  │ ──────●───────── 50      │ │
│  └──────────────────────────┘ │
│  10                       200  │
│                                │
│  ☑ Auto-approve all actions    │
│  Skip confirmation prompts     │
└────────────────────────────────┘
```

**Features:**
- Workspace path input with Browse button
- Max requests slider (10-200)
- Auto-approve checkbox
- Hint text under each setting
- Floating panel (bottom-right)
- Closes when clicking outside

---

## 🎨 Color Scheme

### Light Theme
```css
--bg: #ffffff
--bg-secondary: #f5f5f5
--bg-tertiary: #eeeeee
--border: #e0e0e0
--text: #333333
--text-secondary: #666666
--text-tertiary: #999999
--primary: #007acc (blue)
--primary-dark: #005a9e
--primary-light: rgba(0, 122, 204, 0.1)
--success: #28a745 (green)
--danger: #dc3545 (red)
```

### Dark Theme
```css
--bg: #1e1e1e
--bg-secondary: #252526
--bg-tertiary: #2d2d30
--border: #3e3e42
--text: #cccccc
--text-secondary: #999999
--text-tertiary: #666666
--primary: #0e639c
--primary-dark: #0a4a73
--primary-light: rgba(14, 99, 156, 0.2)
--success: #4ec9b0
--danger: #f48771
```

---

## 🖱️ Interactive Elements

### Hover States
```
Button (normal):    [  Edit Plan  ]
Button (hover):     [  Edit Plan  ] ← slightly lifted (translateY(-1px))

Example Prompt (normal):  ┌─────────────────────┐
                          │ Build a todo app... │
                          └─────────────────────┘

Example Prompt (hover):   ┌─────────────────────┐
                          │ Build a todo app... │ ← border-color: primary
                          └─────────────────────┘
```

### Active States
```
Phase Step (inactive):  ○ Plan
Phase Step (active):    ● Plan ← primary color with glow
Phase Step (completed): ✓ Plan ← success color
```

### Animations
```
Modal Open:
  Opacity: 0 → 1 (200ms)
  Transform: translateY(20px) → translateY(0) (300ms)

Progress Bar:
  Width: 0% → 42% (smooth transition, 300ms)

Phase Transition:
  Icon transform and color change (300ms ease)
```

---

## 📱 Responsive Breakpoints

### Desktop (1200px+)
```
Modal: 90% width, max 1200px
Height: 85vh, max 900px
All features visible
```

### Tablet (768px - 1199px)
```
Modal: 95% width
Height: 90vh
Settings panel repositioned
```

### Mobile (< 768px)
```
Modal: 100% width
Full-screen height
Settings panel full-width
Compact spacing
```

---

## 🔤 Typography

### Font Families
```css
--font-sans: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif
--font-mono: 'Consolas', 'Monaco', 'Courier New', monospace
```

### Font Sizes
```css
Modal Title:      24px (bold)
Section Headers:  20px (semibold)
Subsections:      15px (medium)
Body Text:        14px (regular)
Input Text:       14px (regular)
Hints:            13px (light)
Code Blocks:      13px (monospace)
Logs:             12px (monospace)
Tiny Text:        11px (light)
```

---

## 🎭 Icon Usage

```
✕   Close button
⚙️   Settings toggle
📤  Send message
🔨  Build an App button
👋  Welcome message
👤  Assistant avatar
👨  User avatar
✓   Completed phase
●   Active phase
○   Inactive phase
✅  Success log
❌  Error log
⚠️   Warning log
🔄  Info log
📋  Plan preview header
🚀  Build progress header
```

---

## 📐 Layout Measurements

### Modal
```
Width: 90vw (max: 1200px)
Height: 85vh (max: 900px)
Border Radius: 12px
Shadow: 0 20px 60px rgba(0,0,0,0.3)
```

### Phase Indicator
```
Step Icon: 48px × 48px (circle)
Connector: 2px height
Padding: 20px vertical, 28px horizontal
```

### Chat Interface
```
Message Bubble Padding: 12px × 16px
Message Gap: 16px
Max Width: 80% (of container)
Input Padding: 12px
Send Button: 44px × 44px
```

### Progress Bar
```
Container Height: 8px
Bar Border Radius: 4px
Transition: 300ms ease
```

### Settings Panel
```
Width: 320px
Padding: 20px
Border Radius: 8px
Shadow: 0 8px 24px rgba(0,0,0,0.2)
```

---

## 🧩 Component Hierarchy

```
.app-builder-modal (overlay)
└── .app-builder-container (modal box)
    ├── .app-builder-header
    │   ├── h2 (title)
    │   └── .close-btn
    ├── .app-builder-content
    │   ├── .builder-phase-indicator
    │   │   ├── .phase-step (Clarify)
    │   │   ├── .phase-connector
    │   │   ├── .phase-step (Plan)
    │   │   ├── .phase-connector
    │   │   └── .phase-step (Build)
    │   ├── .builder-chat-container
    │   │   ├── .builder-messages
    │   │   │   └── .builder-message[.assistant|.user]
    │   │   │       └── .message-content
    │   │   └── .builder-input-container
    │   │       ├── textarea
    │   │       └── .send-btn
    │   ├── .builder-plan-container
    │   │   ├── .plan-header
    │   │   └── .plan-section[s]
    │   │       ├── h4
    │   │       └── .code-block | .file-list | .command-list
    │   └── .builder-progress-container
    │       ├── .progress-header
    │       ├── .progress-bar-container
    │       │   └── .progress-bar
    │       ├── .progress-phase
    │       ├── .progress-logs
    │       │   └── .progress-log-entry[.success|.error]
    │       └── .progress-actions
    └── .builder-settings
        ├── .settings-toggle
        └── .settings-panel
            └── .setting-item[s]
```

---

## 🎬 Animation Timeline

### Modal Opening (0-500ms)
```
0ms:    Modal display: block
0-200ms: Opacity 0 → 1 (fadeIn)
0-300ms: TranslateY 20px → 0 (slideUp)
300ms:  Focus input field
500ms:  Animation complete
```

### Phase Transition (0-300ms)
```
0ms:    Update phase state
0-50ms:  Hide current container
50ms:   Update phase indicator classes
50-350ms: Icon color/shadow transition
100ms:  Show new container
350ms:  Transition complete
```

### Progress Update (0-300ms)
```
0ms:    Receive progress data
0-100ms: Update progress bar width
50ms:   Append log entry
100ms:  Scroll logs to bottom
300ms:  Update complete
```

---

**Visual guide complete! Refer to this for understanding the UI structure and behavior. 🎨**
