#!/usr/bin/env node

/**
 * Gateway TypeScript SDK - 性能测试
 * 
 * 测试 SDK 的性能表现：
 * - 连接建立时间
 * - 消息吞吐量
 * - 内存使用
 * - 并发处理能力
 * 
 * 运行: node tests/performance-test.cjs
 */

const { createClient } = require('../dist/index.cjs');

// 性能测试配置
const CONFIG = {
  wsUrl: process.env.WS_URL || 'ws://localhost:18443',
  testChannels: {
    throughput: 'perf-throughput-channel',
    concurrency: 'perf-concurrency-channel',
    stress: 'perf-stress-channel'
  },
  testSizes: {
    small: 10,
    medium: 100,
    large: 1000
  }
};

// 性能指标
const metrics = {
  connectionTime: 0,
  messageLatency: [],
  throughput: 0,
  memoryUsage: 0,
  errorRate: 0
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 性能测试类
class PerformanceTestSuite {
  constructor() {
    this.client = null;
    this.observers = new Map();
  }

  async setup() {
    log('\n🚀 初始化性能测试环境...', 'cyan');
    this.client = createClient(CONFIG.wsUrl, 'PERF');
    await this.sleep(1000);
    log('✅ 性能测试环境初始化完成', 'green');
  }

  async cleanup() {
    log('\n🧹 清理性能测试环境...', 'cyan');
    if (this.client) {
      for (const [channel, observer] of this.observers) {
        try {
          await this.client.unsubscribe(channel, observer);
        } catch (error) {
          // 忽略清理错误
        }
      }
    }
    log('✅ 性能测试环境清理完成', 'green');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 测试1: 连接建立时间
  async testConnectionTime() {
    log('\n⚡ 测试1: 连接建立时间', 'blue');
    
    const iterations = 5;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const client = createClient(CONFIG.wsUrl, `CONN${i}`);
      
      try {
        await client.ping();
        const endTime = Date.now();
        times.push(endTime - startTime);
        log(`   连接 ${i + 1}: ${endTime - startTime}ms`, 'yellow');
      } catch (error) {
        log(`   连接 ${i + 1} 失败: ${error.message}`, 'red');
      }
    }
    
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      metrics.connectionTime = avgTime;
      
      log(`📊 连接建立时间统计:`, 'cyan');
      log(`   平均: ${formatTime(avgTime)}`, 'green');
      log(`   最小: ${formatTime(minTime)}`, 'green');
      log(`   最大: ${formatTime(maxTime)}`, 'green');
      
      if (avgTime < 1000) {
        log('✅ 连接建立时间测试通过', 'green');
      } else {
        log('⚠️ 连接建立时间较慢', 'yellow');
      }
    } else {
      log('❌ 连接建立时间测试失败', 'red');
    }
  }

  // 测试2: 消息吞吐量
  async testMessageThroughput() {
    log('\n📨 测试2: 消息吞吐量', 'blue');
    
    const channel = CONFIG.testChannels.throughput;
    const observer = Symbol('throughput-observer');
    let receivedCount = 0;
    const messageSizes = CONFIG.testSizes;
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        receivedCount++;
      });
      this.observers.set(channel, observer);
      
      // 测试不同大小的消息
      for (const [sizeName, count] of Object.entries(messageSizes)) {
        log(`\n   测试 ${sizeName} 规模 (${count} 条消息):`, 'yellow');
        
        receivedCount = 0;
        const startTime = Date.now();
        
        // 批量发布消息
        const publishPromises = [];
        for (let i = 0; i < count; i++) {
          publishPromises.push(
            this.client.publish(channel, `Message ${i + 1} - ${sizeName} test`)
          );
        }
        
        await Promise.all(publishPromises);
        const publishTime = Date.now() - startTime;
        
        // 等待消息接收
        await this.sleep(2000);
        
        const throughput = (receivedCount / publishTime) * 1000; // 消息/秒
        const successRate = (receivedCount / count) * 100;
        
        log(`     发送: ${count} 条`, 'cyan');
        log(`     接收: ${receivedCount} 条`, 'cyan');
        log(`     耗时: ${formatTime(publishTime)}`, 'cyan');
        log(`     吞吐量: ${throughput.toFixed(2)} 消息/秒`, 'cyan');
        log(`     成功率: ${successRate.toFixed(1)}%`, 'cyan');
        
        if (successRate >= 90) {
          log(`     ✅ ${sizeName} 规模测试通过`, 'green');
        } else {
          log(`     ⚠️ ${sizeName} 规模成功率较低`, 'yellow');
        }
      }
      
    } catch (error) {
      log(`❌ 消息吞吐量测试失败: ${error.message}`, 'red');
    }
  }

  // 测试3: 消息延迟
  async testMessageLatency() {
    log('\n⏱️ 测试3: 消息延迟', 'blue');
    
    const channel = CONFIG.testChannels.throughput;
    const observer = Symbol('latency-observer');
    const latencies = [];
    const testCount = 20;
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        const receiveTime = Date.now();
        const sendTime = parseInt(data.split('|')[1]);
        if (sendTime) {
          latencies.push(receiveTime - sendTime);
        }
      });
      this.observers.set(channel, observer);
      
      // 发送带时间戳的消息
      for (let i = 0; i < testCount; i++) {
        const sendTime = Date.now();
        await this.client.publish(channel, `Latency test ${i}|${sendTime}`);
        await this.sleep(100); // 避免发送过快
      }
      
      // 等待所有消息接收
      await this.sleep(2000);
      
      if (latencies.length > 0) {
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const minLatency = Math.min(...latencies);
        const maxLatency = Math.max(...latencies);
        
        metrics.messageLatency = latencies;
        
        log(`📊 消息延迟统计:`, 'cyan');
        log(`   平均延迟: ${formatTime(avgLatency)}`, 'green');
        log(`   最小延迟: ${formatTime(minLatency)}`, 'green');
        log(`   最大延迟: ${formatTime(maxLatency)}`, 'green');
        log(`   测试消息: ${latencies.length}/${testCount}`, 'green');
        
        if (avgLatency < 100) {
          log('✅ 消息延迟测试通过', 'green');
        } else {
          log('⚠️ 消息延迟较高', 'yellow');
        }
      } else {
        log('❌ 消息延迟测试失败', 'red');
      }
      
    } catch (error) {
      log(`❌ 消息延迟测试失败: ${error.message}`, 'red');
    }
  }

  // 测试4: 并发处理能力
  async testConcurrency() {
    log('\n🔄 测试4: 并发处理能力', 'blue');
    
    const channel = CONFIG.testChannels.concurrency;
    const observerCount = 10;
    const messageCount = 50;
    const observers = [];
    const receivedCounts = new Array(observerCount).fill(0);
    
    try {
      // 创建多个观察者
      for (let i = 0; i < observerCount; i++) {
        const observer = Symbol(`concurrent-observer-${i}`);
        await this.client.subscribe(channel, observer, (cmd, data, header) => {
          receivedCounts[i]++;
        });
        observers.push(observer);
        this.observers.set(`${channel}-${i}`, observer);
      }
      
      log(`   创建了 ${observerCount} 个并发观察者`, 'cyan');
      
      // 发送消息
      const startTime = Date.now();
      const publishPromises = [];
      
      for (let i = 0; i < messageCount; i++) {
        publishPromises.push(
          this.client.publish(channel, `Concurrent message ${i + 1}`)
        );
      }
      
      await Promise.all(publishPromises);
      const publishTime = Date.now() - startTime;
      
      // 等待消息接收
      await this.sleep(3000);
      
      const totalReceived = receivedCounts.reduce((a, b) => a + b, 0);
      const expectedTotal = observerCount * messageCount;
      const successRate = (totalReceived / expectedTotal) * 100;
      
      log(`📊 并发处理统计:`, 'cyan');
      log(`   观察者数量: ${observerCount}`, 'green');
      log(`   消息数量: ${messageCount}`, 'green');
      log(`   期望接收: ${expectedTotal}`, 'green');
      log(`   实际接收: ${totalReceived}`, 'green');
      log(`   成功率: ${successRate.toFixed(1)}%`, 'green');
      log(`   处理时间: ${formatTime(publishTime)}`, 'green');
      
      // 检查每个观察者的接收情况
      const minReceived = Math.min(...receivedCounts);
      const maxReceived = Math.max(...receivedCounts);
      log(`   最少接收: ${minReceived}`, 'cyan');
      log(`   最多接收: ${maxReceived}`, 'cyan');
      
      if (successRate >= 95) {
        log('✅ 并发处理能力测试通过', 'green');
      } else {
        log('⚠️ 并发处理成功率较低', 'yellow');
      }
      
    } catch (error) {
      log(`❌ 并发处理能力测试失败: ${error.message}`, 'red');
    }
  }

  // 测试5: 内存使用
  async testMemoryUsage() {
    log('\n💾 测试5: 内存使用', 'blue');
    
    try {
      const initialMemory = process.memoryUsage();
      log(`📊 初始内存使用:`, 'cyan');
      log(`   RSS: ${formatBytes(initialMemory.rss)}`, 'green');
      log(`   Heap Used: ${formatBytes(initialMemory.heapUsed)}`, 'green');
      log(`   Heap Total: ${formatBytes(initialMemory.heapTotal)}`, 'green');
      
      // 创建大量客户端和消息
      const clients = [];
      const messageCount = 1000;
      
      for (let i = 0; i < 10; i++) {
        const client = createClient(CONFIG.wsUrl, `MEM${i}`);
        clients.push(client);
      }
      
      // 发送大量消息
      const channel = CONFIG.testChannels.stress;
      const publishPromises = [];
      
      for (let i = 0; i < messageCount; i++) {
        publishPromises.push(
          this.client.publish(channel, `Memory test message ${i}`)
        );
      }
      
      await Promise.all(publishPromises);
      
      const afterMemory = process.memoryUsage();
      const memoryIncrease = afterMemory.heapUsed - initialMemory.heapUsed;
      
      log(`📊 测试后内存使用:`, 'cyan');
      log(`   RSS: ${formatBytes(afterMemory.rss)}`, 'green');
      log(`   Heap Used: ${formatBytes(afterMemory.heapUsed)}`, 'green');
      log(`   Heap Total: ${formatBytes(afterMemory.heapTotal)}`, 'green');
      log(`   内存增长: ${formatBytes(memoryIncrease)}`, 'green');
      
      if (memoryIncrease < 50 * 1024 * 1024) { // 50MB
        log('✅ 内存使用测试通过', 'green');
      } else {
        log('⚠️ 内存使用较高', 'yellow');
      }
      
      metrics.memoryUsage = memoryIncrease;
      
    } catch (error) {
      log(`❌ 内存使用测试失败: ${error.message}`, 'red');
    }
  }

  // 测试6: 压力测试
  async testStressTest() {
    log('\n💪 测试6: 压力测试', 'blue');
    
    const channel = CONFIG.testChannels.stress;
    const observer = Symbol('stress-observer');
    let receivedCount = 0;
    const stressCount = 500;
    
    try {
      // 订阅
      await this.client.subscribe(channel, observer, (cmd, data, header) => {
        receivedCount++;
      });
      this.observers.set(channel, observer);
      
      log(`   开始压力测试 (${stressCount} 条消息)...`, 'yellow');
      
      const startTime = Date.now();
      
      // 快速连续发送消息
      const publishPromises = [];
      for (let i = 0; i < stressCount; i++) {
        publishPromises.push(
          this.client.publish(channel, `Stress test message ${i + 1}`)
        );
      }
      
      await Promise.all(publishPromises);
      const publishTime = Date.now() - startTime;
      
      // 等待消息接收
      await this.sleep(5000);
      
      const successRate = (receivedCount / stressCount) * 100;
      const throughput = (receivedCount / publishTime) * 1000;
      
      log(`📊 压力测试结果:`, 'cyan');
      log(`   发送消息: ${stressCount}`, 'green');
      log(`   接收消息: ${receivedCount}`, 'green');
      log(`   成功率: ${successRate.toFixed(1)}%`, 'green');
      log(`   吞吐量: ${throughput.toFixed(2)} 消息/秒`, 'green');
      log(`   处理时间: ${formatTime(publishTime)}`, 'green');
      
      if (successRate >= 80) {
        log('✅ 压力测试通过', 'green');
      } else {
        log('⚠️ 压力测试成功率较低', 'yellow');
      }
      
    } catch (error) {
      log(`❌ 压力测试失败: ${error.message}`, 'red');
    }
  }

  // 运行所有性能测试
  async runAllTests() {
    log('⚡ Gateway TypeScript SDK - 性能测试', 'bright');
    log(`🔗 连接到: ${CONFIG.wsUrl}`, 'cyan');
    log('='.repeat(60), 'cyan');
    
    try {
      await this.setup();
      
      await this.testConnectionTime();
      await this.testMessageThroughput();
      await this.testMessageLatency();
      await this.testConcurrency();
      await this.testMemoryUsage();
      await this.testStressTest();
      
    } finally {
      await this.cleanup();
    }
    
    // 输出性能报告
    this.printPerformanceReport();
  }

  printPerformanceReport() {
    log('\n' + '='.repeat(60), 'cyan');
    log('📊 性能测试报告', 'bright');
    log('='.repeat(60), 'cyan');
    
    log(`连接建立时间: ${formatTime(metrics.connectionTime)}`, 'blue');
    
    if (metrics.messageLatency.length > 0) {
      const avgLatency = metrics.messageLatency.reduce((a, b) => a + b, 0) / metrics.messageLatency.length;
      log(`平均消息延迟: ${formatTime(avgLatency)}`, 'blue');
    }
    
    log(`内存使用增长: ${formatBytes(metrics.memoryUsage)}`, 'blue');
    
    log('\n📈 性能评级:', 'bright');
    
    // 连接时间评级
    if (metrics.connectionTime < 500) {
      log('✅ 连接建立: 优秀 (< 500ms)', 'green');
    } else if (metrics.connectionTime < 1000) {
      log('✅ 连接建立: 良好 (< 1s)', 'green');
    } else {
      log('⚠️ 连接建立: 需要优化 (> 1s)', 'yellow');
    }
    
    // 内存使用评级
    if (metrics.memoryUsage < 10 * 1024 * 1024) { // 10MB
      log('✅ 内存使用: 优秀 (< 10MB)', 'green');
    } else if (metrics.memoryUsage < 50 * 1024 * 1024) { // 50MB
      log('✅ 内存使用: 良好 (< 50MB)', 'green');
    } else {
      log('⚠️ 内存使用: 需要优化 (> 50MB)', 'yellow');
    }
    
    log('\n' + '='.repeat(60), 'cyan');
    log('🎉 性能测试完成！', 'green');
  }
}

// 运行性能测试
async function main() {
  const testSuite = new PerformanceTestSuite();
  await testSuite.runAllTests();
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ 性能测试运行失败: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { PerformanceTestSuite, metrics };
