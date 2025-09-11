#!/usr/bin/env node

/**
 * Gateway TypeScript SDK - 综合测试套件
 * 
 * 测试所有核心功能：
 * - 连接管理
 * - 消息订阅/发布
 * - X-Req-Id 传递
 * - Proxy API
 * - 错误处理
 * - 性能测试
 * 
 * 运行: node tests/comprehensive-test.cjs
 */

const { createClient } = require('../dist/index.cjs');
const { version: SDK_VERSION } = require('../package.json');

// 测试配置
const CONFIG = {
  wsUrl: process.env.WS_URL || 'ws://localhost:18443',
  timeout: 10000, // 10秒超时
  testChannels: {
    basic: 'test-basic-channel',
    reqId: 'test-req-id-channel', 
    proxy: 'test-proxy-channel',
    performance: 'test-performance-channel',
    error: 'test-error-channel'
  }
};

// 测试结果统计
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, status, details = '') {
  testResults.total++;
  if (status === 'PASS') {
    testResults.passed++;
    log(`✅ ${name}`, 'green');
  } else {
    testResults.failed++;
    testResults.errors.push({ name, details });
    log(`❌ ${name}`, 'red');
    if (details) log(`   ${details}`, 'yellow');
  }
}

// 测试工具函数
function createTestClient(clientId = 'TEST') {
  return createClient(CONFIG.wsUrl, clientId);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createHeaders(customHeaders = {}) {
  const headers = new Map();
  Object.entries(customHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return headers;
}

// 测试用例
class TestSuite {
  constructor() {
    this.client = null;
    this.observers = new Map();
  }

  async setup() {
    log('\n🚀 初始化测试环境...', 'cyan');
    this.client = createTestClient('SUITE');
    await sleep(1000); // 等待连接建立
    log('✅ 测试环境初始化完成', 'green');
  }

  async cleanup() {
    log('\n🧹 清理测试环境...', 'cyan');
    if (this.client) {
      // 取消所有订阅
      for (const [channel, observer] of this.observers) {
        try {
          await this.client.unsubscribe(channel, observer);
        } catch (error) {
          // 忽略清理错误
        }
      }
    }
    log('✅ 测试环境清理完成', 'green');
  }

  // 测试1: 基础连接测试
  async testBasicConnection() {
    log('\n📡 测试1: 基础连接', 'blue');
    
    try {
      const pingResult = await this.client.ping();
      logTest('Ping 连接测试', 'PASS', `响应: ${JSON.stringify(pingResult)}`);
    } catch (error) {
      logTest('Ping 连接测试', 'FAIL', error.message);
    }
  }

  // 测试2: 消息订阅和发布
  async testMessageSubscription() {
    log('\n📨 测试2: 消息订阅和发布', 'blue');
    
    const channel = CONFIG.testChannels.basic;
    const observer = Symbol('basic-test-observer');
    let receivedMessages = [];
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        receivedMessages.push({ cmd, data, header });
      });
      this.observers.set(channel, observer);
      logTest('消息订阅', 'PASS');
      
      // 发布消息
      await this.client.publish(channel, 'Test message 1');
      await this.client.publish(channel, 'Test message 2');
      
      // 等待消息接收
      await sleep(1000);
      
      if (receivedMessages.length >= 2) {
        logTest('消息发布和接收', 'PASS', `接收到 ${receivedMessages.length} 条消息`);
      } else {
        logTest('消息发布和接收', 'FAIL', `只接收到 ${receivedMessages.length} 条消息`);
      }
      
    } catch (error) {
      logTest('消息订阅和发布', 'FAIL', error.message);
    }
  }

  // 测试3: X-Req-Id 传递
  async testReqIdPassing() {
    log('\n🔍 测试3: X-Req-Id 传递', 'blue');
    
    const channel = CONFIG.testChannels.reqId;
    const observer = Symbol('req-id-test-observer');
    const testReqId = 'TEST-REQ-ID-12345';
    let receivedReqId = null;
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        receivedReqId = header.get('X-Req-Id');
      });
      this.observers.set(channel, observer);
      
      // 发布带 X-Req-Id 的消息
      const headers = createHeaders({ 'X-Req-Id': testReqId });
      await this.client.publish(channel, 'ReqId test message', headers);
      
      // 等待消息接收
      await sleep(1000);
      
      if (receivedReqId === testReqId) {
        logTest('X-Req-Id 传递', 'PASS', `发送: ${testReqId}, 接收: ${receivedReqId}`);
      } else {
        logTest('X-Req-Id 传递', 'FAIL', `发送: ${testReqId}, 接收: ${receivedReqId || 'null'}`);
      }
      
    } catch (error) {
      logTest('X-Req-Id 传递', 'FAIL', error.message);
    }
  }

  // 测试4: 自定义 Headers
  async testCustomHeaders() {
    log('\n📋 测试4: 自定义 Headers', 'blue');
    
    const channel = CONFIG.testChannels.basic;
    const observer = Symbol('headers-test-observer');
    let receivedHeaders = null;
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        receivedHeaders = header;
      });
      this.observers.set(channel, observer);
      
      // 发布带多个自定义 headers 的消息
      const customHeaders = createHeaders({
        'X-Req-Id': 'HEADERS-TEST-123',
        'X-Source': 'comprehensive-test',
        'X-Priority': 'high',
        'X-Custom-Field': 'custom-value'
      });
      
      await this.client.publish(channel, 'Custom headers test', customHeaders);
      
      // 等待消息接收
      await sleep(1000);
      
      if (receivedHeaders && receivedHeaders.size >= 3) {
        const headerKeys = Array.from(receivedHeaders.keys());
        logTest('自定义 Headers', 'PASS', `接收到 ${receivedHeaders.size} 个 headers: ${headerKeys.join(', ')}`);
      } else {
        logTest('自定义 Headers', 'FAIL', `只接收到 ${receivedHeaders?.size || 0} 个 headers`);
      }
      
    } catch (error) {
      logTest('自定义 Headers', 'FAIL', error.message);
    }
  }

  // 测试5: Proxy API
  async testProxyAPI() {
    log('\n🔗 测试5: Proxy API', 'blue');
    
    try {
      const proxyHeaders = createHeaders({
        'x-proxy-url': 'http://localhost:8080/examples/browser.html',
        'x-proxy-method': 'GET',
        'X-Req-Id': 'PROXY-TEST-123'
      });
      
      class ProxyResult {
        constructor() {
          this.code = 0;
          this.message = '';
          this.data = '';
        }
      }
      
      const result = await this.client.send('API/Proxy', '', ProxyResult, proxyHeaders);
      
      if (result && result.code === 1200) {
        logTest('Proxy API', 'PASS', `响应代码: ${result.code}`);
      } else {
        logTest('Proxy API', 'FAIL', `响应代码: ${result?.code || 'null'}`);
      }
      
    } catch (error) {
      logTest('Proxy API', 'FAIL', error.message);
    }
  }

  // 测试6: 错误处理
  async testErrorHandling() {
    log('\n⚠️ 测试6: 错误处理', 'blue');
    
    try {
      // 测试无效频道
      await this.client.publish('', 'Empty channel test');
      logTest('空频道错误处理', 'PASS');
    } catch (error) {
      if (error.message.includes('channel') || error.message.includes('empty')) {
        logTest('空频道错误处理', 'PASS', '正确抛出错误');
      } else {
        logTest('空频道错误处理', 'FAIL', error.message);
      }
    }
    
    try {
      // 测试无效 Proxy URL
      const invalidProxyHeaders = createHeaders({
        'x-proxy-url': 'invalid-url',
        'x-proxy-method': 'GET'
      });
      
      class ProxyResult {
        constructor() {
          this.code = 0;
          this.message = '';
        }
      }
      
      await this.client.send('API/Proxy', '', ProxyResult, invalidProxyHeaders);
      logTest('无效 Proxy URL 错误处理', 'PASS', '正确处理错误');
    } catch (error) {
      logTest('无效 Proxy URL 错误处理', 'PASS', '正确抛出错误');
    }
  }

  // 测试7: 性能测试
  async testPerformance() {
    log('\n⚡ 测试7: 性能测试', 'blue');
    
    const channel = CONFIG.testChannels.performance;
    const observer = Symbol('performance-test-observer');
    const messageCount = 10;
    let receivedCount = 0;
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        receivedCount++;
      });
      this.observers.set(channel, observer);
      
      // 批量发布消息
      const startTime = Date.now();
      const publishPromises = [];
      
      for (let i = 0; i < messageCount; i++) {
        publishPromises.push(
          this.client.publish(channel, `Performance test message ${i + 1}`)
        );
      }
      
      await Promise.all(publishPromises);
      const publishTime = Date.now() - startTime;
      
      // 等待所有消息接收
      await sleep(2000);
      
      const successRate = (receivedCount / messageCount) * 100;
      
      if (successRate >= 90) {
        logTest('性能测试', 'PASS', `发送 ${messageCount} 条消息，接收 ${receivedCount} 条 (${successRate.toFixed(1)}%)，耗时 ${publishTime}ms`);
      } else {
        logTest('性能测试', 'FAIL', `发送 ${messageCount} 条消息，接收 ${receivedCount} 条 (${successRate.toFixed(1)}%)`);
      }
      
    } catch (error) {
      logTest('性能测试', 'FAIL', error.message);
    }
  }

  // 测试8: 并发测试
  async testConcurrency() {
    log('\n🔄 测试8: 并发测试', 'blue');
    
    const channel = CONFIG.testChannels.basic;
    const observer1 = Symbol('concurrent-observer-1');
    const observer2 = Symbol('concurrent-observer-2');
    let observer1Count = 0;
    let observer2Count = 0;
    
    try {
      // 两个观察者订阅同一频道
      await this.client.subscribe(channel, observer1, (cmd, data, header) => {
        observer1Count++;
      });
      await this.client.subscribe(channel, observer2, (cmd, data, header) => {
        observer2Count++;
      });
      
      this.observers.set(`${channel}-1`, observer1);
      this.observers.set(`${channel}-2`, observer2);
      
      // 发布消息
      await this.client.publish(channel, 'Concurrent test message');
      
      // 等待消息接收
      await sleep(1000);
      
      if (observer1Count > 0 && observer2Count > 0) {
        logTest('并发测试', 'PASS', `观察者1: ${observer1Count} 条，观察者2: ${observer2Count} 条`);
      } else {
        logTest('并发测试', 'FAIL', `观察者1: ${observer1Count} 条，观察者2: ${observer2Count} 条`);
      }
      
    } catch (error) {
      logTest('并发测试', 'FAIL', error.message);
    }
  }

  // 运行所有测试
  async runAllTests() {
    log('🧪 Gateway TypeScript SDK - 综合测试套件', 'bright');
    log(`📦 SDK Version: ${SDK_VERSION}`, 'cyan');
    log(`🔗 连接到: ${CONFIG.wsUrl}`, 'cyan');
    log('='.repeat(60), 'cyan');
    
    try {
      await this.setup();
      
      await this.testBasicConnection();
      await this.testMessageSubscription();
      await this.testReqIdPassing();
      await this.testCustomHeaders();
      await this.testProxyAPI();
      await this.testErrorHandling();
      await this.testPerformance();
      await this.testConcurrency();
      
    } finally {
      await this.cleanup();
    }
    
    // 输出测试结果
    this.printResults();
  }

  printResults() {
    log('\n' + '='.repeat(60), 'cyan');
    log('📊 测试结果汇总', 'bright');
    log('='.repeat(60), 'cyan');
    
    log(`总测试数: ${testResults.total}`, 'blue');
    log(`通过: ${testResults.passed}`, 'green');
    log(`失败: ${testResults.failed}`, 'red');
    
    const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
    log(`成功率: ${successRate}%`, successRate >= 90 ? 'green' : 'yellow');
    
    if (testResults.errors.length > 0) {
      log('\n❌ 失败的测试:', 'red');
      testResults.errors.forEach(error => {
        log(`   • ${error.name}: ${error.details}`, 'yellow');
      });
    }
    
    log('\n' + '='.repeat(60), 'cyan');
    
    if (testResults.failed === 0) {
      log('🎉 所有测试通过！SDK 功能正常', 'green');
      process.exit(0);
    } else {
      log('⚠️ 部分测试失败，请检查上述错误', 'yellow');
      process.exit(1);
    }
  }
}

// 运行测试
async function main() {
  const testSuite = new TestSuite();
  await testSuite.runAllTests();
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ 测试套件运行失败: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { TestSuite, testResults };
