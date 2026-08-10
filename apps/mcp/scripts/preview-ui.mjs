// ─── apps/mcp/scripts/preview-ui.mjs ──────────────────────────────────────
// Renders the two MCP App views to standalone HTML files you can open in a
// browser, with no host and no LLM anywhere in the loop.
//
// Why this exists: the views ship inside Deco Studio, so the only way anyone
// had seen them was to open Studio — and the wire format being right is not
// the same claim as the pixels being right. This paints them from the same
// view code, the same CSS and the same fixture the home tiles are configured
// with, so what you see here is what the tile draws.
//
// The one substitution is `runtime.js`, the MCP Apps lifecycle: instead of
// waiting for a host to push `tool-input` and `tool-result` over postMessage,
// the stub hands the view the result immediately. Everything downstream of
// that — the view models, the funnel, every number — is untouched. The
// transport it skips is the part already covered by tests and by the live
// 401/403/CONNECTION_TEST checks; the drawing is the part nobody had seen.
//
// Output is gitignored, next to the real build:
//   node scripts/preview-ui.mjs && open src/ui/dist-preview/diagnosis.html

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { benchmarks } from '@mazal/data';
import { diagnose, predict } from '@mazal/engine';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Not `src/ui/dist`: the Vercel build copies that directory wholesale into the
// function bundle, so a preview left there would ship as dead weight.
const outDir = resolve(appRoot, 'src/ui/dist-preview');
const repoRoot = resolve(appRoot, '../..');

// The fixture the agent's `metadata.ui.homeTiles` is configured with — the
// eta_shock campaign, so the funnel has something to say.
const fixture = JSON.parse(
  await readFile(resolve(repoRoot, 'packages/sim/fixtures/demo-case2.json'), 'utf8'),
);

const diagnoseInput = {
  days: fixture.days,
  card: fixture.card,
  events: fixture.events ?? [],
  reference: { kind: 'benchmark', table: benchmarks },
};

// Real engine output. The preview never invents a number, for the same reason
// the view never does.
const VIEWS = {
  diagnosis: {
    result: diagnose(diagnoseInput),
    // The view reads `days` off the tool input, exactly as the host passes it.
    input: { days: fixture.days, card: fixture.card, events: fixture.events ?? [], reference: { kind: 'benchmark' } },
  },
  prediction: {
    result: predict({ card: fixture.card, table: benchmarks }),
    input: { card: fixture.card },
  },
};

await mkdir(outDir, { recursive: true });

for (const [view, { result, input }] of Object.entries(VIEWS)) {
  const stub = `
    export function structuredResult(result) {
      if (result.structuredContent) return result.structuredContent;
      const text = result.content?.find((c) => c.type === 'text');
      return text ? JSON.parse(text.text) : undefined;
    }
    export function runView(options) {
      const data = JSON.parse(document.getElementById('mazal-preview-data').textContent);
      try { options.render(data.result, data.input); }
      catch (e) { options.renderError(e instanceof Error ? e.message : String(e)); }
    }
  `;

  const bundle = await build({
    bundle: true,
    entryPoints: [resolve(appRoot, `src/ui/apps/${view}.ts`)],
    format: 'iife',
    legalComments: 'none',
    minify: true,
    platform: 'browser',
    target: 'es2022',
    write: false,
    plugins: [
      {
        name: 'preview-runtime',
        setup(b) {
          b.onResolve({ filter: /^\.\/runtime\.js$/ }, () => ({ path: 'preview-runtime', namespace: 'preview' }));
          b.onLoad({ filter: /.*/, namespace: 'preview' }, () => ({ contents: stub, loader: 'js' }));
        },
      },
    ],
  });

  const js = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const data = JSON.stringify({ result, input }).replaceAll('</script', '<\\/script');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mazal ${view} — preview</title>
<style>
  body { margin: 0; }
  .preview-note {
    font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
    padding: 10px 14px; background: #111; color: #bbb;
  }
  .preview-note strong { color: #fff; }
</style>
</head>
<body>
<p class="preview-note">
  <strong>Preview</strong> — the <code>${view}</code> tile, drawn by the same view code Studio
  loads, from <code>packages/sim/fixtures/demo-case2.json</code> through the real engine.
  No host, no model. Regenerate with <code>node scripts/preview-ui.mjs</code>.
</p>
<script type="application/json" id="mazal-preview-data">${data}</script>
<script>${js}</script>
</body>
</html>
`;

  await writeFile(resolve(outDir, `${view}.html`), html);
}

console.log(`wrote ${Object.keys(VIEWS).length} previews to src/ui/dist-preview (open diagnosis.html)`);
