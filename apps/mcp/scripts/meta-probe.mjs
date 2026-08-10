// ─── apps/mcp/scripts/meta-probe.mjs ─────────────────────────────────────
// Phase 0. The one thing in this repo that has ever spoken to Meta.
//
// Everything in `src/meta-client/` is written against an ASSUMED response
// shape. This script replaces the assumption with an observation, and writes
// the result to `fixtures/meta-mcp/captured-*.json` for Task 11 to reconcile.
//
// Needs a human: Meta authenticates through Business OAuth in a browser, so
// the token has to be obtained interactively and handed to this script through
// the environment.
//
//   MAZAL_META_MCP_TOKEN=... node apps/mcp/scripts/meta-probe.mjs \
//     --account act_123456 --campaign 987654 --since 2026-07-01 --until 2026-07-30
//
// Nothing it writes contains a token, an account id, a page id or a free-text
// name. Redaction happens before the first write, not after review.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(appRoot, 'fixtures/meta-mcp');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const url = process.env.MAZAL_META_MCP_URL ?? 'https://mcp.facebook.com/ads';
const token = process.env.MAZAL_META_MCP_TOKEN;
if (!token) {
  console.error('MAZAL_META_MCP_TOKEN is not set. Authorise in a browser first, then export it.');
  process.exit(1);
}

const account = arg('account');
const campaign = arg('campaign');
const since = arg('since');
const until = arg('until');
if (!account || !campaign || !since || !until) {
  console.error('Usage: --account act_<id> --campaign <id> --since YYYY-MM-DD --until YYYY-MM-DD');
  process.exit(1);
}

/**
 * Redaction, applied to everything before it is written.
 *
 * Ids and names are the parts that identify a real advertiser; the field
 * NAMES and the value SHAPES are the parts we are trying to learn, and they
 * survive. A redacted `"12"` is still a string, which is one of the three
 * things this probe exists to settle.
 */
const SENSITIVE_EXACT = new Set([
  'account_id', 'account_name', 'campaign_id', 'campaign_name',
  'adset_id', 'adset_name', 'ad_id', 'ad_name', 'page_id',
  'business_id', 'dataset_id', 'pixel_id',
]);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_EXACT.has(k) ? `<${k}>` : redact(v)]),
    );
  }
  if (typeof value === 'string' && token && value.includes(token)) return '<token>';
  return value;
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'mazal-probe', version: '0.0.0' });
await client.connect(transport);

await mkdir(outDir, { recursive: true });

const tools = await client.listTools();
await writeFile(
  resolve(outDir, 'captured-tools.json'),
  `${JSON.stringify(redact(tools), null, 2)}\n`,
);
console.log(`tools/list returned ${tools.tools.length} tools:`);
for (const t of tools.tools) console.log(`  ${t.name}`);

/**
 * Call one tool and record whatever comes back, including a failure.
 *
 * A refusal is data too: "this tool needs a parameter we did not send" is a
 * finding, and losing it to a thrown exception means running the whole
 * interactive dance again.
 */
async function probe(label, name, args) {
  console.log(`\ncalling ${name}…`);
  try {
    const result = await client.callTool({ name, arguments: args });
    await writeFile(
      resolve(outDir, `captured-${label}.json`),
      `${JSON.stringify(redact(result), null, 2)}\n`,
    );
    const hasStructured = result.structuredContent !== undefined;
    console.log(`  structuredContent: ${hasStructured ? 'YES' : 'NO'}`);
    console.log(`  content blocks: ${(result.content ?? []).map((c) => c.type).join(', ')}`);
  } catch (error) {
    await writeFile(
      resolve(outDir, `captured-${label}-error.json`),
      `${JSON.stringify({ message: String(error?.message ?? error) }, null, 2)}\n`,
    );
    console.log(`  FAILED: ${error?.message ?? error}`);
  }
}

const insightsTool = arg('insights-tool') ?? 'get_insights';
const signalTool = arg('signal-tool');

await probe('insights', insightsTool, {
  object_id: campaign,
  level: 'campaign',
  time_range: { since, until },
  time_increment: 1,
});

if (signalTool) await probe('signal', signalTool, { object_id: account });

await client.close();

console.log(`\nWrote captures to ${outDir}`);
console.log('\nFour questions this probe exists to answer:');
console.log('  1. Exact tool names        — see the list above');
console.log('  2. Structured JSON or prose — see structuredContent above');
console.log('  3. Daily granularity        — does captured-insights.json hold one row per date?');
console.log('  4. inline_link_clicks       — is it present, or only `clicks`?');
