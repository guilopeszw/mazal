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

test('builds into Vercel\'s Build Output API rather than a scanned directory', async () => {
  // The bug this pins cost hours and looked like everything else.
  //
  // The build used to bundle into `apps/mcp/api/mcp.mjs` and `vercel.json`
  // routed `/mcp` there. That relies on Vercel scanning the SOURCE TREE for
  // `api/*.mjs` — and the file is generated during the build and gitignored, so
  // at scan time it does not exist. No function was created, the route pointed
  // at nothing, and every path returned 404 while the build reported success.
  //
  // Asserting on the build script rather than on `vercel.json` is deliberate:
  // the previous test here read the routes back out of the config file it had
  // just parsed, which restates the file and cannot catch a routing failure.
  // This checks the one fact that made the difference — where the output goes.
  const script = await readFile(
    resolve(appRoot, 'scripts/build-vercel.mjs'),
    'utf8',
  );

  expect(script).toContain('.vercel/output');
  expect(script).toContain('mcp.func');
  // A function directory named `mcp.func` is served at `/mcp` with no routes at
  // all, which is why config.json carries none.
  expect(script).not.toContain("resolve(appRoot, 'api')");

  const config = JSON.parse(
    await readFile(resolve(appRoot, 'vercel.json'), 'utf8'),
  ) as { routes?: unknown[]; outputDirectory?: string };

  // Both would override the Build Output API and put us back where we started.
  expect(config.routes).toBeUndefined();
  expect(config.outputDirectory).toBeUndefined();
});

test('refuses an unauthenticated request through the deployed handler', async () => {
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
