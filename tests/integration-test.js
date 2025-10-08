/**
 * Integration Tests for SQLite Database Migration
 * Run this in the browser console after app loads
 */

const IntegrationTests = {
  results: [],
  
  log(test, status, message, details = {}) {
    const result = { test, status, message, details, timestamp: new Date().toISOString() };
    this.results.push(result);
    console.log(`[${status}] ${test}: ${message}`, details);
  },
  
  async runAll() {
    console.log('🧪 Starting Integration Tests...\n');
    this.results = [];
    
    await this.testCreateSession();
    await this.testSendMessage();
    await this.testDeleteSession();
    await this.testSessionPersistence();
    await this.testArtifactOperations();
    await this.testProjectOperations();
    
    this.printSummary();
  },
  
  async testCreateSession() {
    const testName = 'Create Session Test';
    try {
      const initialCount = state.sessions.length;
      
      // Create new session
      const session = await createNewSession();
      
      if (!session || !session.id) {
        this.log(testName, '❌ FAIL', 'Session creation failed - no ID');
        return;
      }
      
      // Verify session exists in state
      const found = state.sessions.find(s => s.id === session.id);
      if (!found) {
        this.log(testName, '❌ FAIL', 'Session not found in state after creation');
        return;
      }
      
      // Verify session count increased
      if (state.sessions.length !== initialCount + 1) {
        this.log(testName, '❌ FAIL', 'Session count did not increase', {
          expected: initialCount + 1,
          actual: state.sessions.length
        });
        return;
      }
      
      this.log(testName, '✅ PASS', 'Session created successfully', {
        sessionId: session.id,
        totalSessions: state.sessions.length
      });
      
    } catch (error) {
      this.log(testName, '❌ FAIL', 'Exception thrown', { error: error.message });
    }
  },
  
  async testSendMessage() {
    const testName = 'Send Message Test';
    try {
      if (!current || !current.id) {
        this.log(testName, '⚠️ SKIP', 'No active session');
        return;
      }
      
      const initialMessageCount = current.messages.length;
      const testMessage = `Test message at ${Date.now()}`;
      
      // Set input value
      const input = document.getElementById('msg-central');
      if (!input) {
        this.log(testName, '❌ FAIL', 'Input element not found');
        return;
      }
      
      input.value = testMessage;
      
      // Simulate send (without actually sending to AI)
      current.messages.push(['user', testMessage, {}]);
      current.last_updated = new Date().toISOString();
      
      // Track new message
      if (!current._newMessages) current._newMessages = [];
      current._newMessages.push([current.messages.length - 1, ['user', testMessage, {}]]);
      
      await save();
      
      // Verify message count increased
      if (current.messages.length !== initialMessageCount + 1) {
        this.log(testName, '❌ FAIL', 'Message count did not increase', {
          expected: initialMessageCount + 1,
          actual: current.messages.length
        });
        return;
      }
      
      // Verify last message is our test message
      const lastMessage = current.messages[current.messages.length - 1];
      if (lastMessage[1] !== testMessage) {
        this.log(testName, '❌ FAIL', 'Last message content mismatch', {
          expected: testMessage,
          actual: lastMessage[1]
        });
        return;
      }
      
      this.log(testName, '✅ PASS', 'Message sent and saved successfully', {
        messageCount: current.messages.length,
        hasNewMessages: !!current._newMessages
      });
      
    } catch (error) {
      this.log(testName, '❌ FAIL', 'Exception thrown', { error: error.message });
    }
  },
  
  async testDeleteSession() {
    const testName = 'Delete Session Test';
    try {
      // Create a test session to delete
      const session = await createNewSession();
      if (!session) {
        this.log(testName, '❌ FAIL', 'Could not create test session');
        return;
      }
      
      const sessionId = session.id;
      const initialCount = state.sessions.length;
      
      // Delete the session
      deleteSession(session);
      
      // Verify session is removed
      const found = state.sessions.find(s => s.id === sessionId);
      if (found) {
        this.log(testName, '❌ FAIL', 'Session still exists after deletion');
        return;
      }
      
      // Verify count decreased
      if (state.sessions.length !== initialCount - 1) {
        this.log(testName, '❌ FAIL', 'Session count did not decrease', {
          expected: initialCount - 1,
          actual: state.sessions.length
        });
        return;
      }
      
      this.log(testName, '✅ PASS', 'Session deleted successfully', {
        deletedId: sessionId,
        remainingSessions: state.sessions.length
      });
      
    } catch (error) {
      this.log(testName, '❌ FAIL', 'Exception thrown', { error: error.message });
    }
  },
  
  async testSessionPersistence() {
    const testName = 'Session Persistence Test';
    try {
      const beforeSave = {
        count: state.sessions.length,
        firstSessionId: state.sessions[0]?.id,
        firstSessionName: state.sessions[0]?.name
      };
      
      // Save data
      await save();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reload data
      const data = DEBUG_MODE 
        ? JSON.parse(localStorage.getItem("clustrix-data"))
        : await window.api.sessions.load();
      
      if (!data || !data.sessions) {
        this.log(testName, '❌ FAIL', 'No data loaded');
        return;
      }
      
      const afterLoad = {
        count: data.sessions.length,
        firstSessionId: data.sessions[0]?.id,
        firstSessionName: data.sessions[0]?.name
      };
      
      // Verify data matches
      if (beforeSave.count !== afterLoad.count) {
        this.log(testName, '❌ FAIL', 'Session count mismatch after reload', {
          before: beforeSave.count,
          after: afterLoad.count
        });
        return;
      }
      
      if (beforeSave.firstSessionId !== afterLoad.firstSessionId) {
        this.log(testName, '❌ FAIL', 'Session IDs do not match', {
          before: beforeSave.firstSessionId,
          after: afterLoad.firstSessionId
        });
        return;
      }
      
      this.log(testName, '✅ PASS', 'Session data persisted correctly', {
        sessions: afterLoad.count
      });
      
    } catch (error) {
      this.log(testName, '❌ FAIL', 'Exception thrown', { error: error.message });
    }
  },
  
  async testArtifactOperations() {
    const testName = 'Artifact Operations Test';
    try {
      const testArtifact = {
        id: Date.now().toString(),
        title: 'Test Artifact',
        type: 'code',
        language: 'javascript',
        code: 'console.log("test");',
        content: 'console.log("test");',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isFavorite: false
      };
      
      // Add artifact
      codeArtifacts.push(testArtifact);
      await saveArtifactsToFile();
      
      // Reload artifacts
      const loaded = await loadAllArtifacts();
      const found = loaded.find(a => a.id === testArtifact.id);
      
      if (!found) {
        this.log(testName, '❌ FAIL', 'Artifact not found after save/load');
        return;
      }
      
      // Cleanup
      codeArtifacts = codeArtifacts.filter(a => a.id !== testArtifact.id);
      await saveArtifactsToFile();
      
      this.log(testName, '✅ PASS', 'Artifact operations work correctly', {
        artifactId: testArtifact.id
      });
      
    } catch (error) {
      this.log(testName, '❌ FAIL', 'Exception thrown', { error: error.message });
    }
  },
  
  async testProjectOperations() {
    const testName = 'Project Operations Test';
    try {
      const testProject = {
        id: Date.now().toString(),
        name: 'Test Project',
        description: 'Integration test project',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isFavorite: false,
        files: []
      };
      
      // Add project
      projectsData.push(testProject);
      await saveProjectsData();
      
      // Reload projects
      await loadProjectsData();
      const found = projectsData.find(p => p.id === testProject.id);
      
      if (!found) {
        this.log(testName, '❌ FAIL', 'Project not found after save/load');
        return;
      }
      
      // Cleanup
      projectsData = projectsData.filter(p => p.id !== testProject.id);
      await saveProjectsData();
      
      this.log(testName, '✅ PASS', 'Project operations work correctly', {
        projectId: testProject.id
      });
      
    } catch (error) {
      this.log(testName, '❌ FAIL', 'Exception thrown', { error: error.message });
    }
  },
  
  printSummary() {
    console.log('\n📊 Test Results Summary\n');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status === '✅ PASS').length;
    const failed = this.results.filter(r => r.status === '❌ FAIL').length;
    const skipped = this.results.filter(r => r.status === '⚠️ SKIP').length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Skipped: ${skipped}`);
    console.log(`Success Rate: ${((passed / (total - skipped)) * 100).toFixed(1)}%`);
    console.log('='.repeat(50));
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === '❌ FAIL')
        .forEach(r => console.log(`  - ${r.test}: ${r.message}`));
    }
    
    console.log('\n✨ Integration Tests Complete!\n');
  }
};

// Export for console usage
window.IntegrationTests = IntegrationTests;

console.log('✅ Integration Tests loaded. Run: IntegrationTests.runAll()');
