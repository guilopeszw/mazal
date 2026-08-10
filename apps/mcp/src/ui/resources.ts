// ─── apps/mcp/src/ui/resources.ts ─────────────────────────────────────────
// The two `ui://` resources this server exposes, per the MCP Apps extension
// (modelcontextprotocol/ext-apps, spec 2026-01-26): a resource whose
// `resources/read` returns one self-contained HTML document with mime type
// `text/html;profile=mcp-app`, linked from a tool via `_meta.ui.resourceUri`.
// Deco Studio reads exactly this shape through `MCPAppRenderer`.

import { readFile } from 'node:fs/promises';

import type { McpServer } from '@modelcontextprotocol/server';

/**
 * `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps`, inlined so the
 * server bundle does not carry the whole app SDK for one string.
 * `src/ui/resources.test.ts` pins the two against each other.
 */
export const UI_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

export const UI_RESOURCES = [
  {
    name: 'mazal-diagnosis',
    uri: 'ui://mazal/diagnosis',
    title: 'Funnel diagnosis',
    description: 'The seven-stage funnel with the leaking stage marked.',
    file: 'diagnosis.html',
    tool: 'diagnose_campaign',
  },
  {
    name: 'mazal-prediction',
    uri: 'ui://mazal/prediction',
    title: 'Pre-flight verdict',
    description: 'Break-even ROAS and the p10–p90 prediction band.',
    file: 'prediction.html',
    tool: 'predict_campaign',
  },
] as const;

/** Tool name → the `ui://` URI its `_meta.ui.resourceUri` must carry. */
export const UI_RESOURCE_URI_BY_TOOL: Record<string, string> = Object.fromEntries(
  UI_RESOURCES.map((resource) => [resource.tool, resource.uri]),
);

/**
 * Resolved against this module: `src/ui/dist/` in development, `dist/` next to
 * `index.mjs` inside the deployed function — the Vercel build copies the HTML
 * there for exactly this reason.
 */
async function readViewHtml(file: string): Promise<string> {
  try {
    return await readFile(new URL(`./dist/${file}`, import.meta.url), 'utf8');
  } catch (error) {
    throw new Error(
      `view HTML "${file}" is not built — run \`node scripts/build-ui.mjs\` (cause: ${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
}

export function registerUiResources(server: McpServer): void {
  for (const { name, uri, title, description, file } of UI_RESOURCES) {
    server.registerResource(
      name,
      uri,
      { title, description, mimeType: UI_RESOURCE_MIME_TYPE },
      async () => ({
        contents: [{ uri, mimeType: UI_RESOURCE_MIME_TYPE, text: await readViewHtml(file) }],
      }),
    );
  }
}
