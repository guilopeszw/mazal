// ─── packages/contracts/src/metrics.test.ts ──────────────────────────────
// Exactly three assertions, as specified in docs/plan/C-ingest.md:
//   1. safeDiv returns 0 rather than NaN for 0/0
//   2. aggregate sums counts
//   3. ctr(aggregate(days)) differs from the mean of daily CTRs on an uneven series
//      — this is the bug the "store counts, derive rates" rule exists to prevent

import { describe, expect, test } from 'vitest';
import { safeDiv, aggregate, ctr } from './metrics.js';
import type { CampaignDay } from './index.js';

/** Helper: builds a minimal CampaignDay with overrides. */
function day(overrides: Partial<CampaignDay> & { date: string }): CampaignDay {
  return {
    campaignId: 'test-campaign',
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    addToCarts: 0,
    checkoutsInitiated: 0,
    purchases: 0,
    revenue: 0,
    ...overrides,
  };
}

describe('metrics', () => {
  test('safeDiv returns 0 for 0/0 and x/0 rather than NaN or Infinity', () => {
    const result0 = safeDiv(0, 0);
    expect(result0).toBe(0);
    expect(Number.isNaN(result0)).toBe(false);

    const result100 = safeDiv(100, 0);
    expect(result100).toBe(0);
    expect(Number.isFinite(result100)).toBe(true);
  });

  test('aggregate sums counts across days', () => {
    const days: CampaignDay[] = [
      day({ date: '2026-07-01', impressions: 1000, clicks: 50, spend: 100, addToCarts: 5, purchases: 2, revenue: 200 }),
      day({ date: '2026-07-02', impressions: 2000, clicks: 80, spend: 150, addToCarts: 8, purchases: 3, revenue: 350 }),
      day({ date: '2026-07-03', impressions: 1500, clicks: 60, spend: 120, addToCarts: 6, purchases: 1, revenue: 100 }),
    ];

    const agg = aggregate(days);

    expect(agg.impressions).toBe(4500);
    expect(agg.clicks).toBe(190);
    expect(agg.spend).toBe(370);
    expect(agg.addToCarts).toBe(19);
    expect(agg.purchases).toBe(6);
    expect(agg.revenue).toBe(650);
  });

  test('ctr(aggregate(days)) differs from mean of daily CTRs on an uneven series', () => {
    // Deliberately uneven: day 1 has many impressions and few clicks,
    // day 2 has few impressions and many clicks.
    // The mean of daily CTRs weights each day equally.
    // The correct aggregate CTR weights by impressions.
    const days: CampaignDay[] = [
      day({ date: '2026-07-01', impressions: 10000, clicks: 100 }),  // CTR = 0.01
      day({ date: '2026-07-02', impressions: 100,   clicks: 10 }),   // CTR = 0.10
    ];

    const correctCtr = ctr(aggregate(days));       // 110 / 10100 ≈ 0.01089
    const naiveMean = (ctr(days[0]) + ctr(days[1])) / 2; // (0.01 + 0.10) / 2 = 0.055

    // They must differ — this is the bug the rule exists to prevent.
    // The naive mean (0.055) is ~5× too high because it treats a 100-impression
    // day as equally important as a 10,000-impression day.
    expect(correctCtr).not.toBeCloseTo(naiveMean, 2);
    expect(correctCtr).toBeCloseTo(110 / 10100, 10);
    expect(naiveMean).toBeCloseTo(0.055, 10);
  });
});
