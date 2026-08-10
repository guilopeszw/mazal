import { describe, expect, test } from 'vitest';
import type { CampaignDay, ProductCard } from '@mazal/contracts';

import { benchmarks } from '@mazal/data';
import { diagnose } from './index.ts';

/**
 * A seller whose customers buy somewhere Meta cannot watch — iFood, WhatsApp, a
 * marketplace, an Instagram DM. Meta reports spend, impressions, reach and link
 * clicks honestly, and reports zero for every column that would need its pixel
 * on a checkout it never sees.
 *
 * The numbers are not wrong. They are absent, and absent is not zero. Judging
 * them as zero says "nobody who clicked ever added to cart", which is a
 * catastrophic conversion failure and an actionable one — the engine names a
 * cause, the plan proposes a rewrite, and a seller edits a product page that
 * was never the problem.
 *
 * This is a large share of Brazilian small sellers, not an edge case.
 */
function offPixelDays(): CampaignDay[] {
  return Array.from({ length: 30 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    campaignId: 'congelados',
    spend: 45,
    impressions: 6_000 + i * 40,
    reach: 4_200 + i * 30,
    clicks: 90 + (i % 7) * 6,
    addToCarts: 0,
    checkoutsInitiated: 0,
    purchases: 0,
    revenue: 0,
  }));
}

const frozenGoods: ProductCard = {
  category: 'food',
  price: 39.9,
  grossMargin: 0.45,
  shippingCost: 12,
  deliveryEtaDays: 2,
  stockOnHand: 80,
  reviewCount: 12,
  reviewAvg: 4.6,
  pdpImages: 5,
  pdpDescriptionLength: 380,
  returnPolicyDays: 7,
  paymentMethods: ['credit', 'pix'],
  offer: 'none',
};

const reference = { kind: 'benchmark', table: benchmarks } as const;

describe('a column Meta never reported is not a column at zero', () => {
  test('an all-zero funnel column is never diagnosed as a broken stage', () => {
    const d = diagnose({ days: offPixelDays(), card: frozenGoods, events: [], reference });

    // Stage 3 is the one that bites: its sample is *clicks*, which are healthy,
    // so the minimum-sample gate passes and only the numerator is missing.
    expect(d.primary?.stage).not.toBe(3);
    expect(d.primary?.stage).not.toBe(5);
    expect(d.secondary.map((f) => f.stage)).not.toContain(3);
    expect(d.secondary.map((f) => f.stage)).not.toContain(5);
    // And no cause invented to explain data that was never collected.
    expect(d.suspectedCause).not.toBe('thin_pdp');
  });

  test('a column that worked and then stopped is still a break', () => {
    // The signature that separates the two: a tracking loss has a before. Zero
    // from the first day is a column nobody ever reported; zero after two good
    // weeks is something that broke, and `pixel_break` must still fire.
    const days = offPixelDays().map((d, i) =>
      i < 14 ? { ...d, addToCarts: 12, checkoutsInitiated: 6, purchases: 4, revenue: 160 } : d,
    );

    const diagnosis = diagnose({ days, card: frozenGoods, events: [], reference });
    expect(diagnosis.primary).not.toBeNull();
  });

  test('a genuinely bad but reported rate is still judged', () => {
    // One add-to-cart a day is terrible and real. The guard must not swallow it
    // — it keys on nothing ever being reported, not on the number being small.
    const days = offPixelDays().map((d) => ({ ...d, addToCarts: 1 }));

    const diagnosis = diagnose({ days, card: frozenGoods, events: [], reference });
    const flagged = [diagnosis.primary, ...diagnosis.secondary].filter(Boolean);
    expect(flagged.some((f) => f!.stage === 3)).toBe(true);
  });
});
