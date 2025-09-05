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
  
  // Observer-based callbacks: cmd -> (observer -> callback)
  private callbacks: Map<string, Map<symbol, OnPushMessageCallback>> = new Map();
  
  // Client logger with a fixed client ID
  private logger: SDKLogger;
  private clientId: string;
  
  // API root URI (default: "API")
  private rootUri: string = "API";
  
  // Global auto-incrementing counter for request sequence
  private static globalSeqId: number = 0;

  /**
   * 设置 API 根路径
   * 
   * @param rootUri - 新的根路径 (默认: "API")
   * 
   * @example
   * ```typescript
   * // 设置自定义根路径
   * client.setRootUri("CustomAPI");
   * 
   * // 恢复默认根路径
   * client.setRootUri("API");
   * ```
   */
  public setRootUri(rootUri: string): void {
    this.rootUri = rootUri;
  }

  /**
   * 获取当前 API 根路径
   * 
   * @returns 当前根路径
   */
  public getRootUri(): string {
    return this.rootUri;
  }

  /**
   * 生成唯一请求 ID
   * 
   * @returns 格式: {random}-{clientId}-{sequence}-{timestamp}
   * 
   * @example
   * ```typescript
   * const reqId = client.getNextReqId();
   * const headers = new Map([['X-Req-Id', reqId]]);
   * await client.publish('channel', 'data', headers);
   * ```
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

      // 调用所有订阅该命令的观察者回调
      const cmdCallbacks = this.callbacks.get(pushMessage.cmd);
      if (cmdCallbacks && cmdCallbacks.size > 0) {
        logger.debug(`Dispatching push message to ${cmdCallbacks.size} observers for cmd: ${pushMessage.cmd}`);
        
        // 并发调用所有回调
        const callbackPromises = Array.from(cmdCallbacks.entries()).map(async ([observerId, callback]) => {
          try {
            await callback(pushMessage.cmd, pushMessage.data, headerMap);
            logger.debug(`Observer '${observerId.description || 'anonymous'}' handled push message for cmd: ${pushMessage.cmd}`);
          } catch (error) {
            logger.error(`Observer '${observerId.description || 'anonymous'}' failed to handle push message for cmd: ${pushMessage.cmd}: ${error}`);
          }
        });
        
        await Promise.allSettled(callbackPromises);
      } else {
        logger.warn(`No observers found for push command: ${pushMessage.cmd}`);
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
        await this.send(`${this.rootUri}/Subscribe`, request, SubscribeResponse);
        this.logger.info(`Re-subscribed to ${cmdsToResubscribe.length} commands: ${cmdsToResubscribe.join(', ')}`);
      } catch (error) {
        this.logger.error(`Failed to re-subscribe after reconnection: ${error}`);
      }
    }
  }

  /**
   * 订阅频道
   * 
   * @param cmd - 频道名称
   * @param observer - 观察者标识符 (Symbol)
   * @param callback - 消息回调函数
   * @param headers - 可选请求头部
   * 
   * @example
   * ```typescript
   * // 多个组件监听同一频道
   * const NAVBAR = Symbol('navbar');
   * const SIDEBAR = Symbol('sidebar');
   * 
   * await client.subscribe('notifications', NAVBAR, handleNavbar);
   * await client.subscribe('notifications', SIDEBAR, handleSidebar);
   * 
   * // 精确取消订阅
   * await client.unsubscribe('notifications', NAVBAR);
   * ```
   */
  async subscribe(cmd: string, observer: symbol, callback: OnPushMessageCallback, headers: Map<string, string> = new Map()): Promise<SubscribeResponse> {
    return this.subscribeInternal(cmd, observer, callback, headers);
  }

  /**
   * 内部订阅逻辑
   */
  private async subscribeInternal(
    cmd: string,
    observer: symbol,
    callback: OnPushMessageCallback,
    headers: Map<string, string>
  ): Promise<SubscribeResponse> {
    // 检查该观察者是否已经订阅了该命令
    const cmdCallbacks = this.callbacks.get(cmd);
    if (cmdCallbacks?.has(observer)) {
      const observerName = observer.description || 'anonymous';
      throw new Error(`Observer '${observerName}' already subscribed to command '${cmd}'. Please unsubscribe first.`);
    }

    // 添加本地订阅
    if (!this.callbacks.has(cmd)) {
      this.callbacks.set(cmd, new Map());
    }
    this.callbacks.get(cmd)!.set(observer, callback);
    
    // 向服务器发送订阅请求
    const request = new SubscribeRequest();
    request.cmd = [cmd];
    
    try {
      const response = await this.send(`${this.rootUri}/Subscribe`, request, SubscribeResponse, headers);
      const observerName = observer.description || 'anonymous';
      this.logger.info(`Subscription created for cmd '${cmd}' with observer '${observerName}'`);
      return response;
    } catch (error) {
      // 如果订阅失败，移除刚添加的本地订阅
      this.callbacks.get(cmd)!.delete(observer);
      
      // 如果没有其他订阅了，删除整个 cmd 条目
      if (this.callbacks.get(cmd)!.size === 0) {
        this.callbacks.delete(cmd);
      }
      
      throw error;
    }
  }

  /**
   * 取消订阅
   * 
   * @param cmd - 频道名称
   * @param observer - 观察者标识符 (Symbol)
   * @param headers - 可选请求头部
   * 
   * @example
   * ```typescript
   * const NAVBAR = Symbol('navbar');
   * await client.unsubscribe('notifications', NAVBAR);
   * ```
   */
  async unsubscribe(cmd: string, observer: symbol, headers: Map<string, string> = new Map()): Promise<UnsubscribeResponse> {
    return this.unsubscribeInternal(cmd, observer, headers);
  }

  /**
   * 内部取消订阅逻辑
   */
  private async unsubscribeInternal(
    cmd: string,
    observer: symbol,
    headers: Map<string, string>
  ): Promise<UnsubscribeResponse> {
    const cmdCallbacks = this.callbacks.get(cmd);
    if (!cmdCallbacks || cmdCallbacks.size === 0) {
      throw new Error(`No subscriptions found for command '${cmd}'`);
    }

    if (!cmdCallbacks.has(observer)) {
      const observerName = observer.description || 'anonymous';
      throw new Error(`Observer '${observerName}' not found for command '${cmd}'`);
    }
    
    cmdCallbacks.delete(observer);
    const observerName = observer.description || 'anonymous';
    
    // 如果还有其他 observer，不需要向服务器发送取消订阅请求
    if (cmdCallbacks.size > 0) {
      this.logger.info(`Removed observer '${observerName}' from cmd '${cmd}' (${cmdCallbacks.size} remaining)`);
      const response = new UnsubscribeResponse();
      response.errMsg = null;
      return response;
    }
    
    // 如果没有其他订阅了，删除整个 cmd 条目并向服务器发送取消订阅请求
    this.callbacks.delete(cmd);
    this.logger.info(`Removed last observer for cmd '${cmd}', unsubscribing from server`);
    
    const request = new UnsubscribeRequest();
    request.cmd = [cmd];
    return await this.send(`${this.rootUri}/Unsubscribe`, request, UnsubscribeResponse, headers);
  }

  /**
   * 发布消息到频道
   * 
   * @param cmd - 频道名称
   * @param data - 消息内容 (字符串)
   * @param headers - 可选请求头部
   * 
   * @example
   * ```typescript
   * // 发布文本消息
   * await client.publish('notifications', 'Hello World');
   * 
   * // 发布 JSON 数据
   * await client.publish('events', JSON.stringify({ type: 'update', data: 'value' }));
   * ```
   */
  async publish(cmd: string, data: string, headers: Map<string, string> = new Map()): Promise<PublishResponse> {
    const request = new PublishRequest();
    request.cmd = cmd;
    request.data = data;
    return await this.send(`${this.rootUri}/Publish`, request, PublishResponse, headers);
  }

  /**
   * 测试连接状态
   * 
   * @param headers - 可选请求头部
   * @returns 连接正常时返回成功响应
   * 
   * @example
   * ```typescript
   * await client.ping();
   * console.log('连接正常');
   * ```
   */
  async ping(headers: Map<string, string> = new Map()): Promise<PingResponse> {
    const request = new PingRequest();
    return await this.send(`${this.rootUri}/Ping`, request, PingResponse, headers);
  }

  /**
   * 通用 API 调用方法
   * 
   * @param api - API 端点 (如 'API/Proxy' 或自定义如 'CustomAPI/Proxy')
   * @param data - 请求数据对象
   * @param responseType - 响应类型类 (必须匹配服务器响应结构)
   * @param headers - 可选请求头部
   * 
   * @example
   * ```typescript
   * // HTTP 代理请求
   * const headers = new Map([
   *   ['x-proxy-url', 'https://api.example.com/data'],
   *   ['x-proxy-method', 'GET']
   * ]);
   * 
   * class ApiResponse {
   *   constructor() {
   *     this.code = 0;
   *     this.data = '';
   *   }
   * }
   * 
   * const result = await client.send('API/Proxy', {}, ApiResponse, headers);
   * ```
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
    
    return response;
  }
}
