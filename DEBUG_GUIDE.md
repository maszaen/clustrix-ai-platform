# Debug Script untuk Session Menu Dropdown

## 🚀 Cara Pakai

### Step 1: Buka Console Browser
- Tekan `F12` atau `Ctrl+Shift+I`
- Pilih tab **"Console"**

### Step 2: Copy-Paste Debug Script
Copy seluruh code dari file `debug/session-menu-debug.js` dan paste ke console, lalu tekan Enter.

Atau bisa copy langsung dari sini:

```javascript
/**
 * Debug Script untuk Session Menu Dropdown
 * [Paste entire debug script here]
 */
```

### Step 3: Script akan Load dan Show Commands
Setelah paste, Anda akan lihat:
```
✓ Debug script loaded!
Available commands:
  showSessionMenuLogs() - Lihat semua logs
  clearSessionMenuLogs() - Clear logs
  exportSessionMenuLogs() - Export as JSON
  window.debugSessionMenu.eventLog - Raw event log array
```

### Step 4: Test Dropdown dan Capture Logs

**Test Case 1: Hover pada button**
1. Di aplikasi, hover mouse pada session menu button (3 dots)
2. Lihat di console - akan show `MOUSEOVER` events

**Test Case 2: Buka dropdown**
1. Click session menu button
2. Di console akan show `CLICK (session-menu-btn)` dengan `OPEN_MENU`

**Test Case 3: Move mouse ke dropdown**
1. Dropdown sudah open
2. Move mouse perlahan ke menu items
3. Lihat `MOUSEOVER` pada dropdown items

**Test Case 4: Move mouse keluar button (PENTING!)**
1. Dropdown sudah open
2. Move mouse dari button ke dropdown
3. **LIHAT LOGS DI CONSOLE** - akan show apa yang terjadi

**Test Case 5: Move mouse keluar container**
1. Dropdown sudah open
2. Move mouse keluar dari seluruh menu (button + dropdown)
3. **LIHAT LOGS DI CONSOLE** - akan show `MOUSEOUT` dan action yang terjadi

### Step 5: Lihat Hasil Logs

Setelah melakukan test, jalankan command di console:

```javascript
showSessionMenuLogs()
```

Akan muncul tabel dengan semua events:
- timestamp
- eventType (MOUSEOUT, MOUSELEAVE, CLICK, dll)
- details (targetClass, relatedTargetClass, action, dll)
- sessionMenuContainers (jumlah container)
- openDropdowns (jumlah dropdown yang open)

### Step 6: Export Logs untuk Share

Jalankan command:
```javascript
exportSessionMenuLogs()
```

Akan return JSON string yang bisa di-copy-paste dan dikirim.

Atau langsung lihat raw array:
```javascript
console.table(window.debugSessionMenu.eventLog)
```

---

## 📊 Expected Log Output

### Saat mouseleave dari button (MASALAH):
```
[HH:MM:SS.mmm] MOUSEOUT (on session-menu-container)
  targetClass: session-menu-btn
  relatedTargetClass: session-menu-dropdown
  menuContainerContainsRelated: true
  
  → STAYING IN CONTAINER (dropdown tetap terbuka)
    action: KEEP_OPEN
    reason: relatedTarget still inside container
```

### Saat mouseleave dari container (CORRECT):
```
[HH:MM:SS.mmm] MOUSEOUT (on session-menu-container)
  targetClass: session-menu-dropdown
  relatedTargetClass: project-session-item
  menuContainerContainsRelated: false
  
  → LEAVING CONTAINER (dropdown akan ditutup)
    action: CLOSE
    reason: relatedTarget outside container
```

---

## 🔍 Apa yang Di-Track

### Events:
- **MOUSEOUT** - Fired when mouse leaves element or child
- **MOUSELEAVE** - Fired only when mouse leaves element (no bubbling)
- **MOUSEENTER** - Fired when mouse enters element
- **MOUSEOVER** - Fired when mouse enters element or child
- **CLICK** - Fired when element clicked

### Details yang Dicatat:
- `targetClass` - CSS class dari element yang trigger event
- `targetTag` - HTML tag dari element
- `relatedTargetClass` - CSS class dari element yang mouse masuk/keluar
- `relatedTargetTag` - HTML tag dari relatedTarget
- `menuContainerContainsRelated` - Apakah relatedTarget masih dalam container
- `dropdownOpen` - Apakah dropdown sedang open saat event
- `action` - Apa yang akan terjadi (OPEN_MENU, CLOSE_MENU, KEEP_OPEN, dll)

---

## 💾 Cara Share Logs

### Option 1: Copy dari Console
1. Run `exportSessionMenuLogs()`
2. Copy output JSON
3. Paste ke file atau share

### Option 2: Direct Copy
```javascript
JSON.stringify(window.debugSessionMenu.eventLog, null, 2)
```

### Option 3: Screenshot Console
Print screen tab console dan share image

---

## 🎯 Kegunaan Debug

Logs ini akan jelas menunjukkan:

1. **Urutan events** yang terjadi
2. **Target element** yang trigger event
3. **RelatedTarget** (element yang mouse pergi/masuk)
4. **Apakah event logic bekerja** (KEEP_OPEN vs CLOSE)
5. **Timing** kapan event terjadi

Dengan data ini, kita bisa lihat:
- ✅ Apakah mouseout event tertrigger?
- ✅ Apakah relatedTarget correct?
- ✅ Apakah dropdown state updated?
- ✅ Apakah ada event lain yang interfere?

---

## 📝 Contoh Session Lengkap

```javascript
// 1. Hover button
[10:30:45.123] MOUSEOVER (session-menu-btn)

// 2. Click button  
[10:30:46.456] CLICK (session-menu-btn)
  action: OPEN_MENU

// 3. Move ke dropdown
[10:30:46.789] MOUSELEAVE (on session-menu-container)
[10:30:46.801] MOUSEOVER (session-menu-dropdown)

// 4. Move dari button ke dropdown (THIS IS THE ISSUE)
[10:30:47.123] MOUSEOUT (on session-menu-container)
  targetClass: session-menu-btn
  relatedTargetClass: session-menu-dropdown
  menuContainerContainsRelated: true
  → STAYING IN CONTAINER (dropdown tetap terbuka) ✓

// 5. Move ke menu item
[10:30:47.456] MOUSEOVER (session-menu-dropdown)

// 6. Move keluar dari container (CLOSING)
[10:30:48.789] MOUSEOUT (on session-menu-container)
  targetClass: session-menu-item
  relatedTargetClass: project-session-item
  menuContainerContainsRelated: false
  → LEAVING CONTAINER (dropdown akan ditutup) ✓
```

---

Sudah siap untuk debug! Lakukan test-test di atas dan share logs-nya 🚀
