// ─── apps/mcp/src/ui/view-data.ts ─────────────────────────────────────────
// Pure view-models for the two MCP App views. This is the Deco Studio twin of
// `apps/web/lib/answers.ts`: it formats what the engine and the contract
// already computed and never derives a value. Every rate comes from
// `@mazal/contracts/metrics`, every judgment from a `Diagnosis` or `Verdict`,
// and every silence threshold from the engine's own `MEASURED_STAGES`.

import type { CampaignDay, Diagnosis, FunnelStage, Verdict } from '@mazal/contracts';
import { aggregate, atcRate, cpm, ctr, cvr, icRate, roas } from '@mazal/contracts/metrics';
import { MEASURED_STAGES, WINDOW_DAYS } from '@mazal/engine';

// ─── formatting, mirrored from apps/web/lib/format.ts ─────────────────────
// Display only; locale `en`, money stays BRL. Duplicated rather than imported
// because `apps/web` is another owner's app — if the two drift, the web copy
// is the reference.

const pct = new Intl.NumberFormat('en', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const brl = new Intl.NumberFormat('en', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en');

const METRIC_SHAPE: Record<string, 'rate' | 'money' | 'ratio'> = {
  cpm: 'money',
  ctr: 'rate',
  atcRate: 'rate',
  icRate: 'rate',
  cvr: 'rate',
  aov: 'money',
  roas: 'ratio',
};

const METRIC_SHORT: Record<string, string> = {
  cpm: 'CPM',
  ctr: 'CTR',
  atcRate: 'ATC',
  icRate: 'IC',
  cvr: 'CVR',
  aov: 'AOV',
  roas: 'ROAS',
};

export function formatMetric(metric: string, value: number): string {
  const shape = METRIC_SHAPE[metric];
  if (shape === 'money') return brl.format(value);
  if (shape === 'rate') return pct.format(value);
  return num.format(value);
}

export const formatRoas = (value: number): string => `${num.format(value)}×`;
export const formatCount = (value: number): string => int.format(value);

const formatDeviation = (value: number): string =>
  `${new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
    .format(value)
    .replace('-', '−')}σ`;

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
  headline: string;
  changePoint?: string;
  evidence?: string;
};

export function diagnosisViewModel(days: CampaignDay[], diagnosis: Diagnosis): DiagnosisViewModel {
  const window = aggregate(days.slice(-WINDOW_DAYS));
  const leak = diagnosis.primary?.stage ?? null;

  const slices = FUNNEL_COUNTS.map(({ stage, of }) => ({
    label: FUNNEL_STAGES.find((s) => s.stage === stage)!.label,
    value: of(window),
    display: formatCount(of(window)),
    tone: toneFor(stage, leak),
  }));

  const stages = FUNNEL_STAGES.map(({ stage, label, unassessed }): StageRowVM => {
    const name = `${stage} · ${label}`;
    if (unassessed) return { name, state: 'mute', value: unassessed, tag: 'skipped' };

    const tone = toneFor(stage, leak);
    if (tone === 'leak') {
      const p = diagnosis.primary!;
      return {
        name,
        state: 'broken',
        value: `${METRIC_SHORT[p.metric] ?? p.metric} ${formatMetric(p.metric, p.observed)}`,
        tag: 'leak',
      };
    }
    if (tone === 'after') return { name, state: 'mute', value: 'symptom' };

    // Below the engine's own minimum sample the stage was never judged, and a
    // printed value would read as a verdict. The threshold is the engine's, not
    // ours — `diagnose` skips the stage on exactly this comparison.
    const spec = MEASURED_STAGES.find((s) => s.stage === stage);
    if (spec && spec.sample(window) < spec.minSample) {
      return {
        name,
        state: 'mute',
        value: `not judged — under ${formatCount(spec.minSample)} ${spec.sampleName}`,
      };
    }

    const entry = STAGE_METRIC[stage];
    return {
      name,
      state: 'ok',
      value: entry
        ? `${METRIC_SHORT[entry.metric] ?? entry.metric} ${formatMetric(entry.metric, entry.of(window))}`
        : '—',
    };
  });

  const p = diagnosis.primary;
  const headline = p
    ? `Stage ${p.stage} · ${FUNNEL_STAGES.find((s) => s.stage === p.stage)?.label ?? ''} leaked — ` +
      `${METRIC_SHORT[p.metric] ?? p.metric} ${formatMetric(p.metric, p.observed)} against ` +
      `${formatMetric(p.metric, p.reference)} (${formatDeviation(p.deviation)}, ` +
      `${formatCount(p.sampleSize)} samples) · rule ${p.rule}`
    : 'No stage broke — and that is a real answer.';

  return {
    slices,
    stages,
    headline,
    ...(diagnosis.changePoint ? { changePoint: formatDate(diagnosis.changePoint.date) } : {}),
    ...(p?.evidence ? { evidence: `${p.evidence.type} on ${formatDate(p.evidence.date)}` } : {}),
  };
}

// ─── the prediction band ──────────────────────────────────────────────────

export type BandViewModel = {
  decision: Verdict['decision'];
  ends: [string, string, string];
  /** Percent positions along the track — positioning, same move as the web sheet. */
  fill: { left: number; width: number };
  mid: number;
  breakEven: number;
  breakEvenLabel: string;
  limitingFactor?: string;
  killTrigger?: string;
};

export function bandViewModel(verdict: Verdict): BandViewModel {
  const { p10, p50, p90 } = verdict.predictedRoas;
  const breakEven = verdict.breakEvenRoas;
  const scale = Math.max(p90, breakEven) * 1.06 || 1;
  const at = (v: number) => Math.min(100, Math.max(0, (v / scale) * 100));

  return {
    decision: verdict.decision,
    ends: [formatRoas(p10), `likely ${formatRoas(p50)}`, formatRoas(p90)],
    fill: { left: at(p10), width: at(p90) - at(p10) },
    mid: at(p50),
    breakEven: at(breakEven),
    breakEvenLabel: formatRoas(breakEven),
    ...(verdict.limitingFactor ? { limitingFactor: verdict.limitingFactor } : {}),
    ...(verdict.killTrigger ? { killTrigger: verdict.killTrigger } : {}),
  };
}
