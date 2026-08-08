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
// exact signature arrives as a three-line wrapper the moment `diagnose` does;
// README.md has the wrapper and the one dependency to add with it.

import type { BacktestReport, Diagnosis, DiagnoseInput, LabelledCampaign } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import { score, type Scored } from './score.ts';

/** The one function this package needs from the engine, and the only one it may use. */
export type Diagnoser = (input: DiagnoseInput) => Diagnosis;

/** Every campaign is diagnosed against the category benchmarks — the pre-flight arm. */
export function runBacktestWith(campaigns: LabelledCampaign[], diagnose: Diagnoser): BacktestReport {
  const scored: Scored[] = campaigns.map((c) => ({
    fault: c.fault,
    diagnosis: diagnose({
      days: c.days,
      card: c.card,
      events: c.events,
      reference: { kind: 'benchmark', table: benchmarks },
    }),
  }));

  return score(scored);
}

/**
 * A diagnoser that always answers "healthy". It is the floor every real result
 * has to beat, and it belongs on the slide beside them: the cohort is one
 * quarter healthy, so saying "nothing is wrong" every time scores 25% top-1 at
 * a 0% false-alarm rate. Any real diagnoser below that is worse than silence.
 */
export const alwaysHealthy: Diagnoser = () => ({
  primary: null,
  secondary: [],
  suspectedCause: 'none',
});
