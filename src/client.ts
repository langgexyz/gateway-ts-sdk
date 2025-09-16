/**
 * Gateway TypeScript SDK - 主客户端
 * 
 * 提供基于 WebSocket 的实时通信能力，支持：
 * - 频道订阅/取消订阅
 * - 消息发布
 * - 连接状态监控
 * - 自动重连和重订阅
 * - HTTP 代理转发
 */

import { Client, Result, StmError } from 'ts-streamclient';
import { plainToClass, instanceToPlain } from 'class-transformer';
import type { Logger } from 'ts-xutils';
import { ConsoleLogger } from 'ts-xutils';
import type {
  OnPushMessageCallback
} from './types.js';
import {
  OnPushMessage,
  SubscribeRequest,
  SubscribeResponse,
  UnsubscribeRequest,
  UnsubscribeResponse,
  PublishRequest,
  PublishResponse,
  PingRequest,
  PingResponse,
  getHeaderMap
} from './types.js';

// 请求 ID 头部字段名
const X_REQ_ID = 'X-Req-Id';


/**
 * 自动重连器 - 处理连接断开后的重连和重订阅
 * 
 * 当连接断开时，自动尝试重新订阅所有之前订阅的频道
 * 使用指数退避策略，避免频繁重试
 */
class Reconnecter {
  private client: GatewayClient;
  private logger: Logger;
  private retryTimer: NodeJS.Timeout | null = null;
  private isActive: boolean = true;

  constructor(client: GatewayClient, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * 启动重连过程
   */
  start(): void {
    if (!this.isActive) {
      return;
    }
    this.do();
  }

  /**
   * 停止重连过程
   */
  stop(): void {
    this.isActive = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * 执行重连逻辑
   * 使用5秒固定间隔重试，避免指数退避导致的长时间等待
   */
  private async do(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    const cmdsToResubscribe = this.client.getSubscribedCommands();
    if (cmdsToResubscribe.length === 0) {
      this.logger.w.debug(this.logger.f.Debug('Gateway', `Reconnecter: no subscriptions to restore`));
      return;
    }

    try {
      this.logger.w.info(this.logger.f.Info('Gateway', `Reconnecter: attempting to resubscribe ${cmdsToResubscribe.length} commands`));
      
      const request = new SubscribeRequest();
      request.cmd = cmdsToResubscribe;
      
      // 生成请求ID用于日志追踪
      const headers = new Map<string, string>();
      const reqId = this.client.getNextReqId();
      headers.set(X_REQ_ID, reqId);
      
      await this.client.send(`${this.client.getRootUri()}/Subscribe`, request, SubscribeResponse, headers);
      
      this.logger.w.info(this.logger.f.Info('Gateway', `Reconnecter: resubscribed successfully`));
      
      // 成功重连，清除重试定时器
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      
    } catch (error) {
      this.logger.w.error(this.logger.f.Error('Gateway', `Reconnecter: failed - ${error}`));
      
      if (this.isActive) {
        this.logger.w.info(this.logger.f.Info('Gateway', `Reconnecter: will retry in 5s`));
        this.retryTimer = setTimeout(() => {
          this.do();
        }, 5000);
      }
    }
  }
}


/**
 * Gateway 主客户端类
 * 
 * 提供完整的实时通信功能，包括：
 * - 多观察者订阅模式：同一频道可被多个组件订阅
 * - 自动重连和重订阅：网络断开后自动恢复订阅状态
 * - 请求追踪：每个请求都有唯一ID用于日志关联
 */
export class GatewayClient {
  private client: Client;
  
  // 观察者回调映射：频道名 -> (观察者ID -> 回调函数)
  // 支持同一频道被多个组件订阅，每个组件用 Symbol 标识
  private callbacks: Map<string, Map<symbol, OnPushMessageCallback>> = new Map();
  
  // 客户端日志记录器，使用固定的客户端ID
  private logger: Logger;
  private clientId: string;
  
  // API 根路径，默认为 "API"，可通过 setRootUri 修改
  private rootUri: string = "API";
  
  // 自动重连器，处理连接断开后的重连和重订阅
  private reconnecter: Reconnecter;
  
  // 全局请求序列号，用于生成唯一请求ID
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
   * 获取当前已订阅的频道列表 (供 Reconnecter 使用)
   * 
   * @returns 频道名称数组
   */
  public getSubscribedCommands(): string[] {
    return Array.from(this.callbacks.keys());
  }


  /**
   * 停止客户端和清理资源
   * 
   * @example
   * ```typescript
   * client.destroy();
   * ```
   */
  public destroy(): void {
    this.logger.w.info(this.logger.f.Info('Gateway', `Client destroyed`));
    this.reconnecter.stop();
    this.callbacks.clear();
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
    GatewayClient.globalSeqId = (GatewayClient.globalSeqId + 1) % 100000000;
    
    const random = Math.random().toString(16).substring(2, 10).padStart(8, '0');
    const clientId = this.clientId;
    const seqDecimal = GatewayClient.globalSeqId.toString().padStart(8, '0');
    const seqHigh = seqDecimal.substring(0, 4);
    const seqLow = seqDecimal.substring(4, 8);
    const timestamp = Date.now().toString();
    
    return `${random}-${clientId}-${seqHigh}-${seqLow}-${timestamp}`;
  }



  /**
   * 构造函数
   * 
   * @param client - 底层 WebSocket 客户端
   * @param clientId - 客户端ID，必须为4位字符，用于请求追踪和日志关联
   * 
   * @throws Error 当 clientId 长度不为4时抛出错误
   */
  constructor(client: Client, clientId: string = '0000') {
    this.client = client;
    
    // 验证客户端ID格式：必须为4位字符
    if (clientId.length !== 4) {
      throw new Error(`ClientId must be exactly 4 characters, got: ${clientId} (length: ${clientId.length})`);
    }
    
    this.clientId = clientId;
    this.logger = ConsoleLogger;
    
    // 初始化自动重连器
    this.reconnecter = new Reconnecter(this, this.logger);

    // 设置推送消息处理器
    this.client.onPush = async (res: Result) => {
      // 调试：打印原始数据
      const rawData = res.toString();
      this.logger.w.debug(this.logger.f.Debug('Gateway', `Raw push data: ${rawData}`));
      
      // 使用 class-transformer 解析JSON
      let pushData: OnPushMessage;
      try {
        const jsonData = JSON.parse(rawData);
        pushData = plainToClass(OnPushMessage, jsonData);
      } catch (err) {
        this.logger.w.error(this.logger.f.Error('Gateway', `Push message parse failed: ${err}`));
        this.logger.w.error(this.logger.f.Error('Gateway', `Raw data was: ${rawData}`));
        return;
      }
      
      if (!pushData.cmd || !pushData.data) {
        this.logger.w.error(this.logger.f.Error('Gateway', `Push message parse failed: invalid message format`));
        this.logger.w.error(this.logger.f.Error('Gateway', `Raw data was: ${rawData}`));
        return;
      }
      
      // 调试：打印解析后的数据
      this.logger.w.debug(this.logger.f.Debug('Gateway', `Parsed push message: cmd=${pushData.cmd}, data=${pushData.data}, header=${JSON.stringify(pushData.header)}`));

      // 头部信息转换为Map格式
      const headerMap = getHeaderMap(pushData.header || {});

      // 根据请求ID创建专用日志记录器
      const reqId = headerMap.get('X-Req-Id') || '';
      const logger = this.logger;
      
      // 检查是否缺少必需的追踪字段
      if (!reqId) {
        this.logger.w.warn(this.logger.f.Warn('Gateway', `Received push without X-Req-Id - cmd: ${pushData.cmd}, data: ${pushData.data}`));
      } else {
        logger.w.debug(logger.f.Debug('Gateway', `Received push - cmd: ${pushData.cmd}, data: ${pushData.data}`));
      }

      // 分发给所有订阅该频道的观察者
      const cmdCallbacks = this.callbacks.get(pushData.cmd);
      if (!cmdCallbacks || cmdCallbacks.size === 0) {
        logger.w.warn(logger.f.Warn('Gateway', `No observers found for push command: ${pushData.cmd}`));
        return;
      }

      logger.w.debug(logger.f.Debug('Gateway', `Dispatching push message to ${cmdCallbacks.size} observers for cmd: ${pushData.cmd}`));
      
      // 并发调用所有回调，避免阻塞
      const callbackPromises = Array.from(cmdCallbacks.entries()).map(async ([observerId, callback]) => {
        try {
          callback(pushData.cmd, pushData.data, headerMap);
          logger.w.debug(logger.f.Debug('Gateway', `Observer '${observerId.description || 'anonymous'}' handled push message for cmd: ${pushData.cmd}`));
        } catch (error) {
          logger.w.error(logger.f.Error('Gateway', `Observer '${observerId.description || 'anonymous'}' failed to handle push message for cmd: ${pushData.cmd}: ${error}`));
        }
      });
      
      await Promise.allSettled(callbackPromises);
    };

    // 设置连接断开处理器
    this.client.onPeerClosed = async (err: StmError) => {
      const timestamp = new Date().toISOString();
      this.logger.w.warn(this.logger.f.Warn('Gateway', `Connection lost at ${timestamp}: ${err}`));
      
      // 分析错误代码，提供调试信息
      if (err.toString().includes('1006')) {
        this.logger.w.warn(this.logger.f.Warn('Gateway', `1006: Abnormal connection closure - possible network/proxy issue`));
      } else if (err.toString().includes('1001')) {
        this.logger.w.warn(this.logger.f.Warn('Gateway', `1001: Server endpoint going down`));
      } else if (err.toString().includes('timeout')) {
        this.logger.w.warn(this.logger.f.Warn('Gateway', `Timeout: Connection timed out`));
      }
      
      
      // 尝试恢复连接
      await this.client.Recover()
      
      // 启动重连和重订阅流程
      this.reconnecter.start();
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
   * 内部订阅逻辑实现
   * 
   * 实现细节：
   * 1. 检查重复订阅，避免同一观察者多次订阅同一频道
   * 2. 先添加本地订阅，再向服务器发送请求
   * 3. 如果服务器订阅失败，回滚本地订阅状态
   * 4. 使用请求ID进行日志追踪
   */
  private async subscribeInternal(
    cmd: string,
    observer: symbol,
    callback: OnPushMessageCallback,
    headers: Map<string, string>
  ): Promise<SubscribeResponse> {
    // 检查重复订阅：同一观察者不能多次订阅同一频道
    const cmdCallbacks = this.callbacks.get(cmd);
    if (cmdCallbacks?.has(observer)) {
      const observerName = observer.description || 'anonymous';
      throw new Error(`Observer '${observerName}' already subscribed to command '${cmd}'. Please unsubscribe first.`);
    }

    // 先添加本地订阅，确保状态一致性
    if (!this.callbacks.has(cmd)) {
      this.callbacks.set(cmd, new Map());
    }
    this.callbacks.get(cmd)!.set(observer, callback);
    
    // 向服务器发送订阅请求
    const request = new SubscribeRequest();
    request.cmd = [cmd];
    
    // 生成请求ID用于日志追踪
    const reqId = headers.get(X_REQ_ID) || this.getNextReqId();
    headers.set(X_REQ_ID, reqId);
    const logger = this.logger;
    
    try {
      const response = await this.send(`${this.rootUri}/Subscribe`, request, SubscribeResponse, headers);
      const observerName = observer.description || 'anonymous';
      logger.w.info(logger.f.Info('Gateway', `Subscription created for cmd '${cmd}' with observer '${observerName}'`));
      return response;
    } catch (error) {
      // 订阅失败时回滚本地状态
      this.callbacks.get(cmd)!.delete(observer);
      
      // 如果该频道没有其他订阅者，删除整个频道条目
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
   * 内部取消订阅逻辑实现
   * 
   * 实现细节：
   * 1. 检查订阅状态，确保观察者已订阅该频道
   * 2. 先移除本地订阅，再决定是否向服务器发送取消订阅请求
   * 3. 只有当频道没有其他订阅者时，才向服务器发送取消订阅请求
   * 4. 优化网络请求：避免不必要的服务器调用
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
    
    // 移除本地订阅
    cmdCallbacks.delete(observer);
    const observerName = observer.description || 'anonymous';
    
    // 如果还有其他观察者订阅该频道，只需移除本地订阅
    if (cmdCallbacks.size > 0) {
      this.logger.w.info(this.logger.f.Info('Gateway', `Removed observer '${observerName}' from cmd '${cmd}' (${cmdCallbacks.size} remaining)`));
      const response = new UnsubscribeResponse();
      response.errMsg = null;
      return response;
    }
    
    // 如果这是最后一个订阅者，删除频道条目并向服务器发送取消订阅请求
    this.callbacks.delete(cmd);
    
    // 生成请求ID用于日志追踪
    const reqId = headers.get(X_REQ_ID) || this.getNextReqId();
    headers.set(X_REQ_ID, reqId);
    const logger = this.logger;
    
    logger.w.info(logger.f.Info('Gateway', `Removed last observer for cmd '${cmd}', unsubscribing from server`));
    
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
   * 基于 sendRaw 实现，提供类型安全的 JSON 序列化/反序列化
   * 
   * @param api - API 端点 (如 'API/Proxy' 或自定义如 'CustomAPI/Proxy')
   * @param data - 请求数据对象，将被序列化为 JSON
   * @param responseType - 响应类型类，用于反序列化响应
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
    // 序列化请求数据为 JSON 字符串
    const requestData = JSON.stringify(instanceToPlain(data));
    
    // 使用 sendRaw 发送原始数据
    const rawResponse = await this.sendRaw(api, requestData, headers);
    
    // 反序列化响应为指定类型
    const response = plainToClass(responseType, JSON.parse(rawResponse));
    
    return response;
  }

  /**
   * 发送原始数据请求（用于代理转发）
   * 
   * 直接发送字符串数据，返回原始字符串响应，不进行 JSON 编解码
   * 主要用于 HTTP 代理转发，避免不必要的序列化开销
   * 
   * @param api - API 路径
   * @param data - 原始数据字符串
   * @param headers - 请求头
   * @returns 原始响应字符串
   * 
   * @example
   * ```typescript
   * // 代理转发原始数据
   * const result = await client.sendRaw('API/Proxy', 'raw data', headers);
   * ```
   */
  async sendRaw(
    api: string, 
    data: string, 
    headers: Map<string, string> = new Map()
  ): Promise<string> {
    // 防止手动设置 api 头部，该字段由系统自动设置
    if (headers.has("api")) {
      throw new Error("Cannot set 'api' header manually. It is automatically set based on api parameter.");
    }
    
    // 准备请求头部，添加请求ID和API路径
    const header = new Map(headers);
    let reqId = header.get(X_REQ_ID) || this.getNextReqId();
    header.set(X_REQ_ID, reqId);
    header.set("api", api);

    const logger = this.logger;

    // 直接发送原始数据，不进行任何序列化处理
    const [res, err] = await this.client.Send(data, header);
    
    if (err) {
      logger.w.error(logger.f.Error('Gateway', `${api} failed: ${err}`));
      throw err;
    }

    // 直接返回原始响应字符串
    return res.toString();
  }
}
