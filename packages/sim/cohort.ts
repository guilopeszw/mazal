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
 * One campaign in four is healthy; the eight broken kinds share the rest.
 *
 * Plain round-robin over nine kinds gave `none` one ninth of the cohort, which
 * left **eleven** healthy campaigns in the held-out hundred. A false-alarm rate
 * on eleven campaigns carries about fifteen points of standard error, and the
 * false-alarm rate is the number B-data.md says a judge who has shipped a
 * monitoring product asks about first. Quoting it to one decimal place off
 * eleven samples would be the most confident wrong number on the slide.
 *
 * A quarter healthy is also closer to a real account than a ninth, and every
 * broken class still lands ~37 campaigns, which is enough to fill the confusion
 * matrix. It is still nothing like a real account's ratio — most campaigns in
 * the world are fine — so the false-alarm rate stays a floor, not a forecast.
 */
const BROKEN = FAULT_KINDS.filter((k) => k !== 'none');

export function cohortPlan(): { seed: number; fault: FaultKind }[] {
  let broken = 0;
  return Array.from({ length: COHORT_SIZE }, (_, i) => ({
    seed: BASE + i,
    fault: i % 4 === 0 ? ('none' as FaultKind) : BROKEN[broken++ % BROKEN.length]!,
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
