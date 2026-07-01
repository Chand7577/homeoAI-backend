/**
 * Load Testing Script for HomeoAI Backend
 * Tests the application's ability to handle 1000+ concurrent requests
 * 
 * Usage: node test-load.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4000';
const CONCURRENT_REQUESTS = 1000;
const TEST_DURATION_MS = 10000; // 10 seconds

// Test endpoints
const endpoints = [
  { method: 'GET', path: '/api/health', name: 'Health Check' },
  { method: 'GET', path: '/api/repertories', name: 'Get Repertories' },
  { method: 'GET', path: '/api/rubrics?page=1&limit=20', name: 'Get Rubrics' },
  { method: 'GET', path: '/api/patients?page=1&limit=20', name: 'Get Patients' },
];

// Statistics
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  errors: {},
  startTime: null,
  endTime: null
};

// Make a single HTTP request
function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    const startTime = Date.now();
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        stats.totalRequests++;
        stats.responseTimes.push(responseTime);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          stats.successfulRequests++;
        } else {
          stats.failedRequests++;
          const errorKey = `${res.statusCode}`;
          stats.errors[errorKey] = (stats.errors[errorKey] || 0) + 1;
        }
        
        resolve({ success: res.statusCode < 400, responseTime });
      });
    });
    
    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      stats.totalRequests++;
      stats.failedRequests++;
      stats.responseTimes.push(responseTime);
      
      const errorKey = error.code || 'UNKNOWN';
      stats.errors[errorKey] = (stats.errors[errorKey] || 0) + 1;
      
      resolve({ success: false, responseTime, error: error.message });
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      stats.failedRequests++;
      stats.errors['TIMEOUT'] = (stats.errors['TIMEOUT'] || 0) + 1;
      resolve({ success: false, error: 'Timeout' });
    });
  });
}

// Calculate statistics
function calculateStats() {
  const sortedTimes = stats.responseTimes.sort((a, b) => a - b);
  const avg = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
  const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
  const min = sortedTimes[0];
  const max = sortedTimes[sortedTimes.length - 1];
  
  return { avg, median, p95, p99, min, max };
}

// Run load test
async function runLoadTest() {
  console.log('🚀 Starting Load Test');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`⏱️  Duration: ${TEST_DURATION_MS / 1000} seconds`);
  console.log(`🔄 Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`📋 Testing ${endpoints.length} endpoints\n`);
  
  stats.startTime = Date.now();
  const endTime = stats.startTime + TEST_DURATION_MS;
  
  // Warm-up request
  console.log('🔥 Warming up...');
  await makeRequest(endpoints[0]);
  
  console.log('🏃 Running load test...\n');
  
  // Continuous load for TEST_DURATION_MS
  const promises = [];
  let requestCount = 0;
  
  while (Date.now() < endTime) {
    for (let i = 0; i < CONCURRENT_REQUESTS && Date.now() < endTime; i++) {
      const endpoint = endpoints[requestCount % endpoints.length];
      promises.push(makeRequest(endpoint));
      requestCount++;
    }
    
    // Wait a bit before next batch
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Wait for all requests to complete
  await Promise.all(promises);
  stats.endTime = Date.now();
  
  // Print results
  printResults();
}

// Print test results
function printResults() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const requestsPerSecond = stats.totalRequests / duration;
  const successRate = (stats.successfulRequests / stats.totalRequests * 100).toFixed(2);
  const timeStats = calculateStats();
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 LOAD TEST RESULTS');
  console.log('='.repeat(70));
  console.log(`⏱️  Total Duration: ${duration.toFixed(2)}s`);
  console.log(`📨 Total Requests: ${stats.totalRequests}`);
  console.log(`✅ Successful: ${stats.successfulRequests} (${successRate}%)`);
  console.log(`❌ Failed: ${stats.failedRequests}`);
  console.log(`🚀 Requests/Second: ${requestsPerSecond.toFixed(2)}`);
  
  console.log('\n📈 Response Times:');
  console.log(`   Min: ${timeStats.min}ms`);
  console.log(`   Max: ${timeStats.max}ms`);
  console.log(`   Avg: ${timeStats.avg.toFixed(2)}ms`);
  console.log(`   Median: ${timeStats.median}ms`);
  console.log(`   P95: ${timeStats.p95}ms`);
  console.log(`   P99: ${timeStats.p99}ms`);
  
  if (Object.keys(stats.errors).length > 0) {
    console.log('\n❌ Errors:');
    Object.entries(stats.errors).forEach(([error, count]) => {
      console.log(`   ${error}: ${count}`);
    });
  }
  
  console.log('\n💡 Performance Assessment:');
  if (successRate >= 99) {
    console.log('   ✅ EXCELLENT - System is highly stable');
  } else if (successRate >= 95) {
    console.log('   ✅ GOOD - System is stable');
  } else if (successRate >= 90) {
    console.log('   ⚠️  WARNING - Some reliability issues');
  } else {
    console.log('   ❌ CRITICAL - System needs optimization');
  }
  
  if (timeStats.p95 < 200) {
    console.log('   ✅ EXCELLENT - Very fast response times');
  } else if (timeStats.p95 < 500) {
    console.log('   ✅ GOOD - Acceptable response times');
  } else if (timeStats.p95 < 1000) {
    console.log('   ⚠️  WARNING - Slow response times');
  } else {
    console.log('   ❌ CRITICAL - Response times too slow');
  }
  
  console.log('='.repeat(70) + '\n');
}

// Run the test
runLoadTest().catch(console.error);
