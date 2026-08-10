import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/hono';
import {
  createMcpHandler as createSdkMcpHandler,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
} from '@modelcontextprotocol/server';
import { Hono, type Context } from 'hono';

import { InMemoryActionLog, type ActionLog } from './action-log.js';
import { hasValidBearerToken } from './auth.js';
import { registerMazalTools } from './tools/index.js';

export type RegisterTools = (server: McpServer, actionLog?: ActionLog) => void;

export type CreateMcpHandlerOptions = {
  allowedHosts?: string[];
  allowedOrigins?: string[];
  bearerToken?: string;
  registerTools?: RegisterTools;
  createActionLog?: () => ActionLog;
};

// The transport 406s any request whose `Accept` does not name both
// `application/json` and `text/event-stream`. Deco Studio's health probe — a
// bare JSON-RPC ping via node fetch — sends the wildcard `*/*`, which by HTTP
// semantics accepts both, so spell them out for the transport. An explicit
// Accept without the wildcard is a real preference and passes through untouched.
function withMcpAccept(request: Request): Request {
  const accept = request.headers.get('Accept');
  if (accept && !accept.includes('*/*')) return request;

  const headers = new Headers(request.headers);
  headers.set('Accept', 'application/json, text/event-stream');
  return new Request(request, { headers });
}

function readHostnameAllowlist(value: string | undefined): string[] | undefined {
  const hostnames = value
    ?.split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean);

  return hostnames?.length ? hostnames : undefined;
}

export function createMazalMcpServer(
  registerTools: RegisterTools = registerMazalTools,
  actionLog: ActionLog = new InMemoryActionLog(),
): McpServer {
  const server = new McpServer({ name: 'Mazal MCP', version: '0.1.0' });
  registerTools(server, actionLog);
  return server;
}

export function createMcpHandler(
  options: CreateMcpHandlerOptions = {},
  routePath = '/mcp',
) {
  const bearerToken = options.bearerToken ?? process.env.MAZAL_MCP_BEARER_TOKEN;
  const allowedHosts =
    options.allowedHosts ?? readHostnameAllowlist(process.env.MAZAL_MCP_ALLOWED_HOSTS);
  const allowedOrigins =
    options.allowedOrigins ??
    readHostnameAllowlist(process.env.MAZAL_MCP_ALLOWED_ORIGINS) ??
    allowedHosts;
  /**
   * One log for the life of the handler, not one per request.
   *
   * `execute_plan` appends to this and returns a receipt. Built per request, the
   * array it appended to was discarded the moment the response ended — so every
   * receipt pointed at a log that no longer existed, and there was no equivalent
   * of `apps/web/lib/audit.record()` behind it. A receipt for a write you cannot
   * show afterwards is a reference number on nothing.
   *
   * It is still in memory, so it dies with the process: honest about what it is
   * on a serverless Function rather than pretending to durability this build
   * cannot provide. Callers that need per-request isolation — the tests do —
   * pass `createActionLog` and get it.
   */
  const sharedActionLog = options.createActionLog ? undefined : new InMemoryActionLog();
  const actionLogFor = () => options.createActionLog?.() ?? sharedActionLog!;
  const handler = createSdkMcpHandler(
    () => createMazalMcpServer(options.registerTools, actionLogFor()),
  );
  const app = new Hono();

  app.use(routePath, hostHeaderValidation(allowedHosts ?? localhostAllowedHostnames()));
  app.use(
    routePath,
    originValidation(allowedOrigins ?? allowedHosts ?? localhostAllowedOrigins()),
  );

  app.all(routePath, async (c: Context) => {
    if (!hasValidBearerToken(c.req.header('Authorization'), bearerToken)) {
      return c.text('Unauthorized', 401);
    }

    return handler.fetch(withMcpAccept(c.req.raw));
  });

  return app;
}
