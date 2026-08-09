import { expect, test } from 'vitest';

import { createMcpHandler } from '../server.js';
import { apparelCard, healthyDays } from './test-fixtures.js';

type JsonRpcResponse = {
  result?: {
    tools?: Array<{ name: string }>;
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

test('tools/list exposes exactly the four public Mazal tools', async () => {
  const response = await callMcp('tools/list', {}, 1);

  expect(response.result?.tools?.map((tool) => tool.name).sort()).toEqual([
    'build_recovery_plan',
    'diagnose_campaign',
    'execute_plan',
    'predict_campaign',
  ]);
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
