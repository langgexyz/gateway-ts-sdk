/**
 * Gateway TypeScript SDK - Type Definitions
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


// Push Message Types
export class OnPushMessage {
  cmd: string = "";
  data: string = "";
  header: { [key: string]: string } = {};
}

/**
 * 获取头部信息为 Map 格式的工具函数
 * 提供上层接口兼容性，方便使用 Map 的方法
 * @param header - OnPushMessage的header对象
 * @returns Map<string, string> 格式的头部信息
 */
export function getHeaderMap(header: { [key: string]: string } | null | undefined): Map<string, string> {
  const headerMap = new Map<string, string>();
  
  // 处理 null 和 undefined 情况
  if (!header) {
    return headerMap;
  }
  
  // 确保 header 是对象类型
  if (typeof header !== 'object') {
    return headerMap;
  }
  
  try {
    for (const [key, value] of Object.entries(header)) {
      // 确保 key 和 value 都是有效值
      if (key != null && value != null) {
        headerMap.set(String(key), String(value));
      }
    }
  } catch (error) {
    // 如果 Object.entries 失败，返回空 Map
    console.warn('[Gateway] getHeaderMap: Failed to process header object:', error);
  }
  
  return headerMap;
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
