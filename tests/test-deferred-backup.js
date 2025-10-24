/**
 * Test Script for Deferred Backup Architecture
 * 
 * This script helps verify the new deferred backup system works correctly.
 * Run this in the DevTools console after building and starting the app.
 */

// Test 1: Verify pendingBackupAndCleanup flag structure
async function testPendingFlagStructure() {
  console.log('=== Test 1: Verify pendingBackupAndCleanup flag structure ===');
  
  const config = await window.api.sync.getConfig();
  
  if (config.pendingBackupAndCleanup) {
    console.log('✓ Pending flag exists:', config.pendingBackupAndCleanup);
    
    const required = ['user', 'username', 'token', 'scheduledAt', 'reason'];
    const missing = required.filter(field => !config.pendingBackupAndCleanup[field]);
    
    if (missing.length === 0) {
      console.log('✓ All required fields present');
    } else {
      console.log('✗ Missing fields:', missing);
    }
    
    const validReasons = ['logout', 'switch-to-internal'];
    if (validReasons.includes(config.pendingBackupAndCleanup.reason)) {
      console.log('✓ Valid reason:', config.pendingBackupAndCleanup.reason);
    } else {
      console.log('✗ Invalid reason:', config.pendingBackupAndCleanup.reason);
    }
  } else {
    console.log('○ No pending flag (expected if no logout/switch pending)');
  }
}

// Test 2: Verify logout flow doesn't have old backup code
async function testLogoutSpeed() {
  console.log('=== Test 2: Test Logout Speed (should be < 2 seconds) ===');
  console.log('Note: This will logout your account. Make sure you can login again!');
  
  const config = await window.api.sync.getConfig();
  if (!config.currentCloudUser) {
    console.log('○ Not logged in, cannot test logout');
    return;
  }
  
  console.log('Starting logout test...');
  const startTime = Date.now();
  
  // Call the internal performLogout function (if accessible)
  // Or manually click logout button and measure time
  console.log('Please click the logout button now...');
  console.log('Timer started at:', new Date().toISOString());
  
  // User should see restart happen within 1-2 seconds
  // After restart, check logs for backup completion
}

// Test 3: Verify switch data source flow
async function testSwitchSpeed() {
  console.log('=== Test 3: Test Data Source Switch Speed (should be < 2 seconds) ===');
  
  const config = await window.api.sync.getConfig();
  console.log('Current mode:', config.currentMode);
  
  if (config.currentMode === 'internal' && config.currentCloudUser) {
    console.log('Ready to test switch from internal to cloud');
    console.log('This should be instant (no backup needed)');
  } else if (config.currentMode === 'cloud') {
    console.log('Ready to test switch from cloud to internal');
    console.log('This should be instant, backup happens after restart');
  } else {
    console.log('○ Cannot test switch (not logged in or invalid state)');
  }
  
  console.log('Please click a data source button now...');
  console.log('Timer started at:', new Date().toISOString());
}

// Test 4: Check logs for backup completion after restart
async function testBackupCompletion() {
  console.log('=== Test 4: Check Backup Completion After Restart ===');
  console.log('This test should be run AFTER a restart following logout/switch');
  
  // Request logs from main process
  const logs = await window.api.logging.getLogs?.();
  
  if (!logs) {
    console.log('✗ Cannot access logs through API');
    console.log('Please check app.log manually for these entries:');
    console.log('  - "STARTUP | pendingBackup | Processing pending backup and cleanup"');
    console.log('  - "STARTUP | pendingBackup | Backup completed, now cleaning up local data"');
    console.log('  - "STARTUP | pendingBackup | Cloud data deleted successfully"');
    console.log('  - "STARTUP | pendingBackup | Pending backup and cleanup completed"');
    return;
  }
  
  const backupLogs = logs.filter(log => 
    log.includes('pendingBackup') && 
    log.includes('STARTUP')
  );
  
  if (backupLogs.length > 0) {
    console.log('✓ Found backup logs:');
    backupLogs.forEach(log => console.log('  -', log));
  } else {
    console.log('○ No backup logs found (expected if no pending backup)');
  }
}

// Test 5: Verify cloud data deletion
async function testCloudDataDeletion(username) {
  console.log('=== Test 5: Verify Cloud Data Deletion ===');
  
  if (!username) {
    console.log('✗ Please provide username: testCloudDataDeletion("your-github-username")');
    return;
  }
  
  const users = await window.api.sync.listCloudUsers();
  console.log('Cloud users found:', users);
  
  const userExists = users.some(user => user.username === username);
  
  if (userExists) {
    console.log('✗ User folder still exists (deletion may not have completed)');
  } else {
    console.log('✓ User folder deleted successfully');
  }
}

// Run all tests
async function runAllTests() {
  console.log('=================================================');
  console.log('Deferred Backup Architecture Test Suite');
  console.log('=================================================\n');
  
  await testPendingFlagStructure();
  console.log('\n');
  
  await testBackupCompletion();
  console.log('\n');
  
  console.log('=================================================');
  console.log('Manual Tests (require user interaction):');
  console.log('=================================================');
  console.log('- Run testLogoutSpeed() and click logout button');
  console.log('- Run testSwitchSpeed() and click data source button');
  console.log('- After restart, run testBackupCompletion()');
  console.log('- Run testCloudDataDeletion("your-username")');
  console.log('\n');
}

// Export test functions
window.deferredBackupTests = {
  runAllTests,
  testPendingFlagStructure,
  testLogoutSpeed,
  testSwitchSpeed,
  testBackupCompletion,
  testCloudDataDeletion
};

console.log('Deferred Backup Test Suite Loaded!');
console.log('Run: deferredBackupTests.runAllTests()');
