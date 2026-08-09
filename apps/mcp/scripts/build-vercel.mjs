import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(appRoot, 'api');

await mkdir(outputDirectory, { recursive: true });
await build({
  bundle: true,
  entryPoints: [resolve(appRoot, 'src/vercel-entrypoint.ts')],
  format: 'esm',
  legalComments: 'none',
  minify: true,
  outfile: resolve(outputDirectory, 'mcp.mjs'),
  platform: 'node',
  target: 'node24',
});
