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
  allocate,
  buildPlan,
  diagnose,
  fitCurve,
  priorCurve,
  reallocate,
  valueAt,
  measurability,
  predict,
  profileCard,
} from "@mazal/engine";
import { demoAccount, demoCases } from "./fixtures.ts";
import {
  EVENT_LABELS,
  denominatorOf,
  formatBRL,
  formatCount,
  formatMoney,
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

export type AnswerKey = "diagnose" | "atc" | "predict" | "allocate";

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
  /**
   * The Money Line: daily spend against daily profit, on the curve the engine
   * fitted to this campaign's own days.
   *
   * Every other chart here looks backwards. This one is the only place the
   * product says what would happen at a spend the seller has not tried — so it
   * carries its own provenance, and it is not drawn at all unless the campaign
   * has earned it.
   */
  /**
   * The reallocation: where the seller's money is, where it should be, and the
   * difference. Held at the same total by construction — `reallocate` reads the
   * budget off the current spends and redistributes exactly that.
   */
  moves?: {
    budget: string;
    gain: string;
    gainMonthly: string;
    rows: {
      product: string;
      from: string;
      to: string;
      delta: string;
      direction: "up" | "down" | "hold";
      /** Reais of margin on one sale of this product. */
      value: string;
      /** Conversions per day this product's own days support at its ceiling. */
      basis: string;
    }[];
    summary: string;
  };
  /**
   * Each product's daily spend across the flight, on one time axis.
   *
   * This is the evidence for the advice above it rather than decoration. A
   * response curve is a claim about what a different budget would do, and the
   * only reason Mazal can make one here is that these budgets moved — the
   * fit refuses when they have not. Showing the walk is showing why it is
   * allowed to speak.
   */
  budgetWalk?: {
    /** One row per date, one key per product, plus the date itself. */
    points: Record<string, string | number>[];
    series: { key: string; label: string }[];
    summary: string;
  };
  money?: {
    /** Sampled along the fitted curve. Profit in BRL per day. */
    points: { spend: number; profit: number }[];
    /** Where the seller is standing: their own recent daily spend. */
    here: { spend: number; profit: number };
    /** Where profit peaks — the last real that earns back more than itself. */
    best: { spend: number; profit: number };
    /** Reais per day currently left on the table. */
    gain: number;
    headline: string;
    /** `fitted` or `blended`; a pure prior never reaches the screen. */
    source: 'blended' | 'fitted';
    days: number;
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
  const money = buildMoneyLine(days, card);

  const breakEven = predict({ card, table: benchmarks }).breakEvenRoas;
  const margin =
    days.length > 1
      ? {
          points: days.map((d) => ({ date: d.date, value: roas(d) - breakEven })),
          breakEven: formatRoas(breakEven),
          summary: `Daily ROAS measured against the break-even of ${formatRoas(breakEven)}. Days above the line paid for themselves; days below ran at a loss.`,
        }
      : undefined;

  return {
    funnel,
    ...(daily ? { daily } : {}),
    ...(margin ? { margin } : {}),
    ...(money ? { money } : {}),
  };
}

/**
 * The Money Line — the one chart that looks forward.
 *
 * Everything else in an answer reports what happened. This fits the campaign's
 * own spend-to-conversion curve and reads two points off it: where the seller
 * is standing, and where the last real still earns back more than itself.
 *
 * Three refusals are deliberate.
 *
 * It is not drawn from a pure category prior. `fitCurve` will happily return one
 * for a campaign with no history, and it would look identical on screen — a
 * confident curve through the seller's own axis that is really the median of 62
 * categories. `source` decides, and `prior` never reaches the page.
 *
 * It never proposes a larger budget. The best point can only be a spend the
 * curve says pays for itself, and when that is above what the seller already
 * spends there is no headline at all: "you could spend more" is a decision, not
 * a repair, and this product does not make it.
 *
 * And it prints no number the engine did not produce. The gain is a difference
 * of two profits, each `valueAt` times the card's own margin, less the spend.
 */
function buildMoneyLine(
  days: CampaignDay[],
  card: ProductCard,
): AnswerCharts["money"] {
  const spent = days.filter((d) => d.spend > 0);
  if (spent.length < 3) return undefined;

  /**
   * The curve is only identifiable if the spend actually moved.
   *
   * A saturation curve is a claim about how output changes as spend changes, so
   * fitting one to a campaign held at a constant daily budget is asking where
   * the ceiling is from data that never approached it. The least-squares fit
   * does not fail in that case — it succeeds, on a curve whose `k` is pinned
   * wherever the sweep started, and then confidently reports that a campaign
   * spending R$99 a day should spend R$1. Both demo fixtures land exactly there:
   * their daily spend varies by 1.15× and 1.20×, and the fitted `k` comes out at
   * R$1.0 and R$2.5.
   *
   * So the chart requires the seller to have actually varied their budget. Most
   * will not have, which is the honest finding rather than a limitation to
   * paper over: a campaign at a flat budget contains no evidence about any other
   * budget, and the place that evidence does exist is ACROSS adsets or products
   * spending different amounts at the same time.
   */
  const levels = spent.map((d) => d.spend);
  const ratio = Math.max(...levels) / Math.min(...levels);
  if (ratio < 2) return undefined;

  const metrics = benchmarks[card.category].metrics;
  const typicalSpend = spent.reduce((sum, d) => sum + d.spend, 0) / spent.length;

  // The benchmark table publishes CPM and CTR, not CPC. Cost per click is the
  // ratio of the two — spend over impressions, divided by clicks over
  // impressions, with impressions cancelling — so this is the same two priors
  // rearranged rather than a third number from somewhere else. It only sets the
  // prior's slope, and the prior only matters while the campaign's own days are
  // too few to speak.
  const priorCpc = metrics.ctr.median > 0 ? metrics.cpm.median / 1000 / metrics.ctr.median : 0;

  const curve = fitCurve(
    days,
    priorCurve({
      cpc: priorCpc,
      cvr: metrics.cvr.median,
      typicalSpend,
    }),
  );
  if (curve.source === "prior") return undefined;

  // What one conversion is worth to this seller, from their own card.
  const value = card.price * card.grossMargin;
  const profitAt = (spend: number) => valueAt(curve, spend) * value - spend;

  const here = { spend: typicalSpend, profit: profitAt(typicalSpend) };
  const { profitMaxBudget } = allocate([{ id: card.category, curve }], {
    budget: typicalSpend,
    valuePerConversion: value,
  });
  const best = { spend: profitMaxBudget, profit: profitAt(profitMaxBudget) };
  const gain = best.profit - here.profit;

  // Sample past both points so the shape, not just the two dots, is visible.
  const span = Math.max(typicalSpend, profitMaxBudget) * 1.6;
  const points = Array.from({ length: 41 }, (_, i) => {
    const spend = (span * i) / 40;
    return { spend, profit: profitAt(spend) };
  });

  const cheaper = best.spend < here.spend;
  const headline = cheaper
    ? `Profit peaks at ${formatBRL(best.spend)} a day. You are spending ${formatBRL(here.spend)}.`
    : `You are close to the best spend this curve can find.`;

  return {
    points,
    here,
    best,
    gain,
    headline,
    source: curve.source,
    days: curve.n,
    summary: `Daily profit against daily spend, on the curve fitted to this campaign's own ${curve.n} days of spending${
      curve.source === "blended" ? `, still leaning on the ${card.category} median because that is thin` : ""
    }. One conversion is worth ${formatBRL(value)} at this card's price and margin. Profit peaks at ${formatBRL(best.spend)} a day; the campaign is spending ${formatBRL(here.spend)}.`,
  };
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

/**
 * The Allocator's answer: the seller's own money, in the wrong place.
 *
 * This is the only answer that is not about one campaign. Everything else asks
 * what happened to a flight; this asks where a wallet should sit across three
 * products that do not convert into the same reais — a R$200 blender and a R$30
 * broom share a budget and nothing else.
 *
 * Every number is engine output. The curves are fitted here from the fixture's
 * own days, exactly as they would be from an uploaded account, and if any of
 * them came back as anything but `fitted` the answer would be refusing to speak
 * rather than guessing — `pnpm sim:fixtures` fails the build if that happens.
 */
function allocateAnswer(): Answer {
  const funded = demoAccount.products.map((p) => {
    const m = benchmarks[p.card.category].metrics;
    // CPM and CTR are published; CPC is the two of them rearranged.
    const cpc = m.ctr.median > 0 ? m.cpm.median / 1000 / m.ctr.median : 0;
    const spent = p.days.filter((d) => d.spend > 0);
    const typical = spent.reduce((sum, d) => sum + d.spend, 0) / Math.max(1, spent.length);
    return {
      id: p.id,
      card: p.card,
      curve: fitCurve(p.days, priorCurve({ cpc, cvr: m.cvr.median, typicalSpend: typical })),
      valuePerConversion: p.card.price * p.card.grossMargin,
      spend: p.currentSpend,
    };
  });

  const advice = reallocate(funded, {});
  const nameOf = (id: string) =>
    (funded.find((f) => f.id === id)?.card.category ?? id).replace(/_/g, " ");

  const rows = advice.best
    .map((b) => {
      const f = funded.find((x) => x.id === b.id)!;
      const delta = b.spend - f.spend;
      return {
        product: nameOf(b.id),
        from: formatMoney(f.spend),
        to: formatMoney(b.spend),
        delta: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatMoney(Math.abs(delta))}`,
        direction: (delta > 1 ? "up" : delta < -1 ? "down" : "hold") as "up" | "down" | "hold",
        value: formatMoney(f.valuePerConversion),
        basis: `${f.curve.n} days`,
      };
    })
    .sort((a, b) => (a.direction === "up" ? -1 : b.direction === "up" ? 1 : 0));

  // What actually crosses between products: the money leaving, which by
  // construction equals the money arriving.
  const moved = advice.moves
    .filter((m) => m.delta < 0)
    .reduce((sum, m) => sum - m.delta, 0);

  /**
   * The spend walk. Read straight off the fixture's days — no rate is computed
   * here, and the series keys are the product ids so nothing has to be matched
   * back up by label.
   */
  const dates = funded[0]!.card ? demoAccount.products[0]!.days.map((d) => d.date) : [];
  const budgetWalk = {
    points: dates.map((date, i) => {
      const row: Record<string, string | number> = { date };
      for (const p of demoAccount.products) row[p.id] = p.days[i]?.spend ?? 0;
      return row;
    }),
    series: demoAccount.products.map((p) => ({ key: p.id, label: nameOf(p.id) })),
    summary: `Each product's daily budget over the flight. Mazal can only draw a curve for a product whose budget actually moved — these span more than 2× from their lowest day to their highest, which is what makes the advice above possible at all. A budget held flat carries no evidence about any other budget, and Mazal says so rather than guessing.`,
  };

  const moves = {
    budget: formatMoney(advice.budget),
    gain: formatMoney(advice.gain),
    gainMonthly: formatMoney(advice.gain * 30),
    rows,
    summary: `Three products sharing ${formatMoney(advice.budget)} a day. The split that earns most at that same total is worth ${formatMoney(advice.gain)} a day more than the one running now — the money moves, the budget does not.`,
  };

  return {
    asked: "Where should my budget go?",
    verdict: [
      { text: "You are leaving " },
      { text: `${formatMoney(advice.gain * 30)} ` },
      { text: "a month on the table. Same budget, different split." },
    ],
    said: `Your three products do not earn the same amount per sale, so the one that converts most often is not the one worth the most money. ${rows[0]!.product} earns ${rows[0]!.value} a sale and is still hungry; the others have stopped paying for what they get. Moving ${formatMoney(moved)} between them changes nothing about what you spend.`,
    /**
     * No table. `MovesFigure` already is one, and repeating it underneath said
     * the same thing twice — in red, because `hit` paints a row with the warning
     * colour. Red in this product means the one stage that broke; a product
     * that should spend less has not broken, it is full.
     */
    rows: [],
    /**
     * The reallocation as a plan the seller approves, and the guarantee made
     * visible in the process.
     *
     * A reallocation is money off some products and onto another. Mazal can do
     * the first half and structurally cannot do the second: `ExecutableOp` has
     * `reduce_daily_budget` with a multiplier of at most 1 and nothing that
     * raises. So the cuts arrive as `actor: 'mazal'` with a real operation
     * attached, and the raise arrives as `actor: 'seller'` — the plan panel
     * already renders that as "yours to do — Mazal can't".
     *
     * That split is not a limitation to apologise for. It is the clearest
     * statement the product makes: Mazal will take money off what is full, and
     * the decision to spend more is always the seller's.
     */
    plan: {
      actions: advice.best.flatMap((b): Action[] => {
        const f = funded.find((x) => x.id === b.id)!;
        const delta = b.spend - f.spend;
        if (Math.abs(delta) < 1) return [];
        const name = nameOf(b.id);

        if (delta < 0) {
          return [{
            id: `allocate.reduce.${b.id}`,
            title: `Take ${formatMoney(-delta)} a day off ${name}`,
            // Not the numbers again — the row below already prints them. This
            // says why, which is the only thing a seller cannot read off the
            // arrow.
            change: `It is past the point where another real earns one back. The money does more on ${nameOf(advice.moves.find((mv) => mv.delta > 0)?.id ?? b.id)}.`,
            expectedEffect: { metric: 'dailyBudget', from: f.spend, to: b.spend },
            confidence: 'medium' as const,
            reversible: true,
            actor: 'mazal' as const,
            execution: {
              op: 'reduce_daily_budget' as const,
              multiplier: Math.min(1, b.spend / f.spend),
            },
          }];
        }

        return [{
          id: `allocate.raise.${b.id}`,
          title: `Put ${formatMoney(delta)} a day onto ${name}`,
          change: `This is the only product still earning more than it costs at the margin. Mazal never raises a budget, so this one is yours to do.`,
          expectedEffect: { metric: 'dailyBudget', from: f.spend, to: b.spend },
          confidence: 'medium' as const,
          reversible: true,
          actor: 'seller' as const,
        }];
      }),
      projected: `${formatMoney(advice.currentProfit)} → ${formatMoney(advice.bestProfit)} a day, at the same spend`,
      assumption: `Every figure comes from each product's own curve, fitted to ${funded[0]!.curve.n} days. Mazal can make the reductions; raising a budget is a decision to spend more and stays yours. The two halves are the same size, so approving only the cuts lowers your spend rather than moving it.`,
    },
    charts: { moves, budgetWalk },
    note: `Curves fitted from each product's own ${funded[0]!.curve.n} days of spending, which varied by more than 2× — a budget that never moved carries no evidence about any other budget, and Mazal declines rather than guessing. Measured against known curves on 200 simulated accounts this captures 71% of the achievable profit, against 25% for an even split; docs/allocator-results.md has the rest, including what it does not do.`,
  };
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

  return {
    diagnose: diagnoseAns,
    atc: atcAnswer,
    predict: predictAnswer,
    allocate: allocateAnswer(),
  };
}
