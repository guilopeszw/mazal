// ─── packages/engine/src/index.ts ────────────────────────────────────────
// The deterministic core. Nothing here calls an LLM and nothing here computes a
// rate by hand — every rate comes from @mazal/contracts/metrics, because a local
// `clicks / impressions` is how the second definition of CTR gets born.
//
// Firewall: this package never reads packages/sim. See docs/plan/A-engine.md.

import type {
  CampaignDay, CauseLayer, Diagnosis, DiagnoseInput, Distribution,
  FaultKind, Finding, FunnelStage, StoreEvent,
} from '@mazal/contracts';
import { aggregate, atcRate, aov, cpm, ctr, cvr, icRate, roas } from '@mazal/contracts/metrics';

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

/**
 * Stages 0-2 are a media problem; 3-6 are a product, offer or experience
 * problem. That dividing line is the product.
 *
 * Stage 2 is absent: it reads `bounceRate` and `sessions`, which are optional on
 * CampaignDay and absent unless the seller has analytics. The brief says to skip
 * the stage entirely rather than infer it, and inferring it is how a seller gets
 * told their landing page is broken on data nobody collected.
 */
const STAGES: StageSpec[] = [
  { stage: 0, metric: 'cpm', causeLayer: 'media', minSample: 1000, observe: cpm, sample: (d) => d.impressions },
  { stage: 1, metric: 'ctr', causeLayer: 'media', minSample: 1000, observe: ctr, sample: (d) => d.impressions },
  { stage: 3, metric: 'atcRate', causeLayer: 'product', minSample: 100, observe: atcRate, sample: (d) => d.clicks },
  { stage: 4, metric: 'icRate', causeLayer: 'experience', minSample: 30, observe: icRate, sample: (d) => d.addToCarts },
  { stage: 5, metric: 'cvr', causeLayer: 'experience', minSample: 100, observe: cvr, sample: (d) => d.clicks },
  { stage: 6, metric: 'aov', causeLayer: 'offer', minSample: 5, observe: aov, sample: (d) => d.purchases },
];

/**
 * cpm and cpa are costs: high is bad, so the deviation that matters is positive.
 * Every other metric here is a rate where low is bad. Getting this backwards
 * would flag the cheapest media in the account as the problem.
 */
const HIGH_IS_BAD = new Set(['cpm', 'cpc', 'cpa', 'costPerAtc']);

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
    const raw = deviation(observed, reference);
    const dev = HIGH_IS_BAD.has(spec.metric) ? -raw : raw;
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
      rule: `stage${spec.stage}.${spec.metric}_${HIGH_IS_BAD.has(spec.metric) ? 'above' : 'below'}_benchmark`,
      causeLayer: spec.causeLayer,
    });
  }

  const [primary = null, ...secondary] = flagged;
  return {
    primary,
    secondary: secondary.map((f) => ({ ...f, severity: 'secondary' as const })),
    suspectedCause: attribute(primary, flagged, input),
  };
}

const has = (input: DiagnoseInput, type: StoreEvent['type']): boolean =>
  input.events.some((e) => e.type === type);

/**
 * The cause-attribution table from docs/plan/A-engine.md. `suspectedCause` is
 * what the backtest scores, so it is always set — a diagnosis that declines to
 * name a cause is scored as a miss, not excused.
 *
 * The event log is what turns a broken stage into a named cause. Two faults break
 * stage 3 identically — a stockout and a thin product page both take ATC to zero
 * — and only the event log tells them apart.
 */
function attribute(primary: Finding | null, flagged: Finding[], input: DiagnoseInput): FaultKind {
  if (!primary) return 'none';

  const table = input.reference.kind === 'benchmark' ? input.reference.table : null;
  const row = table?.[input.card.category]?.metrics;
  const frequency = (() => {
    const t = aggregate(input.days);
    return t.reach === 0 ? 0 : t.impressions / t.reach;
  })();

  // Everything broke at once. A pixel that stopped reporting looks exactly like
  // this, and it is the most common real "my campaign died" cause — so it is
  // checked before anything that would have the seller rewrite their creative.
  if (flagged.length >= 4) return 'pixel_break';

  switch (primary.stage) {
    case 0:
      return has(input, 'budget_change') ? 'budget_cap' : frequency > 4 ? 'creative_fatigue' : 'budget_cap';
    case 1:
      return 'creative_fatigue';
    case 3:
      if (has(input, 'stockout') || input.card.stockOnHand === 0) return 'stockout';
      if (has(input, 'price_change') || (row && input.card.price > row.price.p75)) return 'price_too_high';
      return 'thin_pdp';
    case 4:
      if (has(input, 'eta_change') || (row && input.card.deliveryEtaDays > row.deliveryDays.p75)) return 'eta_shock';
      return 'checkout_friction';
    case 5:
      return 'checkout_friction';
    case 6:
      return 'price_too_high';
    default:
      return 'none';
  }
}
