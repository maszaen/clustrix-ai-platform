class ClustrixBrowser {
    constructor() {
        this.webview = document.getElementById('webview');
        this.urlInput = document.getElementById('address-bar');
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.loading = document.getElementById('loading');
        this.initialUrlLoaded = false; // Flag to prevent multiple loads

        // Check if we have a URL to load and prepare UI accordingly
        this.prepareForUrlLoad();

        this.init();
        this.setupEventListeners();
    }

    prepareForUrlLoad() {
        // Check if we have a URL to load from hash
        const checkAndPrepare = () => {
            const hash = window.location.hash.substring(1);
            const hasUrl = hash && decodeURIComponent(hash) !== 'about:blank';

            if (hasUrl) {
                // Show webview and hide start page immediately
                this.webview.style.display = 'block';
                document.getElementById('start-page').style.display = 'none';
                console.log('Prepared UI for URL loading');
            } else {
                // Show start page, hide webview
                this.webview.style.display = 'none';
                document.getElementById('start-page').style.display = 'flex';
                console.log('Showing start page, no URL to load');
            }
        };

        // Check immediately
        checkAndPrepare();

        // Also check when hash changes (in case it loads later)
        window.addEventListener('hashchange', checkAndPrepare);
    }

    init() {
        // Configure webview with proper settings to bypass CSP
        this.webview.addEventListener('dom-ready', () => {
            this.loading.style.display = 'none';

            // Ensure webview is visible if we have a URL to load
            const hash = window.location.hash.substring(1);
            const hasUrl = hash && decodeURIComponent(hash) !== 'about:blank';

            if (hasUrl) {
                this.webview.style.display = 'block';
                document.getElementById('start-page').style.display = 'none';
            }

            // Only load initial URL once when webview is ready
            if (!this.initialUrlLoaded) {
                this.initialUrlLoaded = true;
                this.loadInitialUrl();
            }

            // Try to inject CSS to hide any CSP warnings or overlays
            try {
                this.webview.insertCSS(`
                    /* Hide common CSP warning overlays */
                    [style*="position: fixed"][style*="z-index: 999999"],
                    .csp-warning, .csp-overlay, .security-warning {
                        display: none !important;
                    }
                `);
            } catch (e) {
                console.log('Could not inject CSS:', e);
            }
        });

        this.webview.addEventListener('did-start-loading', () => {
            this.loading.style.display = 'block';
            this.updateNavigationButtons();
        });

        this.webview.addEventListener('did-stop-loading', () => {
            this.loading.style.display = 'none';
            this.updateUrlInput();
            this.updateNavigationButtons();
            this.updateTabTitle();
        });

        this.webview.addEventListener('did-navigate', (e) => {
            this.updateUrlInput();
            this.updateTabTitle();
        });

        this.webview.addEventListener('page-title-updated', (e) => {
            this.updateTabTitle(e.title);
        });

        this.webview.addEventListener('new-window', (e) => {
            // Open new windows in the same webview
            this.webview.loadURL(e.url);
        });

        this.webview.addEventListener('did-fail-load', (e) => {
            this.loading.style.display = 'none';

            // Check if it's a CSP or security error that we can handle
            const isSecurityError = e.errorDescription &&
                (e.errorDescription.includes('CSP') ||
                 e.errorDescription.includes('security') ||
                 e.errorDescription.includes('blocked') ||
                 e.errorDescription.includes('ERR_ABORTED'));

            if (isSecurityError) {
                // Give it a moment and check if the page actually loaded
                setTimeout(() => {
                    const currentURL = this.webview.getURL();
                    const currentTitle = this.webview.getTitle();

                    if (currentURL && currentURL !== 'about:blank' && currentTitle) {
                        this.loading.style.display = 'none';
                        this.updateUrlInput();
                        this.updateTabTitle(currentTitle);
                        return; // Don't fallback to external browser
                    }

                    // If page didn't load, fallback to external browser
                    console.log('Page failed to load, opening in external browser...');
                    const urlToOpen = e.validatedURL || this.webview.src;
                    if (window.api && window.api.shell && window.api.shell.openExternal) {
                        window.api.shell.openExternal(urlToOpen);
                        // Close this window after a short delay
                        setTimeout(() => window.close(), 500);
                    } else {
                        console.log('No API available for external browser fallback');
                    }
                }, 2000); // Wait 2 seconds to check if page loaded
            }
        });
    }

    setupEventListeners() {
        // Navigation buttons
        this.backBtn.addEventListener('click', () => {
            if (this.webview.canGoBack()) {
                this.webview.goBack();
            }
        });

        this.forwardBtn.addEventListener('click', () => {
            if (this.webview.canGoForward()) {
                this.webview.goForward();
            }
        });

        this.refreshBtn.addEventListener('click', () => {
            this.webview.reload();
        });

        // URL input and go button
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigateToUrl();
            }
        });
    }

    navigateToUrl() {
        let url = this.urlInput.value.trim();

        if (!url) return;

        // Check if webview is ready
        if (!this.webview || this.webview.getURL() === undefined) {
            console.log('Webview not ready yet, cannot navigate');
            // Show a brief message to user
            this.urlInput.placeholder = 'Webview not ready...';
            setTimeout(() => {
                this.urlInput.placeholder = 'Enter URL or search term';
            }, 2000);
            return;
        }

        // Add protocol if missing
        if (!url.match(/^https?:\/\//i)) {
            // Check if it's a search query or domain
            if (url.includes('.') && !url.includes(' ')) {
                // Looks like a domain
                url = 'https://' + url;
            } else {
                // Treat as search query
                url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
            }
        }

        console.log('Navigating to:', url);
        this.webview.loadURL(url);
    }

    updateUrlInput() {
        const currentUrl = this.webview.getURL();
        if (currentUrl && currentUrl !== 'about:blank') {
            this.urlInput.value = currentUrl;
        }
    }

    updateNavigationButtons() {
        this.backBtn.disabled = !this.webview.canGoBack();
        this.forwardBtn.disabled = !this.webview.canGoForward();
    }

    updateTabTitle(title) {
        const tabTitle = document.querySelector('.tab-title');
        if (title) {
            tabTitle.textContent = title.length > 30 ? title.substring(0, 30) + '...' : title;
        } else {
            const url = this.webview.getURL();
            if (url && url !== 'about:blank') {
                try {
                    const urlObj = new URL(url);
                    tabTitle.textContent = urlObj.hostname;
                } catch (e) {
                    tabTitle.textContent = 'New Tab';
                }
            }
        }
    }

    loadInitialUrl() {
        // Get URL from URL hash or default to Google
        console.log('Loading initial URL, current location:', window.location.href);
        console.log('Hash:', window.location.hash);

        const hash = window.location.hash.substring(1); // Remove the '#'
        const initialUrl = hash ? decodeURIComponent(hash) : null;
        console.log('Initial URL from hash:', initialUrl);

        const finalUrl = initialUrl || 'https://www.google.com';
        console.log('Final URL to load:', finalUrl);

        if (finalUrl && finalUrl !== 'about:blank') {
            console.log('Loading URL in webview:', finalUrl);

            // Webview should already be visible from prepareForUrlLoad()
            // Add a small delay to ensure webview is fully ready
            setTimeout(() => {
                try {
                    this.webview.loadURL(finalUrl);
                    this.urlInput.value = finalUrl;
                } catch (error) {
                    console.error('Error loading URL:', error);
                    // Fallback to external browser
                    if (window.api && window.api.shell && window.api.shell.openExternal) {
                        window.api.shell.openExternal(finalUrl);
                        setTimeout(() => window.close(), 500);
                    }
                }
            }, 100); // Small delay to ensure webview is ready
        } else {
            console.log('No valid URL to load');
        }
    }
}

// Initialize browser when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ClustrixBrowser();
});