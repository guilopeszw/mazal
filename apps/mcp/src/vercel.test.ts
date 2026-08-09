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

test('rewrites the public MCP route to the Vercel artifact before authentication', async () => {
  const config = JSON.parse(
    await readFile(resolve(appRoot, 'vercel.json'), 'utf8'),
  ) as { rewrites: Array<{ source: string; destination: string }> };
  const rewrite = config.rewrites.find(({ source }) => source === '/mcp');

  expect(rewrite).toEqual({ source: '/mcp', destination: '/api/mcp.mjs' });
  if (!rewrite) {
    throw new Error('Missing /mcp Vercel rewrite');
  }

  const handler = createVercelHandler({
    bearerToken: 'test-token',
    allowedHosts: ['mazal-mcp.vercel.app'],
    allowedOrigins: ['mazal-mcp.vercel.app'],
  });
  const response = await handler(new Request(`https://mazal-mcp.vercel.app${rewrite.destination}`, {
    method: 'POST',
    headers: {
      Host: 'mazal-mcp.vercel.app',
    },
  }));

  expect(response.status).toBe(401);
  expect(await response.text()).toBe('Unauthorized');
});
