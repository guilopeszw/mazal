import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, expect, test } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The build writes Vercel's Build Output API tree now, not a scanned `api/`
// directory — a function folder named `mcp.func` is served at `/mcp`.
const bundlePath = join(appRoot, '.vercel', 'output', 'functions', 'mcp.func', 'index.mjs');

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

test('the deployed bundle cannot spell a Meta write call', async () => {
  // The allowlist is the real guard — this is belt and braces over what
  // actually ships. esbuild minifies identifiers but preserves string
  // literals, so a write tool name reaching the allowlist would appear here.
  const bundle = await readFile(bundlePath, 'utf8');

  for (const forbidden of [
    'create_campaign', 'create_adset', 'create_ad',
    'update_adset', 'update_ad', 'update_ad_creative',
    'create_budget_schedule', 'upload_ad_image',
  ]) {
    expect(bundle, `bundle contains "${forbidden}"`).not.toContain(forbidden);
  }
});

test('the isolated bundle exposes named MCP HTTP methods and rejects an unauthenticated POST', async () => {
  const isolatedDirectory = await mkdtemp(join(tmpdir(), 'mazal-mcp-bundle-'));
  const isolatedBundle = join(isolatedDirectory, 'mcp.mjs');

  try {
    await copyFile(bundlePath, isolatedBundle);
    const entrypoint = await import(pathToFileURL(isolatedBundle).href);

    expect(entrypoint.default).toBeUndefined();
    expect(entrypoint.GET).toEqual(expect.any(Function));
    expect(entrypoint.POST).toEqual(expect.any(Function));
    expect(entrypoint.DELETE).toEqual(expect.any(Function));

    const response = await entrypoint.POST(
      new Request('https://localhost/mcp', {
        method: 'POST',
        headers: { Host: 'localhost' },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  } finally {
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});

test('ships both view HTML files inside the function directory', async () => {
  // The resource read resolves `./dist/<view>.html` against the bundle's own
  // location, so the HTML must be deployed inside `mcp.func` — a bundle without
  // it would list the resources and then 500 on every read.
  // Pinned as a set, not just iterated: a fourth view would otherwise ship
  // unasserted, and this test would keep passing while saying nothing about
  // the file that actually broke. Adding one fails here on purpose.
  const shipped = (
    await readdir(join(appRoot, '.vercel', 'output', 'functions', 'mcp.func', 'dist'))
  ).sort();
  expect(shipped).toEqual(['diagnosis.html', 'prediction.html']);

  for (const view of ['diagnosis', 'prediction']) {
    const html = await readFile(
      join(appRoot, '.vercel', 'output', 'functions', 'mcp.func', 'dist', `${view}.html`),
      'utf8',
    );
    expect(html).toContain('ui/initialize');
  }
});

test('the deployed bundle serves a ui:// resource through the authenticated transport', async () => {
  // Imported in place — `dist/` sits next to `index.mjs` exactly as on Vercel.
  const { createVercelHandler } = await import(pathToFileURL(bundlePath).href);
  const handler = createVercelHandler({
    bearerToken: 'test-token',
    allowedHosts: ['mazal-mcp.vercel.app'],
    allowedOrigins: ['mazal-mcp.vercel.app'],
  });
  const response = await handler(
    new Request('https://mazal-mcp.vercel.app/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Host: 'mazal-mcp.vercel.app',
        Origin: 'https://mazal-mcp.vercel.app',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: { uri: 'ui://mazal/prediction' },
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('ui/initialize');
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
      new Request('https://mazal-mcp.vercel.app/mcp', {
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
