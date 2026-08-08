// ─── packages/engine/src/index.ts ────────────────────────────────────────
// The deterministic core. Nothing here calls an LLM and nothing here computes a
// rate by hand — every rate comes from @mazal/contracts/metrics, because a local
// `clicks / impressions` is how the second definition of CTR gets born.
//
// Firewall: this package never reads packages/sim. See docs/plan/A-engine.md.

import type {
  CampaignDay, CauseLayer, Diagnosis, DiagnoseInput, Distribution,
  Finding, FunnelStage,
} from '@mazal/contracts';
import { aggregate, atcRate } from '@mazal/contracts/metrics';

/**
 * Every metric belongs to exactly one stage, and the stages are ordered. The
 * first stage that deviates is the cause; everything after it is a symptom.
 * That rule is the whole engine — it is why Mazal never says "your ROAS is low",
 * a sentence with no information in it.
 */
type StageSpec = {
  stage: FunnelStage;
  metric: string;
  causeLayer: CauseLayer;
  /** Below this, the stage is not flagged at all. Not flagged with low confidence — not flagged. */
  minSample: number;
  observe: (d: CampaignDay) => number;
  sample: (d: CampaignDay) => number;
};

const STAGES: StageSpec[] = [
  {
    stage: 3,
    metric: 'atcRate',
    causeLayer: 'product',
    minSample: 100,
    observe: atcRate,
    sample: (d) => d.clicks,
  },
];

/** Robust sigma from the interquartile range — p75 and p25 of a normal sit 1.349σ apart. */
export function spread(reference: Distribution): number {
  return (reference.p75 - reference.p25) / 1.349;
}

export function deviation(observed: number, reference: Distribution): number {
  const s = spread(reference);
  return s === 0 ? 0 : (observed - reference.median) / s;
}

/** A stage is flagged when it is more than one robust sigma below its reference. */
const FLAG_AT = -1.0;

export function diagnose(input: DiagnoseInput): Diagnosis {
  const total = aggregate(input.days);
  const table = input.reference.kind === 'benchmark' ? input.reference.table : null;
  const flagged: Finding[] = [];

  for (const spec of STAGES) {
    if (spec.sample(total) < spec.minSample) continue;

    const reference = table?.[input.card.category]?.metrics[spec.metric as 'atcRate'];
    if (!reference) continue;

    const observed = spec.observe(total);
    const dev = deviation(observed, reference);
    if (dev >= FLAG_AT) continue;

    flagged.push({
      stage: spec.stage,
      severity: 'primary',
      metric: spec.metric,
      observed,
      reference: reference.median,
      spread: spread(reference),
      deviation: dev,
      sampleSize: spec.sample(total),
      rule: `stage${spec.stage}.${spec.metric}_below_benchmark`,
      causeLayer: spec.causeLayer,
    });
  }

  const [primary = null, ...secondary] = flagged;
  return {
    primary,
    secondary: secondary.map((f) => ({ ...f, severity: 'secondary' as const })),
    suspectedCause: primary?.stage === 3 ? 'thin_pdp' : 'none',
  };
}
