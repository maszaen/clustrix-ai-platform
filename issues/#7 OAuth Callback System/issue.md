# Issue #7: OAuth Callback System

## Problem Statement

OAuth callback system memiliki beberapa masalah critical yang mengganggu user experience:

### 1. Port Conflict (Port 3000)
**Masalah:**
- GitHub OAuth Helper membuat HTTP server sendiri di port 3000
- Port 3000 adalah port yang sangat umum digunakan untuk development (React, Vite, dll)
- Callback sering gagal karena port sudah digunakan aplikasi lain
- Error: `EADDRINUSE: address already in use :::3000`

**Dampak:**
- User tidak bisa login jika port 3000 sudah terpakai
- Harus manual kill process di port 3000
- Pengalaman login yang buruk dan tidak reliable

### 2. Callback URL Not Defined Error
**Masalah:**
- Main.js mencoba parse `req.url` menggunakan module `url`
- Module `url` tidak di-import di main.js
- Error saat GitHub redirect ke callback URL: `ReferenceError: url is not defined`

**Dampak:**
- OAuth callback crash sebelum bisa process authorization code
- User stuck di browser, app tidak terima callback
- Complete OAuth flow failure

### 3. Duplikasi HTTP Server
**Masalah:**
- GitHub OAuth Helper bikin server sendiri di port 3000
- Main.js juga perlu bikin server untuk serve callback HTML
- Dua server untuk satu tujuan (inefficient)
- Callback HTML tidak custom, hanya text biasa

**Dampak:**
- Resource waste (2 HTTP servers)
- Sulit maintain dan sync behavior
- Callback page jelek (plain text "You can close this window")

### 4. Browser Tab Auto-Close Tidak Berfungsi
**Masalah:**
- Callback HTML mencoba `window.close()` tapi tidak berfungsi
- Browser security: `window.close()` hanya bisa close window yang dibuka via `window.open()`
- Tab dibuka oleh GitHub redirect, bukan dari JavaScript kita
- User harus manual close tab setelah OAuth

**Dampak:**
- User bingung, tab tetap terbuka
- Harus manual close tab
- Countdown "closing in 3 seconds" tidak berguna

### 5. Logout UX Buruk
**Masalah:**
- Klik logout langsung close modal tanpa feedback
- Loading state hanya muncul sebentar di full overlay
- Button logout tidak disabled, bisa di-spam
- Modal close sebelum user tau apa yang terjadi

**Dampak:**
- User bingung apakah logout berhasil atau tidak
- Bisa spam click logout button
- UX yang tidak smooth

## Latar Belakang

### Arsitektur Awal
Sistem OAuth awalnya menggunakan pattern dimana setiap OAuth helper (GitHub, Google) membuat HTTP server sendiri:

```
User clicks login
    ↓
GitHub OAuth Helper:
  - Creates HTTP server on port 3000
  - Opens browser to GitHub OAuth
  - Waits for callback at localhost:3000/oauth/callback
    ↓
GitHub redirects to localhost:3000
    ↓
Server receives code, exchanges for token
    ↓
Server serves plain HTML "You can close this window"
    ↓
Server closes itself
```

**Masalah dengan pattern ini:**
1. Setiap OAuth provider butuh port sendiri (port conflict)
2. Server creation/teardown berulang-ulang (inefficient)
3. Tidak bisa customize callback page (hardcoded HTML string)
4. Sulit track state dan debug

### Why Port 2920?
Port dipilih berdasarkan kriteria:
- ✅ Not common development port (avoid conflicts)
- ✅ Not system/reserved port (>1024)
- ✅ Not common service port (avoid 3000, 8080, 5000, etc)
- ✅ Easy to remember (2920)

### OAuth Flow Requirements
1. **Security**: Callback URL must match registered URL di OAuth provider
2. **User Experience**: Seamless flow tanpa manual intervention
3. **Reliability**: Harus work consistently across different environments
4. **Maintainability**: Single source of truth untuk callback handling

## User Requirements

1. ✅ Callback URL harus reliable (no port conflicts)
2. ✅ Callback page harus professional (custom HTML)
3. ✅ Tab auto-close jika possible, fallback ke manual
4. ✅ App auto-restart setelah login sukses
5. ✅ Logout harus ada loading state yang jelas
6. ✅ No spam clicks pada buttons

## Technical Context

**Stack:**
- Electron main process (Node.js)
- HTTP server (native `http` module)
- GitHub OAuth App (registered callback URL)
- Browser-based OAuth flow

**Constraints:**
- Cannot use `window.open()` for OAuth (security/UX)
- Must use native browser for OAuth (Electron BrowserWindow has issues)
- GitHub callback URL must be pre-registered
- App needs restart to switch database (internal ↔ cloud)

**Related Files:**
- `main.js` - Main process, HTTP server
- `backend/github-oauth-helper.js` - GitHub OAuth logic
- `callback/index.html` - OAuth callback page
- `renderer/renderer.js` - Login/logout UI handlers
