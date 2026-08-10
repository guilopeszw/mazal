// ─── apps/mcp/src/meta-client/test-doubles.ts ────────────────────────────
// A MetaMcpClient backed by a map, so insights.ts and signal.ts can be tested
// without a socket, a token or Meta.
//
// It goes through the same allowlist as the real client: a test that reaches a
// tool production could not reach is a test that proves nothing.

import { assertToolAllowed } from './allowlist.js';
import type { MetaMcpClient } from './client.js';
import { MetaMcpError } from './errors.js';

export type StubResponder = (args: Record<string, unknown>) => unknown;

export function stubClient(responses: Record<string, unknown | StubResponder>): MetaMcpClient & {
  readonly calls: { name: string; args: Record<string, unknown> }[];
} {
  const calls: { name: string; args: Record<string, unknown> }[] = [];

  return {
    calls,
    async callTool(name, args) {
      assertToolAllowed(name);
      calls.push({ name, args });
      const responder = responses[name];
      if (responder === undefined) {
        throw new MetaMcpError('META_MCP_TRANSPORT', `No stubbed response for "${name}".`);
      }
      return typeof responder === 'function' ? (responder as StubResponder)(args) : responder;
    },
    async close() {},
  };
}
