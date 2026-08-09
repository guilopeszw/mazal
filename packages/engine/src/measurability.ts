// ─── packages/engine/src/measurability.ts ────────────────────────────────
// What Mazal will be able to see at a given budget, before a real spent.
//
// This is a different question from `predict`. `predict` asks whether the
// campaign will be profitable; this asks whether we will be able to *tell*. A
// seller on R$50 a day gets about fourteen add-to-carts a week against a
// minimum of thirty, so the stage that judges checkout and delivery — the one
// lever that separates better sellers from worse — can never speak.
//
// Saying so up front is unusual and it is the honest thing. It also explains a
// real case rather than a hypothetical: the first demo fixture we committed was
// a small campaign whose checkout stage was silenced exactly this way, and it
// took a frontend being built against it to notice.

import type { BenchmarkTable, FunnelStage, ProductCard } from '@mazal/contracts';
import { MEASURED_STAGES, WINDOW_DAYS } from './index.ts';

export type StageReach = {
  stage: FunnelStage;
  metric: string;
  /** Sample the stage needs before it may be judged. */
  minSample: number;
  /** Days of spend to accumulate it. Null when it never arrives at any horizon. */
  daysToSpeak: number | null;
};

export type Measurability = {
  dailyBudget: number;
  stages: StageReach[];
  /**
   * Stages that cannot reach their minimum inside the window `diagnose` looks
   * at. Not "slow to answer" — silent. The window is fixed, so a stage needing
   * twenty days of accumulation is never judged, however long the campaign runs.
   */
  silent: FunnelStage[];
};

/**
 * Expected daily counts from the category priors. These are the same medians
 * `predict` uses, so the two answers cannot disagree about the same campaign.
 */
export function measurability(card: ProductCard, dailyBudget: number, table: BenchmarkTable): Measurability {
  const m = table[card.category].metrics;

  const impressions = m.cpm.median <= 0 ? 0 : (dailyBudget / m.cpm.median) * 1000;
  const clicks = impressions * m.ctr.median;
  const perDay: Record<string, number> = {
    impressions,
    clicks,
    addToCarts: clicks * m.atcRate.median,
    purchases: clicks * m.cvr.median,
  };

  const stages = MEASURED_STAGES.map((spec): StageReach => {
    const rate = perDay[spec.sampleName] ?? 0;
    return {
      stage: spec.stage,
      metric: spec.metric,
      minSample: spec.minSample,
      daysToSpeak: rate <= 0 ? null : Math.ceil(spec.minSample / rate),
    };
  });

  return {
    dailyBudget,
    stages,
    silent: stages
      .filter((s) => s.daysToSpeak === null || s.daysToSpeak > WINDOW_DAYS)
      .map((s) => s.stage),
  };
}
