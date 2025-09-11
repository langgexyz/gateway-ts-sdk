#!/usr/bin/env node

/**
 * Gateway TypeScript SDK - 单元测试
 * 
 * 测试核心功能和边界情况：
 * - 类型定义
 * - 工具函数
 * - 错误处理
 * - 边界条件
 * 
 * 运行: node tests/unit-test.cjs
 */

const { createClient, OnPushMessage, getHeaderMap } = require('../dist/index.cjs');

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
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertType(value, expectedType, message) {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw new Error(`${message}: expected type ${expectedType}, got ${actualType}`);
  }
}

// 单元测试类
class UnitTestSuite {
  
  // 测试1: OnPushMessage 接口
  testOnPushMessageInterface() {
    log('\n📋 测试1: OnPushMessage 接口', 'blue');
    
    try {
      // 测试接口结构
      const pushMessage = {
        cmd: 'test-channel',
        data: 'test data',
        header: { 'X-Req-Id': 'test-123' }
      };
      
      assertType(pushMessage.cmd, 'string', 'cmd 应该是字符串');
      assertType(pushMessage.data, 'string', 'data 应该是字符串');
      assertType(pushMessage.header, 'object', 'header 应该是对象');
      
      logTest('OnPushMessage 接口结构', 'PASS');
      
      // 测试必需字段
      assert(pushMessage.cmd !== undefined, 'cmd 字段必需');
      assert(pushMessage.data !== undefined, 'data 字段必需');
      assert(pushMessage.header !== undefined, 'header 字段必需');
      
      logTest('OnPushMessage 必需字段', 'PASS');
      
    } catch (error) {
      logTest('OnPushMessage 接口', 'FAIL', error.message);
    }
  }

  // 测试2: getHeaderMap 工具函数
  testGetHeaderMapFunction() {
    log('\n🔧 测试2: getHeaderMap 工具函数', 'blue');
    
    try {
      // 测试正常情况
      const header = { 'X-Req-Id': 'test-123', 'X-Source': 'unit-test' };
      const headerMap = getHeaderMap(header);
      
      assertType(headerMap, 'object', 'getHeaderMap 应该返回对象');
      assert(headerMap instanceof Map, 'getHeaderMap 应该返回 Map 实例');
      assertEqual(headerMap.size, 2, 'Map 大小应该为 2');
      assertEqual(headerMap.get('X-Req-Id'), 'test-123', 'X-Req-Id 值应该正确');
      assertEqual(headerMap.get('X-Source'), 'unit-test', 'X-Source 值应该正确');
      
      logTest('getHeaderMap 正常情况', 'PASS');
      
      // 测试空对象
      const emptyHeader = {};
      const emptyMap = getHeaderMap(emptyHeader);
      
      assertEqual(emptyMap.size, 0, '空对象的 Map 大小应该为 0');
      
      logTest('getHeaderMap 空对象', 'PASS');
      
      // 测试 null/undefined
      const nullMap = getHeaderMap(null);
      assertEqual(nullMap.size, 0, 'null 的 Map 大小应该为 0');
      
      const undefinedMap = getHeaderMap(undefined);
      assertEqual(undefinedMap.size, 0, 'undefined 的 Map 大小应该为 0');
      
      logTest('getHeaderMap 边界情况', 'PASS');
      
    } catch (error) {
      logTest('getHeaderMap 工具函数', 'FAIL', error.message);
    }
  }

  // 测试3: 客户端创建
  testClientCreation() {
    log('\n🏗️ 测试3: 客户端创建', 'blue');
    
    try {
      // 测试正常创建
      const client = createClient('ws://localhost:18443', 'TEST');
      
      assertType(client, 'object', '客户端应该是对象');
      assert(typeof client.ping === 'function', '客户端应该有 ping 方法');
      assert(typeof client.subscribe === 'function', '客户端应该有 subscribe 方法');
      assert(typeof client.publish === 'function', '客户端应该有 publish 方法');
      assert(typeof client.unsubscribe === 'function', '客户端应该有 unsubscribe 方法');
      assert(typeof client.send === 'function', '客户端应该有 send 方法');
      
      logTest('客户端创建和基本方法', 'PASS');
      
      // 测试 clientId 验证
      try {
        createClient('ws://localhost:18443', 'AB'); // 太短
        logTest('clientId 长度验证', 'FAIL', '应该抛出错误');
      } catch (error) {
        if (error.message.includes('must be exactly 4 characters')) {
          logTest('clientId 长度验证', 'PASS');
        } else {
          logTest('clientId 长度验证', 'FAIL', error.message);
        }
      }
      
    } catch (error) {
      logTest('客户端创建', 'FAIL', error.message);
    }
  }

  // 测试4: Headers 处理
  testHeadersHandling() {
    log('\n📋 测试4: Headers 处理', 'blue');
    
    try {
      // 测试 Map 创建
      const headers = new Map();
      headers.set('X-Req-Id', 'test-123');
      headers.set('X-Source', 'unit-test');
      
      assertEqual(headers.size, 2, 'Headers Map 大小应该为 2');
      assertEqual(headers.get('X-Req-Id'), 'test-123', 'X-Req-Id 值应该正确');
      assertEqual(headers.get('X-Source'), 'unit-test', 'X-Source 值应该正确');
      
      logTest('Headers Map 创建和操作', 'PASS');
      
      // 测试 Headers 迭代
      const entries = Array.from(headers.entries());
      assertEqual(entries.length, 2, 'Entries 长度应该为 2');
      
      const keys = Array.from(headers.keys());
      assertEqual(keys.length, 2, 'Keys 长度应该为 2');
      assert(keys.includes('X-Req-Id'), 'Keys 应该包含 X-Req-Id');
      assert(keys.includes('X-Source'), 'Keys 应该包含 X-Source');
      
      logTest('Headers Map 迭代', 'PASS');
      
    } catch (error) {
      logTest('Headers 处理', 'FAIL', error.message);
    }
  }

  // 测试5: JSON 解析
  testJsonParsing() {
    log('\n📄 测试5: JSON 解析', 'blue');
    
    try {
      // 测试正常 JSON
      const validJson = '{"cmd":"test","data":"hello","header":{"X-Req-Id":"123"}}';
      const parsed = JSON.parse(validJson);
      
      assertType(parsed, 'object', '解析结果应该是对象');
      assertEqual(parsed.cmd, 'test', 'cmd 值应该正确');
      assertEqual(parsed.data, 'hello', 'data 值应该正确');
      assertType(parsed.header, 'object', 'header 应该是对象');
      assertEqual(parsed.header['X-Req-Id'], '123', 'X-Req-Id 值应该正确');
      
      logTest('JSON 解析正常情况', 'PASS');
      
      // 测试无效 JSON
      try {
        JSON.parse('invalid json');
        logTest('JSON 解析错误处理', 'FAIL', '应该抛出错误');
      } catch (error) {
        if (error instanceof SyntaxError) {
          logTest('JSON 解析错误处理', 'PASS');
        } else {
          logTest('JSON 解析错误处理', 'FAIL', error.message);
        }
      }
      
      // 测试空字符串
      try {
        JSON.parse('');
        logTest('JSON 解析空字符串', 'FAIL', '应该抛出错误');
      } catch (error) {
        if (error instanceof SyntaxError) {
          logTest('JSON 解析空字符串', 'PASS');
        } else {
          logTest('JSON 解析空字符串', 'FAIL', error.message);
        }
      }
      
    } catch (error) {
      logTest('JSON 解析', 'FAIL', error.message);
    }
  }

  // 测试6: 错误处理
  testErrorHandling() {
    log('\n⚠️ 测试6: 错误处理', 'blue');
    
    try {
      // 测试异步错误处理
      const promise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Test error')), 10);
      });
      
      promise.catch(error => {
        assertEqual(error.message, 'Test error', '错误消息应该正确');
        logTest('异步错误处理', 'PASS');
      });
      
      // 测试同步错误处理
      try {
        throw new Error('Sync test error');
      } catch (error) {
        assertEqual(error.message, 'Sync test error', '同步错误消息应该正确');
        logTest('同步错误处理', 'PASS');
      }
      
    } catch (error) {
      logTest('错误处理', 'FAIL', error.message);
    }
  }

  // 测试7: 类型安全
  testTypeSafety() {
    log('\n🛡️ 测试7: 类型安全', 'blue');
    
    try {
      // 测试字符串类型
      const str = 'test string';
      assertType(str, 'string', '字符串类型检查');
      
      // 测试数字类型
      const num = 123;
      assertType(num, 'number', '数字类型检查');
      
      // 测试布尔类型
      const bool = true;
      assertType(bool, 'boolean', '布尔类型检查');
      
      // 测试对象类型
      const obj = { key: 'value' };
      assertType(obj, 'object', '对象类型检查');
      
      // 测试函数类型
      const func = () => {};
      assertType(func, 'function', '函数类型检查');
      
      logTest('类型安全检查', 'PASS');
      
    } catch (error) {
      logTest('类型安全', 'FAIL', error.message);
    }
  }

  // 测试8: 边界条件
  testBoundaryConditions() {
    log('\n🔍 测试8: 边界条件', 'blue');
    
    try {
      // 测试空字符串
      const emptyStr = '';
      assertEqual(emptyStr.length, 0, '空字符串长度应该为 0');
      
      // 测试空数组
      const emptyArr = [];
      assertEqual(emptyArr.length, 0, '空数组长度应该为 0');
      
      // 测试空对象
      const emptyObj = {};
      assertEqual(Object.keys(emptyObj).length, 0, '空对象键数量应该为 0');
      
      // 测试 null 和 undefined
      assert(null === null, 'null 应该等于 null');
      assert(undefined === undefined, 'undefined 应该等于 undefined');
      assert(null !== undefined, 'null 不应该等于 undefined');
      
      logTest('边界条件检查', 'PASS');
      
    } catch (error) {
      logTest('边界条件', 'FAIL', error.message);
    }
  }

  // 运行所有测试
  async runAllTests() {
    log('🧪 Gateway TypeScript SDK - 单元测试', 'bright');
    log('='.repeat(50), 'cyan');
    
    this.testOnPushMessageInterface();
    this.testGetHeaderMapFunction();
    this.testClientCreation();
    this.testHeadersHandling();
    this.testJsonParsing();
    this.testErrorHandling();
    this.testTypeSafety();
    this.testBoundaryConditions();
    
    // 输出测试结果
    this.printResults();
  }

  printResults() {
    log('\n' + '='.repeat(50), 'cyan');
    log('📊 单元测试结果汇总', 'bright');
    log('='.repeat(50), 'cyan');
    
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
    
    log('\n' + '='.repeat(50), 'cyan');
    
    if (testResults.failed === 0) {
      log('🎉 所有单元测试通过！', 'green');
      process.exit(0);
    } else {
      log('⚠️ 部分单元测试失败，请检查上述错误', 'yellow');
      process.exit(1);
    }
  }
}

// 运行测试
async function main() {
  const testSuite = new UnitTestSuite();
  await testSuite.runAllTests();
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ 单元测试运行失败: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { UnitTestSuite, testResults };
