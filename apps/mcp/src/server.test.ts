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

test('allows a configured deployment host through authentication and handshake', async () => {
  const app = createMcpHandler({
    bearerToken: 'test-token',
    allowedHosts: ['mazal.vercel.app'],
  });

  const unauthorized = await app.request('https://mazal.vercel.app/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: 'mazal.vercel.app',
    },
    body: JSON.stringify(handshake),
  });

  expect(unauthorized.status).toBe(401);

  const authorized = await app.request('https://mazal.vercel.app/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Host: 'mazal.vercel.app',
      Origin: 'https://mazal.vercel.app',
    },
    body: JSON.stringify(handshake),
  });

  expect(authorized.status).toBe(200);
  expect(await authorized.text()).toContain('Mazal MCP');
});

test('reads exact deployment hosts from the environment allowlist', async () => {
  const previousAllowedHosts = process.env.MAZAL_MCP_ALLOWED_HOSTS;
  process.env.MAZAL_MCP_ALLOWED_HOSTS = 'mazal.vercel.app,mazal-preview.vercel.app';

  try {
    const app = createMcpHandler({ bearerToken: 'test-token' });
    const response = await app.request('https://mazal-preview.vercel.app/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Host: 'mazal-preview.vercel.app',
        Origin: 'https://mazal-preview.vercel.app',
      },
      body: JSON.stringify(handshake),
    });

    expect(response.status).toBe(200);
  } finally {
    if (previousAllowedHosts === undefined) delete process.env.MAZAL_MCP_ALLOWED_HOSTS;
    else process.env.MAZAL_MCP_ALLOWED_HOSTS = previousAllowedHosts;
  }
});

test.each([
  {
    name: 'host',
    headers: { Host: 'attacker.example' },
  },
  {
    name: 'origin',
    headers: {
      Host: 'mazal.vercel.app',
      Origin: 'https://attacker.example',
    },
  },
])('rejects a non-allowlisted $name', async ({ headers: securityHeaders }) => {
  const app = createMcpHandler({
    allowedHosts: ['mazal.vercel.app'],
    bearerToken: 'test-token',
  });
  const response = await app.request('https://mazal.vercel.app/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      ...securityHeaders,
    },
    body: JSON.stringify(handshake),
  });

  expect(response.status).toBe(403);
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

test.each([undefined, 'Bearer test-taken', 'Bearer wrong-token'])(
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

test.each([undefined, 'Bearer test-taken'])(
  'authenticates before parsing malformed JSON',
  async (authorization) => {
    const app = createMcpHandler({ bearerToken: 'test-token' });
    const headers = new Headers({
      'Content-Type': 'application/json',
      Host: 'localhost',
    });

    if (authorization) headers.set('Authorization', authorization);

    const response = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: '{',
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  },
);
