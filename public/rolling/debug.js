// window.debugScrollbars = function() {
//   console.log('=== Custom Scrollbar Debug ===');
  
//   const shells = document.querySelectorAll('.ta-shell');
//   console.log(`Found ${shells.length} .ta-shell elements`);
  
//   shells.forEach((shell, index) => {
//     console.log(`\nShell ${index + 1}:`);
//     console.log('- Element:', shell);
//     console.log('- Has __taScroll:', !!shell.__taScroll);
    
//     const textarea = shell.querySelector('textarea');
//     const track = shell.querySelector('.ta-scrollbar');
//     const thumb = shell.querySelector('.ta-thumb');
    
//     console.log('- Textarea:', textarea);
//     console.log('- Track:', track);
//     console.log('- Thumb:', thumb);
    
//     if (textarea) {
//       console.log(`- Textarea scrollHeight: ${textarea.scrollHeight}`);
//       console.log(`- Textarea clientHeight: ${textarea.clientHeight}`);
//       console.log(`- Textarea scrollTop: ${textarea.scrollTop}`);
//       console.log(`- Textarea value length: ${textarea.value.length}`);
//       console.log(`- Textarea computed styles:`, window.getComputedStyle(textarea));
//     }
    
//     if (track) {
//       console.log(`- Track hidden: ${track.classList.contains('is-hidden')}`);
//       console.log(`- Track rect:`, track.getBoundingClientRect());
//       console.log(`- Track computed styles:`, window.getComputedStyle(track));
//     }
    
//     if (thumb) {
//       console.log(`- Thumb style height: ${thumb.style.height}`);
//       console.log(`- Thumb transform: ${thumb.style.transform}`);
//     }
//   });
  
//   console.log('\n=== End Debug ===');
// };

// window.testScrollbar = function(targetId = 'msg-central') {
//   console.log(`Testing scrollbar for #${targetId}`);
  
//   const textarea = document.getElementById(targetId);
//   if (!textarea) {
//     console.error(`Textarea #${targetId} not found`);
//     return;
//   }
  
//   textarea.disabled = false;
  
//   const longText = Array(50).fill('This is a very long line of text that should cause the textarea to grow in height and eventually trigger the custom scrollbar. ').join('\n');
  
//   textarea.value = longText;
  
//   textarea.dispatchEvent(new Event('input', { bubbles: true }));
  
//   const shell = textarea.closest('.ta-shell');
//   if (shell && shell.__taScroll) {
//     console.log('Manually calling updateLayout...');
//     shell.__taScroll.updateLayout(true);
//   }
  
//   console.log('Added long text, checking scrollbar state...');
  
//   setTimeout(() => {
//     window.debugScrollbars();
//   }, 200);
// };

// window.forceShowScrollbar = function(targetId = 'msg-central') {
//   const shell = document.querySelector(`#${targetId}`).closest('.ta-shell');
//   if (!shell) return;
  
//   const track = shell.querySelector('.ta-scrollbar');
//   const thumb = shell.querySelector('.ta-thumb');
  
//   if (track) {
//     track.classList.remove('is-hidden');
//     track.style.display = 'block';
//   }
  
//   if (thumb) {
//     thumb.style.height = '40px';
//     thumb.style.transform = 'translateY(10px)';
//   }
  
//   console.log('Forced scrollbar to show for testing');
// };

// setTimeout(() => {
//   console.log('Auto-running scrollbar debug...');
//   window.debugScrollbars();
  
//   console.log('\nTo test scrollbars, run:');
//   console.log('- testScrollbar("msg-central") or testScrollbar("msg")');
//   console.log('- forceShowScrollbar("msg-central") to force show scrollbar');
  
//   setTimeout(() => {
//     console.log('\n🧪 Auto-testing scrollbar...');
//     window.testScrollbar('msg-central');
//   }, 1000);
// }, 1000);