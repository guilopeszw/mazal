import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

import { createVercelHandler } from './vercel-entrypoint.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const handshake = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vercel-entrypoint-test', version: '1.0.0' },
  },
};

test('routes the public MCP URL to the Vercel artifact before authentication', async () => {
  const config = JSON.parse(
    await readFile(resolve(appRoot, 'vercel.json'), 'utf8'),
  ) as {
    routes?: Array<{
      src?: string;
      dest?: string;
      handle?: string;
      check?: boolean;
    }>;
  };
  const routes = config.routes ?? [];
  const routeIndex = routes.findIndex(({ src }) => src === '/mcp');
  const filesystemIndex = routes.findIndex(
    ({ handle }) => handle === 'filesystem',
  );
  const route = routes[routeIndex];

  expect(routeIndex).toBeGreaterThanOrEqual(0);
  expect(filesystemIndex).toBeGreaterThan(routeIndex);
  expect(route).toEqual({ src: '/mcp', dest: '/api/mcp.mjs' });
  if (!route?.dest) {
    throw new Error('Missing explicit /mcp Vercel route');
  }

  const handler = createVercelHandler({
    bearerToken: 'test-token',
    allowedHosts: ['mazal-mcp.vercel.app'],
    allowedOrigins: ['mazal-mcp.vercel.app'],
  });
  const response = await handler(new Request('https://mazal-mcp.vercel.app/mcp', {
    method: 'POST',
    headers: {
      Host: 'mazal-mcp.vercel.app',
    },
  }));

  expect(response.status).toBe(401);
  expect(await response.text()).toBe('Unauthorized');
});
