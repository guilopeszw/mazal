// ─── packages/sim/run-backtest.ts ────────────────────────────────────────
// Runnable: pnpm sim:backtest
//
// Runs the fixed 400-campaign cohort through a diagnoser and prints the three
// numbers slide 6 shows, plus the confusion matrix.
//
// Today it runs against the always-healthy floor, because packages/engine does
// not exist. That is not a placeholder result — it is the baseline every real
// number has to beat, and running it now proves the cohort, the diagnosis loop
// and the scoring are wired correctly at full scale rather than at the five
// hand-made cases in eyeball.ts.

import { diagnose } from '@mazal/engine';
import { runBacktestWith } from './backtest.ts';
import { generateCohort, splitCohort } from './cohort.ts';
import { formatConfusion } from './score.ts';

const diagnoser = diagnose;

const { train, held } = splitCohort(generateCohort());
const report = runBacktestWith(held, diagnoser);
const noneHeld = held.filter((c) => c.fault.kind === 'none').length;

console.log('diagnoser: @mazal/engine');
console.log('  ⚠ The engine and the simulator were written by the same person. The A/B');
console.log('    firewall did not hold, so this is a wiring and sanity number, not an');
console.log('    accuracy claim. Floor to beat: 25.0% top-1 at 0% false alarms.\n');

console.log(`held-out n       ${report.n}`);
console.log(`top-1            ${(report.top1 * 100).toFixed(1)}%`);
console.log(`top-2            ${(report.top2 * 100).toFixed(1)}%   (stage-level — see score.ts)`);
console.log(`false alarm rate ${(report.falseAlarmRate * 100).toFixed(1)}%   on ${noneHeld} healthy campaigns`);

console.log('\nconfusion — TRAINING half only, safe to show A');
console.log(formatConfusion(runBacktestWith(train, diagnoser)));

console.log('\nrows are the injected fault, columns the suspected cause.');
console.log('A never sees a per-class breakdown of the held-out half — docs/plan/B-data.md.');
