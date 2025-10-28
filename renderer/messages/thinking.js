/**
 * Thinking UI Module
 * Extracted from renderer.js - 99% exact code
 * Manages collapsible thinking UI for AI responses
 */

(function() {
  'use strict';

  function ensureThinkingUI(aiNode) {
    if (aiNode._thinkingReady) return;
    
    const content = aiNode.querySelector(".message-content") || aiNode;
    const existingWrap = content.querySelector('.thinking-wrap');
    
    if (existingWrap) {
      aiNode._thinkingReady = true;
      
      const toggle = existingWrap.querySelector('.thinking-toggle');
      const body = existingWrap.querySelector('.thinking-body');
      const thinkingUpdate = existingWrap.querySelector('.thinking-update');
      const text = existingWrap.querySelector('.thinking-text');
      const toggleContent = toggle?.querySelector('.thinking-toggle-content');
      
      if (toggle && body) {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        newToggle.addEventListener("click", () => {
          const ex = newToggle.getAttribute("aria-expanded") === "true";
          newToggle.setAttribute("aria-expanded", ex ? "false" : "true");
          body.classList.toggle("expanded", !ex);
        });
        
        let thinkingUserScrolled = false;
        body.addEventListener('scroll', () => {
          if (!body.classList.contains('expanded')) return;
          
          const isAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 10;
          if (!isAtBottom) {
            thinkingUserScrolled = true;
          } else if (thinkingUserScrolled) {
            thinkingUserScrolled = false;
          }
        });
        
        aiNode._thinkingEl = { 
          wrap: existingWrap, 
          toggle: newToggle, 
          body, 
          thinkingUpdate,
          text, 
          toggleContent: newToggle.querySelector('.thinking-toggle-content'), 
          userScrolled: () => thinkingUserScrolled 
        };
      }
      
      log('THINKING', 1, 'ensureThinkingUI', 'Rehydrated existing thinking-wrap from cache', {});
      return;
    }
    
    aiNode._thinkingReady = true;

    const wrap = document.createElement("div");
    wrap.className = "thinking-wrap";

    const toggle = document.createElement("button");
    toggle.className = "thinking-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `
      <div class="thinking-toggle-content">
        <span>Thinking</span>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
    `;

    const body = document.createElement("div");
    body.className = "thinking-body";
    
    const thinkingUpdate = document.createElement("div");
    thinkingUpdate.className = "thinking-update";
    
    const text = document.createElement("div");
    text.className = "thinking-text";

    thinkingUpdate.appendChild(text);
    body.appendChild(thinkingUpdate);
    wrap.appendChild(toggle);
    wrap.appendChild(body);

    let thinkingUserScrolled = false;
    body.addEventListener('scroll', () => {
      if (!body.classList.contains('expanded')) return;
      
      const isAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 10;
      if (!isAtBottom) {
        thinkingUserScrolled = true;
      } else if (thinkingUserScrolled) {
        thinkingUserScrolled = false;
      }
    });

    toggle.addEventListener("click", () => {
      const ex = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", ex ? "false" : "true");
      body.classList.toggle("expanded", !ex);
    });

    const messageContent = aiNode.querySelector(".message-content");
    if (messageContent) {
      messageContent.insertBefore(wrap, messageContent.firstChild);
    } else {
      aiNode.insertBefore(wrap, aiNode.firstChild);
    }

    const toggleContent = toggle.querySelector('.thinking-toggle-content');
    aiNode._thinkingEl = { wrap, toggle, body, thinkingUpdate, text, toggleContent, userScrolled: () => thinkingUserScrolled };
  }

  function finalizeThinkingUI(aiNode, duration, metadataOverride = null) {
    if (!aiNode?._thinkingEl) return;

    const { wrap, toggle, toggleContent } = aiNode._thinkingEl;
    if (!wrap) return;

    wrap.classList.add("finalized");

    let meta = null;
    if (typeof metadataOverride === 'object' && metadataOverride) {
      meta = metadataOverride;
    }

    const durationSec = typeof duration === "number" ? (duration / 1000).toFixed(1) : "0.0";
    const modelName = meta?.model || "Unknown Model";
    const inputTokens = meta?.inputTokens !== undefined ? meta.inputTokens.toLocaleString() : "0";
    const outputTokens = meta?.outputTokens !== undefined ? meta.outputTokens.toLocaleString() : "0";

    let statsHTML = `<span>${durationSec}s</span>`;

    if (meta && (meta.inputTokens > 0 || meta.outputTokens > 0)) {
      statsHTML += ` • <span title="Input tokens">${inputTokens} in</span> • <span title="Output tokens">${outputTokens} out</span>`;
    }

    if (toggleContent) {
      toggleContent.innerHTML = `
        <span>Thinking</span>
        <div class="thinking-stats">${statsHTML}</div>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
      `;
    }

    log("THINKING", 1, "finalizeThinkingUI", "Finalized thinking UI", {
      duration: durationSec,
      model: modelName,
      inputTokens,
      outputTokens,
    });
  }

  function hydrateThinkingIfAny(aiNode, thinkingText) {
    if (!thinkingText || typeof thinkingText !== 'string' || !thinkingText.trim()) return;

    ensureThinkingUI(aiNode);

    if (aiNode._thinkingEl?.text) {
      aiNode._thinkingEl.text.textContent = thinkingText;
    }
  }

  // Export to global window object
  window.ensureThinkingUI = ensureThinkingUI;
  window.finalizeThinkingUI = finalizeThinkingUI;
  window.hydrateThinkingIfAny = hydrateThinkingIfAny;
})();
