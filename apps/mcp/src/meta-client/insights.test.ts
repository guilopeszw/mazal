import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { META_TOOLS } from './allowlist.js';
import { MetaMcpError } from './errors.js';
import { fetchInsights, MAX_PAGES } from './insights.js';
import { stubClient } from './test-doubles.js';

const assumed = JSON.parse(
  readFileSync(new URL('../../fixtures/meta-mcp/assumed-insights.json', import.meta.url), 'utf8'),
) as { data: Record<string, unknown>[] };

const query = {
  accountId: 'act_1234567890',
  campaignId: '23851234567890123',
  since: '2026-07-01',
  until: '2026-07-03',
};

describe('fetchInsights', () => {
  test('returns the rows as a MetaInsightsPayload', async () => {
    const client = stubClient({ [META_TOOLS.insights]: { data: assumed.data } });
    const payload = await fetchInsights(client, query);

    expect(payload.data).toHaveLength(3);
    expect(payload.data[0]?.date_start).toBe('2026-07-01');
    // A live fetch is never a fixture, and must not claim to be.
    expect(payload.__mazal_fixture).toBeUndefined();
  });

  test('asks for the campaign, the date range and daily granularity', async () => {
    const client = stubClient({ [META_TOOLS.insights]: { data: assumed.data } });
    await fetchInsights(client, query);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.args).toMatchObject({
      object_id: query.campaignId,
      level: 'campaign',
      time_increment: 1,
      time_range: { since: query.since, until: query.until },
    });
  });

  test('follows pagination and concatenates every page', async () => {
    let page = 0;
    const client = stubClient({
      [META_TOOLS.insights]: () => {
        page += 1;
        return page < 3
          ? { data: [assumed.data[0]], paging: { cursors: { after: `cursor-${page}` } } }
          : { data: [assumed.data[0]] };
      },
    });

    const payload = await fetchInsights(client, query);
    expect(payload.data).toHaveLength(3);
    expect(client.calls[1]?.args).toMatchObject({ after: 'cursor-1' });
    expect(client.calls[2]?.args).toMatchObject({ after: 'cursor-2' });
  });

  /**
   * Half a campaign diagnosed confidently is worse than no diagnosis, so
   * hitting the cap is an error rather than a warning. The adapter can only
   * warn — it makes no network calls — and this is the layer that can do
   * better.
   */
  test('refuses rather than truncating when the page cap is reached', async () => {
    const client = stubClient({
      [META_TOOLS.insights]: () => ({
        data: [assumed.data[0]],
        paging: { cursors: { after: 'always-more' } },
      }),
    });

    await expect(fetchInsights(client, query)).rejects.toThrow(MetaMcpError);
    expect(client.calls.length).toBe(MAX_PAGES);
  });

  test('refuses an account that does not bill in BRL', async () => {
    const usd = assumed.data.map((row) => ({ ...row, account_currency: 'USD' }));
    const client = stubClient({ [META_TOOLS.insights]: { data: usd } });

    try {
      await fetchInsights(client, query);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as MetaMcpError).code).toBe('META_MCP_CURRENCY');
      expect((error as Error).message).toMatch(/BRL/);
    }
  });

  test('accepts a payload that states no currency at all', async () => {
    const noCurrency = assumed.data.map(({ account_currency: _drop, ...rest }) => rest);
    const client = stubClient({ [META_TOOLS.insights]: { data: noCurrency } });
    await expect(fetchInsights(client, query)).resolves.toBeDefined();
  });

  test('refuses an empty result rather than reporting a dead funnel', async () => {
    const client = stubClient({ [META_TOOLS.insights]: { data: [] } });
    await expect(fetchInsights(client, query)).rejects.toThrow(/no rows/i);
  });

  test('refuses a response with no data array', async () => {
    const client = stubClient({ [META_TOOLS.insights]: { summary: 'all good' } });
    await expect(fetchInsights(client, query)).rejects.toThrow(MetaMcpError);
  });
});
