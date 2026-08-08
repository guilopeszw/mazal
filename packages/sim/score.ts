// ─── packages/sim/score.ts ───────────────────────────────────────────────
// Turns (label, diagnosis) pairs into a BacktestReport.
//
// This file deliberately does not import @mazal/engine. Scoring is a pure
// function of what came back, so it can be written, typechecked and argued
// about before `diagnose` exists — and when it does, the only new code is the
// handful of lines in backtest.ts that call it. Keeping the split also keeps
// the firewall obvious: nothing here can reach into how the answer was made.

import type { BacktestReport, Diagnosis, FaultKind, FunnelStage, LabelledCampaign } from '@mazal/contracts';
import { FAULT_KINDS } from './faults.ts';

/**
 * Which funnel stages each fault deforms — the "Deforms" column of B-data.md's
 * fault table, and B's own knowledge rather than anything read out of the engine.
 *
 * Stages 0–2 are the media problem and 3–6 are product, offer and experience,
 * which is the split the whole product rests on.
 */
export const FAULT_STAGES: Record<FaultKind, readonly FunnelStage[]> = {
  none: [],
  stockout: [3],
  eta_shock: [4],
  creative_fatigue: [0, 1],
  price_too_high: [3, 6],
  checkout_friction: [5],
  pixel_break: [0, 1, 2, 3, 4, 5, 6],
  budget_cap: [0],
  thin_pdp: [3],
};

export type Scored = { fault: LabelledCampaign['fault']; diagnosis: Diagnosis };

const emptyConfusion = (): Record<FaultKind, Record<FaultKind, number>> =>
  Object.fromEntries(
    FAULT_KINDS.map((actual) => [actual, Object.fromEntries(FAULT_KINDS.map((p) => [p, 0]))]),
  ) as Record<FaultKind, Record<FaultKind, number>>;

/**
 * `top2` is an approximation and the slide has to say so.
 *
 * B-data.md asks for "correct within the primary or the strongest secondary
 * finding's implied cause", but `Diagnosis` carries one `suspectedCause` for the
 * whole diagnosis and a `Finding` carries a `causeLayer`, not a `FaultKind` —
 * so no finding has an implied cause to read. Reading it out of the engine is
 * what the firewall forbids.
 *
 * What is computable, and is the honest version of the same question: did the
 * engine name the right *stage*, even when it named the wrong cause? A stockout
 * called a thin PDP is a near miss — both break stage 3 and the seller is sent
 * to the right part of the funnel. A stockout called a budget cap is not.
 *
 * The exact metric needs an optional `impliedCause?: FaultKind` on `Finding`.
 * That is a contract change, so it is C's call and an announcement.
 */
export function scoreOne(actual: FaultKind, d: Diagnosis): { top1: boolean; top2: boolean } {
  const top1 = d.suspectedCause === actual;
  if (top1) return { top1, top2: true };

  const stages = FAULT_STAGES[actual];
  const named = [d.primary, ...d.secondary].filter((f) => f !== null);
  return { top1, top2: stages.length > 0 && named.some((f) => stages.includes(f.stage)) };
}

export function score(results: Scored[]): BacktestReport {
  const confusion = emptyConfusion();
  let top1 = 0;
  let top2 = 0;
  let noneTotal = 0;
  let falseAlarms = 0;

  for (const { fault, diagnosis } of results) {
    const actual = fault.kind;
    confusion[actual][diagnosis.suspectedCause] += 1;

    const s = scoreOne(actual, diagnosis);
    if (s.top1) top1 += 1;
    if (s.top2) top2 += 1;

    if (actual === 'none') {
      noneTotal += 1;
      // A false alarm is any primary finding on a healthy campaign. Not
      // "the wrong cause" — a seller who is told to fix nothing is not
      // wrong, and one who is sent to fix a working funnel uninstalls.
      if (diagnosis.primary !== null) falseAlarms += 1;
    }
  }

  const n = results.length;
  return {
    top1: n === 0 ? 0 : top1 / n,
    top2: n === 0 ? 0 : top2 / n,
    falseAlarmRate: noneTotal === 0 ? 0 : falseAlarms / noneTotal,
    confusion,
    n,
  };
}

/** Per-class recall from a report: how often each injected fault was named correctly. */
export function perClassRecall(report: BacktestReport): { fault: FaultKind; n: number; correct: number }[] {
  return FAULT_KINDS.map((fault) => {
    const row = report.confusion[fault];
    return {
      fault,
      n: FAULT_KINDS.reduce((sum, p) => sum + row[p], 0),
      correct: row[fault],
    };
  });
}

/** The confusion matrix as fixed-width text, for the deck. */
export function formatConfusion(report: BacktestReport): string {
  const w = Math.max(...FAULT_KINDS.map((k) => k.length));
  const head = ''.padEnd(w) + FAULT_KINDS.map((k) => k.slice(0, 6).padStart(7)).join('');
  const rows = FAULT_KINDS.map((actual) =>
    actual.padEnd(w) + FAULT_KINDS.map((p) => String(report.confusion[actual][p]).padStart(7)).join(''),
  );
  return [head, ...rows].join('\n');
}
