/**
 * Stream Gateway TypeScript SDK - Type Definitions
 */

// Core API Types
export class SubscribeRequest {
  cmd: string[] = [];
}

export class SubscribeResponse {
  errMsg: string | null = null;
}

export class UnsubscribeRequest {
  cmd: string[] = [];
}

export class UnsubscribeResponse {
  errMsg: string | null = null;
}

export class PublishRequest {
  cmd: string = "";
  data: string = ""; // JSON string
}

export class PublishResponse {
  errMsg: string | null = null;
}

// Header class for proper ts-json serialization/deserialization
export class OnPushHeader {
  "X-Req-Id": string = "";
  
  // Convert to Map for upper layer callback
  toMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const key in this) {
      if (this.hasOwnProperty(key) && typeof (this as any)[key] === 'string' && (this as any)[key]) {
        map.set(key, (this as any)[key]);
      }
    }
    return map;
  }
}

// Push Message Types
export class OnPushMessage {
  cmd: string = "";
  data: string = ""; // JSON string
  header: OnPushHeader = new OnPushHeader(); // Header containing X-Req-Id and future extensions
}

export class PingRequest {
  // Empty request matching Go struct
}

export class PingResponse {
  // Empty response matching Go struct
}

// Note: 
// - Proxy functionality: Use send() method with API: 'API/Proxy' and Headers: 'x-proxy-url', 'x-proxy-method'
// - Hook callbacks: Use 'x-hook-url' and 'x-hook-method' headers in subscribe/unsubscribe/ping/publish calls
// - Hook and Proxy are mutually exclusive - cannot use both in the same request
// - Request/Response types: completely user-defined

// Event Handlers
export type OnPushMessageCallback = (cmd: string, data: string, header: Map<string, string>) => void;

// Constants
export const X_REQ_ID = 'X-Req-Id';

/**
 * HTTP 方法枚举
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD'
}

/**
 * HeaderBuilder - 用于构建请求头的工具类
 * 
 * @example
 * ```typescript
 * // 基本使用
 * const headers = new HeaderBuilder()
 *   .setReqId('custom-123')
 *   .setHeader('X-Source', 'mobile-app')
 *   .build();
 * 
 * // Hook 回调配置 (用于订阅/发布等操作的事件回调)
 * const hookHeaders = HeaderBuilder.create()
 *   .setHook('https://your-business.com/api/subscription-hook', HttpMethod.POST)
 *   .setReqId('sub-hook-456')
 *   .build();
 * 
 * await client.subscribe('user-notifications', hookHeaders);
 * 
 * // Proxy 转发配置 (用于直接转发 HTTP 请求)
 * const proxyHeaders = HeaderBuilder.create()
 *   .setProxy('https://api.example.com/data', HttpMethod.GET)
 *   .setReqId('proxy-123')
 *   .build();
 * 
 * const result = await client.send('API/Proxy', {}, ResponseType, proxyHeaders);
 * ```
 */
export class HeaderBuilder {
  private headers: Map<string, string> = new Map();

  /**
   * 设置 Hook 回调配置
   * 当设置此配置时，subscribe/unsubscribe 等操作会自动触发 Hook 回调到指定的业务服务器
   * 
   * @param url - Hook 回调的目标 URL
   * @param method - HTTP 方法（默认 POST）
   * @returns HeaderBuilder 实例，支持链式调用
   * 
   * @example
   * ```typescript
   * const headers = new HeaderBuilder()
   *   .setHook('https://api.business.com/subscription-hook', HttpMethod.POST)
   *   .build();
   * 
   * // 订阅时会自动触发 Hook 回调业务服务器
   * await client.subscribe('news-channel', headers);
   * ```
   */
  setHook(url: string, method: HttpMethod = HttpMethod.POST): HeaderBuilder {
    this.headers.set('x-hook-url', url);
    this.headers.set('x-hook-method', method);
    return this;
  }

  /**
   * 设置 Proxy 转发配置
   * 用于 send('API/Proxy', ...) 调用，直接转发 HTTP 请求到目标服务器
   * 
   * @param url - Proxy 转发的目标 URL
   * @param method - HTTP 方法（默认 GET）
   * @returns HeaderBuilder 实例，支持链式调用
   * 
   * @example
   * ```typescript
   * const headers = new HeaderBuilder()
   *   .setProxy('https://api.example.com/data', HttpMethod.GET)
   *   .setReqId('proxy-req-123')
   *   .build();
   * 
   * // 直接转发请求到目标 API
   * const result = await client.send('API/Proxy', {}, ResponseType, headers);
   * ```
   */
  setProxy(url: string, method: HttpMethod = HttpMethod.GET): HeaderBuilder {
    this.headers.set('x-proxy-url', url);
    this.headers.set('x-proxy-method', method);
    return this;
  }

  /**
   * 设置自定义请求 ID
   * 如果不设置，SDK 会自动生成
   * 
   * @param reqId - 自定义请求 ID
   * @returns HeaderBuilder 实例，支持链式调用
   */
  setReqId(reqId: string): HeaderBuilder {
    this.headers.set(X_REQ_ID, reqId);
    return this;
  }

  /**
   * 设置自定义头部
   * @param key - 头部名称
   * @param value - 头部值
   * @returns HeaderBuilder 实例，支持链式调用
   */
  setHeader(key: string, value: string): HeaderBuilder {
    this.headers.set(key, value);
    return this;
  }

  /**
   * 批量添加头部
   * @param headers - 头部键值对对象或 Map
   * @returns HeaderBuilder 实例，支持链式调用
   */
  merge(headers: Record<string, string> | Map<string, string>): HeaderBuilder {
    if (headers instanceof Map) {
      headers.forEach((value, key) => this.headers.set(key, value));
    } else {
      Object.entries(headers).forEach(([key, value]) => this.headers.set(key, value));
    }
    return this;
  }

  /**
   * 构建最终的 headers Map
   * @returns 包含所有头部信息的 Map
   */
  build(): Map<string, string> {
    return new Map(this.headers);
  }

  /**
   * 创建新的 HeaderBuilder 实例（静态工厂方法）
   * @returns 新的 HeaderBuilder 实例
   */
  static create(): HeaderBuilder {
    return new HeaderBuilder();
  }
}
