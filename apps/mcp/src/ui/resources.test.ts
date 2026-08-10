import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps';
import { beforeAll, expect, test } from 'vitest';

import { createMcpHandler } from '../server.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The view HTML is a build artifact (`scripts/build-ui.mjs` → `src/ui/dist`),
 * not a committed file — build it here the same way `vercel-bundle.test.ts`
 * builds the function bundle.
 */
beforeAll(() => {
  const result = spawnSync(process.execPath, [join(appRoot, 'scripts', 'build-ui.mjs')], {
    cwd: appRoot,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
});

function rpc(method: string, params: object, id = 1) {
  return {
    method: 'POST' as const,
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Host: 'localhost',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  };
}

/** The transport answers as JSON or as an SSE `data:` line; read either. */
async function resultOf(response: Response): Promise<any> {
  const text = await response.text();
  const data = text.startsWith('event:') || text.includes('\ndata:')
    ? text.split('\n').find((line) => line.startsWith('data:'))!.slice(5)
    : text;
  return JSON.parse(data.trim()).result;
}

test('lists both ui:// resources with the MCP Apps mime type', async () => {
  const app = createMcpHandler({ bearerToken: 'test-token' });
  const response = await app.request('/mcp', rpc('resources/list', {}));

  expect(response.status).toBe(200);
  const { resources } = await resultOf(response);
  const byUri = Object.fromEntries(resources.map((r: any) => [r.uri, r]));

  expect(byUri['ui://mazal/diagnosis'].mimeType).toBe(RESOURCE_MIME_TYPE);
  expect(byUri['ui://mazal/prediction'].mimeType).toBe(RESOURCE_MIME_TYPE);
});

test('serves a self-contained view that performs the MCP Apps handshake', async () => {
  const app = createMcpHandler({ bearerToken: 'test-token' });

  for (const uri of ['ui://mazal/diagnosis', 'ui://mazal/prediction']) {
    const response = await app.request('/mcp', rpc('resources/read', { uri }));
    expect(response.status).toBe(200);

    const { contents } = await resultOf(response);
    expect(contents[0].uri).toBe(uri);
    expect(contents[0].mimeType).toBe(RESOURCE_MIME_TYPE);
    // The bundled ext-apps SDK sends `ui/initialize`; without it the host's
    // renderer waits forever and the tile never leaves its spinner.
    expect(contents[0].text).toContain('ui/initialize');
    // Self-contained: the CSP the host injects blocks every external request.
    expect(contents[0].text).not.toContain('src="http');
    expect(contents[0].text).not.toContain('href="http');
  }
});

test('links each chart tool to its view through _meta.ui.resourceUri', async () => {
  const app = createMcpHandler({ bearerToken: 'test-token' });
  const response = await app.request('/mcp', rpc('tools/list', {}));

  const { tools } = await resultOf(response);
  const byName = Object.fromEntries(tools.map((t: any) => [t.name, t]));

  expect(byName['diagnose_campaign']._meta?.ui?.resourceUri).toBe('ui://mazal/diagnosis');
  expect(byName['predict_campaign']._meta?.ui?.resourceUri).toBe('ui://mazal/prediction');
  // The other tools return receipts and plans for the agent to narrate — no UI.
  expect(byName['build_recovery_plan']._meta?.ui).toBeUndefined();
  expect(byName['execute_plan']._meta?.ui).toBeUndefined();
});

test('the resources sit behind the same bearer gate as every tool', async () => {
  const app = createMcpHandler({ bearerToken: 'test-token' });
  const request = rpc('resources/read', { uri: 'ui://mazal/diagnosis' });

  const noToken = await app.request('/mcp', {
    ...request,
    headers: { ...request.headers, Authorization: '' },
  });
  expect(noToken.status).toBe(401);

  const wrongToken = await app.request('/mcp', {
    ...request,
    headers: { ...request.headers, Authorization: 'Bearer wrong-token' },
  });
  expect(wrongToken.status).toBe(401);
});
