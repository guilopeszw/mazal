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

import { alwaysHealthy, runBacktestWith, type Diagnoser } from './backtest.ts';
import { generateCohort, splitCohort } from './cohort.ts';
import { formatConfusion } from './score.ts';

const DIAGNOSER: { name: string; fn: Diagnoser; real: boolean } = {
  name: 'always-healthy floor',
  fn: alwaysHealthy,
  real: false,
};

const { train, held } = splitCohort(generateCohort());

const report = runBacktestWith(held, DIAGNOSER.fn);
const noneHeld = held.filter((c) => c.fault.kind === 'none').length;

console.log(`diagnoser: ${DIAGNOSER.name}`);
if (!DIAGNOSER.real) {
  console.log('  ⚠ NOT A RESULT. packages/engine does not exist yet, so this is the floor');
  console.log('    a real diagnoser has to beat. Do not put this number on a slide.\n');
}

console.log(`held-out n       ${report.n}`);
console.log(`top-1            ${(report.top1 * 100).toFixed(1)}%`);
console.log(`top-2            ${(report.top2 * 100).toFixed(1)}%   (stage-level — see score.ts)`);
console.log(`false alarm rate ${(report.falseAlarmRate * 100).toFixed(1)}%   on ${noneHeld} healthy campaigns`);

console.log('\nconfusion — TRAINING half only, safe to show A');
console.log(formatConfusion(runBacktestWith(train, DIAGNOSER.fn)));

console.log('\nrows are the injected fault, columns the suspected cause.');
console.log('A never sees a per-class breakdown of the held-out half — docs/plan/B-data.md.');
