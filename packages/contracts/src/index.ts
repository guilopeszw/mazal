// ─── packages/contracts/src/index.ts ─────────────────────────────────────
// The frozen contract. See docs/contracts.md.
// After SAT-A, changes are announced before they are pushed.
// Adding an optional field is cheap; renaming is expensive.

import type { OlistCategory } from './categories.ts';

// ─── inputs ──────────────────────────────────────────────────────────────

/** One row per campaign per day. Counts and money only. */
export type CampaignDay = {
  date: string;                    // ISO 8601, 'YYYY-MM-DD'
  campaignId: string;
  spend: number;                   // BRL
  impressions: number;
  reach: number;
  clicks: number;                  // link clicks, not all clicks
  addToCarts: number;
  checkoutsInitiated: number;
  purchases: number;
  revenue: number;                 // BRL
  sessions?: number;               // absent unless the seller has analytics
  bounceRate?: number;             // 0–1, absent unless the seller has analytics
};

/** What the seller tells us about the product. 12 fields, ~2 minutes to fill. */
export type ProductCard = {
  category: OlistCategory;
  price: number;                   // BRL
  grossMargin: number;             // 0–1. Break-even ROAS is 1 / grossMargin.
  shippingCost: number;            // BRL charged to the customer, 0 = free
  deliveryEtaDays: number;
  stockOnHand: number;
  reviewCount: number;
  reviewAvg: number;               // 1–5
  pdpImages: number;
  pdpDescriptionLength: number;    // characters
  returnPolicyDays: number;
  paymentMethods: PaymentMethod[];
  offer: OfferType;
};

export type PaymentMethod = 'credit' | 'debit' | 'pix' | 'boleto' | 'installments';
export type OfferType = 'none' | 'discount' | 'bundle' | 'free_shipping_threshold';

/** Things that happened to the store, on a date. Turns "ATC collapsed" into "ATC collapsed because…". */
export type StoreEvent = {
  date: string;                    // ISO 8601
  type: StoreEventType;
  detail: string;                  // human-readable, e.g. "supplier ETA 9d → 22d"
};

/**
 * The runtime array is the source, the union is derived from it. `packages/ingest`
 * had its own `z.enum([...])` of the same seven strings, which is two lists to keep
 * in step and one place for them to drift.
 */
export const STORE_EVENT_TYPES = [
  'stockout',
  'price_change',
  'eta_change',
  'creative_refresh',
  'budget_change',
  'pixel_error',
  'policy_flag',
] as const;

export type StoreEventType = (typeof STORE_EVENT_TYPES)[number];

// ─── outputs ─────────────────────────────────────────────────────────────

/** One deviation the engine found, with everything needed to audit it. */
export type Finding = {
  stage: FunnelStage;
  severity: 'primary' | 'secondary';
  metric: string;                  // e.g. 'atcRate'
  observed: number;
  reference: number;
  spread: number;                  // robust sigma of the reference distribution
  deviation: number;               // (observed − reference) / spread
  sampleSize: number;              // denominator of the rate, e.g. clicks for atcRate
  rule: string;                    // id of the rule that fired, e.g. 'stage3.atc_below_benchmark'
  causeLayer: CauseLayer;
  evidence?: StoreEvent;           // the event that explains it, when one correlates
};

export type FunnelStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type CauseLayer = 'media' | 'product' | 'offer' | 'experience';

/** One thing the seller could do. */
export type Action = {
  id: string;
  title: string;                   // "Show the delivery estimate on the product page"
  change: string;                  // what concretely changes
  expectedEffect: { metric: string; from: number; to: number };
  confidence: 'low' | 'medium' | 'high';
  reversible: boolean;
  actor: 'mazal' | 'seller';
};

/** The pre-flight answer. */
export type Verdict = {
  decision: 'launch' | 'launch_small' | 'dont_launch';
  predictedRoas: { p10: number; p50: number; p90: number };
  breakEvenRoas: number;           // 1 / grossMargin
  killTrigger?: string;            // set when decision is 'launch_small'
  /**
   * The factor dragging the band down, named in words. Added after SAT-A and
   * announced in docs/HANDOFF.md — an optional field, so nothing that already
   * builds a Verdict breaks.
   *
   * docs/acceptance.md claim 8 asks the verdict to carry "the specific factor
   * dragging the band down", and the only prose slot was `killTrigger`, which is
   * set for one decision of three. A `dont_launch` could name no reason, which
   * is the verdict that most needs one.
   */
  limitingFactor?: string;
};

// ─── composite types ─────────────────────────────────────────────────────

export type FaultKind =
  | 'none'
  | 'stockout'
  | 'eta_shock'
  | 'creative_fatigue'
  | 'price_too_high'
  | 'checkout_friction'
  | 'pixel_break'
  | 'budget_cap'
  | 'thin_pdp';

export type ReferenceMode =
  | { kind: 'benchmark'; table: BenchmarkTable }   // pre-flight: category medians
  | { kind: 'self'; baselineDays: number };        // in-flight: the campaign's own history

export type BenchmarkTable = Record<OlistCategory, Benchmark>;

export type Benchmark = {
  category: OlistCategory;
  metrics: Record<BenchmarkMetric, Distribution>;
};

export type Distribution = {
  median: number;
  p25: number;
  p75: number;
  n: number;                       // rows behind it — printed in the UI, and n: 0 means prior
  source: 'olist' | 'kaggle_meta' | 'prior';
};

export type BenchmarkMetric =
  | 'cpm' | 'ctr' | 'atcRate' | 'icRate' | 'cvr' | 'aov'
  | 'price' | 'freightRatio' | 'deliveryDays'
  | 'reviewAvg' | 'photos' | 'descriptionLength';

/**
 * Generated by B from Olist's product_category_name_translation.csv, English labels.
 * `pnpm derive` writes `./categories.ts` — it is generated, never hand-edited, and it
 * lives here rather than in `packages/data` so that this package stays the leaf every
 * other package imports.
 *
 * It was written inline as `'health_beauty' | ... | string`, which TypeScript collapses
 * to `string`: `BenchmarkTable` became an index signature over any key, a table with
 * three categories type-checked, and so did a typo.
 *
 * `OLIST_CATEGORIES` is the same list as a runtime array, because a type alone erases
 * and nothing could then validate a category it was handed.
 */
export type { OlistCategory };
export { OLIST_CATEGORIES } from './categories.ts';

// ─── engine API types ────────────────────────────────────────────────────

export type DiagnoseInput = {
  days: CampaignDay[];
  card: ProductCard;
  events: StoreEvent[];
  reference: ReferenceMode;
};

export type Diagnosis = {
  primary: Finding | null;         // null = healthy, and that is a real answer
  secondary: Finding[];
  suspectedCause: FaultKind;       // what the backtest scores against
  changePoint?: { date: string; metric: string };
};

export type PredictInput = {
  card: ProductCard;
  table: BenchmarkTable;
  history?: CampaignDay[];         // narrows the band when present
};

export type RecoveryPlan = {
  actions: Action[];
  projected: { p10: number; p50: number; p90: number };
};

// ─── peer comparison ─────────────────────────────────────────────────────
// Added after SAT-A and announced in docs/HANDOFF.md. Additive: nothing that
// already compiles against this file changes.
//
// This answers a different question from the funnel. `diagnose` asks what broke
// in a campaign; this asks where a seller stands among the sellers they compete
// with, which is a fact about the store rather than about the media.

/** One lever's spread across sellers in a category, and where the good ones sit. */
export type SellerLever = {
  /** Mean among the top quartile of sellers by outcome. */
  top: number;
  /** Mean among the bottom quartile. */
  bottom: number;
  /** (top - bottom) / |bottom|. Negative means the better sellers do less of it. */
  lift: number;
};

export type SellerBenchmark = {
  category: OlistCategory;
  /** Qualifying sellers behind every number here. */
  sellers: number;
  /** What "better" was ranked on. Review score is a proxy — see docs/peer-comparison.md. */
  outcome: 'reviewAvg';
  outcomeTop: number;
  outcomeBottom: number;
  percentiles: Record<SellerLeverName, Distribution>;
  /** Null when the category has too few sellers for a quartile to mean anything. */
  levers: Record<SellerLeverName, SellerLever> | null;
};

export type SellerLeverName =
  | 'price' | 'freightRatio' | 'deliveryDays' | 'photos' | 'descriptionLength';

/**
 * How much a lever separates better sellers from worse, measured across every
 * category with quartile data. Derived by `pnpm derive`, never hand-written — a
 * kept-by-hand table of facts about the data becomes a lie the first time the
 * data is re-derived.
 */
export type LeverReplication = {
  categories: number;
  agreeing: number;
  evidence: 'replicates' | 'inconsistent';
  medianLift: number;
};

export type SellerBenchmarkTable = {
  replication: Record<SellerLeverName, LeverReplication>;
  /** Only 22 of the 62 categories have enough sellers. */
  categories: Partial<Record<OlistCategory, SellerBenchmark>>;
};

/** Where one card field sits among the sellers it competes with. */
export type CardFinding = {
  lever: SellerLeverName;
  observed: number;
  /** Median across qualifying sellers in the category. */
  peerMedian: number;
  /** 0-1. Where the seller sits in the distribution. */
  percentile: number;
  /** What the top quartile does, when the category has enough sellers to say. */
  betterSellers: SellerLever | null;
  /**
   * How much this lever separates good sellers from bad, across every category
   * that has the data. Attached to every finding so a percentile is never quoted
   * as if it predicted anything.
   */
  evidence: 'replicates' | 'inconsistent';
};

// ─── simulator API types ─────────────────────────────────────────────────
// docs/contracts.md § packages/sim. They live here for the same reason the engine's
// do: B injects the fault and A predicts it, and the backtest only means anything if
// neither side gets to define the shape it is scored on.

export type LabelledCampaign = {
  days: CampaignDay[];
  card: ProductCard;
  events: StoreEvent[];
  fault: { kind: FaultKind; injectedOn?: string };
};

export type BacktestReport = {
  top1: number;                    // 0–1
  top2: number;
  falseAlarmRate: number;          // on fault: 'none' campaigns
  confusion: Record<FaultKind, Record<FaultKind, number>>;
  n: number;
};

// ─── metrics (re-export) ─────────────────────────────────────────────────

export {
  safeDiv,
  aggregate,
  ctr,
  cpc,
  cpm,
  atcRate,
  icRate,
  cvr,
  cpa,
  aov,
  roas,
  costPerAtc,
} from './metrics.ts';
