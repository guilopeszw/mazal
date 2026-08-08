// ─── packages/sim/faults.ts ──────────────────────────────────────────────
// One fault, injected as a cause. Each kind returns the per-day multipliers it
// applies and the StoreEvent it would have left in the real world.
//
// B-data.md: "a simulated fault that leaves no trace in the event log is not
// simulating reality" — the event log is how the engine turns a broken stage
// into a named cause.

import type { FaultKind, ProductCard, StoreEvent } from '@mazal/contracts';
import { NEUTRAL, addDays, type FunnelParams, type StageMultipliers } from './funnel.ts';
import type { Rng } from './rng.ts';

/** Every FaultKind, in the order B-data.md's table lists them. */
export const FAULT_KINDS = [
  'none', 'stockout', 'eta_shock', 'creative_fatigue', 'price_too_high',
  'checkout_friction', 'pixel_break', 'budget_cap', 'thin_pdp',
] as const satisfies readonly FaultKind[];

export type FaultPlan = {
  multipliers: StageMultipliers[];
  events: StoreEvent[];
  /** ISO date the fault starts. Absent for `none` and for day-one conditions. */
  injectedOn?: string;
};

const neutralDays = (n: number): StageMultipliers[] => Array.from({ length: n }, () => ({ ...NEUTRAL }));

/**
 * The multiplier that lands a stage on `target`, whatever this campaign's own
 * base rate happens to be.
 *
 * A blind squeeze does not survive contact with the generator: every campaign
 * draws its base rates at sigma 0.2–0.3, so scaling by 0.4 leaves a
 * high-drawing store above a low-drawing healthy one. That campaign carries a
 * fault label and healthy numbers, and it teaches the engine that the fault
 * sometimes does nothing. A fault names the state it puts the funnel in.
 */
const toTarget = (rng: Rng, target: number, base: number, sigma = 0.12): number =>
  (target * rng.lognormal(1, sigma)) / base;

export function planFault(rng: Rng, kind: FaultKind, card: ProductCard, p: FunnelParams): FaultPlan {
  const multipliers = neutralDays(p.days);

  switch (kind) {
    case 'none':
      return { multipliers, events: [] };

    case 'stockout': {
      // Stage 3. "ATC → near zero from a day, CTR unchanged."
      const day = rng.int(8, 22);
      const date = addDays(p.startDate, day);
      const m = toTarget(rng, 0.004, p.baseAtcRate, 0.3);   // ATC to near zero
      for (let i = day; i < p.days; i++) multipliers[i]!.atcRate = m;
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'stockout', detail: `stock on hand ${card.stockOnHand} → 0` }],
      };
    }

    case 'eta_shock': {
      // Stage 4. "IC rate collapses from a day, ATC unchanged."
      const day = rng.int(8, 22);
      const date = addDays(p.startDate, day);
      const to = card.deliveryEtaDays + rng.int(9, 16);
      // Tight sigma on every squeeze below. Each campaign already draws its own
      // base rate at sigma 0.2–0.3, and a squeeze that is loose enough to overlap
      // that lands a campaign in the training set whose label says broken and
      // whose numbers say healthy. The generator would be teaching the engine
      // that the fault sometimes does nothing.
      const m = toTarget(rng, 0.14, p.baseIcRate);          // IC 45% -> ~14%
      for (let i = day; i < p.days; i++) multipliers[i]!.icRate = m;
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'eta_change', detail: `supplier ETA ${card.deliveryEtaDays}d → ${to}d` }],
      };
    }

    case 'creative_fatigue': {
      // Stages 0–1. "frequency climbs past 4, CTR decays gradually, CPM flat."
      // Two signals, not one: a CTR that decays without the frequency climb is
      // a creative that was never good, which is a different diagnosis.
      const start = rng.int(6, 14);
      for (let i = start; i < p.days; i++) {
        const age = i - start;
        multipliers[i]!.ctr = Math.max(0.35, 1 - age * 0.045);
        // The audience stops refreshing, so the same people see it again: the
        // natural ramp ends near 2x and this carries it past 4.
        multipliers[i]!.frequency = 1 + age * 0.09;
      }
      return {
        multipliers,
        injectedOn: addDays(p.startDate, start),
        events: [],   // nobody logs an event when a creative gets tired
      };
    }

    case 'price_too_high': {
      // Stages 3 and 6, from day one — a condition, not a break.
      const squeeze = toTarget(rng, 0.032, p.baseAtcRate);  // ATC 8% -> ~3.2%
      for (const m of multipliers) { m.atcRate = squeeze; m.aov = 1.25; }
      return { multipliers, events: [] };
    }

    case 'checkout_friction': {
      // Stage 5. "CVR depressed, IC fine." Purchases per checkout, not per click.
      const day = rng.int(6, 20);
      const date = addDays(p.startDate, day);
      const m = toTarget(rng, 0.17, p.basePurchaseRate);    // 58% -> ~17% per checkout
      for (let i = day; i < p.days; i++) multipliers[i]!.purchaseRate = m;
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'policy_flag', detail: 'checkout step added: address confirmation' }],
      };
    }

    case 'pixel_break': {
      // "everything drops to near zero on one day" — and stays there, because a
      // broken pixel stops reporting until someone fixes it. Spend keeps running,
      // which is what makes it expensive and what makes it detectable.
      const day = rng.int(10, 24);
      const date = addDays(p.startDate, day);
      for (let i = day; i < p.days; i++) {
        multipliers[i]!.atcRate = toTarget(rng, 0.002, p.baseAtcRate, 0.3);
        multipliers[i]!.icRate = toTarget(rng, 0.02, p.baseIcRate, 0.3);
        multipliers[i]!.purchaseRate = toTarget(rng, 0.02, p.basePurchaseRate, 0.3);
      }
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'pixel_error', detail: 'purchase event stopped firing' }],
      };
    }

    case 'budget_cap': {
      // Stage 0. "impressions flatten, CPM rises, spend pinned."
      const day = rng.int(8, 18);
      const date = addDays(p.startDate, day);
      for (let i = day; i < p.days; i++) {
        multipliers[i]!.cpm = 1 + (i - day) * 0.05;
        multipliers[i]!.impressions = 1;      // spend pinned at the daily budget
      }
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'budget_change', detail: 'daily budget capped by the account spend limit' }],
      };
    }

    case 'thin_pdp': {
      // Stage 3, from day one, "with a low photo count and short description on
      // the card". The card is mutated here because for this fault the card IS
      // the cause — the engine is meant to read it off the PDP fields.
      card.pdpImages = 1;
      card.pdpDescriptionLength = rng.int(40, 160);
      const squeeze = toTarget(rng, 0.034, p.baseAtcRate);  // ATC 8% -> ~3.4%
      for (const m of multipliers) m.atcRate = squeeze;
      return { multipliers, events: [] };
    }
  }
}
