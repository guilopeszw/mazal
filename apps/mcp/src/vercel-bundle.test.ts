import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, expect, test } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = join(appRoot, 'api', 'mcp.mjs');

const handshake = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vercel-bundle-test', version: '1.0.0' },
  },
};

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [join(appRoot, 'scripts', 'build-vercel.mjs')],
    {
      cwd: appRoot,
      encoding: 'utf8',
    },
  );

  expect(result.status, result.stderr || result.stdout).toBe(0);
});

test('emits a self-contained ESM Vercel function', async () => {
  const bundle = await readFile(bundlePath, 'utf8');

  expect(bundle).not.toContain('@mazal/');
  expect(bundle).not.toContain('src/index.ts');
});

test('the isolated bundle completes an authenticated MCP handshake', async () => {
  const isolatedDirectory = await mkdtemp(join(tmpdir(), 'mazal-mcp-bundle-'));
  const isolatedBundle = join(isolatedDirectory, 'mcp.mjs');

  try {
    await copyFile(bundlePath, isolatedBundle);
    const { createVercelHandler } = await import(pathToFileURL(isolatedBundle).href);
    const handler = createVercelHandler({
      bearerToken: 'test-token',
      allowedHosts: ['mazal-mcp.vercel.app'],
      allowedOrigins: ['mazal-mcp.vercel.app'],
    });
    const response = await handler(
      new Request('https://mazal-mcp.vercel.app/api/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
          Host: 'mazal-mcp.vercel.app',
          Origin: 'https://mazal-mcp.vercel.app',
        },
        body: JSON.stringify(handshake),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Mazal MCP');
  } finally {
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});
