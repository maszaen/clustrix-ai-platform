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
    this.ta.style.maxHeight = this.maxHeight + 'px';

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
    
    const currentTextarea = this.shell.querySelector('textarea');
    if (!currentTextarea) {
      console.error('updateLayout: no textarea found in shell');
      return;
    }
    
    if (this.ta !== currentTextarea) {
      console.warn(`Textarea reference changed! Old: ${this.ta?.id}, New: ${currentTextarea.id}`);
      if (this.ta) {
        this.ta.removeEventListener('input', this._onInput);
        this.ta.removeEventListener('scroll', this._onScroll);
      }
      
      this.ta = currentTextarea;
      
      this.ta.addEventListener('input', this._onInput);
      this.ta.addEventListener('scroll', this._onScroll);
      this.ta.style.maxHeight = this.maxHeight + 'px';
      this.ta.__hasCustomScrollbar = true;
    }
    
    const prevH = this.ta.style.height;
    
    const computedStyle = window.getComputedStyle(this.ta);
    
    this.ta.style.height = 'auto';
    
    const natural = this.ta.scrollHeight;   
    const viewport = Math.min(natural, this.maxHeight);

    this.ta.style.height = viewport + 'px';

    const needScroll = natural > viewport + 1; 
    this.track.classList.toggle('is-hidden', !needScroll);

    this._syncThumb();

    if (!force && prevH === this.ta.style.height) return;
  }

  _syncThumb() {
    const content = this.ta.scrollHeight;
    const viewport = this.ta.clientHeight;
    const trackH = this._trackHeight();


    if (content <= viewport + 1 || trackH <= 0) {
      this.track.classList.add('is-hidden');
      return;
    }

    this.track.classList.remove('is-hidden');

    const ratio = viewport / content;
    const thumbH = Math.max(this.minThumb, Math.floor(trackH * ratio));
    this._thumbH = thumbH;
    this.thumb.style.height = thumbH + 'px';

    const maxThumbTop = trackH - thumbH;
    const maxScrollTop = content - viewport;
    const sTop = this.ta.scrollTop;
    const tTop = maxScrollTop > 0 ? (sTop / maxScrollTop) * maxThumbTop : 0;

    this._maxThumbTop = maxThumbTop;
    this._maxScrollTop = maxScrollTop;

    this.thumb.style.transform = `translateY(${Math.round(tTop)}px)`;
  }

  _trackHeight() {
    const rectTrack = this.track.getBoundingClientRect();
    if (rectTrack.height > 0) {
      return rectTrack.height;
    }
    
    const rectShell = this.shell.getBoundingClientRect();
    const taRect = this.ta.getBoundingClientRect();
    return Math.max(0, taRect.height - 8); // 4px top + 4px bottom padding
  }

  // ===== events
  _onInput() {
    this.updateLayout(true);
  }

  _onScroll() {
    cancelAnimationFrame(this._rafSync);
    this._rafSync = requestAnimationFrame(() => {
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
      this.ta.scrollTop = Math.max(0, this.ta.scrollTop - page);
    } else {
      this.ta.scrollTop = Math.min(this._maxScrollTop || 0, this.ta.scrollTop + page);
    }
  }

  _onResize() {
    this.updateLayout(true);
  }
}


(function initAllCustomTextareas() {
  
  function initializeShells() {
    const shells = document.querySelectorAll('.ta-shell');
    
    for (const sh of shells) {
      if (sh.__taScroll) {
        continue;
      }
      
      try {
        sh.__taScroll = new TextareaCustomScrollbar(sh, {
          maxHeight: 350,   // Match CSS max-height for both textareas
          minThumb: 20,     // tinggi minimal thumb
          pageStep: 0.9     // klik track = ~90% viewport
        });
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
            } catch (error) {
              console.error('Failed to initialize dynamic shell:', n, error);
            }
          }
        }
        n.querySelectorAll?.('.ta-shell').forEach((el) => {
          if (!el.__taScroll) {
            try {
              el.__taScroll = new TextareaCustomScrollbar(el);
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
