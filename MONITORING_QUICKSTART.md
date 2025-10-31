# Performance Monitoring - Quick Start Guide

Cara cepat menggunakan performance monitoring di Clustrix AI Platform.

## Cara Mengaktifkan Monitoring

### 1. Buka DevTools Console
- Windows/Linux: `Ctrl + Shift + I`
- Mac: `Cmd + Option + I`

### 2. Jalankan Perintah

```javascript
// Start monitoring
window.DEBUG.startMonitoring()
```

Monitoring panel akan muncul di pojok kanan bawah dengan metrics real-time:
- **FPS**: Frame rate (target 60 FPS)
- **CPU**: CPU usage percentage
- **RAM**: Memory yang digunakan
- **Heap**: JavaScript heap memory

### 3. Stop Monitoring

```javascript
// Stop monitoring
window.DEBUG.stopMonitoring()
```

Atau klik tombol **×** di panel monitoring.

## Toggle On/Off (Hardcoded)

### Backend Monitoring
File: `utils/performance-monitor.js`
```javascript
const MONITORING_ENABLED = true; // ubah ke false untuk disable
```

### Frontend FPS Monitor
File: `renderer/utils/fps-monitor.mjs`
```javascript
export const MONITORING_ENABLED = true; // ubah ke false untuk disable
```

### Frontend UI
File: `renderer/utils/monitoring-ui.mjs`
```javascript
export const MONITORING_ENABLED = true; // ubah ke false untuk disable
```

## Interpretasi Metrics

### FPS (Frames Per Second)
- 🟢 **55-60**: Sangat smooth, performa optimal
- 🟡 **30-54**: Acceptable, ada sedikit lag
- 🔴 **<30**: Laggy, perlu optimasi

### CPU Usage
- 🟢 **<50%**: Normal operation
- 🟡 **50-79%**: High load, masih aman
- 🔴 **≥80%**: Very high load, bisa bottleneck

### RAM Usage
- 🟢 **<60%**: Plenty of memory
- 🟡 **60-84%**: Getting full
- 🔴 **≥85%**: Almost full, bisa crash

### Heap Memory
- Menunjukkan memory yang digunakan oleh JavaScript
- Jika terus naik tanpa turun = **memory leak**
- Normal: naik-turun secara periodik (garbage collection)

## Testing Backend Only

Jalankan test script untuk cek apakah backend monitoring bekerja:

```bash
node test-monitoring.js
```

Output expected:
```
✅ All tests completed successfully!
```

## Troubleshooting

### Panel tidak muncul
1. Cek console ada error atau tidak
2. Pastikan semua `MONITORING_ENABLED = true`
3. Coba restart aplikasi

### Metrics tidak update
1. Cek apakah monitoring sudah di-start: `window.DEBUG.startMonitoring()`
2. Cek console log untuk error IPC
3. Restart aplikasi

### FPS selalu 0
1. Pastikan ada aktivitas rendering (bukan idle)
2. Cek `fps-monitor.mjs` MONITORING_ENABLED
3. Coba gerakkan mouse atau scroll

## Kapan Menggunakan Monitoring?

✅ **Gunakan saat:**
- Debugging performance issues
- Testing heavy operations (AI inference, rendering, dll)
- Monitoring resource usage saat development
- Benchmarking optimizations

❌ **Tidak perlu saat:**
- Production release (disable untuk end users)
- Normal usage (overhead ~1-2%)
- Testing functional features (bukan performance)

## File Locations

```
Clustrix-AI-Platform/
├── utils/
│   └── performance-monitor.js      # Backend monitoring
├── renderer/
│   ├── utils/
│   │   ├── fps-monitor.mjs         # FPS tracking
│   │   └── monitoring-ui.mjs       # UI panel
│   ├── index.html                   # CSS styles + container
│   └── renderer.js                  # Integration + DEBUG
├── main.js                          # IPC handlers
├── preload.js                       # API bridge
├── MONITORING.md                    # Full documentation
└── MONITORING_QUICKSTART.md         # This file
```

## Advanced Usage

### Custom Update Interval

```javascript
const { PerformanceMonitor } = require('./utils/performance-monitor');
const monitor = new PerformanceMonitor();

// Update setiap 500ms (default: 1000ms)
monitor.startMonitoring((metrics) => {
  console.log('CPU:', metrics.cpu.usage);
}, 500);
```

### Subscribe to FPS Updates

```javascript
import { fpsMonitor } from './utils/fps-monitor.mjs';

fpsMonitor.subscribe((fps) => {
  console.log('Current FPS:', fps);
});

fpsMonitor.start();
```

### Get Metrics Programmatically

```javascript
// Get metrics once
const metrics = await window.api.monitoring.getMetrics();
console.log('CPU:', metrics.cpu.usage + '%');

// Subscribe to updates
window.api.monitoring.onUpdate((metrics) => {
  console.log('Updated metrics:', metrics);
});
```

## Next Steps

Baca [MONITORING.md](MONITORING.md) untuk dokumentasi lengkap tentang:
- Architecture details
- Metrics structure
- Customization options
- Future enhancements
