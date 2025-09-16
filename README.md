# Gateway TypeScript SDK

TypeScript SDK for Gateway WebSocket server with unified API design.

## ⚠️ 重要依赖

**此 SDK 需要配合 Gateway Go Server 使用！**

使用前请确保：
1. **启动 Gateway Go Server**: 参考 [gateway-go-server](https://github.com/langgexyz/gateway-go-server) 启动服务器
2. **服务器地址**: 默认为 `ws://localhost:18443`，可根据服务器配置调整
3. **生产环境**: 配置 nginx 反向代理以支持 HTTPS 和正确的超时设置 (见下方配置说明)
4. **连接测试**: 确保 WebSocket 连接正常后再使用 SDK 功能

```bash
# 1. 启动 Go 服务器（在 gateway-go-server 目录）
make debug

# 2. 使用 TypeScript SDK（在 gateway-ts-sdk 目录）
npm install
npm run examples:node
```

## Features

- 🔗 **智能连接管理**: 自动重连机制，按需建立连接以优化资源使用
- 📨 **Subscribe/Publish 消息**: 符合观察者模式的发布订阅机制
- 🏓 **Ping 连接测试**: 支持连接健康检查
- 🔄 **HTTP 代理功能**: 统一的 HTTP 请求代理接口
- 🪝 **Hook 回调集成**: 灵活的业务逻辑回调机制
- 📋 **HeaderBuilder**: 流畅的请求头构建工具
- 🎯 **TypeScript 类型安全**: 完整的类型定义和智能提示
- 🔍 **端到端请求追踪**: 基于 reqID 的完整请求链路追踪
- 🌐 **跨平台支持**: 同时支持 Node.js 和浏览器环境
- ⚡ **高效资源管理**: 无需定期心跳，240秒自然超时释放资源
- 🔧 **nginx 兼容**: 完美支持 nginx 反向代理和 HTTPS

## Installation

### 从 npm registry 安装

```bash
# 配置私有 registry
npm config set registry https://packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/

# 或临时使用私有 registry
npm install gateway-ts-sdk --registry=https://packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/

# 安装最新版本
npm install gateway-ts-sdk

# 安装指定版本
npm install gateway-ts-sdk@1.1.0
```

### 从本地包安装（开发环境）

```bash
# 安装本地打包文件
npm install ./gateway-ts-sdk-1.1.0.tgz
```

### Registry 配置说明

如果您的项目需要同时使用公共 npm 和私有 registry，建议在项目根目录创建 `.npmrc` 文件：

```bash
# .npmrc
@your-scope:registry=https://packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/
registry=https://registry.npmjs.org/
```

或者使用 npm 命令配置：

```bash
# 设置私有 registry
npm config set registry https://packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/

# 恢复官方 registry
npm config set registry https://registry.npmjs.org/

# 查看当前 registry 配置
npm config get registry
```

## Quick Start

### 前置条件

此 SDK 需要配合独立的 Gateway Go Server 使用。请先克隆两个仓库：

```bash
# 克隆服务器仓库
git clone https://github.com/langgexyz/gateway-go-server.git

# 克隆客户端 SDK 仓库 (本项目)
git clone https://github.com/langgexyz/gateway-ts-sdk.git
```

在使用 SDK 之前，请确保完成以下步骤：

#### 1. 启动 Gateway 服务器

```bash
# 切换到服务器目录 (需要单独克隆 gateway-go-server 仓库)
cd path/to/gateway-go-server

# 编译并启动服务器
make debug

# 确认服务器启动成功，应看到类似输出：
# [INFO] Server started on :18443
```

#### 2. 安装和测试 SDK

```bash
# 返回 SDK 目录
cd path/to/gateway-ts-sdk

# 安装依赖
npm install

# 快速测试连接
npm run examples:node
```

#### 3. nginx 反向代理配置 (生产环境)

如果在生产环境中使用，通常需要通过 nginx 反向代理来提供 HTTPS 支持。以下是关键的 WebSocket 代理配置：

```nginx
# /etc/nginx/sites-available/your-domain
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 配置
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;
    
    # Gateway WebSocket 代理配置
    location /gateway {
        proxy_pass http://127.0.0.1:18443;
        proxy_http_version 1.1;
        
        # WebSocket 升级头信息
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # ⚠️ 关键：WebSocket 长连接超时配置
        proxy_connect_timeout 10s;   # 连接建立超时
        proxy_read_timeout 300s;     # 读取超时 (大于Gateway的240s心跳)
        proxy_send_timeout 300s;     # 发送超时
        
        # 禁用缓冲以支持实时传输
        proxy_buffering off;
        proxy_cache off;
    }
}
```

**重要说明**:
- `proxy_read_timeout` 和 `proxy_send_timeout` 必须大于 Gateway 服务器的心跳间隔 (240秒)
- 如果使用默认的 60 秒超时，WebSocket 连接会每 60 秒断开一次
- 配置完成后记得重载 nginx: `sudo nginx -s reload`

配置后您的客户端连接地址变更为：
```typescript
// 使用 nginx 代理的 WSS 连接
const client = createClient('wss://your-domain.com/gateway');
```

### 基础使用示例

```typescript
import { createClient, HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// 1. Create client (default clientId: '0000')
const client = createClient('ws://localhost:18443');

// Create client with custom clientId (must be exactly 4 characters)
const customClient = createClient('ws://localhost:18443', 'A001');

// 2. Subscribe to messages
await client.subscribe('notifications', (cmd, data, headers) => {
  console.log('Received:', { cmd, data });
  console.log('Request ID:', headers['X-Req-Id']);
});

// 3. Publish message
await client.publish('user-action', 'Hello World');

// 4. Test connection
await client.ping();

// 5. HTTP Proxy with HeaderBuilder
const proxyHeaders = new HeaderBuilder()
  .setProxy('https://api.example.com/data', HttpMethod.POST)
  .setReqId('my-proxy-request')
  .setHeader('Authorization', 'Bearer token123')
  .build();

const response = await client.send('API/Proxy', { key: 'value' }, String, proxyHeaders);
console.log(response);

// 6. Hook Callback Integration
const hookHeaders = new HeaderBuilder()
  .setHook('https://your-business.com/webhook', HttpMethod.POST)
  .setReqId('hook-callback-001')
  .build();

await client.subscribe('important-events', (cmd, data, headers) => {
  console.log('Event received:', data);
}, hookHeaders); // Server will call your webhook when subscribing
```

## Core API

### Basic Methods

```typescript
// Create client
const client = createClient('ws://localhost:18443');

// Subscribe to channel with header access
await client.subscribe('cmd', (cmd, data, header) => {
  console.log(`Command: ${cmd}, Data: ${data}`);
  console.log(`Request ID: ${header['X-Req-Id']}`);
});

// Subscribe with custom request ID
const headers = new Map([['X-Req-Id', 'my-subscribe-123']]);
await client.subscribe('chat', (cmd, data, header) => {
  console.log(`Received: ${cmd} with ID: ${header['X-Req-Id']}`);
}, headers);

// Unsubscribe from channel
await client.unsubscribe('cmd');

// Unsubscribe with custom request ID
await client.unsubscribe('cmd', headers);

// Publish message  
await client.publish('cmd', 'data');

// Publish with custom request ID
await client.publish('cmd', 'Important Message', headers);

// Test connection
await client.ping();

// Ping with custom request ID
await client.ping(headers);
```

### Unified Send Method

All functionality uses `client.send()`:

```typescript
// Standard API calls
await client.send('API/Subscribe', request, ResponseType);
await client.send('API/Publish', request, ResponseType);

// Proxy calls (add x-proxy-* headers)
const headers = new Map([
  ['x-proxy-url', 'https://api.example.com'],
  ['x-proxy-method', 'POST']
]);
await client.send('API/Proxy', request, ResponseType, headers);

// Custom request ID (optional)
const customHeaders = new Map([
  ['X-Req-Id', 'my-custom-req-id-12345']
]);
await client.send('API/Subscribe', request, ResponseType, customHeaders);
```

### ⚠️ Important: ResponseType Mapping Rules

The `responseType` class must define properties that **exactly match** the server response JSON fields:

- ✅ **Mapped**: Only fields defined in the responseType class will be mapped from server response
- ❌ **Ignored**: Fields in server response but not in responseType class will be ignored  
- 🔄 **Default**: Fields in responseType class but not in server response will keep default values

**Example - Correct ResponseType:**
```typescript
// Server returns: {"code":1200,"message":"Success","data":"result"}
class ApiResponse {
  constructor() {
    this.code = 0;        // ✅ Matches server field
    this.message = '';    // ✅ Matches server field  
    this.data = '';       // ✅ Matches server field
  }
}
// Result: {code:1200, message:"Success", data:"result"} ✅
```

**Example - Incorrect ResponseType:**
```typescript
// Server returns: {"code":1200,"message":"Success","data":"result"}
class BadResponse {
  constructor() {
    this.result = '';     // ❌ Server doesn't have 'result' field
    // Missing: code, message, data fields
  }
}
// Result: {result:""} ❌ - All server data is lost!
```

## 订阅发布模式

Gateway 支持多种消息传递模式，通过不同的频道命名和 Hook 机制实现精确的消息路由。

### 技术实现原理

#### 三种模式的 Service 职责

| 模式 | Service 职责 | 技术实现 | Hook 作用 |
|------|-------------|----------|-----------|
| **1对所有** | 无需维护订阅者列表 | Gateway 自动广播给所有订阅者 | 可选：监控统计 |
| **1对多** | 通过 Hook 维护分组关系 | Gateway + Hook 确定目标用户 | 必需：权限验证、分组管理 |
| **1对1** | Service 和 Client 约定唯一标识 | 使用 `@` 前缀特殊频道 | 可选：会话管理 |

#### 消息路由机制
- **1对所有**: Gateway 直接广播，Service 无需知道订阅者
- **1对多**: Hook 告知 Service 哪些用户订阅了哪些分组
- **1对1**: Client 直接指定目标用户，Service 不参与路由

### 1对所有（Broadcast）

**技术实现**：Service 无需维护订阅者列表，Gateway 自动广播

#### Web 端实现

```typescript
import { createClient, HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// 1. 多个用户订阅同一频道
const user1 = createClient('ws://localhost:18443', 'USR1');
const user2 = createClient('ws://localhost:18443', 'USR2');
const user3 = createClient('ws://localhost:18443', 'USR3');

// 用户订阅（Hook 可选，仅用于统计）
await user1.subscribe('global-news', (cmd, data, headers) => {
  console.log('[用户1] 收到广播:', data);
});

await user2.subscribe('global-news', (cmd, data, headers) => {
  console.log('[用户2] 收到广播:', data);
});

await user3.subscribe('global-news', (cmd, data, headers) => {
  console.log('[用户3] 收到广播:', data);
});

// 2. Service 直接发布，无需知道有多少订阅者
const publisher = createClient('ws://localhost:18443', 'SRV1');

await publisher.publish('global-news', '系统维护通知：今晚 23:00 开始');
// Gateway 自动发送给所有订阅 global-news 的客户端
```

#### Hook 使用（可选）

如果需要监控订阅行为：

```typescript
// 带 Hook 的订阅（可选）
const monitorHeaders = new HeaderBuilder()
  .setHook('https://your-business.com/api/broadcast-monitor', HttpMethod.POST)
  .setReqId('monitor-subscribe-001')
  .setHeader('X-User-Id', 'user123')
  .build();

await user1.subscribe('global-news', callback, monitorHeaders);
```

Hook 接收数据：
```json
{
  "cmd": ["global-news"],
  "headers": {
    "X-Req-Id": "monitor-subscribe-001",
    "X-User-Id": "user123",
    "api": "API/Subscribe"
  }
}
```

#### 业务系统实现（可选）

```javascript
// 仅用于统计监控，不影响消息传递
app.post('/api/broadcast-monitor', (req, res) => {
  const { cmd, headers } = req.body;
  const userId = headers['X-User-Id'];
  
  // 可选：统计订阅数据
  await incrementSubscriptionCount(cmd[0]);
  await logUserActivity(userId, 'subscribe', cmd[0]);
  
  res.json({ success: true });
});
```

**技术要点**：
- ✅ **Service 职责**：只需 `publish`，无需维护订阅者列表
- ✅ **Gateway 职责**：自动广播给所有订阅者
- ✅ **Hook 用途**：可选的监控统计，不影响消息路由
- ✅ **适用场景**：系统公告、实时数据推送、全局状态更新

### 1对多（Group/Topic）

**技术实现**：Hook 必需，Service 通过 Hook 维护 cmd 对应的 Client 列表

#### Web 端实现

```typescript
import { createClient, HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// 1. 用户订阅分组 A（带 Hook）
const userA = createClient('ws://localhost:18443', 'USRA');

const groupAHeaders = new HeaderBuilder()
  .setHook('https://your-service.com/api/group-hook', HttpMethod.POST)
  .setReqId('group-a-sub-001')
  .setHeader('X-User-Id', 'user123')
  .build();

await userA.subscribe('group:A', (cmd, data, headers) => {
  console.log('分组A消息:', data);
}, groupAHeaders);

// 2. 用户订阅分组 B（带 Hook）
const userB = createClient('ws://localhost:18443', 'USRB');

const groupBHeaders = new HeaderBuilder()
  .setHook('https://your-service.com/api/group-hook', HttpMethod.POST)
  .setReqId('group-b-sub-001')
  .setHeader('X-User-Id', 'user456')
  .build();

await userB.subscribe('group:B', (cmd, data, headers) => {
  console.log('分组B消息:', data);
}, groupBHeaders);

// 3. 发布者发布分组消息
const publisher = createClient('ws://localhost:18443', 'PUB1');

// 发布给分组 A
await publisher.publish('group:A', '分组A专属消息');

// 发布给分组 B  
await publisher.publish('group:B', '分组B专属消息');
```

#### Hook 接收到的数据

用户订阅分组时，Hook 接收：
```json
{
  "cmd": ["group:A"],
  "headers": {
    "X-Req-Id": "group-a-sub-001",
    "X-User-Id": "user123",
    "api": "API/Subscribe"
  }
}
```

#### 业务系统需要实现

```javascript
// 存储分组订阅关系
const groupSubscriptions = {};

// POST https://your-service.com/api/group-hook
app.post('/api/group-hook', (req, res) => {
  const { cmd, headers } = req.body;
  const userId = headers['X-User-Id'];
  const channel = cmd[0]; // "group:A"
  
  // 核心：维护 cmd 对应的 Client 列表
  if (!groupSubscriptions[channel]) {
    groupSubscriptions[channel] = [];
  }
  groupSubscriptions[channel].push(userId);
  
  console.log(`用户 ${userId} 订阅了 ${channel}`);
  console.log(`${channel} 当前有 ${groupSubscriptions[channel].length} 个订阅者`);
  
  res.json({ success: true });
});

// 查询接口：Service 可查询特定 cmd 的订阅者
app.get('/api/subscribers/:cmd', (req, res) => {
  const cmd = req.params.cmd;
  const subscribers = groupSubscriptions[cmd] || [];
  res.json({
    cmd: cmd,
    count: subscribers.length,
    subscribers: subscribers
  });
});
```

**技术要点**：
- ✅ **Service 职责**：通过 Hook 维护每个 cmd 对应哪些 Client
- ✅ **Hook 必需**：用于权限验证、分组管理、订阅关系维护
- ✅ **频道分组**：使用前缀模式（如 `group:vip`、`dept:tech`）
- ✅ **权限控制**：业务系统决定用户是否可订阅特定分组

### 1对1（Point-to-Point）

**技术实现**：Service 和 Client 约定唯一标识，Hook 可选

#### Web 端实现

```typescript
import { createClient, HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// 1. 用户 A 订阅自己的私有频道
const userA = createClient('ws://localhost:18443', 'A001');

await userA.subscribe('@user:userA', (cmd, data, headers) => {
  console.log('用户A 收到私信:', data);
  console.log('请求ID:', headers['X-Req-Id']);
});

// 2. 用户 B 订阅自己的私有频道
const userB = createClient('ws://localhost:18443', 'B002');

await userB.subscribe('@user:userB', (cmd, data, headers) => {
  console.log('用户B 收到私信:', data);
  console.log('请求ID:', headers['X-Req-Id']);
});

// 3. 用户 A 向用户 B 发送私信
const msgHeaders = new HeaderBuilder()
  .setReqId('msg-001')
  .build();

await userA.publish('@user:userB', 'Hello userB!', msgHeaders);

// 4. 用户 B 回复用户 A
const replyHeaders = new HeaderBuilder()
  .setReqId('reply-001')
  .build();

await userB.publish('@user:userA', 'Hello userA!', replyHeaders);

// 结果：只有 userA 和 userB 能收到彼此的私信
```

#### Hook 使用（可选）

如果需要监控 1对1 会话：

```typescript
// 带 Hook 的订阅（可选）
const sessionHeaders = new HeaderBuilder()
  .setHook('https://your-service.com/api/p2p-hook', HttpMethod.POST)
  .setReqId('p2p-sub-001')
  .build();

await userA.subscribe('@user:userA', callback, sessionHeaders);
```

Hook 接收数据：
```json
{
  "cmd": ["@user:userA"],
  "headers": {
    "X-Req-Id": "p2p-sub-001",
    "api": "API/Subscribe"
  }
}
```

#### 业务系统需要实现（可选）

```javascript
// 存储用户会话状态
const userSessions = {};

// POST https://your-service.com/api/p2p-hook
app.post('/api/p2p-hook', (req, res) => {
  const { cmd, headers } = req.body;
  const channel = cmd[0]; // "@user:userA"
  
  // 提取用户ID
  const userId = channel.replace('@user:', '');
  
  // 可选：记录用户上线
  console.log(`用户 ${userId} 订阅了私有频道`);
  userSessions[userId] = { 
    online: true, 
    lastSeen: new Date() 
  };
  
  res.json({ success: true });
});
```

**技术要点**：
- ✅ **Service 职责**：与 Client 约定唯一标识符（如用户ID）
- ✅ **频道格式**：使用 `@` 前缀 + 标识符（如 `@user:alice`）
- ✅ **Hook 可选**：仅用于会话监控，不影响消息路由
- ✅ **路由机制**：Client 直接指定目标，Gateway 精确投递

#### 频道命名规范

| 频道格式 | 说明 | 示例 | 接收者 |
|----------|------|------|--------|
| `@user:{userId}` | 用户私有频道 | `@user:alice` | 用户 alice 的所有设备 |
| `@client:{clientId}` | 客户端私有频道 | `@client:A001` | 特定客户端 A001 |
| `@session:{sessionId}` | 会话私有频道 | `@session:sess123` | 会话参与者 |
| `@device:{deviceId}` | 设备私有频道 | `@device:phone001` | 特定设备 |



### 组合使用示例

实际应用中，通常会组合使用多种模式：

```typescript
import { createClient, HeaderBuilder } from 'gateway-ts-sdk';

class ChatApplication {
  constructor(userId, clientId) {
    this.client = createClient('ws://localhost:18443', clientId);
    this.userId = userId;
    this.clientId = clientId;
  }

  async init() {
    // 1. 订阅全局公告（1对所有）
    await this.client.subscribe('system-announcements', (cmd, data) => {
      this.showSystemMessage(data);
    });

    // 2. 订阅用户群组消息（1对多）
    await this.client.subscribe(`group:${this.userGroup}`, (cmd, data) => {
      this.showGroupMessage(data);
    });

    // 3. 订阅私人消息（1对1）
    await this.client.subscribe(`@user:${this.userId}`, (cmd, data, headers) => {
      this.showPrivateMessage(data, headers['X-From-User']);
    });

    // 4. 订阅在线状态更新（1对多）
    await this.client.subscribe('user-status', (cmd, data) => {
      this.updateUserStatus(data);
    });
  }

  // 发送群组消息（1对多）
  async sendGroupMessage(message) {
    const headers = new HeaderBuilder()
      .setReqId(`group-msg-${Date.now()}`)
      .setHeader('X-From-User', this.userId)
      .setHeader('X-Message-Type', 'group')
      .build();

    await this.client.publish(`group:${this.userGroup}`, message, headers);
  }

  // 发送私人消息（1对1）
  async sendPrivateMessage(targetUserId, message) {
    const headers = new HeaderBuilder()
      .setReqId(`private-msg-${Date.now()}`)
      .setHeader('X-From-User', this.userId)
      .setHeader('X-Message-Type', 'private')
      .build();

    await this.client.publish(`@user:${targetUserId}`, message, headers);
  }

  // 广播在线状态（1对所有）
  async broadcastStatus(status) {
    const headers = new HeaderBuilder()
      .setReqId(`status-${Date.now()}`)
      .setHeader('X-User-Id', this.userId)
      .build();

    await this.client.publish('user-status', {
      userId: this.userId,
      status: status,
      timestamp: Date.now()
    }, headers);
  }
}

// 使用示例
const chatApp = new ChatApplication('user123', 'CHAT');
await chatApp.init();

// 发送群组消息
await chatApp.sendGroupMessage('大家好，我在线了！');

// 发送私人消息
await chatApp.sendPrivateMessage('user456', '你好，最近怎么样？');

// 更新在线状态
await chatApp.broadcastStatus('online');
```

### 消息路由规则

| 频道模式 | 示例 | 接收者 | 使用场景 |
|----------|------|--------|----------|
| 普通频道 | `news`, `chat`, `alerts` | 所有订阅该频道的客户端 | 广播、群组消息 |
| 客户端私有 | `@client:A001` | 指定 ClientID 的客户端 | 客户端间直接通信 |
| 用户私有 | `@user:user123` | 指定 UserID 的所有客户端 | 用户跨设备消息 |
| 会话私有 | `@session:sess789` | 指定会话的参与者 | 临时会话消息 |

### Request Tracing

The SDK automatically generates unique request IDs for tracing:

- **Format**: `rrrrrrrr-cccc-ssss-ssss-ttttttttttttt` (e.g., `327dcdec-A001-1234-5678-1734567890123`)
  - `r`: Random component (8 hex chars)
  - `c`: Client ID (4 chars, configurable)
  - `s`: Global auto-increment sequence (8 decimal chars, split as high 4 - low 4)
  - `t`: Millisecond timestamp (13 decimal chars, directly readable)
- **Client Logs**: `[Gateway] reqid:xxx API/Subscribe failed: timeout` (only errors are logged)
- **Server Logs**: Automatically logged by Go framework with request ID
- **Headers**: Request ID sent as `X-Req-Id` header (auto-generated if not provided)
- **Benefits**: Contains randomness, timestamp for ordering, and sequence for tracing request flow

### Manual Request ID Generation

You can generate consistent request IDs for custom tracking:

```typescript
// Generate unique request ID
const reqId = client.getNextReqId();
console.log(reqId); // "d6eb5c5d-A001-0000-0001-1756350630061"

// Use in SDK calls
const headers = new Map([['X-Req-Id', reqId]]);
await client.publish('channel', 'data', headers);

// Use for external API correlation
await fetch('/api/external', {
  headers: { 'X-Trace-Id': reqId }
});
```

## HeaderBuilder

Fluent interface for building request headers:

```typescript
import { HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// Basic usage
const headers = new HeaderBuilder()
  .setReqId('my-request-123')
  .setHeader('X-Source', 'mobile-app')
  .setHeader('X-Priority', 'high')
  .build();

// Hook configuration
const hookHeaders = HeaderBuilder.create()
  .setHook('https://business.com/webhook', HttpMethod.POST)
  .setReqId('hook-123')
  .setHeader('Authorization', 'Bearer token')
  .build();

// Proxy configuration
const proxyHeaders = HeaderBuilder.create()
  .setProxy('https://api.third-party.com/data', HttpMethod.GET)
  .setReqId('proxy-456')
  .setHeader('X-API-Key', 'key123')
  .build();

// Merge from objects or Maps
const mergedHeaders = new HeaderBuilder()
  .merge({ 'X-App': 'myapp', 'X-Version': '1.0' })
  .merge(new Map([['X-User', 'alice']]))
  .setReqId('merged-789')
  .build();
```

## Hook Callbacks

Hook 功能允许服务器在处理 API 请求时，异步回调您的业务系统。

### 使用方式

```typescript
import { HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// 配置 Hook 回调
const hookHeaders = new HeaderBuilder()
  .setHook('https://your-business.com/webhook', HttpMethod.POST)
  .setReqId('hook-subscribe-001')
  .setHeader('Authorization', 'Bearer your-token')
  .build();

// 订阅时触发 Hook
await client.subscribe('user-events', (cmd, data, headers) => {
  console.log(`Received: ${data}`);
}, hookHeaders);

// 发布时触发 Hook
await client.publish('notifications', 'Important message', hookHeaders);

// Ping 时触发 Hook
await client.ping(hookHeaders);
```

### Hook 时序图

```
Client                 Gateway Server            Your Business Server
  |                           |                           |
  |  1. subscribe/publish     |                           |
  |  (with x-hook-* headers)  |                           |
  |-------------------------->|                           |
  |                           |                           |
  |                           |  2. Process request       |
  |                           |      (subscribe/publish)  |
  |                           |                           |
  |  3. Success response      |                           |
  |<--------------------------|                           |
  |                           |                           |
  |                           |  4. Async Hook callback   |
  |                           |  POST /webhook            |
  |                           |  Headers: X-Req-Id, etc. |
  |                           |  Body: original request   |
  |                           |-------------------------->|
  |                           |                           |
  |                           |  5. Hook response         |
  |                           |<--------------------------|
```

### Hook 请求格式

服务器发送给您的业务服务器的请求：

```http
POST /webhook HTTP/1.1
Host: your-business.com
Content-Type: application/json
X-Req-Id: hook-subscribe-001
Authorization: Bearer your-token

{
  "cmd": ["user-events"],
  "data": "message content"
}
```

### Hook 使用场景

- **订阅审核**: 用户订阅敏感频道时通知业务系统审核
- **事件通知**: 重要消息发布时同步到业务系统
- **数据同步**: 实时数据变更时更新业务数据库
- **监控报警**: 系统事件触发时发送报警通知

## HTTP Proxy

Proxy 功能允许通过 Gateway 代理转发 HTTP 请求到第三方 API。

### 使用方式

```typescript
import { HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// GET 请求代理
const getHeaders = new HeaderBuilder()
  .setProxy('https://api.example.com/users', HttpMethod.GET)
  .setReqId('proxy-get-001')
  .setHeader('Authorization', 'Bearer api-token')
  .build();

const users = await client.send('API/Proxy', {}, String, getHeaders);
console.log(JSON.parse(users));

// POST 请求代理
const postHeaders = new HeaderBuilder()
  .setProxy('https://api.example.com/users', HttpMethod.POST)
  .setReqId('proxy-post-001')
  .setHeader('Content-Type', 'application/json')
  .build();

const requestBody = JSON.stringify({ name: 'Alice', email: 'alice@example.com' });
const result = await client.send('API/Proxy', requestBody, String, postHeaders);
console.log(JSON.parse(result));
```

### Proxy 时序图

```
Client                 Gateway Server            Third-party API
  |                           |                           |
  |  1. send('API/Proxy')     |                           |
  |  (with x-proxy-* headers) |                           |
  |-------------------------->|                           |
  |                           |                           |
  |                           |  2. Extract proxy config  |
  |                           |     from headers          |
  |                           |                           |
  |                           |  3. Forward HTTP request  |
  |                           |     Method + URL + Body   |
  |                           |     Headers forwarded     |
  |                           |-------------------------->|
  |                           |                           |
  |                           |  4. Third-party response  |
  |                           |<--------------------------|
  |                           |                           |
  |  5. Proxy response        |                           |
  |     (original response)   |                           |
  |<--------------------------|                           |
```

### Proxy 请求头配置

| Header | 必需 | 说明 | 示例 |
|--------|------|------|------|
| `x-proxy-url` | ✅ | 目标 API URL | `https://api.example.com/data` |
| `x-proxy-method` | ✅ | HTTP 方法 | `GET`, `POST`, `PUT`, `DELETE` |
| `X-Req-Id` | ❌ | 请求追踪 ID | `proxy-request-123` |
| 其他头部 | ❌ | 转发到目标 API | `Authorization`, `Content-Type` |

### Proxy 使用场景

- **API 聚合**: 统一通过 Gateway 访问多个第三方服务
- **认证代理**: Gateway 统一处理认证，简化客户端逻辑
- **请求转换**: 在 Gateway 层处理请求格式转换
- **监控统计**: 统一监控和统计第三方 API 调用
- **缓存优化**: Gateway 层实现响应缓存提升性能

### SDK Logging

The SDK provides comprehensive logging with request ID tracking:

```typescript
import { SDKLogger } from 'gateway-ts-sdk';

// SDK automatically logs various events:
// [Gateway] reqid:client-abc123-17345678901-000001 Connection closed: timeout
// [Gateway] reqid:client-abc123-17345678901-000001 Re-subscribed to 2 commands: news, chat
// [Gateway] reqid:client-abc123-17345678901-000001 No callback found for push command: unknown
// [Gateway] reqid:req-def456-17345678902-000002 API/Subscribe failed: connection timeout
// [Gateway] reqid:req-ghi789-17345678903-000003 API/Publish server error: invalid data

// For custom logging with request ID:
const logger = new SDKLogger('my-custom-id-12345');
logger.error('Custom error message');     // [Gateway] reqid:my-custom-id-12345 Custom error message
logger.warn('Warning message');           // [Gateway] reqid:my-custom-id-12345 Warning message
logger.info('Info message');              // [Gateway] reqid:my-custom-id-12345 Info message
```

## TypeScript Types

Define your own request/response types:

```typescript
class MyRequest {
  data: string = '';
}

class MyResponse {
  result: any = null;
  error?: string;
}

const response = await client.send('API/MyAPI', request, MyResponse);
```

For proxy requests, there are no built-in types - define your own based on the target API.

## Examples

Interactive examples to test the SDK:

### Node.js Examples

```bash
# 基础功能测试（推荐先运行）
npm run examples:node

# Hook & Proxy 完整功能测试（需要本地 Gateway 服务器）
npm run examples:hook-proxy

# 测试不同环境的连接
npm run examples:node wsurl=local     # 本地环境
npm run examples:node wsurl=dev       # 开发环境
npm run examples:node wsurl=wss://your-server/gateway  # 自定义地址
```

### Browser Examples

```bash
# 启动本地 HTTP 服务器
npm run serve

# 然后打开浏览器访问：
# http://localhost:8080/examples/browser.html - 基础 WebSocket 功能
# http://localhost:8080/examples/proxy.html   - HTTP Proxy 测试
```

### 完整功能演示

**Hook & Proxy 测试示例**包含：
- ✅ HeaderBuilder 链式调用演示  
- ✅ Hook 回调功能（4个场景：Subscribe, Publish, Unsubscribe, Ping）
- ✅ Hook 链路追踪测试（自定义 reqId + 自动生成 reqId + 发布消息追踪）
- ✅ Proxy 转发功能（GET, POST, 通用端点）
- ✅ 本地模拟服务器（自动启动和关闭）
- ✅ 完整的错误处理和统计报告

运行方式：
```bash
# 确保本地 Gateway 服务器运行在 localhost:18443
make debug  # 在 Go 项目根目录运行

# 然后运行完整测试
npm run examples:hook-proxy
```

## Quick Reference

### 常用命令速查

```bash
# 安装 SDK
npm install gateway-ts-sdk --registry=https://packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/

# 基础测试
npm run examples:node

# Hook & Proxy 测试
npm run examples:hook-proxy

# 浏览器测试
npm run serve
```

### 核心 API 速查

```typescript
import { createClient, HeaderBuilder, HttpMethod } from 'gateway-ts-sdk';

// 1. 基础连接
const client = createClient('ws://localhost:18443', 'A001');

// 2. 订阅消息
await client.subscribe('channel', (cmd, data, headers) => {
  console.log(`${cmd}: ${data}, reqId: ${headers['X-Req-Id']}`);
});

// 3. 发布消息
await client.publish('channel', 'message');

// 4. Hook 回调
const hookHeaders = new HeaderBuilder()
  .setHook('https://your-api.com/webhook', HttpMethod.POST)
  .setReqId('hook-001')
  .build();
await client.publish('events', 'data', hookHeaders);

// 5. HTTP 代理
const proxyHeaders = new HeaderBuilder()
  .setProxy('https://api.example.com/data', HttpMethod.GET)
  .setReqId('proxy-001')
  .build();
const result = await client.send('API/Proxy', {}, String, proxyHeaders);
```

### HeaderBuilder 方法速查

| 方法 | 说明 | 示例 |
|------|------|------|
| `setReqId(id)` | 设置请求 ID | `.setReqId('my-request-123')` |
| `setHook(url, method)` | 配置 Hook 回调 | `.setHook('https://api.com/hook', HttpMethod.POST)` |
| `setProxy(url, method)` | 配置 HTTP 代理 | `.setProxy('https://api.com/data', HttpMethod.GET)` |
| `setHeader(key, value)` | 设置自定义头部 | `.setHeader('Authorization', 'Bearer token')` |
| `merge(headers)` | 合并头部 | `.merge({ 'X-App': 'myapp' })` |
| `build()` | 构建最终头部 | `.build()` |

## License

MIT