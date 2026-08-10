// ─── apps/mcp/src/ui/view-data.ts ─────────────────────────────────────────
// Pure view-models for the two MCP App views. This is the Deco Studio twin of
// `apps/web/lib/answers.ts`: it formats what the engine and the contract
// already computed and never derives a value. Every rate comes from
// `@mazal/contracts/metrics`, every judgment from a `Diagnosis` or `Verdict`,
// and every silence threshold from the engine's own `MEASURED_STAGES`.
//
// The voice is the product owner's language rule: the sellers are not
// economists. No label says p10, sigma, median, or a metric code — the
// decision leads, the number is the evidence, and translating a label is
// allowed while changing a value never is.

import type { CampaignDay, Diagnosis, FunnelStage, ReferenceMode, Verdict } from '@mazal/contracts';
import { aggregate, atcRate, cpm, ctr, cvr, icRate, roas } from '@mazal/contracts/metrics';
import {
  MEASURED_STAGES,
  SELF_MIN_BASELINE_DAYS,
  SELF_WINDOW_DAYS,
  WINDOW_DAYS,
} from '@mazal/engine';

// ─── formatting — locale `en` to match the web sheet, money stays BRL ─────

const pct = new Intl.NumberFormat('en', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const brl = new Intl.NumberFormat('en', { style: 'currency', currency: 'BRL' });
/** Money a seller reads: whole reais. Cents on a CPM read as false precision. */
const brlWhole = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat('en');

export const formatCount = (value: number): string => int.format(value);

/** UTC on purpose — see apps/web/lib/format.ts: local time shifts the date. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * One plain sentence fragment per metric — what the rate *is*, not its code.
 * "1.0% of clicks add to cart", never "ATC 1.0%". The value is the contract's;
 * only the label is translated.
 */
const METRIC_PHRASE: Record<string, (value: number) => string> = {
  cpm: (v) => `${brlWhole.format(v)} per 1,000 views`,
  ctr: (v) => `${pct.format(v)} of views click`,
  atcRate: (v) => `${pct.format(v)} of clicks add to cart`,
  icRate: (v) => `${pct.format(v)} of carts start checkout`,
  cvr: (v) => `${pct.format(v)} of clicks buy`,
  aov: (v) => `${brlWhole.format(v)} per sale`,
  roas: (v) => `each R$1 back as ${brl.format(v)}`,
};

const metricPhrase = (metric: string, value: number): string =>
  METRIC_PHRASE[metric]?.(value) ?? int.format(value);

/** What `Finding.sampleSize` counts, in the seller's words. */
const SAMPLE_NOUN: Record<string, string> = {
  cpm: 'views',
  ctr: 'views',
  atcRate: 'clicks',
  icRate: 'add-to-carts',
  cvr: 'clicks',
  aov: 'sales',
};

/** Store events, plainly — the seller should not read `eta_change`. */
const EVENT_LABELS: Record<string, string> = {
  stockout: 'stock-out',
  price_change: 'price change',
  eta_change: 'delivery-estimate change',
  creative_refresh: 'creative refresh',
  budget_change: 'budget change',
  pixel_error: 'pixel error',
  policy_flag: 'policy flag',
};

// ─── the funnel, mirrored from apps/web/lib/funnel.ts ─────────────────────

const FUNNEL_STAGES: ReadonlyArray<{
  stage: FunnelStage;
  label: string;
  unassessed?: string;
}> = [
  { stage: 0, label: 'Delivery' },
  { stage: 1, label: 'Attention' },
  {
    stage: 2,
    label: 'Landing',
    unassessed: 'no analytics',
  },
  { stage: 3, label: 'Product interest' },
  { stage: 4, label: 'Intent' },
  { stage: 5, label: 'Purchase' },
  { stage: 6, label: 'Economics' },
];

/** What each stage is called mid-sentence — "your checkout broke". */
const STAGE_NOUN: Record<FunnelStage, string> = {
  0: 'delivery',
  1: 'creative',
  2: 'landing page',
  3: 'product page',
  4: 'checkout',
  5: 'purchase step',
  6: 'unit economics',
};

/** Upstream of the leak is healthy, the leak is the leak, downstream is a symptom. */
function toneFor(stage: FunnelStage, leak: FunnelStage | null): 'ok' | 'leak' | 'after' {
  if (leak === null || stage < leak) return 'ok';
  if (stage === leak) return 'leak';
  return 'after';
}

/** The five contract counts, in funnel order — read, never computed. */
const FUNNEL_COUNTS: ReadonlyArray<{ stage: FunnelStage; of: (d: CampaignDay) => number }> = [
  { stage: 0, of: (d) => d.impressions },
  { stage: 1, of: (d) => d.clicks },
  { stage: 3, of: (d) => d.addToCarts },
  { stage: 4, of: (d) => d.checkoutsInitiated },
  { stage: 5, of: (d) => d.purchases },
];

/** One headline rate per stage, each a contract function. */
const STAGE_METRIC: Partial<Record<FunnelStage, { metric: string; of: (d: CampaignDay) => number }>> = {
  0: { metric: 'cpm', of: cpm },
  1: { metric: 'ctr', of: ctr },
  3: { metric: 'atcRate', of: atcRate },
  4: { metric: 'icRate', of: icRate },
  5: { metric: 'cvr', of: cvr },
  6: { metric: 'roas', of: roas },
};

export type FunnelSliceVM = {
  label: string;
  value: number;
  display: string;
  tone: 'ok' | 'leak' | 'after';
  /**
   * Bar width as a percentage — how much of the *previous* stage survived into
   * this one, so the first stage is always full.
   *
   * Not a share of the largest stage. A funnel spans orders of magnitude —
   * 91,837 impressions to 7 purchases on the demo campaign — so against the
   * maximum every bar below the first pins to the floor and the chart says
   * nothing. Step-to-step is also the quantity the funnel is *about*: the
   * stage that lost the most is the one that leaked.
   */
  width: number;
};

export type StageRowVM = {
  name: string;
  state: 'ok' | 'broken' | 'mute';
  value: string;
  tag?: string;
};

export type DiagnosisViewModel = {
  slices: FunnelSliceVM[];
  stages: StageRowVM[];
  /** The decision, in the seller's words, date included. */
  headline: string;
  /** The evidence behind it: observed, reference, sample. */
  detail?: string;
  evidence?: string;
};

/**
 * `reference` is the one the tool was called with. It decides two things the
 * view cannot get from a `Diagnosis`: which window `diagnose` measured over —
 * self mode uses a shorter one, and the sample minimums are checked against it
 * — and whether the engine had a baseline to judge against at all.
 *
 * Omitted means benchmark, which is what both home tiles send.
 */
export function diagnosisViewModel(
  days: CampaignDay[],
  diagnosis: Diagnosis,
  reference?: ReferenceMode,
): DiagnosisViewModel {
  const self = reference?.kind === 'self';
  const window = aggregate(days.slice(-(self ? SELF_WINDOW_DAYS : WINDOW_DAYS)));
  // The engine's own baseline slice: history before the window it is compared
  // against, capped at what the caller asked for. Under a week of it,
  // `selfReference` returns null for every stage and nothing is judged.
  const judged =
    !self ||
    Math.min(
      (reference as { baselineDays: number }).baselineDays,
      Math.max(days.length - SELF_WINDOW_DAYS, 0),
    ) >= SELF_MIN_BASELINE_DAYS;
  const leak = diagnosis.primary?.stage ?? null;

  const slices = FUNNEL_COUNTS.map(({ stage, of }, index, all): FunnelSliceVM => {
    const value = of(window);
    const previous = index === 0 ? value : all[index - 1]!.of(window);
    return {
      label: FUNNEL_STAGES.find((s) => s.stage === stage)!.label,
      value,
      display: formatCount(value),
      tone: toneFor(stage, leak),
      // A visible sliver rather than nothing when a stage keeps almost none of
      // the one above: zero survivors is a fact worth seeing, not a blank row.
      width: previous > 0 ? Math.max(2, (value / previous) * 100) : 2,
    };
  });

  const stages = FUNNEL_STAGES.map(({ stage, label, unassessed }): StageRowVM => {
    const name = `${stage} · ${label}`;
    if (unassessed) return { name, state: 'mute', value: unassessed, tag: 'skipped' };

    const tone = toneFor(stage, leak);
    if (tone === 'leak') {
      const p = diagnosis.primary!;
      return {
        name,
        state: 'broken',
        value: metricPhrase(p.metric, p.observed),
        tag: 'leak',
      };
    }
    if (tone === 'after') return { name, state: 'mute', value: 'symptom' };

    // No baseline, no judgment. `selfReference` returned null for every stage,
    // so the engine compared nothing — printing a value here would turn silence
    // into health, which is the one thing this view must never do.
    if (!judged) {
      return {
        name,
        state: 'mute',
        value: `no history to compare against yet — needs ${SELF_MIN_BASELINE_DAYS} days before the window`,
      };
    }

    // Below the engine's own minimum sample the stage was never judged, and a
    // printed value would read as a verdict. The threshold is the engine's, not
    // ours — `diagnose` skips the stage on exactly this comparison.
    const spec = MEASURED_STAGES.find((s) => s.stage === stage);
    if (spec && spec.sample(window) < spec.minSample) {
      const noun = SAMPLE_NOUN[spec.metric] ?? spec.sampleName;
      return {
        name,
        state: 'mute',
        value: `too few ${noun} to judge — needs ${formatCount(spec.minSample)}`,
      };
    }

    const entry = STAGE_METRIC[stage];
    return {
      name,
      state: 'ok',
      value: entry ? metricPhrase(entry.metric, entry.of(window)) : '—',
    };
  });

  const p = diagnosis.primary;
  const headline = p
    ? `Your ${STAGE_NOUN[p.stage]} broke${
        diagnosis.changePoint ? ` on ${formatDate(diagnosis.changePoint.date)}` : ''
      }.`
    : judged
      ? 'No stage broke — and that is a real answer.'
      : 'Not enough history to judge this yet.';
  const detail = p
    ? `Yours: ${metricPhrase(p.metric, p.observed)}. Stores like yours: ${metricPhrase(
        p.metric,
        p.reference,
      )}. Measured on ${formatCount(p.sampleSize)} ${SAMPLE_NOUN[p.metric] ?? 'samples'}.`
    : undefined;

  return {
    slices,
    stages,
    headline,
    ...(detail ? { detail } : {}),
    ...(p?.evidence
      ? {
          evidence: `${EVENT_LABELS[p.evidence.type] ?? p.evidence.type} on ${formatDate(
            p.evidence.date,
          )}`,
        }
      : {}),
  };
}

// ─── the prediction band ──────────────────────────────────────────────────

/**
 * The engine writes its verdict prose for the audited sheet; the tile speaks
 * the seller's language. Known engine tokens are translated — factor names to
 * what they mean, the statistics vocabulary to plain words, a bare ROAS to
 * reais back per real spent. Values pass through untouched: `predict.ts` emits
 * three sentence shapes and every one keeps its numbers.
 */
export function plainProse(text: string): string {
  return (
    text
      .replace(/Stop if ROAS is below (\d+(?:\.\d+)?)/, (_, v: string) =>
        `Stop if each R$1 spent is bringing back less than ${brl.format(Number(v))}`)
      // Case-insensitive on every factor: `killTrigger` capitalises the factor
      // at sentence start (predict.ts), so `AtcRate` and `IcRate` reach here
      // capitalised and a case-sensitive match leaves them on the seller's screen.
      .replace(/\bctr\b/gi, 'the share of views that click')
      .replace(/\batcRate\b/gi, 'the share of clicks that add to cart')
      .replace(/\bicRate\b/gi, 'the share of carts that start checkout')
      .replace(/\bcvr\b/gi, 'the share of clicks that turn into sales')
      .replace(/\baov\b/gi, 'what each sale is worth')
      .replace(/the band is category-wide/g, 'the estimate is as wide as the category')
      .replace(/holding this band down/g, 'holding this estimate down')
      .replace(/\bthe band\b/g, 'the estimate')
      // Absorb the article: "of the category median" → "of what is typical for
      // the category". Replacing the noun alone left "of the what is typical".
      .replace(/the category median/g, 'what is typical for the category')
      .replace(/the widest factor here/g, 'the number that varies most here')
      // Grammar seam: a replacement lands where the engine had a capitalised
      // factor at sentence start, so re-capitalise whichever phrase landed there.
      .replace(
        /(^|\. )(the share|what each sale is worth)/g,
        (_, lead: string, phrase: string) => `${lead}${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`,
      )
  );
}

export type BandViewModel = {
  decision: Verdict['decision'];
  /** worst case / most likely / best case, as reais back per R$1 spent. */
  ends: [string, string, string];
  /** Percent positions along the track — positioning, same move as the web sheet. */
  fill: { left: number; width: number };
  mid: number;
  breakEven: number;
  /** Reais back per R$1 at which the campaign covers its own cost. */
  breakEvenLabel: string;
  limitingFactor?: string;
  killTrigger?: string;
};

/** First letter up. The engine writes these to sit mid-sentence. */
const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export function bandViewModel(verdict: Verdict): BandViewModel {
  const { p10, p50, p90 } = verdict.predictedRoas;
  const breakEven = verdict.breakEvenRoas;
  const scale = Math.max(p90, breakEven) * 1.06 || 1;
  const at = (v: number) => Math.min(100, Math.max(0, (v / scale) * 100));

  // ROAS 2.38 and "R$2.38 back per R$1 spent" are the same number in the
  // seller's unit — a label translation, not arithmetic.
  return {
    decision: verdict.decision,
    ends: [
      `worst case ${brl.format(p10)}`,
      `most likely ${brl.format(p50)}`,
      `best case ${brl.format(p90)}`,
    ],
    fill: { left: at(p10), width: at(p90) - at(p10) },
    mid: at(p50),
    breakEven: at(breakEven),
    breakEvenLabel: brl.format(breakEven),
    // `killTrigger` already ends with the limiting factor — `predict` appends it
    // there deliberately, so a `launch_small` verdict carries the same sentence
    // twice. Rendering both printed it twice to the seller, back to back. The
    // standalone one is for the verdicts that have no kill trigger, and it gets
    // a capital because there it starts a sentence rather than finishing one.
    ...(verdict.limitingFactor && !verdict.killTrigger
      ? { limitingFactor: sentence(plainProse(verdict.limitingFactor)) }
      : {}),
    ...(verdict.killTrigger ? { killTrigger: plainProse(verdict.killTrigger) } : {}),
  };
}
