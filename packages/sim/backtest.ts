// ─── packages/sim/backtest.ts ────────────────────────────────────────────
// Runs a cohort through a diagnoser and scores what comes back.
//
// `diagnose` is a parameter, not an import. That is not indirection for its own
// sake — it is what lets the whole backtest be written, run and checked before
// `packages/engine` exists, and it makes the firewall a property of the type
// system rather than a promise: this file cannot reach into the engine because
// it does not know what the engine is.
//
// docs/contracts.md specifies `runBacktest(campaigns): BacktestReport`. That
// exact signature arrives as a three-line wrapper the moment `diagnose` does —
// see `runBacktest` at the bottom, currently commented out because the import
// would not resolve.

import type { BacktestReport, Diagnosis, DiagnoseInput, LabelledCampaign } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import { score, type Scored } from './score.ts';

/** The one function this package needs from the engine, and the only one it may use. */
export type Diagnoser = (input: DiagnoseInput) => Diagnosis;

/** Every campaign is diagnosed against the category benchmarks — the pre-flight arm. */
export function diagnoseAll(campaigns: LabelledCampaign[], diagnose: Diagnoser): Scored[] {
  return campaigns.map((c) => ({
    fault: c.fault,
    diagnosis: diagnose({
      days: c.days,
      card: c.card,
      events: c.events,
      reference: { kind: 'benchmark', table: benchmarks },
    }),
  }));
}

export function runBacktestWith(campaigns: LabelledCampaign[], diagnose: Diagnoser): BacktestReport {
  return score(diagnoseAll(campaigns, diagnose));
}

/**
 * A diagnoser that always answers "healthy". It is the floor every real result
 * has to beat, and it is worth printing beside them: on a cohort that is one
 * ninth `none`, always-healthy already scores 11% top-1 with a 0% false-alarm
 * rate. A number is not evidence until it is compared to that.
 */
export const alwaysHealthy: Diagnoser = () => ({
  primary: null,
  secondary: [],
  suspectedCause: 'none',
});

// Once `packages/engine` exports `diagnose`, add "@mazal/engine": "workspace:*"
// to this package's dependencies and replace this block with:
//
//   import { diagnose } from '@mazal/engine';
//   export const runBacktest = (campaigns: LabelledCampaign[]): BacktestReport =>
//     runBacktestWith(campaigns, diagnose);
//
// Nothing else in this package changes.
