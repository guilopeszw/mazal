import { describe, expect, test } from 'vitest';

import { connectMetaMcp, unwrapToolResult } from './client.js';
import { MetaMcpError } from './errors.js';

const config = { url: 'https://meta.test/ads', token: 'secret-token' };

describe('unwrapToolResult', () => {
  test('prefers structuredContent when the tool provides it', () => {
    expect(unwrapToolResult({
      structuredContent: { data: [{ date_start: '2026-07-01' }] },
      content: [{ type: 'text', text: 'ignored' }],
    })).toEqual({ data: [{ date_start: '2026-07-01' }] });
  });

  test('falls back to a text block that parses as JSON', () => {
    expect(unwrapToolResult({
      content: [{ type: 'text', text: '{"data":[{"date_start":"2026-07-01"}]}' }],
    })).toEqual({ data: [{ date_start: '2026-07-01' }] });
  });

  /**
   * The Phase 0 risk, named in code. If Meta's reporting tool summarises in
   * prose, no adapter in this repo can read it, and the failure should say
   * exactly that rather than "unexpected token S in JSON".
   */
  test('refuses prose, and says why', () => {
    expect(() => unwrapToolResult({
      content: [{ type: 'text', text: 'Spend was R$1,240 across 3 campaigns.' }],
    })).toThrow(MetaMcpError);

    try {
      unwrapToolResult({ content: [{ type: 'text', text: 'Spend was R$1,240.' }] });
    } catch (error) {
      expect((error as MetaMcpError).code).toBe('META_MCP_UNREADABLE');
      expect((error as Error).message).toMatch(/prose|structured/i);
    }
  });

  test('refuses a tool result flagged as an error', () => {
    expect(() => unwrapToolResult({
      isError: true,
      content: [{ type: 'text', text: 'Invalid parameter: object_id' }],
    })).toThrow(/Invalid parameter/);
  });

  test('refuses an empty result', () => {
    expect(() => unwrapToolResult({ content: [] })).toThrow(MetaMcpError);
  });
});

describe('connectMetaMcp', () => {
  test('sends the bearer token and never the token alone in an error', async () => {
    const seen: { authorization?: string } = {};
    // `string | URL | Request`, not `RequestInfo`: this package compiles with
    // `types: ["node"]` and no DOM lib, and @types/node declares fetch's own
    // parameter type rather than the DOM's `RequestInfo` alias.
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      seen.authorization = new Headers(init?.headers).get('authorization') ?? undefined;
      return new Response('nope', { status: 401, statusText: 'Unauthorized' });
    }) as typeof fetch;

    await expect(connectMetaMcp({ config, fetchImpl })).rejects.toThrow(MetaMcpError);
    expect(seen.authorization).toBe('Bearer secret-token');
  });

  test('maps an auth failure to META_MCP_AUTH without echoing the token', async () => {
    const fetchImpl = (async () =>
      new Response('unauthorized', { status: 401 })) as typeof fetch;

    try {
      await connectMetaMcp({ config, fetchImpl });
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as MetaMcpError).code).toBe('META_MCP_AUTH');
      expect((error as Error).message).not.toContain('secret-token');
    }
  });

  test('maps a dead socket to META_MCP_TRANSPORT', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    try {
      await connectMetaMcp({ config, fetchImpl });
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as MetaMcpError).code).toBe('META_MCP_TRANSPORT');
    }
  });
});
