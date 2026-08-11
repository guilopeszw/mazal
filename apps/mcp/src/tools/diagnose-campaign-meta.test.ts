import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { META_TOOLS, MetaMcpError, type MetaMcpClient } from '../meta-client/index.js';
import { stubClient } from '../meta-client/test-doubles.js';
import { diagnoseCampaignWithNotesAsync } from './diagnose-campaign.js';
import { apparelCard } from './test-fixtures.js';

const assumed = JSON.parse(
  readFileSync(new URL('../../fixtures/meta-mcp/assumed-insights.json', import.meta.url), 'utf8'),
) as { data: Record<string, unknown>[] };

const metaQuery = {
  accountId: 'act_1234567890',
  campaignId: '23851234567890123',
  since: '2026-07-01',
  until: '2026-07-03',
};

const input = {
  metaQuery,
  card: apparelCard,
  events: [],
  reference: { kind: 'benchmark' as const },
};

function connectStub(client: MetaMcpClient) {
  return async () => client;
}

beforeEach(() => {
  process.env['META_ADS_ENABLED'] = 'true';
  process.env['MAZAL_META_MCP_TOKEN'] = 'secret-token';
});
afterEach(() => {
  delete process.env['META_ADS_ENABLED'];
  delete process.env['MAZAL_META_MCP_TOKEN'];
});

describe('diagnose_campaign — the metaQuery arm', () => {
  test('fetches, normalises and diagnoses without the caller sending any rows', async () => {
    const client = stubClient({
      [META_TOOLS.insights]: { data: assumed.data },
      [META_TOOLS.signal]: { status: 'healthy' },
    });

    const { diagnosis } = await diagnoseCampaignWithNotesAsync(input, {
      connect: connectStub(client),
    });

    expect(diagnosis).toHaveProperty('suspectedCause');
    expect(diagnosis).toHaveProperty('secondary');
  });

  test('a broken dataset reaches the engine as pixel_break', async () => {
    const client = stubClient({
      [META_TOOLS.insights]: { data: assumed.data },
      [META_TOOLS.signal]: {
        status: 'broken',
        reason: 'No purchase events for 6 days',
        since: '2026-07-02',
      },
    });

    const { diagnosis, notes } = await diagnoseCampaignWithNotesAsync(input, {
      connect: connectStub(client),
    });

    expect(diagnosis.suspectedCause).toBe('pixel_break');
    expect(notes.join(' ')).toMatch(/Meta dataset diagnostics/);
  });

  test('refuses when META_ADS_ENABLED is not true, before opening any session', async () => {
    delete process.env['META_ADS_ENABLED'];
    let connected = false;

    await expect(diagnoseCampaignWithNotesAsync(input, {
      connect: async () => {
        connected = true;
        return stubClient({});
      },
    })).rejects.toThrow(MetaMcpError);

    expect(connected).toBe(false);
  });

  test('closes the session even when the diagnosis throws', async () => {
    let closed = false;
    const client: MetaMcpClient = {
      async callTool() {
        throw new MetaMcpError('META_MCP_TRANSPORT', 'socket died');
      },
      async close() {
        closed = true;
      },
    };

    await expect(diagnoseCampaignWithNotesAsync(input, { connect: connectStub(client) }))
      .rejects.toThrow(MetaMcpError);
    expect(closed).toBe(true);
  });

  test('the days and metaInsights arms still work and open no session', async () => {
    let connected = false;
    const result = await diagnoseCampaignWithNotesAsync({
      metaInsights: { data: assumed.data },
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
    }, {
      connect: async () => {
        connected = true;
        return stubClient({});
      },
    });

    expect(result.diagnosis).toHaveProperty('suspectedCause');
    expect(connected).toBe(false);
  });

  test('says out loud that the data came from a live Meta account', async () => {
    const client = stubClient({
      [META_TOOLS.insights]: { data: assumed.data },
      [META_TOOLS.signal]: { status: 'healthy' },
    });

    const { notes } = await diagnoseCampaignWithNotesAsync(input, { connect: connectStub(client) });
    expect(notes.join(' ')).toMatch(/live Meta ad account/i);
  });
});
