/**
 * Monitoring UI Manager
 * Displays real-time performance metrics in #monitoring-container
 */

import { fpsMonitor, MONITORING_ENABLED as FPS_MONITORING_ENABLED } from './fps-monitor.mjs';

// Toggle monitoring UI on/off
export const MONITORING_ENABLED = false;

export class MonitoringUI {
    constructor(containerId = 'monitoring-container') {
        this.containerId = containerId;
        this.container = null;
        this.isRunning = false;

        // Metrics state
        this.metrics = {
            fps: 0,
            cpu: { usage: 0, cores: 0, model: '' },
            ram: { used: 0, total: 0, usagePercent: 0 },
            processMemory: { heapUsed: 0, heapTotal: 0 }
        };

        // UI update batching
        this.pendingUIUpdate = false;
        this.rafId = null;

        // Bind methods
        this.handleBackendMetrics = this.handleBackendMetrics.bind(this);
        this.handleFPSUpdate = this.handleFPSUpdate.bind(this);
    }

    /**
     * Initialize and start monitoring
     */
    async start() {
        if (!MONITORING_ENABLED) {
            console.log('[MonitoringUI] Monitoring is disabled');
            return;
        }

        if (this.isRunning) {
            console.warn('[MonitoringUI] Already running');
            return;
        }

        // Get container element
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error(`[MonitoringUI] Container #${this.containerId} not found`);
            return;
        }

        console.log('[MonitoringUI] Starting monitoring UI...');
        this.isRunning = true;

        // Create UI elements
        this.createUI();

        // Start FPS monitoring
        if (FPS_MONITORING_ENABLED) {
            fpsMonitor.subscribe(this.handleFPSUpdate);
            fpsMonitor.start();
        }

        // Start backend monitoring
        try {
            const result = await window.api.monitoring.start();
            if (result.success) {
                window.api.monitoring.onUpdate(this.handleBackendMetrics);
                console.log('[MonitoringUI] Backend monitoring started');
            } else {
                console.error('[MonitoringUI] Failed to start backend monitoring:', result.message || result.error);
            }
        } catch (error) {
            console.error('[MonitoringUI] Error starting backend monitoring:', error);
        }
    }

    /**
     * Stop monitoring
     */
    async stop() {
        if (!this.isRunning) return;

        console.log('[MonitoringUI] Stopping monitoring UI...');
        this.isRunning = false;

        // Cancel pending RAF
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.pendingUIUpdate = false;

        // Stop FPS monitoring
        fpsMonitor.stop();

        // Stop backend monitoring
        try {
            await window.api.monitoring.stop();
            window.api.monitoring.removeUpdateListener();
        } catch (error) {
            console.error('[MonitoringUI] Error stopping backend monitoring:', error);
        }

        // Clear UI
        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.display = 'none';
        }
    }

    /**
     * Create monitoring UI elements
     */
    createUI() {
        this.container.innerHTML = `
            <div class="monitoring-panel">
                <div class="monitoring-header">
                    <span class="monitoring-title">Performance Monitor</span>
                    <button class="monitoring-close" id="monitoring-close-btn">×</button>
                </div>
                <div class="monitoring-metrics">
                    <div class="metric-item">
                        <span class="metric-label">FPS</span>
                        <span class="metric-value" id="metric-fps">0</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">CPU</span>
                        <span class="metric-value" id="metric-cpu">0%</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">RAM</span>
                        <span class="metric-value" id="metric-ram">0 GB</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Heap</span>
                        <span class="metric-value" id="metric-heap">0 MB</span>
                    </div>
                </div>
                <div class="monitoring-details" id="monitoring-details">
                    <div class="detail-row">
                        <span class="detail-label">CPU Cores:</span>
                        <span class="detail-value" id="detail-cpu-cores">-</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total RAM:</span>
                        <span class="detail-value" id="detail-total-ram">-</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Process Heap:</span>
                        <span class="detail-value" id="detail-process-heap">-</span>
                    </div>
                </div>
            </div>
        `;

        this.container.style.display = 'block';

        // Add close button handler
        const closeBtn = document.getElementById('monitoring-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.stop());
        }
    }

    /**
     * Handle FPS updates
     */
    handleFPSUpdate(fps) {
        this.metrics.fps = fps;
        this.scheduleUIUpdate();
    }

    /**
     * Handle backend metrics updates
     */
    handleBackendMetrics(metrics) {
        if (!metrics || !metrics.enabled) return;

        if (metrics.cpu) {
            this.metrics.cpu = metrics.cpu;
        }

        if (metrics.ram) {
            this.metrics.ram = metrics.ram;
        }

        if (metrics.processMemory) {
            this.metrics.processMemory = metrics.processMemory;
        }

        this.scheduleUIUpdate();
    }

    /**
     * Schedule UI update using requestAnimationFrame to batch DOM operations
     */
    scheduleUIUpdate() {
        if (this.pendingUIUpdate) return;

        this.pendingUIUpdate = true;
        this.rafId = requestAnimationFrame(() => {
            this.performUIUpdate();
            this.pendingUIUpdate = false;
        });
    }

    /**
     * Perform the actual UI update (called by RAF)
     */
    performUIUpdate() {
        // Update main metrics
        this.updateElement('metric-fps', `${this.metrics.fps}`);
        this.updateElement('metric-cpu', `${this.metrics.cpu.usage}%`);
        this.updateElement('metric-ram', `${this.metrics.ram.used} GB`);
        this.updateElement('metric-heap', `${this.metrics.processMemory.heapUsed} MB`);

        // Update details
        this.updateElement('detail-cpu-cores', `${this.metrics.cpu.cores} cores`);
        this.updateElement('detail-total-ram', `${this.metrics.ram.total} GB (${this.metrics.ram.usagePercent}% used)`);
        this.updateElement('detail-process-heap', `${this.metrics.processMemory.heapUsed} / ${this.metrics.processMemory.heapTotal} MB`);

        // Color code based on values
        this.applyColorCoding();
    }

    /**
     * Apply color coding based on metric values
     */
    applyColorCoding() {
        // FPS color coding
        const fpsElement = document.getElementById('metric-fps');
        if (fpsElement) {
            const fps = this.metrics.fps;
            if (fps >= 55) {
                fpsElement.className = 'metric-value metric-good';
            } else if (fps >= 30) {
                fpsElement.className = 'metric-value metric-warning';
            } else {
                fpsElement.className = 'metric-value metric-danger';
            }
        }

        // CPU color coding
        const cpuElement = document.getElementById('metric-cpu');
        if (cpuElement) {
            const cpu = parseFloat(this.metrics.cpu.usage);
            if (cpu < 50) {
                cpuElement.className = 'metric-value metric-good';
            } else if (cpu < 80) {
                cpuElement.className = 'metric-value metric-warning';
            } else {
                cpuElement.className = 'metric-value metric-danger';
            }
        }

        // RAM color coding
        const ramElement = document.getElementById('metric-ram');
        if (ramElement) {
            const ramPercent = parseFloat(this.metrics.ram.usagePercent);
            if (ramPercent < 60) {
                ramElement.className = 'metric-value metric-good';
            } else if (ramPercent < 85) {
                ramElement.className = 'metric-value metric-warning';
            } else {
                ramElement.className = 'metric-value metric-danger';
            }
        }
    }

    /**
     * Update element text content safely
     */
    updateElement(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * Toggle monitoring on/off
     */
    async toggle() {
        if (this.isRunning) {
            await this.stop();
        } else {
            await this.start();
        }
    }
}

// Create singleton instance
export const monitoringUI = new MonitoringUI();

// Auto-start if enabled (optional, can be manually triggered)
if (MONITORING_ENABLED) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Uncomment to auto-start on page load
            // monitoringUI.start();
        });
    }
}
