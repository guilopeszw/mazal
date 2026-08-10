import { expect, test } from 'vitest';

import type { Action } from '@mazal/contracts';

import { InMemoryActionLog } from './action-log.js';
import { createMcpHandler } from './server.js';
import { mazalAction } from './tools/test-fixtures.js';

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

test('isolates simulated action logs across two authenticated MCP requests', async () => {
  const actionLogs: InMemoryActionLog[] = [];
  const app = createMcpHandler({
    bearerToken: 'test-token',
    createActionLog: () => {
      const actionLog = new InMemoryActionLog();
      actionLogs.push(actionLog);
      return actionLog;
    },
  });
  const secondAction: Action = { ...mazalAction, id: 'stockout.2' };

  for (const [id, action] of [[1, mazalAction], [2, secondAction]] as const) {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Host: 'localhost',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'execute_plan', arguments: { actions: [action] } },
      }),
    });

    expect(response.status).toBe(200);
  }

  expect(actionLogs).toHaveLength(2);
  expect(actionLogs.map((actionLog) => actionLog.snapshot())).toEqual([
    [mazalAction],
    [secondAction],
  ]);
});

// Deco Studio's CONNECTION_TEST probe POSTs a JSON-RPC ping with the
// connection headers and nothing else — no MCP `Accept` header (node fetch
// defaults to `*/*`), no session. The transport's strict reading returned 406,
// so Studio reported the connection unhealthy while every real MCP call
// worked. `*/*` means the client accepts anything, including the two types
// the spec requires — treat it that way.
test.each([
  { name: 'no Accept header', accept: undefined },
  { name: 'Accept: */*', accept: '*/*' },
])('answers the Deco health probe ping sent with $name', async ({ accept }) => {
  const app = createMcpHandler({ bearerToken: 'test-token' });
  const headers = new Headers({
    Authorization: 'Bearer test-token',
    'Content-Type': 'application/json',
    Host: 'localhost',
  });
  if (accept) headers.set('Accept', accept);

  const response = await app.request('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"result":{}');
});

test('still rejects an explicit Accept header that excludes the MCP types', async () => {
  const app = createMcpHandler({ bearerToken: 'test-token' });

  const response = await app.request('/mcp', {
    method: 'POST',
    headers: {
      Accept: 'text/html',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Host: 'localhost',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
  });

  expect(response.status).toBe(406);
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

test('keeps one action log across requests when the caller does not supply one', async () => {
  // Built per request, the array `execute_plan` appended to was discarded the
  // moment the response ended — so every receipt it returned pointed at a log
  // that no longer existed. The test above pins that a caller CAN still ask for
  // per-request isolation; this pins that the default does not do it silently.
  const seen = new Set<unknown>();
  const app = createMcpHandler({
    bearerToken: 'test-token',
    registerTools: (_server, actionLog) => {
      seen.add(actionLog);
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
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ ...handshake, id }),
    });
    expect(response.status).toBe(200);
  }

  expect(seen.size).toBe(1);
});
