// Force initialization and debugging
console.log('Force init script loaded');

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', forceInit);
} else {
  forceInit();
}

function forceInit() {
  console.log('Force init running...');
  
  // Check if TextareaCustomScrollbar is available
  if (typeof TextareaCustomScrollbar === 'undefined') {
    console.error('TextareaCustomScrollbar class not found!');
    return;
  }
  
  // Find all ta-shell elements
  const shells = document.querySelectorAll('.ta-shell');
  console.log('Found ta-shell elements:', shells.length);
  
  shells.forEach((shell, index) => {
    const textarea = shell.querySelector('textarea');
    const scrollbar = shell.querySelector('.ta-scrollbar');
    const thumb = shell.querySelector('.ta-thumb');
    
    console.log(`Shell ${index}:`, {
      shell,
      textarea: textarea ? textarea.id || 'unnamed' : 'missing',
      scrollbar: !!scrollbar,
      thumb: !!thumb,
      hasCustomScrollbar: textarea && textarea.__hasCustomScrollbar
    });
    
    // Force initialize if not already done
    if (textarea && scrollbar && thumb && !textarea.__hasCustomScrollbar) {
      try {
        console.log(`Force initializing scrollbar for: ${textarea.id || 'unnamed'}`);
        new TextareaCustomScrollbar(shell, { maxHeight: 350 });
        console.log(`Successfully initialized scrollbar for: ${textarea.id || 'unnamed'}`);
      } catch (error) {
        console.error(`Failed to initialize scrollbar for ${textarea.id || 'unnamed'}:`, error);
      }
    }
  });
  
  // Check computed styles
  setTimeout(() => {
    const msgCentral = document.getElementById('msg-central');
    const msg = document.getElementById('msg');
    
    if (msgCentral) {
      const styles = window.getComputedStyle(msgCentral);
      console.log('msg-central computed styles:', {
        maxHeight: styles.maxHeight,
        height: styles.height,
        minHeight: styles.minHeight
      });
    }
    
    if (msg) {
      const styles = window.getComputedStyle(msg);
      console.log('msg computed styles:', {
        maxHeight: styles.maxHeight,
        height: styles.height,
        minHeight: styles.minHeight
      });
    }
  }, 100);
}

// Also add global debugging function
window.debugScrollbarStates = function() {
  const msgCentral = document.getElementById('msg-central');
  const msg = document.getElementById('msg');
  
  console.log('=== Scrollbar Debug States ===');
  
  [msgCentral, msg].forEach(ta => {
    if (ta) {
      const shell = ta.closest('.ta-shell');
      const styles = window.getComputedStyle(ta);
      
      console.log(`${ta.id}:`, {
        hasCustomScrollbar: !!ta.__hasCustomScrollbar,
        shell: !!shell,
        maxHeight: styles.maxHeight,
        height: styles.height,
        scrollHeight: ta.scrollHeight,
        clientHeight: ta.clientHeight,
        value: ta.value.length + ' chars'
      });
    }
  });
};

// Test function that properly simulates user input
window.testTextareaExpansion = function(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) {
    console.error('Textarea not found:', textareaId);
    return;
  }
  
  console.log(`Testing textarea expansion for: ${textareaId}`);
  
  // Check if textarea has custom scrollbar - instance is stored on shell, not textarea
  const shell = textarea.closest('.ta-shell');
  const customScrollbar = shell ? shell.__taScroll : null;
  console.log('Custom scrollbar instance:', customScrollbar);
  console.log('Textarea has __hasCustomScrollbar:', !!textarea.__hasCustomScrollbar);
  
  // Check event listeners
  console.log('Event listeners check:');
  console.log('- Input event listeners:', getEventListeners(textarea).input || 'none');
  
  // Long test text
  const longText = `This is a very long text that should trigger the scrollbar. `.repeat(100);
  
  console.log('Setting textarea content...');
  console.log('Target textarea:', textarea.id, textarea);
  console.log('Scrollbar textarea reference:', customScrollbar.ta.id, customScrollbar.ta);
  console.log('Are they the same element?', textarea === customScrollbar.ta);
  
  textarea.focus();
  textarea.value = longText;
  console.log('Content set. ScrollHeight now:', textarea.scrollHeight);
  console.log('Scrollbar ta scrollHeight:', customScrollbar.ta.scrollHeight);
  
  // Test manual updateLayout call with content
  if (customScrollbar) {
    console.log('Testing manual updateLayout call with content...');
    customScrollbar.updateLayout(true);
  } else {
    console.error('No custom scrollbar instance found!');
  }
  
  // Test manual _onInput call
  if (customScrollbar && customScrollbar._onInput) {
    console.log('Manually calling _onInput with content...');
    customScrollbar._onInput();
  }
  
  // Dispatch input event to trigger the scrollbar logic
  console.log('Dispatching input event...');
  const inputEvent = new Event('input', { bubbles: true });
  textarea.dispatchEvent(inputEvent);
  
  // Also try with InputEvent
  const inputEvent2 = new InputEvent('input', { bubbles: true });
  textarea.dispatchEvent(inputEvent2);
  
  // Log the results
  setTimeout(() => {
    console.log(`Final results for ${textareaId}:`, {
      scrollHeight: textarea.scrollHeight,
      clientHeight: textarea.clientHeight,
      value: textarea.value.length + ' chars',
      style: textarea.style.height,
      maxHeight: textarea.style.maxHeight
    });
    
    const track = textarea.closest('.ta-shell').querySelector('.ta-scrollbar');
    console.log('Track status:', {
      isHidden: track.classList.contains('is-hidden'),
      track: track
    });
    
    if (track.classList.contains('is-hidden')) {
      console.log('🔴 ISSUE: Track is still hidden even with content!');
    } else {
      console.log('✅ SUCCESS: Track is visible!');
    }
  }, 100);
};