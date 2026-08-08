// ─── packages/engine/test/fixtures.ts ────────────────────────────────────
// Hand-built from the contract. Never copied out of the simulator — the engine
// never sees simulator output, in its source or in its tests, or the firewall
// leaks through the test directory (docs/testing.md, docs/plan/A-engine.md).
//
// The numbers below are chosen to sit on the published benchmark medians in
// @mazal/data, so a healthy fixture is healthy by construction and a broken one
// is broken by exactly the deviation the test names.

import type { CampaignDay, OlistCategory, ProductCard, ReferenceMode } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';

export const APPAREL: OlistCategory = 'fashion_bags_accessories';

export const benchmarkRef: ReferenceMode = { kind: 'benchmark', table: benchmarks };

/**
 * Thirty days sitting on the category medians: ctr 1.1%, atcRate 8%, icRate 45%,
 * and purchases at the 2.1% cvr the same table publishes. Every count is a whole
 * number and every stage is comfortably above its minimum sample.
 */
export function healthyDays(): CampaignDay[] {
  return Array.from({ length: 30 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    campaignId: 'fixture',
    spend: 400,
    impressions: 20000,
    reach: 17000,          // frequency 1.18
    clicks: 220,           // ctr 1.1%
    addToCarts: 18,        // atcRate ~8.2%
    checkoutsInitiated: 8, // icRate ~44%
    purchases: 5,          // cvr ~2.3%
    revenue: 345,          // aov 69, against a category median of 65
  }));
}

export const apparelCard: ProductCard = {
  category: APPAREL,
  // Deliberately at the category median. A card priced above the category p75
  // makes `price_too_high` the honest attribution for any stage 3 break, which
  // is correct engine behaviour and would confound every other stage 3 test.
  price: 49,
  grossMargin: 0.45,
  shippingCost: 20,   // aov = price + shipping = 69
  deliveryEtaDays: 12,
  stockOnHand: 200,
  reviewCount: 80,
  reviewAvg: 4.5,
  pdpImages: 6,
  pdpDescriptionLength: 900,
  returnPolicyDays: 14,
  paymentMethods: ['credit', 'pix'],
  offer: 'none',
};
