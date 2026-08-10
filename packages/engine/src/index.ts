// ─── packages/engine/src/index.ts ────────────────────────────────────────
// The deterministic core. Nothing here calls an LLM and nothing here computes a
// rate by hand — every rate comes from @mazal/contracts/metrics, because a local
// `clicks / impressions` is how the second definition of CTR gets born.
//
// Firewall: this package never reads packages/sim. See docs/plan/A-engine.md.

export { measurability, type Measurability, type StageReach } from './measurability.ts';
export { buildPlan } from './plan.ts';
export { profileCard } from './profile.ts';
export { predict } from './predict.ts';
export {
  allocate,
  fitCurve,
  marginalRevenue,
  priorCurve,
  reallocate,
  valueAt,
  type Adset,
  type AllocateOptions,
  type Allocation,
  type FundedAdset,
  type Move,
  type Reallocation,
} from './allocate.ts';

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
  /** Which count the minimum is counted in. Named so `measurability` can project it forward. */
  sampleName: 'impressions' | 'clicks' | 'addToCarts' | 'purchases';
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
export const MEASURED_STAGES: StageSpec[] = [
  { stage: 0, metric: 'cpm', causeLayer: 'media', minSample: 1000, observe: cpm, sample: (d) => d.impressions, sampleName: 'impressions' },
  { stage: 1, metric: 'ctr', causeLayer: 'media', minSample: 1000, observe: ctr, sample: (d) => d.impressions, sampleName: 'impressions' },
  { stage: 3, metric: 'atcRate', causeLayer: 'product', minSample: 100, observe: atcRate, sample: (d) => d.clicks, sampleName: 'clicks' },
  { stage: 4, metric: 'icRate', causeLayer: 'experience', minSample: 30, observe: icRate, sample: (d) => d.addToCarts, sampleName: 'addToCarts' },
  { stage: 5, metric: 'cvr', causeLayer: 'experience', minSample: 100, observe: cvr, sample: (d) => d.clicks, sampleName: 'clicks' },
  { stage: 6, metric: 'aov', causeLayer: 'offer', minSample: 5, observe: aov, sample: (d) => d.purchases, sampleName: 'purchases' },
];

/**
 * cpm and cpa are costs: high is bad, so the deviation that matters is positive.
 * Every other metric here is a rate where low is bad. Getting this backwards
 * would flag the cheapest media in the account as the problem.
 */
const HIGH_IS_BAD = new Set(['cpm', 'cpc', 'cpa', 'costPerAtc']);

/**
 * Only the three quantiles are needed to score a deviation, which is what lets
 * both reference modes share one code path: the benchmark arm passes a
 * Distribution straight out of @mazal/data, and the self arm builds the same
 * three numbers out of the campaign's own trailing history.
 */
export type Quantiles = Pick<Distribution, 'median' | 'p25' | 'p75'>;

/**
 * Robust sigma from the interquartile range — p75 and p25 of a normal sit 1.349σ
 * apart — floored at a tenth of the median.
 *
 * The floor is not cosmetic. A campaign whose baseline barely moved has an IQR
 * of nearly zero, and dividing by that gives either infinity or, as it did here,
 * a guarded zero that silently flags nothing: self mode returned "healthy" for a
 * campaign whose add-to-carts had fallen by two thirds. No real metric has zero
 * variance, so a zero IQR means too few distinct values rather than a campaign
 * that cannot change.
 */
export function spread(reference: Quantiles): number {
  return Math.max((reference.p75 - reference.p25) / 1.349, Math.abs(reference.median) * 0.1);
}

export function deviation(observed: number, reference: Quantiles): number {
  const s = spread(reference);
  return s === 0 ? 0 : (observed - reference.median) / s;
}

/** A stage is flagged when it is more than one robust sigma below its reference. */
const FLAG_AT = -1.0;

/**
 * Days of history the diagnosis actually looks at.
 *
 * A campaign that broke on day fifteen is broken *now*, but its thirty-day mean
 * is half healthy and sits comfortably inside the benchmark — a stockout reads
 * -0.16 sigma over thirty days and -1.41 over the last seven. Averaging the
 * break away is how a monitoring product tells a seller nothing is wrong while
 * their add-to-carts sit at zero.
 *
 * Seven days rather than three or fourteen: it covers a full week, so weekday
 * and weekend traffic are both in the window and neither distorts the rate.
 */
export const WINDOW_DAYS = 7;

/**
 * Self mode compares a shorter window, because it has a baseline to compare
 * against and does not need seven days to beat down category noise. The brief
 * names three.
 */
export const SELF_WINDOW_DAYS = 3;

/**
 * Self mode needs a week of baseline before it will compare anything. Under
 * that there is no trustworthy shape, and a "deviation" measured off three days
 * is noise wearing a sigma. Exported because a renderer has to be able to tell
 * "nothing broke" apart from "nothing could be judged" — they look identical in
 * a `Diagnosis` (`primary: null`) and mean opposite things on a seller's screen.
 */
export const SELF_MIN_BASELINE_DAYS = 7;

/** Linear-interpolated quantile on a sorted array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

/**
 * The campaign's own trailing baseline, as the same three numbers a benchmark
 * row carries. Daily values, not one aggregate — the spread of a campaign
 * against itself *is* its day-to-day variance, and without it there is nothing
 * to divide a deviation by.
 */
function selfReference(baseline: CampaignDay[], observe: (d: CampaignDay) => number): Quantiles | null {
  if (baseline.length < SELF_MIN_BASELINE_DAYS) return null;

  const values = baseline.map(observe).filter(Number.isFinite).sort((a, b) => a - b);
  return { median: quantile(values, 0.5), p25: quantile(values, 0.25), p75: quantile(values, 0.75) };
}

/**
 * Which events can explain which stage. An event is evidence only when it lands
 * on the stage that broke — a creative refresh three weeks before an add-to-cart
 * collapse explains nothing, and attaching it would be the engine inventing a
 * story out of a coincidence.
 */
const STAGE_EVENTS: Partial<Record<FunnelStage, readonly StoreEvent['type'][]>> = {
  0: ['budget_change'],
  1: ['creative_refresh'],
  3: ['stockout', 'price_change'],
  4: ['eta_change'],
  5: ['pixel_error', 'policy_flag'],
};

const daysApart = (a: string, b: string): number =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

export function diagnose(input: DiagnoseInput): Diagnosis {
  const ref = input.reference;
  const self = ref.kind === 'self';
  const windowDays = self ? SELF_WINDOW_DAYS : WINDOW_DAYS;
  // Sample minimums are checked against this window too, so a short window
  // silences a stage rather than letting it speak on thin data.
  const total = aggregate(input.days.slice(-windowDays));
  const table = input.reference.kind === 'benchmark' ? input.reference.table : null;
  // The baseline never overlaps the window it is compared against: a break that
  // is inside its own reference cannot deviate from it.
  const baseline = ref.kind === 'self'
    ? input.days.slice(0, Math.min(ref.baselineDays, Math.max(input.days.length - windowDays, 0)))
    : [];
  const flagged: Finding[] = [];

  for (const spec of MEASURED_STAGES) {
    if (spec.sample(total) < spec.minSample) continue;

    const reference = self
      ? selfReference(baseline, spec.observe)
      : table?.[input.card.category]?.metrics[spec.metric as 'atcRate'];
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

  const [first = null, ...rest] = flagged;
  const changePoint = first ? findChangePoint(input, first, windowDays, self, baseline, table) : undefined;

  // The event log is what turns "ATC collapsed" into "ATC collapsed the day your
  // supplier ETA moved from 9 days to 22". That sentence is the demo.
  const evidence = first && changePoint
    ? input.events.find((e) =>
        (STAGE_EVENTS[first.stage] ?? []).includes(e.type) && daysApart(e.date, changePoint.date) <= 1)
    : undefined;

  const primary = first && evidence ? { ...first, evidence } : first;

  return {
    primary,
    secondary: rest.map((f) => ({ ...f, severity: 'secondary' as const })),
    suspectedCause: attribute(primary, flagged, input),
    ...(changePoint ? { changePoint } : {}),
  };
}

/**
 * The first date a rolling window crossed the threshold. Scanned forward, so it
 * reports when the metric turned rather than when someone noticed — that date is
 * what an event has to line up with before it counts as an explanation.
 */
function findChangePoint(
  input: DiagnoseInput,
  finding: Finding,
  _windowDays: number,
  self: boolean,
  baseline: CampaignDay[],
  table: ReturnType<typeof benchmarkTable>,
): { date: string; metric: string } | undefined {
  const spec = MEASURED_STAGES.find((s) => s.metric === finding.metric);
  if (!spec) return undefined;

  const reference = self
    ? selfReference(baseline, spec.observe)
    : table?.[input.card.category]?.metrics[spec.metric as 'atcRate'];
  if (!reference) return undefined;

  // Three days, in both modes and whatever window the flag itself used. The
  // question here is different: not "is it broken now" but "which day did it
  // turn", and a seven-day window answers that five days late — late enough that
  // the event which explains it no longer lines up.
  const span = SELF_WINDOW_DAYS;

  /**
   * The minimum scales with the window it is judged over. A stage is flagged on
   * seven days and its change point scanned over three, so an unscaled minimum
   * meant a campaign that cleared the bar comfortably enough to be flagged could
   * never clear it on the scan — it was told it was broken and never told when.
   */
  const minForSpan = Math.ceil((spec.minSample * span) / WINDOW_DAYS);

  for (let end = Math.max(span, baseline.length); end <= input.days.length; end++) {
    const window = aggregate(input.days.slice(end - span, end));
    if (spec.sample(window) < minForSpan) continue;

    const raw = deviation(spec.observe(window), reference);
    const dev = HIGH_IS_BAD.has(spec.metric) ? -raw : raw;
    if (dev < FLAG_AT) {
      // The first day of the window that crossed, not the last. A trailing
      // window cannot cross until it has filled with broken days, so reporting
      // its end dates the break two days after it happened — and the event that
      // explains it, which has to land within a day, never lines up again.
      const date = input.days[end - span]?.date;
      if (date) return { date, metric: spec.metric };
    }
  }
  return undefined;
}

const benchmarkTable = (input: DiagnoseInput) =>
  input.reference.kind === 'benchmark' ? input.reference.table : null;

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
    const t = aggregate(input.days.slice(-WINDOW_DAYS));
    return t.reach === 0 ? 0 : t.impressions / t.reach;
  })();

  /**
   * Precedence: an explicit event beats card evidence, and card evidence beats
   * pattern inference. A pixel break and a thin product page look identical in
   * the numbers — both take add-to-carts down and purchases with them — so the
   * pattern rule below cannot be allowed to answer first. It used to, and it
   * claimed every stage-3 break severe enough to zero out purchases.
   */
  if (has(input, 'pixel_error')) return 'pixel_break';

  const broken = new Set(flagged.map((f) => f.stage));

  if (primary.stage === 3) {
    if (has(input, 'stockout') || input.card.stockOnHand === 0) return 'stockout';
    if (has(input, 'price_change') || (row && input.card.price > row.price.p75)) return 'price_too_high';

    /**
     * `thin_pdp` now has to be earned. It was the fallback for any unexplained
     * stage-3 break, so a seller with eight photos and nine hundred characters
     * was told their page was thin and sent to rewrite a page that was fine.
     *
     * Olist barely separates good sellers from bad on either field — 1.79 photos
     * against 1.93 — so the evidence for this fault is thin in its own right.
     * Requiring the card to actually be below the category's lower quartile is
     * the least we can do before naming it.
     */
    const thinPhotos = row ? input.card.pdpImages <= row.photos.p25 : false;
    const thinCopy = row ? input.card.pdpDescriptionLength <= row.descriptionLength.p25 : false;
    if (thinPhotos || thinCopy) return 'thin_pdp';
  }

  /**
   * "Everything down uniformly, sudden" — the last row of the brief's signature
   * table, and now the fallback rather than the first answer. Stage 4 cannot be
   * part of the test: when add-to-carts collapse there are fewer than thirty
   * left to judge checkouts on, so the stage silences itself and requiring it
   * would mean the rule never fires. Stage 2 is out for the usual reason.
   */
  const mediaHealthy = !broken.has(0) && !broken.has(1);
  const explained = ['stockout', 'eta_change', 'price_change', 'budget_change'] as const;

  /**
   * "Near zero" means near zero, so it is measured against the reference itself
   * rather than in sigmas. A sigma threshold reads differently for every metric
   * — atcRate's benchmark spread is wide enough that a stage at a twentieth of
   * its reference is only 1.4 sigma down — and a mild dip on a page the card
   * says is fine is not a tracking break. Calling it one sends a seller to check
   * a pixel that was never broken.
   */
  const NEAR_ZERO = 0.15;
  const collapsed = (stage: FunnelStage) =>
    flagged.some((f) => f.stage === stage && f.observed <= f.reference * NEAR_ZERO);

  if (mediaHealthy && collapsed(3) && collapsed(5) && !explained.some((t) => has(input, t))) {
    return 'pixel_break';
  }

  switch (primary.stage) {
    case 0:
      return has(input, 'budget_change') ? 'budget_cap' : frequency > 4 ? 'creative_fatigue' : 'budget_cap';
    case 1:
      return 'creative_fatigue';
    case 3:
      // Card evidence was checked above and did not explain it. Saying so is a
      // better answer than naming a cause the card contradicts.
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
