// Menu Debugging Helper
// Add this to your browser console or include it temporarily in your app

function debugMenuPositioning() {
  console.log('=== MENU POSITIONING DEBUG ===');
  
  // Find all menu containers
  const menuContainers = document.querySelectorAll('.chat-menu-container');
  console.log(`Found ${menuContainers.length} menu containers`);
  
  menuContainers.forEach((container, index) => {
    const dropdown = container.querySelector('.chat-menu-dropdown');
    const button = container.querySelector('.chat-menu-btn');
    const listItem = container.closest('li, .chat-item');
    
    console.log(`\n--- Menu ${index + 1} ---`);
    console.log('Container:', container);
    console.log('Dropdown:', dropdown);
    console.log('Button:', button);
    console.log('List Item:', listItem);
    
    // Check positioning context
    const containerStyles = getComputedStyle(container);
    const dropdownStyles = getComputedStyle(dropdown);
    const listItemStyles = getComputedStyle(listItem);
    
    console.log('Container position:', containerStyles.position);
    console.log('Dropdown position:', dropdownStyles.position);
    console.log('List Item position:', listItemStyles.position);
    console.log('List Item z-index:', listItemStyles.zIndex);
    console.log('Dropdown z-index:', dropdownStyles.zIndex);
    
    // Check if dropdown is visible
    const isVisible = dropdown.classList.contains('clicked-open') || 
                     dropdown.classList.contains('show') ||
                     dropdownStyles.visibility === 'visible';
    console.log('Dropdown visible:', isVisible);
    
    if (isVisible) {
      const dropdownRect = dropdown.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      console.log('Button rect:', buttonRect);
      console.log('Dropdown rect:', dropdownRect);
      
      // Check for overlapping elements
      const elementsAtDropdownPos = document.elementsFromPoint(
        dropdownRect.left + dropdownRect.width/2, 
        dropdownRect.top + dropdownRect.height/2
      );
      console.log('Elements at dropdown center:', elementsAtDropdownPos);
    }
  });
}

function highlightMenuElements() {
  console.log('=== HIGHLIGHTING MENU ELEMENTS ===');
  
  // Add temporary styles for debugging
  const style = document.createElement('style');
  style.id = 'debug-menu-styles';
  style.innerHTML = `
    .chat-menu-container {
      outline: 2px solid red !important;
    }
    .chat-menu-dropdown {
      outline: 3px solid blue !important;
      background: rgba(255, 255, 0, 0.9) !important;
    }
    #session-list li {
      outline: 1px solid green !important;
    }
    .chat-item {
      outline: 1px solid purple !important;
    }
    .session-item-group {
      outline: 1px dashed orange !important;
    }
  `;
  document.head.appendChild(style);
  
  console.log('Added debug highlighting. Use removeDebugHighlighting() to remove.');
}

function removeDebugHighlighting() {
  const debugStyle = document.getElementById('debug-menu-styles');
  if (debugStyle) {
    debugStyle.remove();
    console.log('Debug highlighting removed.');
  }
}

function testMenuOverlap() {
  console.log('=== TESTING MENU OVERLAP ===');
  
  // Find the first menu and open it
  const firstMenu = document.querySelector('.chat-menu-btn');
  if (firstMenu) {
    firstMenu.click();
    console.log('Opened first menu for testing');
    
    setTimeout(() => {
      debugMenuPositioning();
      
      // Check what's covering the menu
      const dropdown = document.querySelector('.chat-menu-dropdown.clicked-open');
      if (dropdown) {
        const rect = dropdown.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const elementsAtCenter = document.elementsFromPoint(centerX, centerY);
        console.log('Elements covering menu center:', elementsAtCenter);
        
        // Check each element's z-index and position
        elementsAtCenter.forEach((el, i) => {
          const styles = getComputedStyle(el);
          console.log(`Element ${i}:`, el, {
            position: styles.position,
            zIndex: styles.zIndex,
            background: styles.background
          });
        });
      }
    }, 100);
  }
}

// Export functions to global scope for console access
window.debugMenuPositioning = debugMenuPositioning;
window.highlightMenuElements = highlightMenuElements;
window.removeDebugHighlighting = removeDebugHighlighting;
window.testMenuOverlap = testMenuOverlap;

console.log('Menu debugging tools loaded! Available commands:');
console.log('- debugMenuPositioning() - Analyze positioning contexts');
console.log('- highlightMenuElements() - Add visual debugging outlines');
console.log('- removeDebugHighlighting() - Remove visual debugging');
console.log('- testMenuOverlap() - Test menu overlap issues');