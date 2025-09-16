/**
 * Gateway TypeScript SDK
 * 
 * A comprehensive TypeScript SDK for connecting to Gateway WebSocket server.
 * Supports channel-based messaging, automatic reconnection, and type-safe API calls.
 * 
 * Works in both Node.js and Browser environments.
 */

export { GatewayClient } from './client.js';
export * from './types.js';

// Import dependencies
import { GatewayClient } from './client.js';
import { Client, withBrowser } from 'ts-streamclient';

/**
* Create a Gateway client
* @param wsUrl WebSocket URL
* @param clientId Client ID (4 characters, default: '0000')
* @returns GatewayClient instance
*/
export function createClient(wsUrl: string, clientId?: string): GatewayClient {
  const client = new Client(withBrowser(wsUrl));
  return new GatewayClient(client, clientId);
}

