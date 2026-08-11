import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import {
  buildRecoveryPlanInputSchema,
  diagnoseCampaignInputSchema,
  executePlanInputSchema,
  predictCampaignInputSchema,
  productCardSchema,
} from './schemas.js';
import {
  apparelCard,
  healthyDays,
  mazalAction,
  stockoutDiagnosis,
} from './tools/test-fixtures.js';

describe('public tool schemas', () => {
  test('accepts the two public reference modes without a client benchmark table', () => {
    const shared = { days: healthyDays(), card: apparelCard, events: [] };

    expect(diagnoseCampaignInputSchema.safeParse({
      ...shared,
      reference: { kind: 'benchmark' },
    }).success).toBe(true);
    expect(diagnoseCampaignInputSchema.safeParse({
      ...shared,
      reference: { kind: 'self', baselineDays: 14 },
    }).success).toBe(true);
  });

  test('rejects benchmark data supplied by the client', () => {
    const diagnosis = diagnoseCampaignInputSchema.safeParse({
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark', table: {} },
    });
    const prediction = predictCampaignInputSchema.safeParse({
      card: apparelCard,
      table: {},
    });

    expect(diagnosis.success).toBe(false);
    expect(prediction.success).toBe(false);
  });

  test('rejects malformed payloads for every tool', () => {
    const invalidDiagnosis = { ...stockoutDiagnosis, suspectedCause: 'unknown' };

    expect(diagnoseCampaignInputSchema.safeParse({
      days: [{ ...healthyDays()[0], clicks: -1 }],
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' },
    }).success).toBe(false);
    expect(predictCampaignInputSchema.safeParse({
      card: { ...apparelCard, grossMargin: 0 },
    }).success).toBe(false);
    expect(buildRecoveryPlanInputSchema.safeParse({
      diagnosis: invalidDiagnosis,
      card: apparelCard,
    }).success).toBe(false);
    expect(executePlanInputSchema.safeParse({
      actions: [{ ...mazalAction, expectedEffect: { metric: '', from: 0.01, to: 0.08 } }],
    }).success).toBe(false);
  });

  test('rejects a product card with a zero price', () => {
    expect(productCardSchema.safeParse({ ...apparelCard, price: 0 }).success).toBe(false);
  });

  test('rejects a product card without a payment method', () => {
    expect(productCardSchema.safeParse({ ...apparelCard, paymentMethods: [] }).success).toBe(false);
  });
});

test('rejects an unbounded day series at the tool boundary', () => {
  // Every array here was unbounded, so an authenticated caller could post a
  // million CampaignDays and make the engine chew through all of them inside one
  // request. The web route has capped its own sink since the day it was written.
  const days = healthyDays();
  const tooMany = Array.from({ length: 1101 }, () => days[0]!);
  expect(diagnoseCampaignInputSchema.safeParse({
    days: tooMany,
    card: apparelCard,
    events: [],
    reference: { kind: 'benchmark' },
  }).success).toBe(false);
});

test('rejects a string long enough to be a payload', () => {
  const days = healthyDays();
  expect(diagnoseCampaignInputSchema.safeParse({
    days: [{ ...days[0]!, campaignId: 'x'.repeat(121) }],
    card: apparelCard,
    events: [],
    reference: { kind: 'benchmark' },
  }).success).toBe(false);
});

describe('diagnoseCampaignInputSchema — the metaQuery arm', () => {
  const card = {
    category: 'bed_bath_table' as const,
    price: 100, grossMargin: 0.4, shippingCost: 10, deliveryEtaDays: 5,
    stockOnHand: 10, reviewCount: 5, reviewAvg: 4, pdpImages: 3,
    pdpDescriptionLength: 400, returnPolicyDays: 7,
    paymentMethods: ['pix' as const], offer: 'none' as const,
  };
  const base = { card, events: [], reference: { kind: 'benchmark' as const } };
  const metaQuery = {
    accountId: 'act_1234567890',
    campaignId: '23851234567890123',
    since: '2026-07-01',
    until: '2026-07-30',
  };

  test('accepts a well-formed metaQuery', () => {
    expect(diagnoseCampaignInputSchema.parse({ ...base, metaQuery })).toMatchObject({ metaQuery });
  });

  test('refuses an account id that is not act_<digits>', () => {
    expect(() => diagnoseCampaignInputSchema.parse({
      ...base, metaQuery: { ...metaQuery, accountId: '1234567890' },
    })).toThrow();
  });

  test('refuses a range that ends before it starts', () => {
    expect(() => diagnoseCampaignInputSchema.parse({
      ...base, metaQuery: { ...metaQuery, since: '2026-07-30', until: '2026-07-01' },
    })).toThrow();
  });

  test('refuses two of the three arms at once', () => {
    const days = [{
      date: '2026-07-01', campaignId: 'c', spend: 1, impressions: 1, reach: 1,
      clicks: 1, addToCarts: 0, checkoutsInitiated: 0, purchases: 0, revenue: 0,
    }];
    expect(() => diagnoseCampaignInputSchema.parse({ ...base, days, metaQuery })).toThrow();
  });

  test('refuses all three arms missing', () => {
    expect(() => diagnoseCampaignInputSchema.parse(base)).toThrow();
  });

  test('publishes an object at the schema root, not an anyOf', () => {
    // A union root breaks clients that expect an object in tools/list, which is
    // why the exactly-one rule is a refinement rather than a discriminated union.
    const json = z.toJSONSchema(diagnoseCampaignInputSchema, { io: 'input' }) as Record<string, unknown>;
    expect(json['type']).toBe('object');
    expect(json['anyOf']).toBeUndefined();
  });
});
