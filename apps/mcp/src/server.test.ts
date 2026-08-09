import { expect, test } from 'vitest';

import { createMcpHandler } from './server.js';

const handshake = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-integration-test', version: '1.0.0' },
  },
};

test('accepts an authorized MCP handshake', async () => {
  const app = createMcpHandler({ bearerToken: 'test-token' });

  const response = await app.request('/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Host: 'localhost',
    },
    body: JSON.stringify(handshake),
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Mazal MCP');
});

test('builds a fresh server and registers tools for each authorized request', async () => {
  let registrations = 0;
  const app = createMcpHandler({
    bearerToken: 'test-token',
    registerTools: () => {
      registrations += 1;
    },
  });

  for (const id of [1, 2]) {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Host: 'localhost',
      },
      body: JSON.stringify({ ...handshake, id }),
    });

    expect(response.status).toBe(200);
  }

  expect(registrations).toBe(2);
});

test.each([undefined, 'Bearer wrong-token'])(
  'rejects a handshake without the configured bearer token',
  async (authorization) => {
    const app = createMcpHandler({ bearerToken: 'test-token' });
    const headers = new Headers({
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Host: 'localhost',
    });

    if (authorization) headers.set('Authorization', authorization);

    const response = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(handshake),
    });

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('test-token');
  },
);
