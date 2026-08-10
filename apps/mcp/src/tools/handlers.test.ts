import { benchmarks } from '@mazal/data';
import { buildPlan, diagnose, predict } from '@mazal/engine';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { InMemoryActionLog } from '../action-log.js';
import { buildRecoveryPlan } from './build-recovery-plan.js';
import { diagnoseCampaign, diagnoseCampaignWithNotes } from './diagnose-campaign.js';
import { executePlan } from './execute-plan.js';
import { predictCampaign } from './predict-campaign.js';
import {
  apparelCard,
  healthyDays,
  mazalAction,
  sellerAction,
  stockoutDiagnosis,
} from './test-fixtures.js';

/**
 * Most of the payload tests below send a hand-built response with no fixture
 * stamp on it — which is exactly what `META_ADS_ENABLED` gates. They are about
 * the adapter arm's mechanics rather than about the flag, so the flag is on for
 * them and has two tests of its own at the end of this block.
 */
beforeEach(() => {
  process.env['META_ADS_ENABLED'] = 'true';
});
afterEach(() => {
  delete process.env['META_ADS_ENABLED'];
});

describe('diagnose_campaign handler', () => {
  test('injects the server benchmark table and returns the engine diagnosis unchanged', () => {
    const input = {
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
    };

    expect(diagnoseCampaign(input)).toEqual(diagnose({
      ...input,
      reference: { kind: 'benchmark', table: benchmarks },
    }));
  });

  test('rejects a benchmark table supplied by the client', () => {
    expect(() => diagnoseCampaign({
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark', table: {} },
    })).toThrow();
  });

  test('accepts a raw Meta insights payload and lands on the same diagnosis', () => {
    const days = healthyDays();
    const shared = { card: apparelCard, events: [], reference: { kind: 'benchmark' as const } };

    const metaInsights = {
      data: days.map((d) => ({
        date_start: d.date,
        date_stop: d.date,
        campaign_id: d.campaignId,
        campaign_name: 'Apparel',
        account_currency: 'BRL',
        spend: d.spend.toFixed(2),
        impressions: String(d.impressions),
        reach: String(d.reach),
        inline_link_clicks: String(d.clicks),
        actions: [
          { action_type: 'add_to_cart', value: String(d.addToCarts) },
          { action_type: 'initiate_checkout', value: String(d.checkoutsInitiated) },
          { action_type: 'purchase', value: String(d.purchases) },
        ],
        action_values: [{ action_type: 'purchase', value: d.revenue.toFixed(2) }],
      })),
    };

    // The point of the arm: the caller sends what Meta sent them, and the
    // answer is the one the days would have given.
    expect(diagnoseCampaign({ ...shared, metaInsights })).toEqual(diagnoseCampaign({ ...shared, days }));
  });

  test('drops the row it cannot read, names it, and answers from the rest', () => {
    const [first, ...rest] = healthyDays();
    const row = (d: (typeof rest)[number], over: Record<string, unknown> = {}) => ({
      date_start: d.date,
      date_stop: d.date,
      campaign_id: d.campaignId,
      campaign_name: 'Apparel',
      spend: d.spend.toFixed(2),
      impressions: String(d.impressions),
      reach: String(d.reach),
      inline_link_clicks: String(d.clicks),
      actions: [],
      action_values: [],
      ...over,
    });

    const { diagnosis, notes } = diagnoseCampaignWithNotes({
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
      metaInsights: { data: [row(first!, { spend: '' }), ...rest.map((d) => row(d))] },
    });

    // The hole is refused by name and the rest of the month survives it.
    expect(diagnosis).toBeDefined();
    expect(notes.some((n) => n.includes('Absence is not zero'))).toBe(true);
    expect(notes.some((n) => n.includes('spend'))).toBe(true);
  });

  test('hands the provenance of a fixture payload back to the caller', () => {
    const days = healthyDays();
    const { notes } = diagnoseCampaignWithNotes({
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
      metaInsights: {
        data: days.map((d) => ({
          date_start: d.date,
          date_stop: d.date,
          campaign_id: d.campaignId,
          campaign_name: 'Apparel',
          spend: d.spend.toFixed(2),
          impressions: String(d.impressions),
          reach: String(d.reach),
          inline_link_clicks: String(d.clicks),
          actions: [{ action_type: 'purchase', value: String(d.purchases) }],
          action_values: [{ action_type: 'purchase', value: d.revenue.toFixed(2) }],
        })),
        __mazal_fixture: {
          kind: 'fixture',
          generator: 'packages/meta/generate.ts',
          derivedFrom: 'test',
          note: 'Synthetic.',
        },
      },
    });

    // Without this the tool answers confidently about invented data and never
    // says so — which is the whole reason the stamp exists.
    expect(notes.some((n) => n.includes('No Meta account was called'))).toBe(true);
  });

  test('refuses to average several campaigns into one funnel', () => {
    const days = healthyDays().slice(0, 3);
    const rowsFor = (campaign: string) =>
      days.map((d) => ({
        date_start: d.date,
        date_stop: d.date,
        campaign_id: campaign,
        campaign_name: campaign,
        spend: d.spend.toFixed(2),
        impressions: String(d.impressions),
        reach: String(d.reach),
        inline_link_clicks: String(d.clicks),
        actions: [{ action_type: 'purchase', value: String(d.purchases) }],
        action_values: [{ action_type: 'purchase', value: d.revenue.toFixed(2) }],
      }));

    expect(() => diagnoseCampaign({
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
      metaInsights: { data: [...rowsFor('c1'), ...rowsFor('c2')] },
    })).toThrow(/one funnel/);
  });

  test('accepts the extra fields Meta really returns instead of rejecting the response', () => {
    const days = healthyDays();
    const shared = { card: apparelCard, events: [], reference: { kind: 'benchmark' as const } };
    const withRealFields = {
      data: days.map((d) => ({
        date_start: d.date,
        date_stop: d.date,
        campaign_id: d.campaignId,
        campaign_name: 'Apparel',
        // All real, all returned by presets nobody controls. Stripped, not read.
        ctr: '2.14',
        cpc: '0.69',
        cpm: '14.74',
        frequency: '1.15',
        objective: 'OUTCOME_SALES',
        account_name: 'Loja',
        spend: d.spend.toFixed(2),
        impressions: String(d.impressions),
        reach: String(d.reach),
        inline_link_clicks: String(d.clicks),
        actions: [
          { action_type: 'add_to_cart', value: String(d.addToCarts) },
          { action_type: 'initiate_checkout', value: String(d.checkoutsInitiated) },
          { action_type: 'purchase', value: String(d.purchases) },
        ],
        action_values: [{ action_type: 'purchase', value: d.revenue.toFixed(2) }],
      })),
    };

    expect(diagnoseCampaign({ ...shared, metaInsights: withRealFields }))
      .toEqual(diagnoseCampaign({ ...shared, days }));
  });

  test('will not diagnose a payload it has never been validated against, by default', () => {
    // The adapter has only ever read its own generator's output. Diagnosing a
    // seller's real campaign through code with a closed-loop guard is the kind
    // of confidence this product exists to refuse — so an unstamped payload
    // needs META_ADS_ENABLED, and a fixture never does.
    delete process.env['META_ADS_ENABLED'];

    const days = healthyDays();
    const row = (d: (typeof days)[number]) => ({
      date_start: d.date,
      date_stop: d.date,
      campaign_id: d.campaignId,
      campaign_name: 'Apparel',
      spend: d.spend.toFixed(2),
      impressions: String(d.impressions),
      reach: String(d.reach),
      inline_link_clicks: String(d.clicks),
      actions: [{ action_type: 'purchase', value: String(d.purchases) }],
      action_values: [{ action_type: 'purchase', value: d.revenue.toFixed(2) }],
    });
    const shared = { card: apparelCard, events: [], reference: { kind: 'benchmark' as const } };

    expect(() => diagnoseCampaign({ ...shared, metaInsights: { data: days.map(row) } }))
      .toThrow(/META_ADS_ENABLED/);

    // The same payload with our own stamp on it is fine with the flag unset,
    // which is what "the flag off preserves CSV and fixtures" has to mean.
    expect(diagnoseCampaign({
      ...shared,
      metaInsights: {
        data: days.map(row),
        __mazal_fixture: {
          kind: 'fixture',
          generator: 'packages/meta/generate.ts',
          derivedFrom: 'test',
          note: 'Synthetic.',
        },
      },
    })).toBeDefined();
  });

  test('takes days or a payload, never both and never neither', () => {
    const shared = { card: apparelCard, events: [], reference: { kind: 'benchmark' as const } };
    const metaInsights = { data: [] as unknown[] };

    expect(() => diagnoseCampaign({ ...shared, days: healthyDays(), metaInsights })).toThrow();
    expect(() => diagnoseCampaign(shared)).toThrow();
  });
});

describe('predict_campaign handler', () => {
  test('injects the server benchmark table and returns the engine verdict unchanged', () => {
    const input = { card: apparelCard, history: healthyDays() };

    expect(predictCampaign(input)).toEqual(predict({ ...input, table: benchmarks }));
  });

  test('rejects a benchmark table supplied by the client', () => {
    expect(() => predictCampaign({ card: apparelCard, table: {} })).toThrow();
  });
});

describe('build_recovery_plan handler', () => {
  test('returns buildPlan output without numeric enrichment', () => {
    expect(buildRecoveryPlan({ diagnosis: stockoutDiagnosis, card: apparelCard })).toEqual(
      buildPlan(stockoutDiagnosis, apparelCard),
    );
  });

  test('rejects a malformed diagnosis before calling the engine', () => {
    expect(() => buildRecoveryPlan({
      diagnosis: { ...stockoutDiagnosis, primary: { ...stockoutDiagnosis.primary, rule: '' } },
      card: apparelCard,
    })).toThrow();
  });
});

describe('execute_plan handler', () => {
  test('logs Mazal actions and returns their deterministic receipt', () => {
    const log = new InMemoryActionLog();

    expect(executePlan({ actions: [mazalAction] }, log)).toEqual({
      receipt: '381e19127b7a4287ea6381debcd8e2cfc89e007e8c714f21648f096bd13a0bd4',
      logged: [mazalAction],
    });
    expect(log.snapshot()).toEqual([mazalAction]);
  });

  test('rejects seller actions without writing any part of the batch', () => {
    const log = new InMemoryActionLog();

    expect(() => executePlan({ actions: [mazalAction, sellerAction] }, log)).toThrow(
      'execute_plan only accepts actions with actor "mazal"',
    );
    expect(log.snapshot()).toEqual([]);
  });
});
