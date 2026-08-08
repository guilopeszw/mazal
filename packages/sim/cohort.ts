// ─── packages/sim/cohort.ts ──────────────────────────────────────────────
// The 400 campaigns the backtest runs on, and the 100 A never sees.
//
// Fixed here, in code, and fixed *before* anyone has seen a score. That is the
// whole point of a held-out set: a split chosen after the first result is not a
// held-out set, it is a choice about which result to report. B-data.md —
// "Hold out 100 that A never sees", "No tuning against the held-out set after
// looking at it."

import type { FaultKind, LabelledCampaign } from '@mazal/contracts';
import { FAULT_KINDS } from './faults.ts';
import { generateCampaign } from './index.ts';

export const COHORT_SIZE = 400;
export const HELD_OUT = 100;

/** Seeds are `BASE + i`, so the cohort is one integer away from reproducible. */
const BASE = 700000;

/**
 * Faults are assigned round-robin, which gives `none` 45 of 400 — the same
 * share as every other class.
 *
 * That is a deliberate over-representation of broken campaigns relative to any
 * real account, and it is the right call for a confusion matrix, which needs
 * every cell populated. It does mean **the false-alarm rate here is measured on
 * 45 healthy campaigns of a possible 400**, and the slide should quote the
 * denominator rather than the percentage alone.
 */
export function cohortPlan(): { seed: number; fault: FaultKind }[] {
  return Array.from({ length: COHORT_SIZE }, (_, i) => ({
    seed: BASE + i,
    fault: FAULT_KINDS[i % FAULT_KINDS.length]!,
  }));
}

export function generateCohort(): LabelledCampaign[] {
  return cohortPlan().map((c) => generateCampaign(c.seed, c.fault));
}

/**
 * `train` is what A may see, including per-class breakdowns. `held` is what the
 * reported number comes from, and A sees only its aggregate.
 *
 * The split is by position, not shuffled, and the round-robin above means both
 * halves carry every fault kind in the same proportion.
 */
export function splitCohort<T>(items: T[]): { train: T[]; held: T[] } {
  return {
    train: items.slice(0, COHORT_SIZE - HELD_OUT),
    held: items.slice(COHORT_SIZE - HELD_OUT),
  };
}
