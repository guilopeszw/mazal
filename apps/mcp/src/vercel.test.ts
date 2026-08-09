import { expect, test } from 'vitest';

import { createVercelHandler } from '../api/mcp.js';

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

test('serves the rewritten authenticated MCP route through the Vercel entrypoint', async () => {
  const handler = createVercelHandler({
    bearerToken: 'test-token',
    allowedHosts: ['mazal-mcp.vercel.app'],
    allowedOrigins: ['mazal-mcp.vercel.app'],
  });
  const response = await handler(new Request('https://mazal-mcp.vercel.app/api/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Host: 'mazal-mcp.vercel.app',
      Origin: 'https://mazal-mcp.vercel.app',
    },
    body: JSON.stringify(handshake),
  }));

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Mazal MCP');
});
