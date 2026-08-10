// ─── apps/mcp/src/meta-client/client.ts ──────────────────────────────────
// One MCP session to Meta, for the length of one diagnosis.
//
// The session is not pooled or cached. A Vercel Function is short-lived and a
// pooled session outliving a request is a credential outliving the request it
// was authorised for.

import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { assertToolAllowed } from './allowlist.js';
import type { MetaMcpConfig } from './config.js';
import { MetaMcpError } from './errors.js';

/** The surface `insights.ts` and `signal.ts` are written against. */
export type MetaMcpClient = {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

export type ConnectOptions = {
  config: MetaMcpConfig;
  /** Injected in tests. Production passes nothing and the SDK uses global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** A hung call must not hold a Function open until the platform kills it. */
const DEFAULT_TIMEOUT_MS = 20_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Get the data out of an MCP tool result, or refuse.
 *
 * Three shapes are possible and only two are usable. `structuredContent` is
 * the modern one. A single text block holding JSON is the common one. Prose is
 * the one this whole module is at risk from: `fromMetaInsights` reads rows, and
 * a sentence about spend cannot become a funnel. When that is what arrives, the
 * error says so — "unexpected token S in JSON" would send the next reader to
 * debug a parser rather than to re-read Meta's tool description.
 */
export function unwrapToolResult(result: unknown): unknown {
  if (!isRecord(result)) {
    throw new MetaMcpError('META_MCP_UNREADABLE', 'Meta returned no tool result.');
  }

  const content = Array.isArray(result['content']) ? result['content'] : [];

  if (result['isError'] === true) {
    const text = content
      .filter((c): c is { type: string; text: string } => isRecord(c) && typeof c['text'] === 'string')
      .map((c) => c.text)
      .join(' ');
    throw new MetaMcpError(
      'META_MCP_UNREADABLE',
      `Meta's tool reported an error: ${text || '(no detail given)'}`,
    );
  }

  if (isRecord(result['structuredContent'])) return result['structuredContent'];

  const firstText = content.find(
    (c): c is { type: string; text: string } => isRecord(c) && typeof c['text'] === 'string',
  );
  if (!firstText) {
    throw new MetaMcpError('META_MCP_UNREADABLE', 'Meta returned a tool result with no content.');
  }

  try {
    return JSON.parse(firstText.text) as unknown;
  } catch {
    throw new MetaMcpError(
      'META_MCP_UNREADABLE',
      "Meta's tool answered in prose rather than structured data, and this product reads rows, " +
        'not sentences. A summary cannot become a funnel. Check whether the tool takes a ' +
        'parameter that asks for structured output.',
    );
  }
}

function asMetaMcpError(error: unknown): MetaMcpError {
  if (error instanceof MetaMcpError) return error;
  const message = error instanceof Error ? error.message : String(error);
  // The token is never interpolated into these, and the upstream message is
  // Meta's own text about a status code — but a credential in a log is
  // permanent, so the classification is deliberately coarse.
  const code = /401|403|unauthor|forbidden/i.test(message) ? 'META_MCP_AUTH' : 'META_MCP_TRANSPORT';
  return new MetaMcpError(
    code,
    code === 'META_MCP_AUTH'
      ? 'Meta rejected the credential for this ad account. Re-authorise and replace ' +
        'MAZAL_META_MCP_TOKEN; the token itself is never shown here.'
      : `Could not reach Meta's MCP server: ${message}`,
  );
}

export async function connectMetaMcp(options: ConnectOptions): Promise<MetaMcpClient> {
  const { config, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  const client = new Client({ name: 'mazal-mcp', version: '0.0.0' });

  try {
    await client.connect(transport);
  } catch (error) {
    throw asMetaMcpError(error);
  }

  return {
    async callTool(name, args) {
      // The only door. Nothing else in this module calls the SDK's callTool.
      assertToolAllowed(name);
      try {
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
        return unwrapToolResult(result);
      } catch (error) {
        throw asMetaMcpError(error);
      }
    },
    async close() {
      // A close that throws must not mask the answer we already have.
      await client.close().catch(() => undefined);
    },
  };
}
