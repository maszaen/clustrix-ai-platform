class TextareaCustomScrollbar {
  /**
   * @param {HTMLElement} shellEl  .ta-shell element
   * @param {{maxHeight?: number, minThumb?: number, pageStep?: number}} opts
   */
  constructor(shellEl, opts = {}) {
    this.shell = shellEl;
    this.ta = shellEl.querySelector('textarea');
    this.track = shellEl.querySelector('.ta-scrollbar');
    this.thumb = shellEl.querySelector('.ta-thumb');

    if (!this.ta || !this.track || !this.thumb) {
      throw new Error('TextareaCustomScrollbar: struktur .ta-shell tidak lengkap');
    }

    // Default to 350px to match CSS, but allow override
    this.maxHeight = opts.maxHeight ?? 350;
    this.minThumb = opts.minThumb ?? 20;     // tinggi minimal thumb
    this.pageStep = opts.pageStep ?? 0.9;    // klik track = 90% viewport

    // State drag
    this._dragging = false;
    this._dragStartY = 0;
    this._dragStartScrollTop = 0;

    // Apply maxHeight ke textarea
    console.log(`TextareaCustomScrollbar init for ${this.ta.id || 'unnamed'}:`, {
      defaultMaxHeight: this.maxHeight,
      optsMaxHeight: opts.maxHeight
    });
    
    this.ta.style.maxHeight = this.maxHeight + 'px';
    console.log(`Applied max-height: ${this.maxHeight}px for ${this.ta.id}`);

    // Mark the textarea as having a custom scrollbar
    this.ta.__hasCustomScrollbar = true;
    
    // Store instance on shell for consistency with auto-initialization
    this.shell.__taScroll = this;

    // Bind events
    this._onInput = this._onInput.bind(this);
    this._onScroll = this._onScroll.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onTrackClick = this._onTrackClick.bind(this);
    this._onResize = this._onResize.bind(this);

    this.ta.addEventListener('input', this._onInput);
    this.ta.addEventListener('scroll', this._onScroll);
    this.thumb.addEventListener('pointerdown', this._onPointerDown);
    this.track.addEventListener('pointerdown', this._onTrackClick);

    // ResizeObserver: kalau shell/textarea berubah ukuran
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this.shell);
    this._ro.observe(this.ta);

    // First layout
    this.updateLayout(true);
  }

  destroy() {
    this.ta.removeEventListener('input', this._onInput);
    this.ta.removeEventListener('scroll', this._onScroll);
    this.thumb.removeEventListener('pointerdown', this._onPointerDown);
    this.track.removeEventListener('pointerdown', this._onTrackClick);
    this._ro?.disconnect();
    this._detachDragging();
  }

  // ===== public helpers
  setValue(text) {
    this.ta.value = text || '';
    this.updateLayout(true);
  }
  getValue() {
    return this.ta.value;
  }
  focus() {
    this.ta.focus();
  }

  // ===== core
  updateLayout(force = false) {
    console.log('updateLayout called, force:', force);
    
    // Re-query the textarea to ensure we have the current element
    const currentTextarea = this.shell.querySelector('textarea');
    if (!currentTextarea) {
      console.error('updateLayout: no textarea found in shell');
      return;
    }
    
    // If the textarea reference has changed, update it
    if (this.ta !== currentTextarea) {
      console.warn(`Textarea reference changed! Old: ${this.ta?.id}, New: ${currentTextarea.id}`);
      // Remove event listeners from old textarea if it exists
      if (this.ta) {
        this.ta.removeEventListener('input', this._onInput);
        this.ta.removeEventListener('scroll', this._onScroll);
      }
      
      this.ta = currentTextarea;
      
      // Re-bind events to the new textarea
      this.ta.addEventListener('input', this._onInput);
      this.ta.addEventListener('scroll', this._onScroll);
      this.ta.style.maxHeight = this.maxHeight + 'px';
      this.ta.__hasCustomScrollbar = true;
    }
    
    console.log('Textarea element:', this.ta.id, this.ta);
    console.log('Before height change - scrollHeight:', this.ta.scrollHeight, 'value length:', this.ta.value.length);
    console.log('Textarea value preview:', this.ta.value.substring(0, 50) + (this.ta.value.length > 50 ? '...' : ''));
    
    // Autoheight sampai maxHeight
    const prevH = this.ta.style.height;
    
    // Store current computed height
    const computedStyle = window.getComputedStyle(this.ta);
    console.log('Current computed height:', computedStyle.height, 'min-height:', computedStyle.minHeight);
    
    this.ta.style.height = 'auto';
    console.log('After setting height auto - scrollHeight:', this.ta.scrollHeight);
    
    const natural = this.ta.scrollHeight;     // tinggi konten asli
    const viewport = Math.min(natural, this.maxHeight);

    this.ta.style.height = viewport + 'px';
    console.log(`Natural height: ${natural}, viewport: ${viewport}, maxHeight: ${this.maxHeight}`);

    // Tampilkan track hanya jika konten > viewport
    const needScroll = natural > viewport + 1; // toleransi
    console.log('Need scroll:', needScroll, 'natural:', natural, 'viewport:', viewport);
    this.track.classList.toggle('is-hidden', !needScroll);

    // Sync thumb size & pos
    this._syncThumb();

    // Kalau height gak berubah dan bukan force, skip
    if (!force && prevH === this.ta.style.height) return;
  }

  _syncThumb() {
    const content = this.ta.scrollHeight;
    const viewport = this.ta.clientHeight;
    const trackH = this._trackHeight();

    console.log(`_syncThumb: content=${content}, viewport=${viewport}, trackH=${trackH}`);

    if (content <= viewport + 1 || trackH <= 0) {
      console.log('Hiding track - content too small or track height 0');
      this.track.classList.add('is-hidden');
      return;
    }

    console.log('Showing track');
    this.track.classList.remove('is-hidden');

    const ratio = viewport / content;
    const thumbH = Math.max(this.minThumb, Math.floor(trackH * ratio));
    this._thumbH = thumbH;
    this.thumb.style.height = thumbH + 'px';
    console.log(`Setting thumb height: ${thumbH}px`);

    const maxThumbTop = trackH - thumbH;
    const maxScrollTop = content - viewport;
    const sTop = this.ta.scrollTop;
    const tTop = maxScrollTop > 0 ? (sTop / maxScrollTop) * maxThumbTop : 0;

    this._maxThumbTop = maxThumbTop;
    this._maxScrollTop = maxScrollTop;

    this.thumb.style.transform = `translateY(${Math.round(tTop)}px)`;
    console.log(`Setting thumb transform: translateY(${Math.round(tTop)}px)`);
  }

  _trackHeight() {
    const rectTrack = this.track.getBoundingClientRect();
    if (rectTrack.height > 0) {
      return rectTrack.height;
    }
    
    // Fallback: calculate based on shell height
    const rectShell = this.shell.getBoundingClientRect();
    const taRect = this.ta.getBoundingClientRect();
    
    // Use the actual textarea height minus some padding
    return Math.max(0, taRect.height - 8); // 4px top + 4px bottom padding
  }

  // ===== events
  _onInput() {
    // natural height bisa berubah → relayout & sync
    console.log('_onInput triggered, calling updateLayout');
    this.updateLayout(true);
  }

  _onScroll() {
    // textarea digeser (wheel/keys) → thumb ikut
    // throttle via rAF
    cancelAnimationFrame(this._rafSync);
    this._rafSync = requestAnimationFrame(() => {
      console.log('_onScroll triggered, calling _syncThumb');
      this._syncThumb();
    });
  }

  _onPointerDown(e) {
    if (e.button !== 0) return;
    this._dragging = true;
    this.track.classList.add('dragging');
    this._dragStartY = e.clientY;
    this._dragStartScrollTop = this.ta.scrollTop;
    this.thumb.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    e.preventDefault();
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const deltaY = e.clientY - this._dragStartY;
    // konversi deltaY track → scrollTop
    const scrollDelta = (deltaY / (this._maxThumbTop || 1)) * (this._maxScrollTop || 1);
    this.ta.scrollTop = this._dragStartScrollTop + scrollDelta;
  }

  _onPointerUp(e) {
    this._detachDragging();
  }

  _detachDragging() {
    if (!this._dragging) return;
    this._dragging = false;
    this.track.classList.remove('dragging');
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  _onTrackClick(e) {
    if (e.target === this.thumb || this.thumb.contains(e.target)) return; // drag sudah handle
    
    e.preventDefault();
    e.stopPropagation();
    
    const trackRect = this.track.getBoundingClientRect();
    const thumbRect = this.thumb.getBoundingClientRect();
    const clickY = e.clientY - trackRect.top;

    const page = Math.floor(this.ta.clientHeight * this.pageStep);
    const thumbMiddle = (thumbRect.top + thumbRect.bottom) / 2 - trackRect.top;
    
    if (clickY < thumbMiddle) {
      // page up
      this.ta.scrollTop = Math.max(0, this.ta.scrollTop - page);
    } else {
      // page down
      this.ta.scrollTop = Math.min(this._maxScrollTop || 0, this.ta.scrollTop + page);
    }
  }

  _onResize() {
    this.updateLayout(true);
  }
}


(function initAllCustomTextareas() {
  console.log("TA-SHELL EXECUTED");
  
  function initializeShells() {
    const shells = document.querySelectorAll('.ta-shell');
    console.log(`Found ${shells.length} .ta-shell elements`);
    
    for (const sh of shells) {
      if (sh.__taScroll) {
        console.log('Shell already initialized:', sh);
        continue;
      }
      
      try {
        sh.__taScroll = new TextareaCustomScrollbar(sh, {
          maxHeight: 350,   // Match CSS max-height for both textareas
          minThumb: 20,     // tinggi minimal thumb
          pageStep: 0.9     // klik track = ~90% viewport
        });
        console.log('Successfully initialized shell:', sh);
      } catch (error) {
        console.error('Failed to initialize custom scrollbar for shell:', sh, error);
      }
    }
  }

  // Initialize immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShells);
  } else {
    initializeShells();
  }

  // Also initialize after a short delay to catch any dynamically added elements
  setTimeout(initializeShells, 100);

  // optional: kalau kamu dynamically inject input, observe DOM:
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches?.('.ta-shell')) {
          if (!n.__taScroll) {
            try {
              n.__taScroll = new TextareaCustomScrollbar(n);
              console.log('Dynamically initialized shell:', n);
            } catch (error) {
              console.error('Failed to initialize dynamic shell:', n, error);
            }
          }
        }
        n.querySelectorAll?.('.ta-shell').forEach((el) => {
          if (!el.__taScroll) {
            try {
              el.__taScroll = new TextareaCustomScrollbar(el);
              console.log('Dynamically initialized nested shell:', el);
            } catch (error) {
              console.error('Failed to initialize dynamic nested shell:', el, error);
            }
          }
        });
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
