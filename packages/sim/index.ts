// ─── packages/sim/index.ts ───────────────────────────────────────────────
// docs/contracts.md § packages/sim.

import type { FaultKind, LabelledCampaign } from '@mazal/contracts';
import { planFault } from './faults.ts';
import { sampleFunnelParams, simulateFunnel } from './funnel.ts';
import { makeRng } from './rng.ts';
import { sampleStore } from './store.ts';

/**
 * Cause first, effect second: sample a store, sample a campaign, decide the
 * fault, and only then let the funnel run. The label is returned beside the
 * metrics and is never derivable from them by construction.
 *
 * The same seed and the same fault give byte-identical output on any machine.
 */
export function generateCampaign(seed: number, fault: FaultKind = 'none'): LabelledCampaign {
  const rng = makeRng(seed);
  const card = sampleStore(rng);
  const params = sampleFunnelParams(rng, card);
  const plan = planFault(rng, fault, card, params);
  const days = simulateFunnel(rng, params, plan.multipliers);

  return {
    days,
    card,
    events: plan.events,
    fault: plan.injectedOn ? { kind: fault, injectedOn: plan.injectedOn } : { kind: fault },
  };
}

export { alwaysHealthy, runBacktestWith, type Diagnoser } from './backtest.ts';
export { COHORT_SIZE, HELD_OUT, cohortPlan, generateCohort, splitCohort } from './cohort.ts';
export { FAULT_KINDS } from './faults.ts';
export { FAULT_STAGES, formatConfusion, score, scoreOne, type Scored } from './score.ts';
export { makeRng, type Rng } from './rng.ts';
export { sampleStore } from './store.ts';
