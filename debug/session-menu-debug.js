/**
 * Debug Script untuk Session Menu Dropdown di SIDEBAR
 * Inject script ini ke console untuk melihat semua event yang terjadi
 * Copy paste code ini ke browser console
 * 
 * TARGET: Session list di SIDEBAR (bukan project detail page!)
 * Container: .chat-menu-container
 * Button: .chat-menu-btn
 * Dropdown: .chat-menu-dropdown dengan class .clicked-open
 */

console.log('%c=== SIDEBAR SESSION MENU DROPDOWN DEBUG ===', 'color: #00ff00; font-size: 16px; font-weight: bold');
console.log('%c(Target: .chat-menu-container di sidebar)', 'color: #ffff00; font-size: 12px');

// Flag untuk tracking
window.debugSessionMenu = {
  lastEvent: null,
  eventLog: [],
  maxLogs: 100
};

// Helper function untuk add log
function addLog(eventType, details) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  const log = {
    timestamp,
    eventType,
    details,
    chatMenuContainers: document.querySelectorAll('.chat-menu-container').length,
    openDropdowns: document.querySelectorAll('.chat-menu-dropdown.clicked-open').length,
    allDropdowns: document.querySelectorAll('.chat-menu-dropdown').length
  };
  
  window.debugSessionMenu.eventLog.push(log);
  if (window.debugSessionMenu.eventLog.length > window.debugSessionMenu.maxLogs) {
    window.debugSessionMenu.eventLog.shift();
  }
  
  console.log(`%c[${timestamp}] ${eventType}`, 'color: #00ccff; font-weight: bold', details);
  return log;
}

// Track MOUSEENTER events - SIDEBAR VERSION (.chat-menu-container)
document.addEventListener('mouseenter', (e) => {
  if (!(e.target instanceof Element)) return;
  
  const menuContainer = e.target.closest('.chat-menu-container');
  if (menuContainer) {
    const dropdown = menuContainer.querySelector('.chat-menu-dropdown.clicked-open');
    const isDropdownOpen = !!dropdown;
    
    const details = {
      targetClass: e.target.className,
      targetTag: e.target.tagName,
      dropdownOpen: isDropdownOpen,
      dropdownState: isDropdownOpen ? 'clicked-open' : 'closed'
    };
    
    addLog('MOUSEENTER (chat-menu-container)', details);
  }
}, true);

// Track MOUSELEAVE events - SIDEBAR VERSION (.chat-menu-container)
// INI YANG PENTING! Ini listener yang bikin dropdown close!
document.addEventListener('mouseleave', (e) => {
  if (!(e.target instanceof Element)) return;
  
  const menuContainer = e.target.closest('.chat-menu-container');
  if (menuContainer) {
    const dropdown = menuContainer.querySelector('.chat-menu-dropdown.clicked-open');
    const menuButton = menuContainer.querySelector('.chat-menu-btn');
    const isDropdownOpen = !!dropdown;
    
    const details = {
      targetClass: e.target.className,
      targetTag: e.target.tagName,
      dropdownOpen: isDropdownOpen,
      dropdownState: isDropdownOpen ? 'clicked-open' : 'closed',
      willRemoveClickedOpen: !!dropdown && !!menuButton
    };
    
    addLog('MOUSELEAVE (chat-menu-container)', details);
    
    // Log apa yang akan terjadi
    if (dropdown && menuButton) {
      addLog('  ⚠️ WILL CLOSE DROPDOWN (clicked-open akan di-remove)', {
        action: 'REMOVING_CLICKED_OPEN_CLASS',
        reason: 'mouseleave listener trigger'
      });
    }
  }
}, true);

// Track CLICK events - SIDEBAR VERSION
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  
  const chatMenuBtn = e.target.closest('.chat-menu-btn');
  if (chatMenuBtn) {
    const menuContainer = chatMenuBtn.closest('.chat-menu-container');
    const dropdown = menuContainer?.querySelector('.chat-menu-dropdown');
    const isCurrentlyOpen = dropdown?.classList.contains('clicked-open');
    
    addLog('CLICK (chat-menu-btn)', {
      action: isCurrentlyOpen ? 'WILL_CLOSE' : 'WILL_OPEN',
      currentState: isCurrentlyOpen ? 'clicked-open' : 'closed'
    });
  }
}, false);

// Track actual class changes on dropdown
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      const target = mutation.target;
      if (target.classList.contains('chat-menu-dropdown')) {
        const isOpen = target.classList.contains('clicked-open');
        addLog('CLASS MUTATION (chat-menu-dropdown)', {
          target: target.className,
          isOpenNow: isOpen,
          action: isOpen ? 'OPENED' : 'CLOSED'
        });
      }
    }
  });
});

// Start observing all chat-menu-dropdown elements
document.querySelectorAll('.chat-menu-dropdown').forEach((dropdown) => {
  observer.observe(dropdown, { attributes: true, attributeFilter: ['class'] });
});

// Also observe for new dropdowns
const containerObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList?.contains('chat-menu-dropdown')) {
          observer.observe(node, { attributes: true, attributeFilter: ['class'] });
        }
      });
    }
  });
});

containerObserver.observe(document.getElementById('session-list') || document.body, { 
  childList: true, 
  subtree: true 
});

// Helper function untuk lihat semua logs
window.showSessionMenuLogs = function() {
  console.clear();
  console.log('%c=== SESSION MENU DEBUG LOGS ===', 'color: #ffff00; font-size: 14px; font-weight: bold');
  console.table(window.debugSessionMenu.eventLog);
  
  console.log('%c\n=== SUMMARY ===', 'color: #00ff00; font-weight: bold');
  const closeEvents = window.debugSessionMenu.eventLog.filter(l => l.details?.action === 'CLOSE').length;
  const keepOpenEvents = window.debugSessionMenu.eventLog.filter(l => l.details?.action === 'KEEP_OPEN').length;
  console.log(`Close events: ${closeEvents}`);
  console.log(`Keep open events: ${keepOpenEvents}`);
};

// Helper function untuk clear logs
window.clearSessionMenuLogs = function() {
  window.debugSessionMenu.eventLog = [];
  console.log('Logs cleared');
};

// Helper function untuk export logs as JSON
window.exportSessionMenuLogs = function() {
  const json = JSON.stringify(window.debugSessionMenu.eventLog, null, 2);
  console.log(json);
  return json;
};

console.log('%c✓ Debug script loaded!', 'color: #00ff00; font-weight: bold');
console.log('%cAvailable commands:', 'color: #00ccff; font-weight: bold');
console.log('  showSessionMenuLogs() - Lihat semua logs');
console.log('  clearSessionMenuLogs() - Clear logs');
console.log('  exportSessionMenuLogs() - Export as JSON');
console.log('  window.debugSessionMenu.eventLog - Raw event log array');
