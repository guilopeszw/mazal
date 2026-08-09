import type {
  Action,
  CampaignDay,
  Diagnosis,
  FunnelStage,
  ProductCard,
  RecoveryPlan,
  ReferenceMode,
  SellerLeverName,
  StoreEvent,
} from "@mazal/contracts";
import { aggregate, atcRate } from "@mazal/contracts/metrics";
import { benchmarks, sellerBenchmarks } from "@mazal/data";
import {
  MEASURED_STAGES,
  WINDOW_DAYS,
  buildPlan,
  diagnose,
  measurability,
  predict,
  profileCard,
} from "@mazal/engine";
import { demoCases } from "./fixtures.ts";
import {
  EVENT_LABELS,
  denominatorOf,
  formatBRL,
  formatCount,
  formatDate,
  formatDeviation,
  formatMetric,
  formatPercent,
  formatRoas,
  metricLabel,
  metricShort,
} from "./format.ts";
import { FUNNEL_STAGES, stageValue, toneFor } from "./funnel.ts";
import { provenanceFor } from "./reference.ts";

/**
 * Server-side only: this module drags `@mazal/data`'s benchmark JSON with it, and the whole
 * point of building the three answers here is that the browser never downloads that file.
 * `page.tsx` calls `buildAnswers()` in a server component and hands the client plain strings.
 *
 * Every number in an `Answer` was produced by the engine or read off the contract and then
 * *formatted* — nothing below computes a rate, and the one division (mean daily spend) is
 * budget arithmetic the contract has no vocabulary for.
 */

export type AnswerKey = "diagnose" | "atc" | "predict";

export type VerdictSegment = { text: string; tone?: "good" | "bad" };

export type Answer = {
  asked: string;
  verdict: VerdictSegment[];
  said: string;
  /** The correlated store event, rendered when the engine attached one. */
  evidence?: string;
  stages?: { name: string; state: "ok" | "broken" | "mute"; value: string; tag?: string }[];
  band?: {
    ends: [string, string, string];
    /** Percent positions along the track. */
    fill: { left: number; width: number };
    mid: number;
    breakEven: number;
  };
  rows: { label: string; value: string; ref: string; hit?: boolean }[];
  /**
   * The recovery plan, when the engine has one. `actions` are the raw contract objects —
   * the client formats them and POSTs the approved `actor: 'mazal'` subset to /api/execute.
   * `projected` is p50 only: the full band on a plan is honest about uncertainty but reads
   * as a sales pitch, and a p90 of 20× on a seller's screen is worse than no number.
   */
  plan?: { actions: Action[]; projected: string; assumption: string };
  note: string;
};

/** What each stage is called mid-sentence — "your checkout broke", not "your Intent broke". */
const STAGE_NOUN: Record<FunnelStage, string> = {
  0: "delivery",
  1: "creative",
  2: "landing page",
  3: "product page",
  4: "checkout",
  5: "purchase step",
  6: "unit economics",
};

const stageTitle = (stage: FunnelStage) =>
  `Stage ${stage} · ${FUNNEL_STAGES.find((s) => s.stage === stage)?.label ?? ""}`;

/** The seven funnel rows: leak from the finding itself, healthy stages from the window. */
function stageRows(diagnosis: Diagnosis, window: CampaignDay) {
  const leak = diagnosis.primary?.stage ?? null;
  return FUNNEL_STAGES.map(({ stage, label, unassessed }) => {
    const name = `${stage} · ${label}`;
    if (unassessed) return { name, state: "mute" as const, value: "no analytics", tag: "skipped" };

    const tone = toneFor(stage, leak);
    if (tone === "leak") {
      const p = diagnosis.primary!;
      return {
        name,
        state: "broken" as const,
        value: `${metricShort(p.metric)} ${formatMetric(p.metric, p.observed)}`,
        tag: "leak",
      };
    }
    // Downstream of the leak is a consequence, not a cause. Printing its number in the same
    // column as the healthy stages would invite fixing it — the misdiagnosis Mazal exists
    // to prevent — so the row says what it is instead.
    if (tone === "downstream") return { name, state: "mute" as const, value: "symptom" };

    const v = stageValue(stage, window);
    return {
      name,
      state: "ok" as const,
      value: v ? `${metricShort(v.metric)} ${formatMetric(v.metric, v.value)}` : "—",
    };
  });
}

/** The plan payload, p50 only — see the comment on `Answer.plan`. */
function planPayload(
  plan: RecoveryPlan,
  diagnosis: Diagnosis,
  reference: ReferenceMode,
  currentP50?: number,
): Answer["plan"] {
  if (!diagnosis.primary || plan.actions.length === 0) return undefined;
  const refWord = reference.kind === "benchmark" ? "the category median" : "its own baseline";
  return {
    actions: plan.actions,
    projected:
      currentP50 !== undefined
        ? `${formatRoas(currentP50)} → ${formatRoas(plan.projected.p50)} likely`
        : `likely ${formatRoas(plan.projected.p50)} if the ${STAGE_NOUN[diagnosis.primary.stage]} is fixed`,
    assumption: `Median only. Assumes ${metricLabel(diagnosis.primary.metric)} returns to ${refWord} and every other stage holds still — a projection, not a forecast.`,
  };
}

/** The shared diagnose answer: the fixture case and an uploaded CSV render identically. */
function diagnoseAnswer(args: {
  asked: string;
  diagnosis: Diagnosis;
  window: CampaignDay;
  card: ProductCard;
  reference: ReferenceMode;
  plan: RecoveryPlan;
  noteSuffix?: string;
}): Answer {
  const { asked, diagnosis, window, card, reference, plan, noteSuffix = "" } = args;
  const primary = diagnosis.primary;

  const categoryRow = benchmarks[card.category].metrics;
  const measured = Object.values(categoryRow).filter((m) => m.n > 0);
  const orders = Math.max(0, ...measured.map((m) => m.n));
  const benchmarkNote = `${measured.length} of the 12 category benchmarks are measured from ${formatCount(orders)} Olist orders; the other ${12 - measured.length} are published priors, marked as estimates wherever they appear.`;

  if (!primary) {
    return {
      asked,
      verdict: [
        { text: "No leak found. ", tone: "good" },
        { text: "Every measured stage sits inside its reference." },
      ],
      said: "Nothing deviated far enough from its reference to be flagged.",
      stages: stageRows(diagnosis, window),
      rows: [],
      note: benchmarkNote + noteSuffix,
    };
  }

  const spec = MEASURED_STAGES.find((s) => s.stage === primary.stage);
  const provenance = provenanceFor(primary, card.category, reference);
  return {
    asked,
    verdict:
      primary.causeLayer === "media"
        ? [
            { text: "This one is a media problem. " },
            { text: `Your ${STAGE_NOUN[primary.stage]} is the first stage that broke.`, tone: "bad" },
          ]
        : [
            { text: "Your ads are fine. " },
            {
              text: diagnosis.changePoint
                ? `Your ${STAGE_NOUN[primary.stage]} broke on ${formatDate(diagnosis.changePoint.date)}.`
                : `Your ${STAGE_NOUN[primary.stage]} is the leak.`,
              tone: "bad",
            },
          ],
    said: `Everything upstream held. ${metricLabel(primary.metric)} fell to ${formatMetric(primary.metric, primary.observed)} against a baseline of ${formatMetric(primary.metric, primary.reference)}, and nothing downstream of that could recover.`,
    evidence: primary.evidence
      ? `A ${EVENT_LABELS[primary.evidence.type] ?? primary.evidence.type} landed on ${formatDate(primary.evidence.date)} — ${primary.evidence.detail}.`
      : undefined,
    stages: stageRows(diagnosis, window),
    rows: [
      {
        label: metricLabel(primary.metric),
        value: formatMetric(primary.metric, primary.observed),
        ref: `reference ${formatMetric(primary.metric, primary.reference)}`,
        hit: true,
      },
      {
        label: "Deviation from reference",
        value: formatDeviation(primary.deviation),
        ref: "flagged below −1σ",
      },
      {
        label: `${denominatorOf(primary.metric)} behind it`,
        value: formatCount(primary.sampleSize),
        ref: spec ? `minimum ${formatCount(spec.minSample)}` : "",
      },
    ],
    plan: planPayload(plan, diagnosis, reference),
    note: `Rule ${primary.rule} · reference: ${provenance.label}. ${benchmarkNote}${noteSuffix}`,
  };
}

/**
 * Diagnose a campaign a seller just uploaded. Benchmark reference only — there is no
 * trustworthy self-baseline for a file we just met. Called from a server action, so the
 * benchmark table still never reaches the browser.
 */
export function buildUploadAnswer(
  days: CampaignDay[],
  card: ProductCard,
  events: StoreEvent[],
  asked: string,
  noteSuffix?: string,
): Answer {
  const reference = { kind: "benchmark", table: benchmarks } as const;
  const diagnosis = diagnose({ days, card, events, reference });
  return diagnoseAnswer({
    asked,
    diagnosis,
    window: aggregate(days.slice(-WINDOW_DAYS)),
    card,
    reference,
    plan: buildPlan(diagnosis, card),
    noteSuffix,
  });
}

export function buildAnswers(): Record<AnswerKey, Answer> {
  const { case1, case2 } = demoCases;

  // ── in-flight diagnosis (case 2) ────────────────────────────────────────────────
  /**
   * A fixed baseline, and deliberately not one derived from `fault.injectedOn`.
   *
   * The fixture carries the answer; a seller's CSV does not. Reading `injectedOn`
   * to configure the diagnosis is the app telling the engine when the break
   * happened and then presenting the engine's agreement as a finding — the
   * demo would be measuring something production can never do.
   *
   * Fourteen days is the figure `docs/demo-contract.md` publishes and the guard
   * in `pnpm sim:fixtures` asserts against, so the screen and the contract cannot
   * drift apart.
   */
  const reference = { kind: "self", baselineDays: 14 } as const;
  const diagnosis = diagnose({
    days: case2.days,
    card: case2.card,
    events: case2.events,
    reference,
  });
  const window = aggregate(case2.days.slice(-WINDOW_DAYS));
  const primary = diagnosis.primary;

  const diagnoseAns = diagnoseAnswer({
    asked: "My ROAS dropped this week",
    diagnosis,
    window,
    card: case2.card,
    reference,
    plan: buildPlan(diagnosis, case2.card),
  });

  // ── "why is my ATC low?" (case 2, stage 3 specifically) ─────────────────────────
  const categoryRow = benchmarks[case2.card.category].metrics;
  const atcObserved = atcRate(window);
  const atcDist = categoryRow.atcRate;
  const atcIsLeak = primary?.stage === 3;
  const atcAnswer: Answer = {
    asked: "Why is my ATC rate low?",
    verdict: atcIsLeak
      ? [
          { text: "It is low — " },
          { text: "your product page is the first stage that broke.", tone: "bad" },
        ]
      : [
          { text: "Your add-to-cart rate is " },
          { text: "normal for your category", tone: "good" },
          { text: "." },
        ],
    said: atcIsLeak
      ? `${formatMetric("atcRate", primary!.observed)} against a reference of ${formatMetric("atcRate", primary!.reference)}. This is the stage to fix.`
      : primary
        ? `${formatMetric("atcRate", atcObserved)} over the last ${WINDOW_DAYS} days against a category median of ${formatMetric("atcRate", atcDist.median)}. Nothing at that stage needs fixing — the leak is at your ${STAGE_NOUN[primary.stage]}, one stage further down.`
        : `${formatMetric("atcRate", atcObserved)} over the last ${WINDOW_DAYS} days against a category median of ${formatMetric("atcRate", atcDist.median)}. Nothing in this campaign is flagged at all.`,
    rows: [
      {
        label: "Your add-to-cart rate",
        value: formatMetric("atcRate", atcObserved),
        ref: `category median ${formatMetric("atcRate", atcDist.median)}`,
      },
      ...(primary && !atcIsLeak
        ? [
            {
              label: "Where the leak actually is",
              value: stageTitle(primary.stage),
              ref: formatDeviation(primary.deviation),
              hit: true,
            },
          ]
        : []),
    ],
    note: `Telling you to rewrite a product page that is working is the failure this product exists to prevent. The category median is ${
      atcDist.n > 0
        ? `measured from ${formatCount(atcDist.n)} Olist orders`
        : "a published estimate for Brazilian retail — not measured"
    }.`,
  };

  // ── pre-flight prediction (case 1) ──────────────────────────────────────────────
  const verdict = predict({ card: case1.card, table: benchmarks });
  const profile = profileCard(case1.card, sellerBenchmarks);
  // Budget arithmetic, not a funnel rate: what campaign #1 actually spent per day.
  const dailyBudget = aggregate(case1.days).spend / case1.days.length;
  const silent = measurability(case1.card, dailyBudget, benchmarks).silent;

  const { p10, p50, p90 } = verdict.predictedRoas;
  const breakEven = verdict.breakEvenRoas;
  const scale = Math.max(p90, breakEven) * 1.06 || 1;
  const at = (v: number) => Math.min(100, Math.max(0, (v / scale) * 100));

  const LEVER: Record<SellerLeverName, { label: string; format: (v: number) => string }> = {
    price: { label: "Price", format: formatBRL },
    freightRatio: { label: "Freight over price", format: formatPercent },
    deliveryDays: { label: "Delivery promise", format: (v) => `${formatCount(Math.round(v))} days` },
    photos: { label: "Photos on the listing", format: (v) => formatCount(Math.round(v)) },
    descriptionLength: { label: "Description length", format: (v) => `${formatCount(Math.round(v))} chars` },
  };

  const decisionVerdict: Record<typeof verdict.decision, VerdictSegment[]> = {
    dont_launch: [
      { text: "Don't launch yet. ", tone: "bad" },
      { text: `Your break-even needs ${formatRoas(breakEven)} and the best case is ${formatRoas(p90)}.` },
    ],
    launch_small: [
      { text: "Launch small. ", tone: "good" },
      { text: verdict.killTrigger ?? `The band crosses your break-even of ${formatRoas(breakEven)} — start small and kill early.` },
    ],
    launch: [
      { text: "Launch. ", tone: "good" },
      { text: `Even the low case, ${formatRoas(p10)}, clears your break-even of ${formatRoas(breakEven)}.` },
    ],
  };

  const replication = sellerBenchmarks.replication;
  const replicating = (Object.keys(replication) as SellerLeverName[]).filter(
    (l) => replication[l].evidence === "replicates",
  );
  const replicationNote =
    replicating.length === 1
      ? `Across ${replication[replicating[0]!].categories} categories, ${LEVER[replicating[0]!].label.toLowerCase()} is the only lever that separates better-reviewed sellers from worse — in ${replication[replicating[0]!].agreeing} of them. The rest are coin flips, so Mazal won't tell you to change them.`
      : replicating.length > 1
        ? `Levers that separate better-reviewed sellers from worse: ${replicating.map((l) => LEVER[l].label.toLowerCase()).join(", ")}. The rest are coin flips, so Mazal won't tell you to change them.`
        : "No card lever cleanly separates better-reviewed sellers from worse in this data, so none of these percentiles is a promise.";
  const silentNote = silent.length
    ? ` At ${formatBRL(dailyBudget)}/day, ${silent.map(stageTitle).join(" and ")} never accumulates enough data inside the ${WINDOW_DAYS}-day window to be judged.`
    : "";

  /**
   * The pre-flight plan: campaign #1's own flight, judged against the category table,
   * is what the plan repairs before campaign #2 spends. The projected line pairs the
   * current predicted p50 with the plan's p50 — the two numbers the decision is between.
   */
  const preflightDiagnosis = diagnose({
    days: case1.days,
    card: case1.card,
    events: case1.events,
    reference: { kind: "benchmark", table: benchmarks },
  });
  const preflightPlan = planPayload(
    buildPlan(preflightDiagnosis, case1.card),
    preflightDiagnosis,
    { kind: "benchmark", table: benchmarks },
    p50,
  );

  const predictAnswer: Answer = {
    asked: "Should I launch this campaign?",
    verdict: decisionVerdict[verdict.decision],
    said: `At a ${formatPercent(case1.card.grossMargin)} margin every real spent has to return ${formatRoas(breakEven)}. The likely case is ${formatRoas(p50)}.${verdict.limitingFactor ? ` ${verdict.limitingFactor[0]!.toUpperCase()}${verdict.limitingFactor.slice(1)}.` : ""}`,
    band: {
      ends: [formatRoas(p10), `likely ${formatRoas(p50)}`, formatRoas(p90)],
      fill: { left: at(p10), width: at(p90) - at(p10) },
      mid: at(p50),
      breakEven: at(breakEven),
    },
    rows: profile.slice(0, 3).map((f) => ({
      label: LEVER[f.lever].label,
      value: LEVER[f.lever].format(f.observed),
      ref: `sellers like you: ${LEVER[f.lever].format(f.peerMedian)} · p${Math.round(f.percentile * 100)}`,
      hit: f.percentile >= 0.75,
    })),
    plan: preflightPlan,
    note: replicationNote + silentNote,
  };

  return { diagnose: diagnoseAns, atc: atcAnswer, predict: predictAnswer };
}
