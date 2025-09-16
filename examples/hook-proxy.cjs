#!/usr/bin/env node

/**
 * Hook 和 Proxy 功能测试示例
 * 
 * 使用方法:
 * node examples/hook-proxy.cjs
 * 
 * 或使用不同环境:
 * npm run examples:hook-proxy wsurl=local
 * npm run examples:hook-proxy wsurl=dev
 */

const { createClient, HeaderBuilder, HttpMethod } = require('../dist/index.cjs');
const http = require('http');

// 从环境变量获取 WebSocket URL
const WS_URL = process.env.WS_URL || 'ws://localhost:18443';
const ENV_NAME = WS_URL.includes('localhost') ? '本地环境' : 
                 '其他环境';

// 本地测试服务器配置
const TEST_SERVER_PORT = 3001;
const HOOK_URL = `http://localhost:${TEST_SERVER_PORT}/hook`;
const PROXY_TARGET_URL = `http://localhost:${TEST_SERVER_PORT}/api`;

console.log('🚀 Gateway SDK - Hook & Proxy 功能测试');
console.log(`📦 SDK Version: 1.1.0`);
console.log(`🔗 连接到: ${WS_URL} (${ENV_NAME})`);
console.log('=====================================\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 存储接收到的 Hook 和 Proxy 请求
const receivedRequests = {
  hooks: [],
  proxies: []
};

// 创建本地测试服务器
function createTestServer() {
  const server = http.createServer((req, res) => {
    // 启用 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Req-Id, X-Test-Type, X-Message-Type, X-Health-Check, X-Test-Client, User-Agent');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const timestamp = new Date().toISOString();
      
      if (req.url === '/hook') {
        // Hook 回调处理
        const hookData = {
          timestamp,
          method: req.method,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
          url: req.url
        };
        
        receivedRequests.hooks.push(hookData);
        console.log(`🔗 [${timestamp}] Hook 回调接收:`, {
          reqId: req.headers['x-req-id'],
          testType: req.headers['x-test-type'],
          bodyData: hookData.body
        });
        
        // 返回成功响应
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Hook received successfully',
          timestamp,
          reqId: req.headers['x-req-id']
        }));
        
      } else if (req.url.startsWith('/api')) {
        // Proxy 目标 API 模拟
        const proxyData = {
          timestamp,
          method: req.method,
          headers: req.headers,
          body: body || null,
          url: req.url
        };
        
        receivedRequests.proxies.push(proxyData);
        console.log(`🔄 [${timestamp}] Proxy 请求接收:`, {
          method: req.method,
          url: req.url,
          reqId: req.headers['x-req-id']
        });
        
        // 模拟不同的 API 响应
        if (req.url === '/api/users') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            users: [
              { id: 1, name: 'Alice', email: 'alice@example.com' },
              { id: 2, name: 'Bob', email: 'bob@example.com' }
            ],
            total: 2,
            timestamp
          }));
        } else if (req.url === '/api/echo' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            echo: body ? JSON.parse(body) : null,
            headers: req.headers,
            timestamp
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'Mock API response',
            method: req.method,
            url: req.url,
            timestamp,
            receivedData: body || null
          }));
        }
        
      } else {
        // 404 处理
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', url: req.url }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(TEST_SERVER_PORT, () => {
      console.log(`🛠️  本地测试服务器启动: http://localhost:${TEST_SERVER_PORT}`);
      console.log(`🔗 Hook 端点: ${HOOK_URL}`);
      console.log(`🔄 Proxy 目标: ${PROXY_TARGET_URL}`);
      console.log('=====================================\n');
      resolve(server);
    });
  });
}

async function testHookCallback() {
  console.log('🔗 Hook 回调功能测试...');
  
  const client = createClient(WS_URL, 'HOOK');
  
  try {
    // 1. 测试 Hook 回调的 Subscribe
    console.log('1️⃣ 测试 Hook Subscribe...');
    const hookHeaders = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setReqId('hook-subscribe-test')
      .setHeader('X-Test-Type', 'hook-callback')
      .build();
    
    const hookTestObserver = Symbol('hook-test-observer');
    await client.subscribe('hook-test-channel', hookTestObserver, (cmd, data, headers) => {
      console.log(`📨 收到推送: ${data}`);
    }, hookHeaders);
    console.log('✅ Hook Subscribe 发送成功');
    
    // 2. 测试 Hook 回调的 Publish
    console.log('2️⃣ 测试 Hook Publish...');
    const publishHeaders = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setReqId('hook-publish-test')
      .setHeader('X-Message-Type', 'test-notification')
      .build();
    
    await client.publish('hook-test-channel', 'Hook 测试消息', publishHeaders);
    console.log('✅ Hook Publish 发送成功');
    
    // 等待接收推送消息
    await sleep(2000);
    
    // 3. 测试 Hook 回调的 Unsubscribe
    console.log('3️⃣ 测试 Hook Unsubscribe...');
    const unsubHeaders = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setReqId('hook-unsubscribe-test')
      .build();
    
    await client.unsubscribe('hook-test-channel', hookTestObserver, unsubHeaders);
    console.log('✅ Hook Unsubscribe 发送成功');
    
    // 4. 测试 Hook 回调的 Ping
    console.log('4️⃣ 测试 Hook Ping...');
    const pingHeaders = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setReqId('hook-ping-test')
      .setHeader('X-Health-Check', 'true')
      .build();
    
    await client.ping(pingHeaders);
    console.log('✅ Hook Ping 发送成功');
    
    console.log('\n✅ Hook 回调功能测试完成');
    console.log(`📝 Hook 回调统计: 共接收到 ${receivedRequests.hooks.length} 个回调请求\n`);
    
  } catch (error) {
    console.error('❌ Hook 测试失败:', error.message);
  }
}

async function testHookTracing() {
  console.log('🔍 Hook 链路追踪测试...');
  
  const client = createClient(WS_URL, 'TRAC');
  
  try {
    // 测试 1: 自定义 reqId
    console.log('\n1️⃣ 测试自定义 reqId 追踪...');
    const customReqId = 'trace-test-001';
    
    const headers1 = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setReqId(customReqId)
      .setHeader('X-Test-Type', 'custom-reqid')
      .build();
    
    console.log(`📋 发送 reqId: ${customReqId}`);
    await client.ping(headers1);
    console.log('✅ 自定义 reqId 测试完成');
    
    await sleep(1000);
    
    // 测试 2: 自动生成的 reqId
    console.log('\n2️⃣ 测试自动生成 reqId 追踪...');
    
    const headers2 = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setHeader('X-Test-Type', 'auto-reqid')
      // 不设置 reqId，让 SDK 自动生成
      .build();
    
    console.log('📋 使用 SDK 自动生成的 reqId');
    const traceObserver = Symbol('trace-observer');
    await client.subscribe('trace-channel', traceObserver, (cmd, data, headers) => {
      console.log(`📨 收到推送: ${data}`);
    }, headers2);
    console.log('✅ 自动 reqId 测试完成');
    
    await sleep(1000);
    
    // 测试 3: 发布消息并追踪
    console.log('\n3️⃣ 测试发布消息的 reqId 追踪...');
    const publishReqId = 'trace-publish-001';
    
    const headers3 = new HeaderBuilder()
      .setHook(HOOK_URL, HttpMethod.POST)
      .setReqId(publishReqId)
      .setHeader('X-Test-Type', 'publish-reqid')
      .build();
    
    console.log(`📋 发布消息 reqId: ${publishReqId}`);
    await client.publish('trace-channel', 'Hello Tracing!', headers3);
    console.log('✅ 发布消息追踪测试完成');
    
    // 等待一下看Hook回调
    await sleep(2000);
    
    console.log('\n📊 链路追踪结果分析:');
    const tracingHooks = receivedRequests.hooks.filter(h => h.headers && h.headers['x-test-type'] && h.headers['x-test-type'].includes('reqid'));
    tracingHooks.forEach((hook, index) => {
      console.log(`\n📥 追踪 Hook ${index + 1}:`);
      console.log(`   时间: ${hook.timestamp}`);
      console.log(`   ReqId: ${hook.headers['x-req-id'] || '(缺失)'}`);
      console.log(`   测试类型: ${hook.headers['x-test-type'] || '(未设置)'}`);
      console.log(`   Body: ${hook.body ? JSON.stringify(hook.body) : '(empty)'}`);
    });
    
    // 验证链路追踪
    const successCount = tracingHooks.filter(h => h.headers && h.headers['x-req-id']).length;
    console.log(`\n🎯 链路追踪统计:`);
    console.log(`   总追踪请求数: ${tracingHooks.length}`);
    console.log(`   带 reqId 的请求: ${successCount}`);
    console.log(`   追踪成功率: ${tracingHooks.length > 0 ? (successCount / tracingHooks.length * 100).toFixed(1) : 0}%`);
    
    if (successCount === tracingHooks.length && tracingHooks.length > 0) {
      console.log(`\n✅ 链路追踪功能正常！所有 Hook 回调都包含正确的 reqId`);
    } else {
      console.log(`\n❌ 链路追踪存在问题！有 ${tracingHooks.length - successCount} 个回调缺少 reqId`);
    }
    
  } catch (error) {
    console.error('❌ 链路追踪测试失败:', error.message);
  }
}

async function testProxyForwarding() {
  console.log('🔄 Proxy 转发功能测试...');
  
  const client = createClient(WS_URL, 'PRXY');
  
  try {
    // 1. 测试 GET 请求代理
    console.log('1️⃣ 测试 Proxy GET 请求...');
    const getHeaders = new HeaderBuilder()
      .setProxy(`${PROXY_TARGET_URL}/users`, HttpMethod.GET)
      .setReqId('proxy-get-test')
      .setHeader('X-Test-Client', 'gateway-sdk')
      .build();
    
    const getResult = await client.send('API/Proxy', {}, String, getHeaders);
    console.log('✅ Proxy GET 成功');
    try {
      const parsed = JSON.parse(getResult);
      console.log('📄 响应预览:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('📄 响应内容:', getResult.substring(0, 100) + '...');
    }
    
    // 2. 测试 POST 请求代理
    console.log('\n2️⃣ 测试 Proxy POST 请求...');
    const postHeaders = new HeaderBuilder()
      .setProxy(`${PROXY_TARGET_URL}/echo`, HttpMethod.POST)
      .setReqId('proxy-post-test')
      .setHeader('Content-Type', 'application/json')
      .build();
    
    const postData = JSON.stringify({
      message: 'Hello from Gateway Proxy',
      timestamp: new Date().toISOString(),
      test: true
    });
    
    const postResult = await client.send('API/Proxy', postData, String, postHeaders);
    console.log('✅ Proxy POST 成功');
    try {
      const parsed = JSON.parse(postResult);
      console.log('📄 响应预览:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('📄 响应内容:', postResult.substring(0, 100) + '...');
    }
    
    // 3. 测试通用 API 端点
    console.log('\n3️⃣ 测试 Proxy 通用端点...');
    const apiHeaders = new HeaderBuilder()
      .setProxy(`${PROXY_TARGET_URL}/status`, HttpMethod.GET)
      .setReqId('proxy-status-test')
      .setHeader('User-Agent', 'Gateway-SDK/1.1.0')
      .build();
    
    const apiResult = await client.send('API/Proxy', {}, String, apiHeaders);
    console.log('✅ Proxy 通用 API 成功');
    try {
      const statusData = JSON.parse(apiResult);
      console.log('📄 API 响应:', JSON.stringify(statusData, null, 2));
    } catch (e) {
      console.log('📄 API 响应:', apiResult.substring(0, 100) + '...');
    }
    
    console.log('\n✅ Proxy 转发功能测试完成');
    console.log(`📝 Proxy 请求统计: 共转发了 ${receivedRequests.proxies.length} 个请求\n`);
    
  } catch (error) {
    console.error('❌ Proxy 测试失败:', error.message);
    if (error.message.includes('Invalid code point')) {
      console.log('💡 提示: 某些 API 可能返回压缩数据，Gateway 会自动处理解压缩');
    }
  }
}

async function testHeaderBuilderFeatures() {
  console.log('🔧 HeaderBuilder 功能演示...');
  
  // 1. 基本用法
  console.log('1️⃣ 基本 HeaderBuilder 用法:');
  const basicHeaders = new HeaderBuilder()
    .setReqId('demo-123')
    .setHeader('X-Source', 'examples')
    .setHeader('X-Priority', 'high')
    .build();
  
  console.log('📋 构建的头部:', Array.from(basicHeaders.entries()));
  
  // 2. Hook 配置
  console.log('\n2️⃣ Hook 配置示例:');
  const hookHeaders = HeaderBuilder.create()
    .setHook('https://business.com/api/events', HttpMethod.POST)
    .setReqId('hook-demo')
    .setHeader('X-Event-Type', 'subscription')
    .build();
  
  console.log('📋 Hook 头部:', Array.from(hookHeaders.entries()));
  
  // 3. Proxy 配置
  console.log('\n3️⃣ Proxy 配置示例:');
  const proxyHeaders = HeaderBuilder.create()
    .setProxy('https://api.example.com/data', HttpMethod.GET)
    .setReqId('proxy-demo')
    .setHeader('Authorization', 'Bearer token123')
    .build();
  
  console.log('📋 Proxy 头部:', Array.from(proxyHeaders.entries()));
  
  // 4. 批量合并
  console.log('\n4️⃣ 批量合并示例:');
  const mergedHeaders = new HeaderBuilder()
    .merge({ 'X-App': 'my-app', 'X-Version': '1.0' })
    .merge(new Map([['X-User', 'test-user']]))
    .setReqId('merged-demo')
    .build();
  
  console.log('📋 合并后头部:', Array.from(mergedHeaders.entries()));
  
  console.log('\n✅ HeaderBuilder 功能演示完成\n');
}

async function main() {
  let server;
  
  try {
    // 启动本地测试服务器
    server = await createTestServer();
    
    // 如果是本地环境，等待服务器启动
    if (WS_URL.includes('localhost')) {
      console.log('⏳ 等待本地服务器准备就绪...');
      await sleep(2000);
    }
    
    // 演示 HeaderBuilder 功能
    await testHeaderBuilderFeatures();
    
    // 测试 Hook 回调功能
    await testHookCallback();
    
    // 测试 Hook 链路追踪功能
    await testHookTracing();
    
    // 测试 Proxy 转发功能
    await testProxyForwarding();
    
    console.log('🎉 Hook & Proxy 功能测试完成！');
    console.log('\n📋 功能总结:');
    console.log('✅ HeaderBuilder 链式调用');
    console.log('✅ Hook 回调机制 (x-hook-url + x-hook-method)');
    console.log(`✅ Hook 回调统计: ${receivedRequests.hooks.length} 个`);
    
    // 链路追踪统计
    const tracingHooks = receivedRequests.hooks.filter(h => h.headers && h.headers['x-test-type'] && h.headers['x-test-type'].includes('reqid'));
    const tracingSuccessCount = tracingHooks.filter(h => h.headers && h.headers['x-req-id']).length;
    console.log(`✅ Hook 链路追踪: ${tracingSuccessCount}/${tracingHooks.length} 成功`);
    
    console.log('✅ Proxy 转发机制 (x-proxy-url + x-proxy-method)');
    console.log(`✅ Proxy 请求统计: ${receivedRequests.proxies.length} 个`);
    console.log('✅ 自定义请求头设置');
    console.log('✅ 批量头部合并');
    
  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
  } finally {
    // 关闭测试服务器
    if (server) {
      server.close(() => {
        console.log('\n🛠️  本地测试服务器已关闭');
        process.exit(0);
      });
    } else {
      process.exit(1);
    }
  }
}

// 运行测试
main();
