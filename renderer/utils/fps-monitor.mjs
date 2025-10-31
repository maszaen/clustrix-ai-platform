/**
 * FPS Monitor Utility
 * Tracks frames per second in the renderer process
 */

// Toggle FPS monitoring on/off
export const MONITORING_ENABLED = false;

export class FPSMonitor {
    constructor() {
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.isRunning = false;
        this.animationFrameId = null;
        this.callbacks = new Set();
    }

    /**
     * Update FPS calculation
     */
    update() {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        this.frameCount++;

        // Calculate FPS every second
        if (currentTime >= this.lastTime + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;

            // Notify all callbacks
            this.callbacks.forEach(callback => {
                try {
                    callback(this.fps);
                } catch (error) {
                    console.error('[FPSMonitor] Callback error:', error);
                }
            });
        }

        this.animationFrameId = requestAnimationFrame(() => this.update());
    }

    /**
     * Start monitoring FPS
     */
    start() {
        if (!MONITORING_ENABLED) {
            console.log('[FPSMonitor] Monitoring is disabled');
            return;
        }

        if (this.isRunning) {
            console.warn('[FPSMonitor] Already running');
            return;
        }

        console.log('[FPSMonitor] Starting FPS monitoring...');
        this.isRunning = true;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.update();
    }

    /**
     * Stop monitoring FPS
     */
    stop() {
        if (!this.isRunning) return;

        console.log('[FPSMonitor] Stopping FPS monitoring...');
        this.isRunning = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        this.fps = 0;
        this.frameCount = 0;
    }

    /**
     * Subscribe to FPS updates
     * @param {Function} callback - Called with FPS value every second
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    /**
     * Get current FPS
     */
    getCurrentFPS() {
        return this.fps;
    }

    /**
     * Get renderer process memory info (Chrome only)
     */
    getMemoryInfo() {
        if (performance.memory) {
            return {
                usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2), // MB
                totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2), // MB
                jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2), // MB
            };
        }
        return null;
    }
}

// Create singleton instance
export const fpsMonitor = new FPSMonitor();
