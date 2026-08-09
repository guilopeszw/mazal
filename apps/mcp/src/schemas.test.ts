import { describe, expect, test } from 'vitest';

import {
  buildRecoveryPlanInputSchema,
  diagnoseCampaignInputSchema,
  executePlanInputSchema,
  predictCampaignInputSchema,
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
});
