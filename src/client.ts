/**
 * Stream Gateway TypeScript SDK - Main Client
 */

import { Client, Result, StmError } from 'ts-streamclient';
import { Json } from 'ts-json';
import { SDKLogger } from './logger';
import type {
  OnPushMessageCallback
} from './types';
import {
  OnPushMessage,
  SubscribeRequest,
  SubscribeResponse,
  UnsubscribeRequest,
  UnsubscribeResponse,
  PublishRequest,
  PublishResponse,
  PingRequest,
  PingResponse
} from './types';


/**
 * Main Stream Gateway Client
 */

// Constants
const X_REQ_ID = 'X-Req-Id';

export class StreamGatewayClient {
  private client: Client;
  
  // Cmd callbacks
  private callbacks: Map<string, OnPushMessageCallback> = new Map();
  
  // Client logger with a fixed client ID
  private logger: SDKLogger;
  private clientId: string;
  
  // Global auto-incrementing counter for request sequence
  private static globalSeqId: number = 0;

  /**
   * Generate a unique request ID for custom tracking and logging
   * @returns Unique request ID in format: {random}-{clientId}-{sequence}-{timestamp}
   * 
   * Useful for:
   * - Custom API calls outside the SDK
   * - External service integration logging
   * - Request correlation across multiple systems
   * 
   * @example
   * // Generate ID for custom logging
   * const reqId = client.getNextReqId();
   * console.log(`Starting custom operation: ${reqId}`);
   * 
   * @example
   * // Use in SDK calls with custom headers
   * const headers = new Map([['X-Req-Id', client.getNextReqId()]]);
   * await client.publish('channel', 'data', headers);
   * 
   * @example
   * // Use for external API correlation
   * const traceId = client.getNextReqId();
   * await fetch('/api/external', {
   *   headers: { 'X-Trace-Id': traceId }
   * });
   * await client.publish('results', responseData, new Map([['X-Req-Id', traceId]]));
   */
  public getNextReqId(): string {
    StreamGatewayClient.globalSeqId = (StreamGatewayClient.globalSeqId + 1) % 100000000;
    
    const random = Math.random().toString(16).substring(2, 10).padStart(8, '0');
    const clientId = this.clientId;
    const seqDecimal = StreamGatewayClient.globalSeqId.toString().padStart(8, '0');
    const seqHigh = seqDecimal.substring(0, 4);
    const seqLow = seqDecimal.substring(4, 8);
    const timestamp = Date.now().toString();
    
    return `${random}-${clientId}-${seqHigh}-${seqLow}-${timestamp}`;
  }



  constructor(client: Client, clientId: string = '0000') {
    this.client = client;
    
    // Validate clientId: must be exactly 4 characters
    if (clientId.length !== 4) {
      throw new Error(`ClientId must be exactly 4 characters, got: ${clientId} (length: ${clientId.length})`);
    }
    
    this.clientId = clientId;
    this.logger = new SDKLogger(this.clientId);

    // Set up push message handler
    this.client.onPush = async (res: Result) => {
      // 使用 ts-json 反序列化推送消息
      const json = new Json();
      const [pushMessage, err] = json.fromJson(res.toString(), OnPushMessage);
      
      if (err || !pushMessage.cmd || !pushMessage.data) {
        this.logger.error(`Push message parse failed: ${err || 'invalid message format'}`);
        return;
      }

      // 将 OnPushHeader 类转换为 Map<string, string> 供上层回调使用
      const headerMap = pushMessage.header ? pushMessage.header.toMap() : new Map<string, string>();

      // 记录收到的推送消息用于调试
      const reqId = headerMap.get('X-Req-Id') || '';
      const logger = reqId ? new SDKLogger(reqId) : this.logger;
      
      if (reqId) {
        logger.debug(`Received push - cmd: ${pushMessage.cmd}, data: ${pushMessage.data}`);
      }

      // 调用对应命令的回调，传递 Map 类型的 header
      const callback = this.callbacks.get(pushMessage.cmd);
      if (callback) {
        callback(pushMessage.cmd, pushMessage.data, headerMap);
      } else {
        logger.warn(`No callback found for push command: ${pushMessage.cmd}`);
      }
    };

    this.client.onPeerClosed = async (err: StmError) => {
      this.logger.warn(`Connection closed: ${err}`);
      
      await this.client.Recover()
      
      const cmdsToResubscribe = Array.from(this.callbacks.keys());
      if (cmdsToResubscribe.length === 0) {
        return;
      }

      try {
        const request = new SubscribeRequest();
        request.cmd = cmdsToResubscribe;
        await this.send("API/Subscribe", request, SubscribeResponse);
        this.logger.info(`Re-subscribed to ${cmdsToResubscribe.length} commands: ${cmdsToResubscribe.join(', ')}`);
      } catch (error) {
        this.logger.error(`Failed to re-subscribe after reconnection: ${error}`);
      }
    }
  }



  /**
   * 订阅指定频道并注册消息回调
   * 
   * @param cmd - 要订阅的频道名称 (例如: 'user-notifications', 'live-chat')
   * @param callback - 接收推送消息的回调函数: (cmd, data, headers) => void
   * @param headers - 可选的请求头部，支持 Hook 回调配置 (自动生成 X-Req-Id 如果未提供)
   * @throws {Error} 如果已经订阅了该频道
   * 
   * @example
   * ```typescript
   * // 基本订阅
   * await client.subscribe('news-channel', (cmd, data, headers) => {
   *   console.log(`收到消息: ${data} 来自频道: ${cmd}`);
   * });
   * 
   * // 带自定义 Request ID 的订阅
   * const headers = new Map([['X-Req-Id', 'my-subscribe-123']]);
   * await client.subscribe('alerts', (cmd, data, headers) => {
   *   const reqId = headers.get('X-Req-Id');
   *   console.log(`警报: ${data} (reqId: ${reqId})`);
   * }, headers);
   * 
   * // 带 Hook 回调的订阅 (业务服务器会收到订阅通知)
   * const hookHeaders = new HeaderBuilder()
   *   .setHook('https://your-business.com/api/subscription-hook', HttpMethod.POST)
   *   .setReqId('subscription-hook-123')
   *   .setHeader('X-Source', 'mobile-app')
   *   .build();
   * 
   * await client.subscribe('user-notifications', callback, hookHeaders);
   * ```
   */
  async subscribe(cmd: string, callback: OnPushMessageCallback, headers: Map<string, string> = new Map()): Promise<SubscribeResponse> {
    // Check if cmd is already subscribed
    if (this.callbacks.has(cmd)) {
      throw new Error(`Command '${cmd}' is already subscribed. Please unsubscribe first.`);
    }

    const request = new SubscribeRequest();
    request.cmd = [cmd];
    
    this.callbacks.set(cmd, callback);
    
    try {
      return await this.send('API/Subscribe', request, SubscribeResponse, headers);
    } catch (error) {
      // If subscribe fails, remove the callback we just added
      this.callbacks.delete(cmd);
      throw error;
    }
  }

  /**
   * 取消订阅指定频道
   * 
   * @param cmd - 要取消订阅的频道名称
   * @param headers - 可选的请求头部，支持 Hook 回调配置 (自动生成 X-Req-Id 如果未提供)
   * 
   * @example
   * ```typescript
   * // 基本取消订阅
   * await client.unsubscribe('news-channel');
   * 
   * // 带自定义 Request ID 的取消订阅
   * const headers = new Map([['X-Req-Id', 'my-unsubscribe-456']]);
   * await client.unsubscribe('alerts', headers);
   * 
   * // 带 Hook 回调的取消订阅 (业务服务器会收到取消订阅通知)
   * const hookHeaders = new HeaderBuilder()
   *   .setHook('https://your-business.com/api/subscription-hook', HttpMethod.POST)
   *   .setReqId('unsubscribe-hook-789')
   *   .build();
   * 
   * await client.unsubscribe('user-notifications', hookHeaders);
   * ```
   */
  async unsubscribe(cmd: string, headers: Map<string, string> = new Map()): Promise<UnsubscribeResponse> {
    const request = new UnsubscribeRequest();
    request.cmd = [cmd];
    
    this.callbacks.delete(cmd);
    
    return await this.send('API/Unsubscribe', request, UnsubscribeResponse, headers);
  }

  /**
   * 向指定频道发布消息
   * 
   * @param cmd - 要发布到的频道名称
   * @param data - 消息内容 (字符串数据)
   * @param headers - 可选的请求头部 (自动生成 X-Req-Id 如果未提供)
   * 
   * @example
   * ```typescript
   * // 基本发布
   * await client.publish('news-channel', 'Breaking news update!');
   * 
   * // 发布 JSON 数据
   * const jsonData = JSON.stringify({ 
   *   type: 'notification', 
   *   message: 'Hello World',
   *   timestamp: Date.now()
   * });
   * await client.publish('notifications', jsonData);
   * 
   * // 带自定义请求头的发布
   * const headers = new HeaderBuilder()
   *   .setReqId('news-broadcast-789')
   *   .setHeader('X-Priority', 'high')
   *   .setHeader('X-Source', 'admin-panel')
   *   .build();
   * 
   * await client.publish('alerts', 'Emergency notification', headers);
   * ```
   */
  async publish(cmd: string, data: string, headers: Map<string, string> = new Map()): Promise<PublishResponse> {
    const request = new PublishRequest();
    request.cmd = cmd;
    request.data = data;
    return await this.send('API/Publish', request, PublishResponse, headers);
  }

  /**
   * 测试与服务器的连接状态
   * 
   * @param headers - 可选的请求头部，支持 Hook 回调配置 (自动生成 X-Req-Id 如果未提供)
   * @returns Promise<PingResponse> - 连接健康时解析
   * @throws {Error} 如果连接测试失败
   * 
   * @example
   * ```typescript
   * // 基本连接测试
   * await client.ping();
   * console.log('连接正常');
   * 
   * // 带自定义请求 ID 的连接测试
   * const headers = new HeaderBuilder()
   *   .setReqId('health-check-001')
   *   .setHeader('X-Test-Type', 'connectivity')
   *   .build();
   * 
   * await client.ping(headers);
   * console.log('健康检查完成');
   * 
   * // 带 Hook 回调的 Ping (用于服务器监控)
   * const monitorHeaders = new HeaderBuilder()
   *   .setHook('https://monitor.example.com/api/ping-hook', HttpMethod.POST)
   *   .setReqId('monitor-ping-123')
   *   .build();
   * 
   * await client.ping(monitorHeaders);
   * ```
   */
  async ping(headers: Map<string, string> = new Map()): Promise<PingResponse> {
    const request = new PingRequest();
    return await this.send('API/Ping', request, PingResponse, headers);
  }





  /**
   * Advanced API call method - mainly used for HTTP proxy and custom APIs
   * @param api - API endpoint ('API/Proxy' for HTTP proxy, or other custom endpoints)
   * @param data - Request data object
   * @param responseType - Response class that defines expected response structure
   * @param headers - Optional headers (automatically generates X-Req-Id if not provided)
   * @returns Promise resolving to typed response
   * @throws {Error} If request fails or response parsing fails
   * 
   * ⚠️ **Critical: Response Type Must Match Server Response**
   * Your responseType class properties must exactly match the server's JSON response fields.
   * Missing properties = lost data!
   * 
   * @example
   * // HTTP Proxy - Forward web requests through WebSocket
   * const headers = new Map([
   *   ['x-proxy-url', 'https://api.github.com/users/octocat'],
   *   ['x-proxy-method', 'GET']
   * ]);
   * 
   * class ApiResponse {
   *   constructor() {
   *     this.code = 0;      // ✅ Match server field
   *     this.message = '';  // ✅ Match server field
   *     this.data = '';     // ✅ Match server field
   *   }
   * }
   * 
   * const result = await client.send('API/Proxy', {}, ApiResponse, headers);
   * console.log(result.code, result.message, result.data);
   * 
   * @example
   * // Custom API with request tracking
   * const headers = new Map([['X-Req-Id', 'my-api-call-123']]);
   * const response = await client.send('API/CustomEndpoint', requestData, ResponseType, headers);
   */
  async send<T>(
    api: string, 
    data: object, 
    responseType: new() => T, 
    headers: Map<string, string> = new Map()
  ): Promise<T> {
    if (headers.has("api")) {
      throw new Error("Cannot set 'api' header manually. It is automatically set based on api parameter.");
    }
    
    const header = new Map(headers);
    let reqId = header.get(X_REQ_ID) || this.getNextReqId();
    header.set(X_REQ_ID, reqId);
    header.set("api", api);

    const json = new Json();
    const requestData = json.toJson(data);
    const logger = new SDKLogger(reqId);

    const [res, err] = await this.client.Send(requestData, header);
    
    if (err) {
      logger.error(`${api} failed: ${err}`);
      throw err;
    }

    const [response, parseErr] = json.fromJson(res.toString(), responseType);
    
    if (parseErr) {
      logger.error(`${api} response parse error: ${parseErr}`);
      throw parseErr;
    }
    
    if (response && typeof response === 'object' && 'errMsg' in response && response.errMsg) {
      logger.error(`${api} server error: ${response.errMsg}`);
      throw new Error(response.errMsg as string);
    }
    return response;
  }
}
