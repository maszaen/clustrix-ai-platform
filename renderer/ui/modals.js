/**
 * Modal Management Module
 * Extracted from renderer.js - 99% exact code
 * Modal open/close with animations
 */

(function() {
  'use strict';

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    log("MODAL", 1, "openModal", "Modal opened", { modalId });
  }

  function closeModal(modalId) {
    const modal = typeof modalId === 'string' 
      ? document.getElementById(modalId) 
      : modalId;
    
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    log("MODAL", 1, "closeModal", "Modal closed");
  }

  function openModalWithAnimation(modal) {
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  function closeModalWithAnimation(modal) {
    if (!modal) return;
    
    modal.classList.remove('show');
    
    setTimeout(() => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }, 300);
  }

  // Export to global window object
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.openModalWithAnimation = openModalWithAnimation;
  window.closeModalWithAnimation = closeModalWithAnimation;
})();
