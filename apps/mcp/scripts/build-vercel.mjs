// ─── apps/mcp/scripts/build-vercel.mjs ───────────────────────────────────
// Builds the MCP server into Vercel's Build Output API, not into `api/`.
//
// ## Why this changed
//
// The previous version bundled to `apps/mcp/api/mcp.mjs` and let `vercel.json`
// route `/mcp` there. That relies on Vercel's zero-config detection, which scans
// the SOURCE TREE for `api/*.mjs` and turns what it finds into Serverless
// Functions. Our file is generated during the build and is gitignored, so at
// scan time it does not exist — no function was ever created, the route pointed
// at nothing, and every path returned 404 while the build itself reported
// success. That combination is why it looked like a routing or protection
// problem for hours.
//
// The Build Output API removes the guessing: whatever this script writes under
// `.vercel/output` IS the deployment. No detection, no framework preset
// inference, no ordering problem between "when is the file written" and "when does
// Vercel look".
//
// Layout it produces:
//
//   .vercel/output/config.json                  version 3, and nothing else
//   .vercel/output/functions/mcp.func/index.mjs the bundle
//   .vercel/output/functions/mcp.func/.vc-config.json
//
// A function directory named `mcp.func` is served at `/mcp`. That is the whole
// routing story, which is why `config.json` needs no routes.

import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(appRoot, '.vercel/output');
const functionDir = resolve(outputRoot, 'functions/mcp.func');

// Start clean: a stale function from an earlier layout would still be deployed.
await rm(outputRoot, { recursive: true, force: true });
await mkdir(functionDir, { recursive: true });

// The MCP App views first: the function reads `./dist/<view>.html` relative to
// its own bundle, so the HTML ships inside the function directory.
await import('./build-ui.mjs');
await cp(resolve(appRoot, 'src/ui/dist'), resolve(functionDir, 'dist'), { recursive: true });

await build({
  bundle: true,
  entryPoints: [resolve(appRoot, 'src/vercel-entrypoint.ts')],
  format: 'esm',
  legalComments: 'none',
  minify: true,
  outfile: resolve(functionDir, 'index.mjs'),
  platform: 'node',
  target: 'node24',
});

/**
 * `launcherType: 'Nodejs'` with an ESM entry that exports GET/POST/DELETE is
 * Vercel's Web handler convention — the same shape that worked under `api/`,
 * now declared rather than detected. The runtime matches the project's Node 24
 * and `apps/mcp/package.json`'s own engines field.
 */
await writeFile(
  resolve(functionDir, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      supportsResponseStreaming: true,
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  resolve(outputRoot, 'config.json'),
  `${JSON.stringify({ version: 3 }, null, 2)}\n`,
);

console.log('built .vercel/output — functions/mcp.func serves /mcp');
