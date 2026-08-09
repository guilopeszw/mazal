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
import { aggregate, atcRate, roas } from "@mazal/contracts/metrics";
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

/** One count stage of the funnel chart. `tone` is `toneFor`, serialised. */
export type FunnelSlice = {
  label: string;
  value: number;
  display: string;
  tone: "ok" | "leak" | "after";
};

export type ChartPoint = { date: string; value: number };

/**
 * Chart payloads. Same rule as everything else in an `Answer`: every number was
 * produced by the engine or read straight off the contract — a count field, a
 * rate function from `@mazal/contracts/metrics`, a percentile from
 * `profileCard`. The client positions them and never derives a new one.
 */
export type AnswerCharts = {
  funnel?: { slices: FunnelSlice[]; summary: string };
  daily?: {
    label: string;
    points: ChartPoint[];
    /** The day the engine says the metric turned. Absent = no mark. */
    changePoint?: string;
    markLabel?: string;
    summary: string;
  };
  /** Daily ROAS re-based against break-even: 0 on this axis *is* break-even. */
  margin?: { points: ChartPoint[]; breakEven: string; summary: string };
  radar?: {
    axes: { key: string; label: string }[];
    /** 0–100 per axis; distance from centre is standing among peers (out = better). */
    seller: Record<string, number>;
    /** The category median — 50 on every axis, by what a median is. */
    peers: Record<string, number>;
    summary: string;
  };
};

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
  charts?: AnswerCharts;
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

/**
 * The five stages of the funnel that are counts on the contract, in funnel
 * order. Read straight off `CampaignDay` — no rate is computed here, which is
 * also why stage 6 (AOV, a money rate) and the unassessed stage 2 (no data)
 * have no segment. The rows beneath the chart still carry all seven.
 */
const FUNNEL_COUNTS: ReadonlyArray<{ stage: FunnelStage; of: (d: CampaignDay) => number }> = [
  { stage: 0, of: (d) => d.impressions },
  { stage: 1, of: (d) => d.clicks },
  { stage: 3, of: (d) => d.addToCarts },
  { stage: 4, of: (d) => d.checkoutsInitiated },
  { stage: 5, of: (d) => d.purchases },
];

/** The three campaign charts of a diagnosis. Shared by the fixture case and an upload. */
function buildDiagnoseCharts(
  diagnosis: Diagnosis,
  days: CampaignDay[],
  window: CampaignDay,
  card: ProductCard,
): AnswerCharts {
  const leak = diagnosis.primary?.stage ?? null;

  const slices = FUNNEL_COUNTS.map(({ stage, of }) => {
    const tone = toneFor(stage, leak);
    return {
      label: FUNNEL_STAGES.find((s) => s.stage === stage)?.label ?? `Stage ${stage}`,
      value: of(window),
      display: formatCount(of(window)),
      tone: (tone === "upstream" ? "ok" : tone === "leak" ? "leak" : "after") as FunnelSlice["tone"],
    };
  });
  const funnel = {
    slices,
    summary: `The funnel over the last ${WINDOW_DAYS} days: ${slices
      .map((s) => `${s.display} ${s.label.toLowerCase()}${s.tone === "leak" ? " — the leak" : ""}`)
      .join(", ")}.`,
  };

  const primary = diagnosis.primary;
  const spec = primary ? MEASURED_STAGES.find((s) => s.stage === primary.stage) : undefined;
  const daily =
    primary && spec && days.length > 1
      ? {
          label: metricLabel(primary.metric),
          // Each point is the contract's own rate function over one day's counts.
          points: days.map((d) => ({ date: d.date, value: spec.observe(d) })),
          ...(diagnosis.changePoint
            ? {
                changePoint: diagnosis.changePoint.date,
                markLabel: `broke ${formatDate(diagnosis.changePoint.date)}`,
              }
            : {}),
          summary: `${metricLabel(primary.metric)} by day over the whole flight${
            diagnosis.changePoint
              ? `; the engine dates the turn to ${formatDate(diagnosis.changePoint.date)}`
              : ""
          }. The numbers behind it are in the table.`,
        }
      : undefined;

  /**
   * Break-even comes from the engine's verdict, not from arithmetic here.
   * Re-basing each day's ROAS against it is positioning, the same move as the
   * percent mapping on the prediction band: 0 on this chart's axis *is* the
   * break-even line, and no re-based value is ever printed.
   */
  const breakEven = predict({ card, table: benchmarks }).breakEvenRoas;
  const margin =
    days.length > 1
      ? {
          points: days.map((d) => ({ date: d.date, value: roas(d) - breakEven })),
          breakEven: formatRoas(breakEven),
          summary: `Daily ROAS measured against the break-even of ${formatRoas(breakEven)}. Days above the line paid for themselves; days below ran at a loss.`,
        }
      : undefined;

  return { funnel, ...(daily ? { daily } : {}), ...(margin ? { margin } : {}) };
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
  days: CampaignDay[];
  window: CampaignDay;
  card: ProductCard;
  reference: ReferenceMode;
  plan: RecoveryPlan;
  noteSuffix?: string;
}): Answer {
  const { asked, diagnosis, days, window, card, reference, plan, noteSuffix = "" } = args;
  const primary = diagnosis.primary;
  const charts = buildDiagnoseCharts(diagnosis, days, window, card);

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
      charts,
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
    charts,
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
    days,
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
    days: case2.days,
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
      /**
       * The kill number alone. `killTrigger` also carries the limiting factor,
       * which the line beneath already says — printing the whole string here
       * put the same sentence on screen twice, in the demo's opening beat.
       */
      { text: `Your break-even is ${formatRoas(breakEven)} and the likely case is ${formatRoas(p50)} — start small, and stop below ${formatRoas(breakEven)} after 100 clicks.` },
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

  /**
   * The peer radar: this card against its category across the five levers.
   * Each axis is the percentile `profileCard` computed — engine output — drawn
   * so that distance from the centre is standing among peers, with out = better
   * (the percentile stores 1 as the bad end, so the flip is orientation, not a
   * new number). The category median is 50 on every axis, by what a median is.
   */
  const radar =
    profile.length >= 3
      ? {
          axes: profile.map((f) => ({ key: f.lever, label: LEVER[f.lever].label })),
          seller: Object.fromEntries(
            profile.map((f) => [f.lever, Math.round((1 - f.percentile) * 100)]),
          ),
          peers: Object.fromEntries(profile.map((f) => [f.lever, 50])),
          summary: `Where this card sits among sellers in its category, across ${profile.length} levers: ${profile
            .map((f) => `${LEVER[f.lever].label.toLowerCase()} at the ${Math.round(f.percentile * 100)}th percentile`)
            .join(", ")} (100 is the bad end). The dashed ring is the category median.`,
        }
      : undefined;

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
    ...(radar ? { charts: { radar } } : {}),
    note: replicationNote + silentNote,
  };

  return { diagnose: diagnoseAns, atc: atcAnswer, predict: predictAnswer };
}
