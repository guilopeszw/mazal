// ─── packages/sim/funnel.ts ──────────────────────────────────────────────
// Forward-simulates 30 days of funnel counts. This file knows nothing about
// faults: a fault reaches it only as a per-day set of multipliers, which is
// what keeps "cause first, effect second" true in the code and not only in
// the comments.

import type { CampaignDay, ProductCard } from '@mazal/contracts';
import type { Rng } from './rng.ts';

/** One multiplier per funnel stage. 1 means untouched. */
export type StageMultipliers = {
  impressions: number;
  ctr: number;
  atcRate: number;
  icRate: number;
  purchaseRate: number;
  aov: number;
  cpm: number;
  /** Multiplies the natural frequency ramp. Only creative_fatigue moves it. */
  frequency: number;
};

export const NEUTRAL: StageMultipliers = {
  impressions: 1, ctr: 1, atcRate: 1, icRate: 1, purchaseRate: 1, aov: 1, cpm: 1, frequency: 1,
};

export type FunnelParams = {
  campaignId: string;
  dailyBudget: number;             // BRL
  baseCpm: number;                 // BRL per 1000 impressions
  baseCtr: number;
  baseAtcRate: number;             // add-to-carts per click
  baseIcRate: number;              // checkouts per add-to-cart
  basePurchaseRate: number;        // purchases per checkout initiated
  aov: number;                     // BRL
  days: number;
  startDate: string;               // ISO 8601
};

/**
 * The published BRL priors that ship in benchmarks.json, restated here as the
 * generator's centre. cvr 0.021 = atcRate 0.08 × icRate 0.45 × purchaseRate,
 * so purchaseRate is 0.583 and the four rates are mutually consistent — a
 * generator whose stages disagree with its own funnel rate teaches the engine
 * a relationship that does not hold.
 */
const PRIOR = { cpm: 22, ctr: 0.011, atcRate: 0.08, icRate: 0.45, purchaseRate: 0.583 } as const;

/**
 * Rounds down and carries the fraction as the chance of rounding up, so the
 * expectation survives small numbers.
 *
 * Math.round does not. A seller on R$60/day gets ~20 clicks, so ~1 add-to-cart,
 * and `Math.round(1 * 0.45)` is 0 — the campaign reports zero checkouts and zero
 * purchases for thirty days while carrying the label `none`. Every small
 * advertiser in the training set would have been a false alarm, and the false
 * alarm rate is the number B-data.md says a judge asks about first.
 */
function stochasticRound(rng: Rng, x: number): number {
  const floor = Math.floor(x);
  return floor + (rng.float() < x - floor ? 1 : 0);
}

/** No timezone maths: the whole package runs on UTC midnights. */
export function addDays(isoDate: string, n: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function sampleFunnelParams(rng: Rng, card: ProductCard): FunnelParams {
  return {
    campaignId: `sim-${rng.int(100000, 999999)}`,
    dailyBudget: Math.round(rng.lognormal(180, 0.6)),
    baseCpm: PRIOR.cpm * rng.lognormal(1, 0.25),
    baseCtr: PRIOR.ctr * rng.lognormal(1, 0.3),
    baseAtcRate: PRIOR.atcRate * rng.lognormal(1, 0.3),
    baseIcRate: PRIOR.icRate * rng.lognormal(1, 0.2),
    basePurchaseRate: PRIOR.purchaseRate * rng.lognormal(1, 0.15),
    aov: card.price + card.shippingCost,
    days: 30,
    // Fixed: nothing in this package may read the clock (see the plan's Global Constraints).
    startDate: '2026-07-01',
  };
}

/**
 * `perDay[i]` is the multiplier set for day i. Pass `NEUTRAL` for a healthy day.
 *
 * Counts are rounded at every stage and clamped so a later stage can never
 * exceed the earlier one it draws from. Without that clamp, day-level noise
 * occasionally produces more purchases than checkouts, and a seller who spots
 * that in the UI stops believing the rest of the screen.
 */
export function simulateFunnel(rng: Rng, p: FunnelParams, perDay: StageMultipliers[]): CampaignDay[] {
  const days: CampaignDay[] = [];

  for (let i = 0; i < p.days; i++) {
    const m = perDay[i] ?? NEUTRAL;
    const noise = () => rng.lognormal(1, 0.12);

    const cpm = p.baseCpm * m.cpm * rng.lognormal(1, 0.08);
    const spend = p.dailyBudget * m.impressions * rng.lognormal(1, 0.05);
    const impressions = Math.max(0, Math.round((spend / cpm) * 1000));

    const step = (upstream: number, rate: number, mult: number) =>
      Math.min(upstream, stochasticRound(rng, upstream * rate * mult * noise()));

    const clicks = step(impressions, p.baseCtr, m.ctr);
    const addToCarts = step(clicks, p.baseAtcRate, m.atcRate);
    const checkoutsInitiated = step(addToCarts, p.baseIcRate, m.icRate);
    const purchases = step(checkoutsInitiated, p.basePurchaseRate, m.purchaseRate);

    days.push({
      date: addDays(p.startDate, i),
      campaignId: p.campaignId,
      spend: Number(spend.toFixed(2)),
      impressions,
      // Meta reach is below impressions, and frequency climbs as a flight burns
      // through its audience. A healthy 30-day run ends near 2×; only
      // creative_fatigue pushes it past the 4 that B-data.md's table names.
      reach: Math.max(1, Math.round(impressions / ((1.15 + i * 0.03) * m.frequency))),
      clicks,
      addToCarts,
      checkoutsInitiated,
      purchases,
      revenue: Number((purchases * p.aov * m.aov).toFixed(2)),
    });
  }

  return days;
}
