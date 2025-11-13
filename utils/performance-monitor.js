/**
 * Performance Monitoring Utility
 * Monitors CPU, GPU, RAM usage for the application
 */

const os = require('os');
const { app } = require('electron');

// Toggle monitoring on/off
const MONITORING_ENABLED = true;

class PerformanceMonitor {
    constructor() {
        this.previousCPUUsage = null;
        this.previousTime = null;
        this.updateInterval = null;
        this.cachedGPUInfo = null;
        this.gpuInfoCacheTime = 0;
        this.GPU_CACHE_DURATION = 30000; // Cache GPU info for 30 seconds
    }

    /**
     * Get process-specific CPU usage percentage
     */
    getProcessCPUUsage() {
        const currentUsage = process.cpuUsage();
        const currentTime = Date.now();

        if (!this.previousCPUUsage || !this.previousTime) {
            // First call, store values and return 0
            this.previousCPUUsage = currentUsage;
            this.previousTime = currentTime;
            return {
                usage: '0.0',
                cores: os.cpus().length
            };
        }

        // Calculate CPU usage since last call
        const userDiff = currentUsage.user - this.previousCPUUsage.user;
        const systemDiff = currentUsage.system - this.previousCPUUsage.system;
        const timeDiff = (currentTime - this.previousTime) * 1000; // Convert to microseconds

        // Total CPU time used by this process
        const totalCPUTime = userDiff + systemDiff;
        
        // Calculate percentage (divide by number of cores for accurate percentage)
        const cpuPercent = (totalCPUTime / timeDiff) * 100;

        // Store current values for next calculation
        this.previousCPUUsage = currentUsage;
        this.previousTime = currentTime;

        return {
            usage: cpuPercent.toFixed(1),
            cores: os.cpus().length
        };
    }

    /**
     * Get RAM usage
     */
    getRAMUsage() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usagePercent = (usedMem / totalMem) * 100;

        return {
            total: (totalMem / 1024 / 1024 / 1024).toFixed(2), // GB
            used: (usedMem / 1024 / 1024 / 1024).toFixed(2), // GB
            free: (freeMem / 1024 / 1024 / 1024).toFixed(2), // GB
            usagePercent: usagePercent.toFixed(1)
        };
    }

    /**
     * Get process-specific memory usage
     */
    getProcessMemory() {
        const memoryUsage = process.memoryUsage();

        return {
            rss: (memoryUsage.rss / 1024 / 1024).toFixed(2), // MB
            heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2), // MB
            heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2), // MB
            external: (memoryUsage.external / 1024 / 1024).toFixed(2) // MB
        };
    }

    /**
     * Get GPU information (basic info from Chromium)
     * Cached for 30 seconds to avoid performance hit
     */
    async getGPUInfo() {
        const now = Date.now();

        // Return cached value if still valid
        if (this.cachedGPUInfo && (now - this.gpuInfoCacheTime) < this.GPU_CACHE_DURATION) {
            return this.cachedGPUInfo;
        }

        try {
            // Electron's app.getGPUFeatureStatus() provides GPU details
            const gpuInfo = await app.getGPUFeatureStatus();

            this.cachedGPUInfo = {
                available: true,
                features: gpuInfo
            };
            this.gpuInfoCacheTime = now;

            return this.cachedGPUInfo;
        } catch (error) {
            this.cachedGPUInfo = {
                available: false,
                error: error.message
            };
            this.gpuInfoCacheTime = now;

            return this.cachedGPUInfo;
        }
    }

    /**
     * Get all metrics at once
     */
    async getAllMetrics() {
        if (!MONITORING_ENABLED) {
            return { enabled: false };
        }

        const cpu = this.getProcessCPUUsage();
        const processMemory = this.getProcessMemory();

        return {
            enabled: true,
            timestamp: Date.now(),
            cpu,
            processMemory
        };
    }

    /**
     * Start continuous monitoring
     * @param {Function} callback - Called with metrics every interval
     * @param {Number} interval - Update interval in ms (default: 2000)
     */
    startMonitoring(callback, interval = 2000) {
        if (!MONITORING_ENABLED) {
            console.log('[PerformanceMonitor] Monitoring is disabled');
            return;
        }

        if (this.updateInterval) {
            this.stopMonitoring();
        }

        console.log('[PerformanceMonitor] Starting monitoring...');

        this.updateInterval = setInterval(async () => {
            const metrics = await this.getAllMetrics();
            callback(metrics);
        }, interval);

        // Send initial metrics immediately
        this.getAllMetrics().then(callback);
    }

    /**
     * Stop continuous monitoring
     */
    stopMonitoring() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[PerformanceMonitor] Monitoring stopped');
        }
    }
}

module.exports = { PerformanceMonitor, MONITORING_ENABLED };
