import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler as createSdkMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { Context } from 'hono';

import { hasValidBearerToken } from './auth.js';

export type RegisterTools = (server: McpServer) => void;

export type CreateMcpHandlerOptions = {
  bearerToken?: string;
  registerTools?: RegisterTools;
};

export function createMazalMcpServer(registerTools: RegisterTools = () => undefined): McpServer {
  const server = new McpServer({ name: 'Mazal MCP', version: '0.1.0' });
  registerTools(server);
  return server;
}

export function createMcpHandler(options: CreateMcpHandlerOptions = {}) {
  const bearerToken = options.bearerToken ?? process.env.MAZAL_MCP_BEARER_TOKEN;
  const handler = createSdkMcpHandler(() => createMazalMcpServer(options.registerTools));
  const app = createMcpHonoApp();

  app.all('/mcp', async (c: Context) => {
    if (!hasValidBearerToken(c.req.header('Authorization'), bearerToken)) {
      return c.text('Unauthorized', 401);
    }

    return handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') });
  });

  return app;
}
