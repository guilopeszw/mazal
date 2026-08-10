// ─── apps/mcp/scripts/build-ui.mjs ────────────────────────────────────────
// Bundles each MCP App view into one self-contained HTML file the resource
// read callback serves verbatim. Self-contained is not a preference: the host
// injects a restrictive CSP into the iframe, so a <script src> to anywhere
// would simply not load. Output goes to `src/ui/dist` (gitignored); the
// Vercel build copies it next to the function bundle.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(appRoot, 'src/ui/dist');

const VIEWS = ['diagnosis', 'prediction'];

await mkdir(outDir, { recursive: true });

for (const view of VIEWS) {
  const bundle = await build({
    bundle: true,
    entryPoints: [resolve(appRoot, `src/ui/apps/${view}.ts`)],
    format: 'iife',
    legalComments: 'none',
    minify: true,
    platform: 'browser',
    target: 'es2022',
    write: false,
  });

  // `</script` inside the bundle would end the inline tag early.
  const js = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mazal ${view}</title></head>
<body><script>${js}</script></body>
</html>
`;

  await writeFile(resolve(outDir, `${view}.html`), html);
}

console.log(`built ${VIEWS.length} MCP App views into src/ui/dist`);
