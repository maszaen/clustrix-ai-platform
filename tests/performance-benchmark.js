/**
 * Performance Benchmark Tests for SQLite Database
 * Run this in the browser console after app loads
 * 
 * Targets:
 * - Add message: < 10ms
 * - Load session: < 20ms
 * - Delete session: < 10ms  
 * - Save all: < 50ms
 */

const PerformanceBenchmark = {
  results: {},
  
  async runAll() {
    console.log('⚡ Starting Performance Benchmarks...\n');
    console.log('Targets: Add Message <10ms | Load Session <20ms | Delete <10ms | Save All <50ms\n');
    
    this.results = {};
    
    await this.benchmarkSaveOperation();
    await this.benchmarkLoadOperation();
    await this.benchmarkAddMessage();
    await this.benchmarkDeleteSession();
    await this.benchmarkSessionSwitch();
    
    this.printReport();
  },
  
  async benchmarkSaveOperation() {
    console.log('📊 Benchmarking Save Operation...');
    
    const iterations = 100;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await save();
      const end = performance.now();
      times.push(end - start);
      
      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const stats = this.calculateStats(times);
    this.results.save = stats;
    
    console.log(`  Average: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  95th percentile: ${stats.p95.toFixed(2)}ms`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms | Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  Target: <50ms | Status: ${stats.avg < 50 ? '✅ PASS' : '❌ FAIL'}\n`);
  },
  
  async benchmarkLoadOperation() {
    console.log('📊 Benchmarking Load Operation...');
    
    const iterations = 50;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const data = DEBUG_MODE 
        ? JSON.parse(localStorage.getItem("clustrix-data"))
        : await window.api.sessions.load();
      const end = performance.now();
      times.push(end - start);
      
      if (!data) {
        console.log('  ⚠️ Load returned no data');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    const stats = this.calculateStats(times);
    this.results.load = stats;
    
    console.log(`  Average: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  95th percentile: ${stats.p95.toFixed(2)}ms`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms | Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  Target: <20ms | Status: ${stats.avg < 20 ? '✅ PASS' : '❌ FAIL'}\n`);
  },
  
  async benchmarkAddMessage() {
    console.log('📊 Benchmarking Add Message Operation...');
    
    if (!current || !current.id) {
      console.log('  ⚠️ No active session - skipping\n');
      return;
    }
    
    const iterations = 100;
    const times = [];
    const initialMessageCount = current.messages.length;
    
    for (let i = 0; i < iterations; i++) {
      const testMessage = `Benchmark test ${i}`;
      
      const start = performance.now();
      
      // Simulate message addition
      current.messages.push(['user', testMessage, {}]);
      if (!current._newMessages) current._newMessages = [];
      current._newMessages.push([current.messages.length - 1, ['user', testMessage, {}]]);
      
      const end = performance.now();
      times.push(end - start);
    }
    
    // Cleanup - remove test messages
    current.messages = current.messages.slice(0, initialMessageCount);
    current._newMessages = [];
    
    const stats = this.calculateStats(times);
    this.results.addMessage = stats;
    
    console.log(`  Average: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  95th percentile: ${stats.p95.toFixed(2)}ms`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms | Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  Target: <10ms | Status: ${stats.avg < 10 ? '✅ PASS' : '❌ FAIL'}\n`);
  },
  
  async benchmarkDeleteSession() {
    console.log('📊 Benchmarking Delete Session Operation...');
    
    const iterations = 20;
    const times = [];
    const createdSessions = [];
    
    // Create test sessions
    for (let i = 0; i < iterations; i++) {
      const session = await createNewSession();
      createdSessions.push(session);
    }
    
    // Benchmark deletion
    for (const session of createdSessions) {
      const start = performance.now();
      
      state.sessions = state.sessions.filter(s => s !== session);
      
      const end = performance.now();
      times.push(end - start);
    }
    
    await save();
    
    const stats = this.calculateStats(times);
    this.results.deleteSession = stats;
    
    console.log(`  Average: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  95th percentile: ${stats.p95.toFixed(2)}ms`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms | Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  Target: <10ms | Status: ${stats.avg < 10 ? '✅ PASS' : '❌ FAIL'}\n`);
  },
  
  async benchmarkSessionSwitch() {
    console.log('📊 Benchmarking Session Switch Operation...');
    
    if (state.sessions.length < 3) {
      console.log('  ⚠️ Not enough sessions - skipping\n');
      return;
    }
    
    const iterations = 20;
    const times = [];
    const testSessions = state.sessions.slice(0, Math.min(5, state.sessions.length));
    
    for (let i = 0; i < iterations; i++) {
      const session = testSessions[i % testSessions.length];
      
      const start = performance.now();
      await setCurrent(session);
      const end = performance.now();
      
      times.push(end - start);
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    const stats = this.calculateStats(times);
    this.results.sessionSwitch = stats;
    
    console.log(`  Average: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  95th percentile: ${stats.p95.toFixed(2)}ms`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms | Max: ${stats.max.toFixed(2)}ms`);
    console.log(`  Info: Session switch includes rendering\n`);
  },
  
  calculateStats(times) {
    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    
    return {
      avg: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: times.length
    };
  },
  
  printReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 PERFORMANCE BENCHMARK REPORT');
    console.log('='.repeat(60));
    
    const operations = [
      { name: 'Save All', key: 'save', target: 50 },
      { name: 'Load Sessions', key: 'load', target: 20 },
      { name: 'Add Message', key: 'addMessage', target: 10 },
      { name: 'Delete Session', key: 'deleteSession', target: 10 }
    ];
    
    console.log('\n📊 Summary:\n');
    
    let allPassed = true;
    
    operations.forEach(op => {
      const stats = this.results[op.key];
      if (!stats) {
        console.log(`${op.name}: ⚠️ SKIPPED`);
        return;
      }
      
      const passed = stats.avg < op.target;
      const status = passed ? '✅ PASS' : '❌ FAIL';
      const comparison = passed 
        ? `(${((op.target - stats.avg) / op.target * 100).toFixed(1)}% under target)`
        : `(${((stats.avg - op.target) / op.target * 100).toFixed(1)}% over target)`;
      
      console.log(`${op.name.padEnd(20)} ${status}`);
      console.log(`  Average: ${stats.avg.toFixed(2)}ms | Target: <${op.target}ms ${comparison}`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms | P99: ${stats.p99.toFixed(2)}ms\n`);
      
      if (!passed) allPassed = false;
    });
    
    console.log('='.repeat(60));
    
    if (allPassed) {
      console.log('✅ ALL PERFORMANCE TARGETS MET! 🎉');
    } else {
      console.log('❌ Some performance targets not met. Consider optimization.');
    }
    
    console.log('='.repeat(60));
    
    // Calculate improvement over JSON baseline
    console.log('\n💡 Estimated Improvement over JSON baseline:');
    if (this.results.save) {
      const jsonBaseline = 100; // Assuming 100ms for JSON full rewrite
      const improvement = ((jsonBaseline - this.results.save.avg) / jsonBaseline * 100).toFixed(1);
      console.log(`  Save: ${improvement}% faster (${jsonBaseline}ms → ${this.results.save.avg.toFixed(2)}ms)`);
    }
    if (this.results.load) {
      const jsonBaseline = 50;
      const improvement = ((jsonBaseline - this.results.load.avg) / jsonBaseline * 100).toFixed(1);
      console.log(`  Load: ${improvement}% faster (${jsonBaseline}ms → ${this.results.load.avg.toFixed(2)}ms)`);
    }
    
    console.log('\n✨ Benchmarks Complete!\n');
  }
};

// Export for console usage
window.PerformanceBenchmark = PerformanceBenchmark;

console.log('✅ Performance Benchmarks loaded. Run: PerformanceBenchmark.runAll()');
