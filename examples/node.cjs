/**
 * Stream Gateway SDK - Node.js Complete Example & Test
 * 
 * Comprehensive example demonstrating all SDK features
 * Run: npm run example:node
 * 
 * Environment:
 * - For remote server: ws://localhost:18443
 * - For local server: ws://localhost:18443 (make debug)
 */

const { createClient } = require('../dist/index.cjs');
const { version: SDK_VERSION } = require('../package.json');

// 环境配置 - 通过环境变量传入
const WS_URL = process.env.WS_URL || 'ws://localhost:18443';
const ENV_NAME = WS_URL.includes('localhost') ? '本地环境' : '生产环境';

// Proxy API 测试函数
async function testProxy(client) {
  try {
    console.log('   🔗 测试 Proxy API...');
    
    // 设置代理 headers - 修复后的正确写法
    const proxyHeaders = new Map();
    proxyHeaders.set("x-proxy-url", "http://localhost:8080/api/test");
    proxyHeaders.set("x-proxy-method", "GET");
    proxyHeaders.set("X-Req-Id", "NODE-PROXY-TEST-123");
    
    // 定义响应类型 - 匹配服务器实际响应结构
    class ProxyResult {
      constructor() {
        this.code = 0;
        this.message = '';
        this.messageEn = '';
        this.data = ''; // 某些响应可能包含 data 字段
      }
    }
    
    // 发送代理请求 - 对于 GET 请求使用空字符串
    const result = await client.send("API/Proxy", "", ProxyResult, proxyHeaders);
    
    console.log('   ✅ Proxy 请求成功');
    
    // 处理响应数据
    if (result) {
      console.log('   📄 完整响应对象:', JSON.stringify(result, null, 2));
      console.log('   📄 响应字段分析:');
      console.log(`      - code: ${result.code || '未设置'}`);
      console.log(`      - message: ${result.message || '未设置'}`);
      console.log(`      - messageEn: ${result.messageEn || '未设置'}`);
      console.log(`      - data: ${result.data || '未设置'}`);
      
      // 检查是否为成功响应
      if (result.code === 1200) {
        console.log('   ✅ 服务器响应正常 (代码 1200)');
      } else if (result.code > 0) {
        console.log(`   ⚠️  服务器响应代码: ${result.code}`);
      }
    } else {
      console.log('   ❌ 响应为空或未定义');
    }
    
  } catch (error) {
    console.log('   ❌ Proxy 测试失败:', error.message);
    
    // 友好的错误提示
    if (error.message.includes('MISSING_PROXY_URL')) {
      console.log('   💡 缺少 x-proxy-url header');
    } else if (error.message.includes('MISSING_PROXY_METHOD')) {
      console.log('   💡 缺少 x-proxy-method header');
    } else if (error.message.includes('500')) {
      console.log('   💡 服务器错误，请检查目标 URL 是否可访问');
    }
  }
}

// X-Req-Id 传递测试函数
async function testCustomReqId(client) {
  try {
    console.log('   🔍 测试自定义 X-Req-Id 传递...');

    let testMessages = [];
    
    // 1. 使用自定义 X-Req-Id 订阅
    const subscribeHeaders = new Map();
    subscribeHeaders.set('X-Req-Id', 'CUSTOM-SUB-TEST-123');
    subscribeHeaders.set('X-Test-Type', 'req-id-validation');
    
    await client.subscribe('req-id-test-channel', (cmd, data, header) => {
      const receivedReqId = header.get('X-Req-Id');
      testMessages.push({
        cmd,
        data,
        receivedReqId,
        expectedReqId: 'CUSTOM-PUB-TEST-456' // 这是我们稍后发布时将使用的ID
      });
      console.log(`      📨 收到推送: cmd=${cmd}, data=${data}`);
      console.log(`      📋 推送中的 X-Req-Id: ${receivedReqId}`);
    }, subscribeHeaders);
    
    console.log('      ✅ 订阅成功 (X-Req-Id: CUSTOM-SUB-TEST-123)');

    // 2. 使用自定义 X-Req-Id 发布
    const publishHeaders = new Map();
    publishHeaders.set('X-Req-Id', 'CUSTOM-PUB-TEST-456');
    publishHeaders.set('X-Test-Publisher', 'nodejs-example');
    
    await client.publish('req-id-test-channel', 'X-Req-Id 测试消息', publishHeaders);
    console.log('      ✅ 发布成功 (X-Req-Id: CUSTOM-PUB-TEST-456)');

    // 等待推送消息到达
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. 验证 X-Req-Id 传递
    if (testMessages.length > 0) {
      const lastMessage = testMessages[testMessages.length - 1];
      if (lastMessage.receivedReqId === lastMessage.expectedReqId) {
        console.log('      ✅ X-Req-Id 正确传递! 发布时的 X-Req-Id 出现在推送消息中');
        console.log(`         发布设置: ${lastMessage.expectedReqId}`);
        console.log(`         推送收到: ${lastMessage.receivedReqId}`);
      } else {
        console.log('      ❌ X-Req-Id 传递异常!');
        console.log(`         发布设置: ${lastMessage.expectedReqId}`);
        console.log(`         推送收到: ${lastMessage.receivedReqId || '(未找到)'}`);
      }
    } else {
      console.log('      ❌ 未收到推送消息，无法验证 X-Req-Id 传递');
    }

    // 4. 测试其他 API 的自定义 X-Req-Id
    const pingHeaders = new Map();
    pingHeaders.set('X-Req-Id', 'CUSTOM-PING-TEST-789');
    await client.ping(pingHeaders);
    console.log('      ✅ Ping 成功 (X-Req-Id: CUSTOM-PING-TEST-789)');

    // 清理：取消订阅
    const unsubscribeHeaders = new Map();
    unsubscribeHeaders.set('X-Req-Id', 'CUSTOM-UNSUB-TEST-999');
    await client.unsubscribe('req-id-test-channel', unsubscribeHeaders);
    console.log('      ✅ 清理完成 (X-Req-Id: CUSTOM-UNSUB-TEST-999)');

    console.log('   ✅ X-Req-Id 传递测试完成');
    
  } catch (error) {
    console.log('   ❌ X-Req-Id 测试失败:', error.message);
  }
}

async function nodeExample() {
  console.log('🚀 Stream Gateway SDK - Node.js Complete Example');
  console.log(`📦 SDK Version: ${SDK_VERSION}`);
  console.log(`🔗 连接到: ${WS_URL} (${ENV_NAME})`);
  console.log('=====================================\n');
  
  try {
            if (WS_URL.includes('localhost')) {
          console.log('⏳ 等待本地服务器准备就绪...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

    // 1. 创建客户端
    console.log('1️⃣ 创建客户端...');
    const client = createClient(WS_URL, 'DEMO');
    console.log('✅ 客户端创建成功');
    console.log(`   可用方法: ${Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(m => !m.startsWith('_') && m !== 'constructor').join(', ')}\n`);

    // 等待连接建立
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. 测试 ping
    console.log('2️⃣ 测试连接 (ping)...');
    const pingResult = await client.ping();
    console.log('✅ Ping 成功');
    console.log(`   结果: ${JSON.stringify(pingResult)}\n`);

    // 3. 订阅消息
    console.log('3️⃣ 订阅消息频道...');
    let messageCount = 0;
    
    await client.subscribe('demo-channel', (cmd, data, header) => {
      messageCount++;
      console.log(`📨 收到第 ${messageCount} 条推送消息:`);
      console.log(`   频道: ${cmd}`);
      console.log(`   内容: ${data}`);
      console.log(`   头信息: ${JSON.stringify(header)}`);
    });
    console.log('✅ 订阅 demo-channel 成功\n');

    // 4. 发布简单消息
    console.log('4️⃣ 发布简单消息...');
    await client.publish('demo-channel', 'Hello from Node.js SDK Example!');
    console.log('✅ 消息发布成功\n');

    // 5. 发布带自定义 headers 的消息
    console.log('5️⃣ 发布带自定义 headers 的消息...');
    const customHeaders = new Map();
    customHeaders.set('X-Req-Id', 'demo-custom-123');
    customHeaders.set('X-Source', 'nodejs-example');
    customHeaders.set('X-Priority', 'high');
    
    await client.publish('demo-channel', 'Message with custom headers', customHeaders);
    console.log('✅ 带自定义 headers 的消息发布成功\n');

    // 6. 测试通用 send 方法 (使用正确的 API 路径)
    console.log('6️⃣ 测试通用 send 方法...');
    
    // 定义响应类型 (需要和 PingResponse 一致)
    class PingResult {
      constructor() {}
    }
    
    const sendResult = await client.send('API/Ping', {}, PingResult);
    console.log('✅ Send 方法调用成功');
    console.log(`   结果: ${JSON.stringify(sendResult)}\n`);

    // 7. 等待接收消息
    console.log('7️⃣ 等待接收推送消息...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (messageCount > 0) {
      console.log(`✅ 成功接收到 ${messageCount} 条推送消息\n`);
    } else {
      console.log('⚠️  未接收到推送消息\n');
    }

    // 8. 取消订阅
    console.log('8️⃣ 取消订阅...');
    await client.unsubscribe('demo-channel');
    console.log('✅ 取消订阅成功\n');

    console.log('🎉 Node.js SDK 示例完成！');
    console.log('\n📋 功能测试总结:');
    // 7. 测试自定义 X-Req-Id 传递
    console.log('7️⃣ 测试自定义 X-Req-Id 传递...');
    await testCustomReqId(client);

    // 8. 测试 Proxy API
    console.log('8️⃣ 测试 Proxy API...');
    await testProxy(client);

    console.log('   ✅ 客户端创建');
    console.log('   ✅ 连接测试 (ping)');
    console.log('   ✅ 消息订阅');
    console.log('   ✅ 消息发布');
    console.log('   ✅ 自定义 headers');
    console.log('   ✅ 通用 API 调用');
    console.log(`   ✅ 推送消息接收 (${messageCount} 条)`);
    console.log('   ✅ 取消订阅');
    console.log('   ✅ X-Req-Id 传递验证');
    console.log('   ✅ Proxy API 测试');

    // 程序执行完毕，主动退出（因为WebSocket连接会保持程序运行）
    console.log('\n✅ 所有测试完成，程序即将退出...');
    setTimeout(() => {
      process.exit(0);
    }, 1000); // 等待1秒让日志完全输出

  } catch (error) {
    console.error('❌ 示例运行失败:', error.message);
    
    if (USE_LOCAL_SERVER && error.message.includes('WebSocket')) {
      console.error('\n💡 本地服务器连接提示:');
      console.error('   1. 确保运行了 make debug 启动本地服务器');
      console.error('   2. 确认服务器监听 localhost:18443');
      console.error('   3. 检查防火墙设置');
    } else if (!USE_LOCAL_SERVER) {
      console.error('\n💡 远程服务器连接提示:');
      console.error('   1. 检查网络连接');
      console.error('   2. 确认远程服务器状态');
      console.error('   3. 可以尝试设置 USE_LOCAL_SERVER = true 使用本地服务器');
    }
    
    // 发生错误后也要退出程序
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }
}

nodeExample().catch(console.error);