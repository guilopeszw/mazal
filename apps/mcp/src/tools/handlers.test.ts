import { benchmarks } from '@mazal/data';
import { buildPlan, diagnose, predict } from '@mazal/engine';
import { describe, expect, test } from 'vitest';

import { InMemoryActionLog } from '../action-log.js';
import { buildRecoveryPlan } from './build-recovery-plan.js';
import { diagnoseCampaign } from './diagnose-campaign.js';
import { executePlan } from './execute-plan.js';
import { predictCampaign } from './predict-campaign.js';
import {
  apparelCard,
  healthyDays,
  mazalAction,
  sellerAction,
  stockoutDiagnosis,
} from './test-fixtures.js';

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

  test('refuses a payload with a hole in it rather than reading the hole as zero', () => {
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

    expect(() => diagnoseCampaign({
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
      metaInsights: { data: [row(first!, { spend: '' }), ...rest.map((d) => row(d))] },
    })).toThrow(/Absence is not zero/);
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
