import { expect, test } from 'vitest';

import { createMcpHandler } from '../server.js';
import { apparelCard, healthyDays } from './test-fixtures.js';

type JsonRpcResponse = {
  result?: {
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: { properties?: Record<string, unknown> };
    }>;
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

async function callMcp(method: string, params: Record<string, unknown>, id: number) {
  const app = createMcpHandler({ bearerToken: 'test-token' });
  const response = await app.request('/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Host: 'localhost',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const body = await response.text();
  const data = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? body.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
    : body;

  expect(response.status).toBe(200);
  expect(data).toBeTruthy();
  return JSON.parse(data!) as JsonRpcResponse;
}

test('tools/list exposes the four public Mazal tools and the Deco lifecycle callback', async () => {
  const response = await callMcp('tools/list', {}, 1);

  expect(response.result?.tools?.map((tool) => tool.name).sort()).toEqual([
    'ON_MCP_CONFIGURATION',
    'build_recovery_plan',
    'diagnose_campaign',
    'execute_plan',
    'predict_campaign',
  ]);
});

// Deco Studio invokes ON_MCP_CONFIGURATION on every connection create/update
// whose configuration changed (decocms/studio apps/api/src/tools/connection/
// {create,update}.ts). A server without the tool makes that callback throw
// "Tool ON_MCP_CONFIGURATION not found". The argument shape below is verbatim
// what Studio sends; the vault token must never be echoed back.
test('accepts Deco Studio\'s ON_MCP_CONFIGURATION callback and returns nothing', async () => {
  const response = await callMcp('tools/call', {
    name: 'ON_MCP_CONFIGURATION',
    arguments: {
      state: {},
      scopes: [],
      firstRun: true,
      vault: {
        baseUrl: 'https://api.decocms.example',
        org: 'guilherme-works-btg1',
        subjectConnectionId: 'conn_test',
        token: 'vault-workload-token',
      },
    },
  }, 4);

  expect(response.error).toBeUndefined();
  expect(response.result?.isError).not.toBe(true);
  expect(response.result?.structuredContent).toEqual({});
  expect(JSON.stringify(response)).not.toContain('vault-workload-token');
});

test('accepts the minimal ON_MCP_CONFIGURATION call an update sends', async () => {
  const response = await callMcp('tools/call', {
    name: 'ON_MCP_CONFIGURATION',
    arguments: { state: {}, scopes: [] },
  }, 5);

  expect(response.error).toBeUndefined();
  expect(response.result?.isError).not.toBe(true);
});

test('calls diagnose_campaign end to end through HTTP and the MCP SDK', async () => {
  const response = await callMcp('tools/call', {
    name: 'diagnose_campaign',
    arguments: {
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' },
    },
  }, 2);

  expect(response.error).toBeUndefined();
  expect(response.result?.isError).not.toBe(true);
  expect(response.result?.structuredContent).toEqual({
    primary: null,
    secondary: [],
    suspectedCause: 'none',
  });
});

test('returns a structured MCP tool error for invalid input', async () => {
  const response = await callMcp('tools/call', {
    name: 'diagnose_campaign',
    arguments: {
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark', table: {} },
    },
  }, 3);

  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(response.result?.content?.[0]?.text).toContain('Input validation error');
});

test('diagnose_campaign advertises the metaQuery arm in its description', async () => {
  const response = await callMcp('tools/list', {}, 90);
  const tool = response.result?.tools?.find((t) => t.name === 'diagnose_campaign');

  expect(tool?.description).toMatch(/metaQuery/);
});

test('diagnose_campaign publishes all three input arms', async () => {
  const response = await callMcp('tools/list', {}, 91);
  const tool = response.result?.tools?.find((t) => t.name === 'diagnose_campaign');

  expect(Object.keys(tool?.inputSchema?.properties ?? {})).toEqual(
    expect.arrayContaining(['days', 'metaInsights', 'metaQuery', 'card', 'events', 'reference']),
  );
});

test('reading a live account added no public tool', async () => {
  // PRD 10 asked for no fifth tool, and the first test in this file already
  // pins the exact five names. This one says why that matters here: the
  // metaQuery arm must not have become `diagnose_meta_campaign`.
  const response = await callMcp('tools/list', {}, 92);
  const names = response.result?.tools?.map((t) => t.name) ?? [];

  expect(names).toHaveLength(5);
  expect(names).not.toContain('diagnose_meta_campaign');
});
