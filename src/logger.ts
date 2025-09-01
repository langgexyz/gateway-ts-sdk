/**
 * Stream Gateway SDK Logger
 * Provides standardized logging with request ID tracking
 */

export class SDKLogger {
  private static readonly PREFIX = '[Gateway]';
  private reqId: string;

  constructor(reqId: string) {
    this.reqId = reqId;
  }

  /**
   * Log info message
   */
  info(message: string): void {
    console.log(`${SDKLogger.PREFIX} reqid:${this.reqId} ${message}`);
  }

  /**
   * Log error message
   */
  error(message: string): void {
    console.error(`${SDKLogger.PREFIX} reqid:${this.reqId} ${message}`);
  }

  /**
   * Log warning message
   */
  warn(message: string): void {
    console.warn(`${SDKLogger.PREFIX} reqid:${this.reqId} ${message}`);
  }

  /**
   * Log debug message
   */
  debug(message: string): void {
    console.debug(`${SDKLogger.PREFIX} reqid:${this.reqId} ${message}`);
  }


}
