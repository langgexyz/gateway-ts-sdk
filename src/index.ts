/**
 * Stream Gateway TypeScript SDK
 * 
 * A comprehensive TypeScript SDK for connecting to Stream Gateway WebSocket server.
 * Supports channel-based messaging, automatic reconnection, and type-safe API calls.
 * 
 * Works in both Node.js and Browser environments.
 */

export { StreamGatewayClient } from './client';
export { SDKLogger } from './logger';
export * from './types';

// Re-export Client and withBrowser for advanced usage
export { Client, withBrowser } from 'ts-streamclient';

// Import dependencies
import { StreamGatewayClient } from './client';
import { Client, withBrowser } from 'ts-streamclient';

/**
* Create a StreamGateway client
* @param wsUrl WebSocket URL
* @param clientId Client ID (4 characters, default: '0000')
* @returns StreamGatewayClient instance
*/
export function createClient(wsUrl: string, clientId?: string): StreamGatewayClient {
  const client = new Client(withBrowser(wsUrl));
  return new StreamGatewayClient(client, clientId);
}

// Default export
export default StreamGatewayClient;
