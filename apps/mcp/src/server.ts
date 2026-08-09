import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/hono';
import {
  createMcpHandler as createSdkMcpHandler,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
} from '@modelcontextprotocol/server';
import { Hono, type Context } from 'hono';

import { hasValidBearerToken } from './auth.js';

export type RegisterTools = (server: McpServer) => void;

export type CreateMcpHandlerOptions = {
  allowedHosts?: string[];
  allowedOrigins?: string[];
  bearerToken?: string;
  registerTools?: RegisterTools;
};

function readHostnameAllowlist(value: string | undefined): string[] | undefined {
  const hostnames = value
    ?.split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean);

  return hostnames?.length ? hostnames : undefined;
}

export function createMazalMcpServer(registerTools: RegisterTools = () => undefined): McpServer {
  const server = new McpServer({ name: 'Mazal MCP', version: '0.1.0' });
  registerTools(server);
  return server;
}

export function createMcpHandler(options: CreateMcpHandlerOptions = {}) {
  const bearerToken = options.bearerToken ?? process.env.MAZAL_MCP_BEARER_TOKEN;
  const allowedHosts =
    options.allowedHosts ?? readHostnameAllowlist(process.env.MAZAL_MCP_ALLOWED_HOSTS);
  const allowedOrigins =
    options.allowedOrigins ??
    readHostnameAllowlist(process.env.MAZAL_MCP_ALLOWED_ORIGINS) ??
    allowedHosts;
  const handler = createSdkMcpHandler(() => createMazalMcpServer(options.registerTools));
  const app = new Hono();

  app.use('/mcp', hostHeaderValidation(allowedHosts ?? localhostAllowedHostnames()));
  app.use(
    '/mcp',
    originValidation(allowedOrigins ?? allowedHosts ?? localhostAllowedOrigins()),
  );

  app.all('/mcp', async (c: Context) => {
    if (!hasValidBearerToken(c.req.header('Authorization'), bearerToken)) {
      return c.text('Unauthorized', 401);
    }

    return handler.fetch(c.req.raw);
  });

  return app;
}
