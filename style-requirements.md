# Clustrix AI - Style Requirements & Design System

## Overview
Dokumen ini menjelaskan sistem desain, pola styling, dan requirements untuk styling aplikasi Clustrix AI berdasarkan analisis mendalam dari `renderer/style.css`.

---

## 1. Typography System

### Font Families
Aplikasi menggunakan sistem font yang beragam untuk berbagai konteks:

- **Default (Sans-serif)**: `Capricorn-USR-Text.woff2` - Font utama untuk UI
- **AI Text**: `Capricorn-AI-Text-Bold-2.woff2` - Khusus untuk pesan AI
- **AI Text Bold**: `AnthropicSerif-AI-Text-Bold.woff2` - Bold variant untuk AI text dengan optical sizing
- **Mono**: `ClaudeCode.woff2` - Font monospace untuk code blocks
- **Display**: `Capricorn-Display.woff2` - Font display untuk headings
- **Display Italic**: `Capricorn-Display-Italic.woff2` - Italic variant
- **Classic**: `Newsreader.woff2` - Font klasik untuk konten tertentu
- **Emoji**: `NotoColorEmoji-Regular.ttf` - Emoji support

### Font Stacks (CSS Variables)
```css
--font-sans: 'Default', 'Emoji', 'Apple Color Emoji', [system fallbacks]
--font-ai: 'AI_Text', 'Emoji', [system fallbacks]
--font-ai-bold: 'AI_Text_Bold', 'Emoji', [system fallbacks]
--font-classic: 'Classic', 'Emoji', [system fallbacks]
--font-mono: 'Mono', 'Emoji', [system fallbacks]
--font-display: 'Display', 'Emoji', [system fallbacks]
--font-display-italic: 'Display_Italic', 'Emoji', [system fallbacks]
```

### Font Weights
- `--font-bold: 600`
- `--font-normal: 350`

### Base Typography
- **Body font size**: 15px
- **Line height**: 1.5
- **Font smoothing**: Antialiased (webkit & moz)

---

## 2. Spacing System

Sistem spacing menggunakan skala konsisten:

```css
--spacing-xs: 4px
--spacing-2xs: 6px
--spacing-sm: 8px
--spacing-md: 10px
--spacing-lg: 16px
--spacing-xl: 20px
--spacing-2xl: 24px
```

**Prinsip penggunaan:**
- XS/2XS: Padding internal kecil, gaps minimal
- SM: Padding button, gaps antar elemen kecil
- MD: Padding standar container
- LG: Padding section, gaps antar komponen
- XL/2XL: Margin besar, spacing antar section

---

## 3. Border Radius System

```css
--radius-sm: 6px    /* Input fields, small buttons */
--radius-md: 8px    /* Cards, medium components */
--radius-lg: 12px   /* Modals, large containers */
--radius-xl: 16px   /* Hero sections */
--radius-2xl: 19px  /* Special large components */
--radius-full: 9999px /* Pills, circular buttons */
```

**Pola penggunaan:**
- Buttons: `--radius-full` (30px rounded)
- Cards/Modals: `--radius-lg` atau `--radius-xl`
- Input fields: `--radius-sm` atau `--radius-md`
- Icons: `--radius-md` atau `--radius-full`

---

## 4. Animation & Transitions

### Timing Functions
```css
--transition-fast: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)
--transition-medium: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
--transition-slow: all 0.5s cubic-bezier(0.4, 0, 0.2, 1)
--bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### Keyframe Animations
- **slideUp**: Fade in + translate up + scale (0.2s bounce)
- **slideDown**: Fade out + translate down + scale (0.2s ease-out)
- **spin**: Rotating animation untuk loading spinners (0.5s linear infinite)

### Hover Effects
- **Transform**: `translateY(-1px)` untuk lift effect
- **Scale**: `scale(1.1)` untuk emphasis
- **Box shadow**: Glow effects dengan primary color

---

## 5. Shadow System

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 2px 15px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)
```

**Penggunaan:**
- SM: Subtle elevation untuk cards
- MD: Dropdown menus, tooltips
- LG: Modals, popovers
- XL: Settings menu, major overlays

---

## 6. Color System (CSS Variables)

### Semantic Colors
Aplikasi menggunakan CSS variables untuk theming (light/dark mode support):

**Background Colors:**
- `--bg`: Background utama
- `--bg-secondary`: Background sidebar/secondary areas
- `--hover-bg`: Background saat hover
- `--hover-bg-secondary`: Secondary hover state
- `--input-bg`: Background input fields
- `--surface`: Surface untuk cards/modals

**Foreground Colors:**
- `--fg`: Text color utama
- `--fg-muted`: Text color secondary/muted
- `--fg-death`: Text color sangat muted (date separators)
- `--icon`: Icon color

**Brand Colors:**
- `--primary`: Primary brand color
- `--primary-light`: Light variant untuk backgrounds
- `--primary-light-hover`: Hover state untuk primary light
- `--primary-light-user`: User-specific primary variant
- `--accent`: Accent color untuk highlights

**Interactive Colors:**
- `--link`: Link color
- `--link-hover`: Link hover state
- `--border`: Border color standar
- `--border-light`: Light border variant
- `--border-input`: Input border color

**Selection Colors:**
- `--purple-sel-bg`: Purple selection background (code blocks)
- `--purple-sel`: Purple selection text

---

## 7. Component Patterns

### Buttons

#### Primary Button
```css
.primary-btn {
  background: transparent;
  color: var(--primary);
  border: none;
  padding: var(--spacing-xs) var(--spacing-lg);
  border-radius: 30px;
  height: 40px;
  font-weight: var(--font-bold);
  transition: var(--transition-fast);
}
```
- Hover: Background `--primary-light`, lift effect
- Active: Remove lift effect

#### Primary Button Reversed
- Default: `background: var(--primary-light)`
- Hover: `background: transparent`

#### Icon Button
```css
.icon-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: var(--spacing-xs);
  border-radius: var(--radius-md);
  height: 30px;
  width: 30px;
}
```

#### Icon Button 2 (dengan label)
- Circular icon dengan background accent
- Label text di sebelah kanan
- Hover: Scale effect + glow shadow
- Active state: Primary light background

### Links (AI Messages)
```css
.message.ai a {
  font-size: 11px;
  color: var(--link-hover);
  border: 1px solid var(--border);
  background: var(--hover-bg);
  padding: 0px 7px;
  border-radius: var(--radius-sm);
  max-width: 320px;
  text-overflow: ellipsis;
}
```
- Hover: Primary light background + primary border
- Transform: `translateY(-1px)`

### Menu Items
```css
.menu-item {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 14px;
}
```
- Hover: `background: var(--hover-bg)`

---

## 8. Layout Patterns

### App Structure
```
#app (flex container, height: 100vh)
├── .sidebar (fixed, 260px width)
│   ├── .sidebar-header
│   ├── .sessions-container (flex: 1, overflow-y: auto)
│   └── .sidebar-footer
└── .chat-area (margin-left: 260px)
```

### Sidebar Collapsed State
- Width: 64px
- Chat area: `margin-left: 64px`, `width: calc(100% - 64px)`
- Hide text labels, show only icons

### Flexbox Utilities
- `.row-between`: Space-between layout
- `.row-gap`: Row dengan gap spacing-sm
- `.row-gap-0`: Row dengan gap 4px
- `.row-center`: Row dengan vertical center alignment
- `.col-center`: Column dengan center alignment

---

## 9. Scrollbar Styling

### Custom Scrollbar
```css
--scrollbar-size: 2px
--scrollbar-thumb: var(--border-input, #8181811f)
--scrollbar-thumb-hover: var(--fg-muted, #090909ff)
--scrollbar-track: transparent
```

**Firefox:**
- `scrollbar-width: thin`
- `scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)`

**Chromium/Safari:**
- Width/height: 2px
- Thumb: Border-input color, rounded
- Track: Transparent
- Hover: Fg-muted color

---

## 10. Special Components

### Loading Overlay
```css
.loading-overlay {
  position: fixed;
  backdrop-filter: blur(20px);
  z-index: 99999;
  background: transparent;
}
```
- States: default, `.unblur`, `.hidden`
- Smooth blur transition untuk loading experience

### Session List
- Sticky date separators dengan gradient background
- Hover effects: Show action buttons dengan opacity transition
- Active state: Primary light background
- Text mask untuk fade effect saat hover

### Settings Menu
- Absolute positioning dari bottom sidebar
- Slide up animation dengan bounce easing
- Shadow XL untuk depth
- Closing animation dengan slide down

### Search Box
- Icon positioned absolute di kiri
- Input padding-left: 46px untuk space icon
- Focus: No outline (custom styling)

---

## 11. Typography Hierarchy

### AI Messages
- Strong text: `font-family: var(--font-ai-bold)`, `letter-spacing: 0.03em`
- Em text: `margin-right: 3px`
- List items: `position: relative`, `z-index: 5`

### Headings & Separators
- Date separator: 12px, uppercase, sticky positioning
- Help text: 12px, muted color, padding-left: 6px

### Code Blocks
- Font: `var(--font-mono)`
- Selection: Purple variant colors
- Language name: User-select none

---

## 12. Responsive & Accessibility

### User Selection
- Default: Disabled (`user-select: none`)
- Enabled untuk:
  - `.chat-log-container` dan children
  - Input fields
  - Code blocks

### Smooth Scrolling
- Default: `scroll-behavior: smooth`
- Disabled saat session switching (`.session-switching *`)

### Font Display
- Semua fonts: `font-display: swap` untuk performance

---

## 13. Blockquote Styling

```css
--quote-indent: 14px
--quote-pillar-w: 3px
--quote-pillar-left: 10px
```

---

## 14. Z-Index Hierarchy

```
1: Base elements
5: AI message list items
10: Settings menu, sticky headers
60: Settings menu absolute
70: Gradient overlays
99: Session actions
100: Sidebar
999: Footer gradient
10000: Active session with dropdown
99999: Loading overlay
```

---

## 15. Best Practices & Guidelines

### DO's:
✅ Gunakan CSS variables untuk semua colors
✅ Gunakan spacing system untuk consistency
✅ Gunakan transition variables untuk animations
✅ Implement hover states dengan lift/scale effects
✅ Gunakan border-radius system
✅ Implement proper z-index hierarchy
✅ Gunakan flexbox utilities untuk layout
✅ Implement smooth transitions (0.2s - 0.5s)

### DON'Ts:
❌ Hardcode colors (gunakan CSS variables)
❌ Hardcode spacing values (gunakan spacing system)
❌ Skip hover/active states
❌ Gunakan !important kecuali absolutely necessary
❌ Forget font-smoothing untuk typography
❌ Skip transition animations
❌ Hardcode z-index values tanpa sistem

---

## 16. Theme Support

Aplikasi mendukung light/dark theme melalui CSS variables. Semua colors menggunakan semantic naming (`--bg`, `--fg`, `--primary`, dll.) yang dapat di-override per theme.

### Theme Switcher Component
- Toggle switch dengan slider
- Small variant: 34x20px
- Default: 44x24px
- Smooth transition dengan transform

---

## 17. Performance Optimizations

- `will-change: width` untuk sidebar transitions
- `transform: translateZ(0)` untuk hardware acceleration
- `font-display: swap` untuk font loading
- Minimal repaints dengan transform animations
- Backdrop-filter untuk blur effects (modern browsers)

---

## Kesimpulan

Sistem desain Clustrix AI dibangun dengan prinsip:
1. **Consistency**: Spacing, colors, dan typography menggunakan sistem yang konsisten
2. **Flexibility**: CSS variables memungkinkan theming yang mudah
3. **Performance**: Optimized animations dan transitions
4. **Accessibility**: Proper contrast, font sizing, dan user selection
5. **Modern**: Menggunakan modern CSS features (backdrop-filter, CSS variables, flexbox)

Semua komponen baru harus mengikuti sistem dan pola yang sudah ada untuk menjaga konsistensi visual dan code quality.
