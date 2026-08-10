# The frozen contract

Everything in this file lives in `packages/contracts`. It is committed in SAT-A and **frozen** from that moment: five people code against these names simultaneously, so a rename costs four people their next hour. Changes are an all-hands decision, announced before they are pushed.

C is the contracts guardian. Requests to change a type go to C.

---

## The governing rule: store counts, derive rates

**No `ctr`, `cvr`, `roas`, `atcRate`, `cpc`, `cpa`, or `cpm` field exists anywhere in the contract.** Only counts and amounts are stored. Every rate is a function, exported from `packages/contracts/src/metrics.ts`, imported by everyone.

This is not style. Five people storing rates independently produces one person's CTR as `0.021` and another's as `2.1`, the engine flags a leak that isn't there, and the bug surfaces at hour 30 in front of a judge. Functions have one definition.

```ts
// packages/contracts/src/metrics.ts — the only arithmetic vocabulary
export const ctr      = (d: CampaignDay) => safeDiv(d.clicks, d.impressions);
export const cpc      = (d: CampaignDay) => safeDiv(d.spend, d.clicks);
export const cpm      = (d: CampaignDay) => safeDiv(d.spend * 1000, d.impressions);
export const atcRate  = (d: CampaignDay) => safeDiv(d.addToCarts, d.clicks);
export const icRate   = (d: CampaignDay) => safeDiv(d.checkoutsInitiated, d.addToCarts);
export const cvr      = (d: CampaignDay) => safeDiv(d.purchases, d.clicks);
export const cpa      = (d: CampaignDay) => safeDiv(d.spend, d.purchases);
export const aov      = (d: CampaignDay) => safeDiv(d.revenue, d.purchases);
export const roas     = (d: CampaignDay) => safeDiv(d.revenue, d.spend);
export const costPerAtc = (d: CampaignDay) => safeDiv(d.spend, d.addToCarts);

/** Sums a window of days into one CampaignDay so every rate above works on ranges too. */
export const aggregate = (days: CampaignDay[]): CampaignDay => /* ... */;

/** Returns 0 for 0/0 rather than NaN. NaN propagates silently through the engine; 0 does not. */
const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);
```

`aggregate` is what makes rolling windows honest: a 3-day CTR is `ctr(aggregate(days.slice(-3)))`, never the mean of three daily CTRs. Those two numbers differ, and the second one is wrong.

---

## The six types

```ts
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
```

`reach` is stored so frequency is derivable (`impressions / reach`) — ad fatigue is stage 0 and the whole creative-fatigue signature hangs off it. `sessions` and `bounceRate` are optional because most sellers do not have them; the engine must degrade to skipping stage 2 rather than failing.

```ts
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
```

`grossMargin` is the single field that makes the output belong to this seller rather than to the category. Every verdict is measured against break-even ROAS = `1 / grossMargin`, so a 70%-margin product and a 12%-margin product get opposite verdicts on identical metrics. It is the first field on the form.

Every field maps to a funnel stage — that mapping is what lets the engine say *"the leak is your page"* and then name which thing on the page.

```ts
/** Things that happened to the store, on a date. Turns "ATC collapsed" into "ATC collapsed because…". */
export type StoreEvent = {
  date: string;                    // ISO 8601
  type: StoreEventType;
  detail: string;                  // human-readable, e.g. "supplier ETA 9d → 22d"
};

export type StoreEventType =
  | 'stockout'
  | 'price_change'
  | 'eta_change'
  | 'creative_refresh'
  | 'budget_change'
  | 'pixel_error'
  | 'policy_flag';
```

Without the event log the engine can only say a stage broke. With it, the engine names the cause. This is the difference between a dashboard and Mazal, and it is four fields.

```ts
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
```

`rule` is the audit hook. Every claim Mazal makes on screen names the rule that produced it, so a judge asking *"how do you know it isn't hallucinating"* gets pointed at a rule id and a formula rather than at a paragraph. This field is not optional and is never an empty string.

`sampleSize` is what stops the engine crying wolf on 40 clicks. A finding below its minimum sample is not emitted.

```ts
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
```

`actor` is load-bearing. A dropshipper cannot change a supplier's delivery ETA, so *"fix your SLA"* is a diagnosis they cannot act on. `actor: 'seller'` actions render as advice; `actor: 'mazal'` actions render with a toggle and a Run button. Mazal never offers to execute something it cannot execute.

```ts
/** The pre-flight answer. */
export type Verdict = {
  decision: 'launch' | 'launch_small' | 'dont_launch';
  predictedRoas: { p10: number; p50: number; p90: number };
  breakEvenRoas: number;           // 1 / grossMargin
  killTrigger?: string;            // set when decision is 'launch_small'
};
```

Thresholds: `p90 < breakEven` → `dont_launch`. `p10 < breakEven < p90` → `launch_small`, and `killTrigger` must be set. `p10 > breakEven` → `launch`.

---

## Composite types

```ts
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
```

`FaultKind` lives in the contract, not in the simulator, and this is deliberate. B injects a `FaultKind`; A predicts a `FaultKind`; the backtest compares two values from a shared vocabulary. Neither package imports the other. It is what makes the firewall enforceable rather than aspirational.

```ts
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
  n: number;                       // rows behind it — printed in the UI
  source: 'olist' | 'kaggle_meta';
};

export type BenchmarkMetric =
  | 'cpm' | 'ctr' | 'atcRate' | 'icRate' | 'cvr' | 'aov'
  | 'price' | 'freightRatio' | 'deliveryDays'
  | 'reviewAvg' | 'photos' | 'descriptionLength';
```

`spread` in a `Finding` is derived from a `Distribution` as `(p75 − p25) / 1.349` — the robust estimate of sigma. Medians and quartiles survive the outliers that a real marketplace dataset is full of; means and standard deviations do not.

`Distribution.n` and `Distribution.source` exist so the UI can print *"7.1% median, n=4,812 Olist orders"* next to a finding. Two extra fields, and the accuracy argument makes itself.

```ts
/** Generated by B from Olist's product_category_name_translation.csv, English labels. */
export type OlistCategory = 'health_beauty' | 'bed_bath_table' | 'sports_leisure' | /* …71 more */ string;
```

`OlistCategory` is the one generated type in the contract — B emits it in SAT-A alongside `benchmarks.json`, and it is never hand-edited.

---

## Added after SAT-A

Six groups went in after the freeze. `AGENTS.md` allows additive changes and requires they be announced; the announcement was late and is in `docs/HANDOFF.md`. All of them are additive — new exported types, no renames, no removals, nothing made required — so anything that compiled against this file before still does.

### `ExecutableOp` — the type the spend guarantee rests on

```ts
export type ExecutableOp =
  | { op: 'pause_campaign' }
  | { op: 'reduce_daily_budget'; multiplier: number }   // (0, 1]
  | { op: 'set_frequency_cap'; perWeek: number };

// on Action:
execution?: ExecutableOp;
```

**This union is a promise, not a convenience.** Mazal can pause a campaign, slow it, or lower its budget, and there is no operation in the product that raises spend. Adding a spend-raising member here would break that silently, so it does not grow without a conversation — and `packages/engine/src/execution.test.ts` walks every fault at both cause layers to keep it true.

A multiplier above 1 is **rejected, not clamped**: turning "spend 3× more" into "change nothing" and reporting success is a no-op wearing a receipt.

### `ResponseCurve` — what the Allocator fits

```ts
export type ResponseCurve = {
  vMax: number;    // conversions per day at unlimited spend
  k: number;       // the spend at half of that
  alpha: number;   // held at 1 by the engine
  n: number;       // days of the campaign's own history behind it
  source: 'prior' | 'blended' | 'fitted';
  quality?: number;  // 0–1, how much day-to-day movement the fit explains
};
```

`source` is not decoration. A curve fitted to a campaign held at a flat daily budget is unidentifiable — the fit succeeds and returns a confident nonsense — so `fitCurve` refuses and labels it `blended` or `prior`. **Never present a curve as the seller's own unless `source` is `fitted`.**

`quality` is reported and deliberately never spent. Discounting a ceiling by it was tried and measured at −4.7% of achievable profit; `docs/allocator-results.md` says why.

### Peer comparison

```ts
export type LeverEvidence = 'replicates' | 'inconsistent';
export type SellerLeverName = 'price' | 'freightRatio' | 'deliveryDays' | 'photos' | 'descriptionLength';

export type SellerLever = { top: number; bottom: number; lift: number };
export type SellerBenchmark = { category, sellers, outcome, outcomeTop, outcomeBottom, percentiles, levers };
export type SellerBenchmarkTable = { replication; categories };
export type CardFinding = { lever, observed, peerMedian, percentile, betterSellers, evidence };
```

`CardFinding.evidence` is attached to **every** finding so a percentile is never quoted as though it predicted anything. Only 22 of the 62 categories have enough sellers for quartiles; the rest carry `levers: null`.

### Card provenance

```ts
export type FieldSource = 'stated' | 'inferred' | 'confirmed';
export type CardProvenance = Partial<Record<keyof ProductCard, FieldSource>>;
```

Absent fields are `stated`, so a hand-filled card needs no provenance and every existing caller keeps working. **Never render an `inferred` value as fact.**

### `Verdict.limitingFactor`

Names which stage caps the prediction, so "it will be fine" can say what would stop it.

### Simulator types

`LabelledCampaign` and `BacktestReport` live here rather than in `packages/sim` for the same reason the engine's types do: B injects the fault and A predicts it, and the backtest only means anything if neither side gets to define the shape it is scored on.

### Three edits to declarations that already existed

- `StoreEventType` is derived from a `STORE_EVENT_TYPES` const with the same seven members, so the runtime can iterate them. No member changed.
- `Benchmark.source` gained `'prior'` beside `'olist' | 'kaggle_meta'`.
- **`OlistCategory` was narrowed** from `'health_beauty' | ... | string` to the 62-member union generated from Olist's own CSV. The old form collapsed to `string` and typechecked nothing. This is the only change of the six that can reject input the previous type accepted.

---

## The public API of each package

These signatures are the handoff. They are what each brief's **Consume** section refers to.

```ts
// packages/engine
export function diagnose(input: DiagnoseInput): Diagnosis;
export function predict(input: PredictInput): Verdict;
export function buildPlan(diagnosis: Diagnosis, card: ProductCard): RecoveryPlan;

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
```

```ts
// packages/ingest
export function parseMetaCsv(text: string): { days: CampaignDay[]; warnings: string[] };
export function parseEventLog(text: string): StoreEvent[];
export const productCardSchema: z.ZodType<ProductCard>;
```

```ts
// packages/sim
export function generateCampaign(seed: number, fault?: FaultKind): LabelledCampaign;
export function runBacktest(campaigns: LabelledCampaign[]): BacktestReport;

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
```

```ts
// packages/data
export const benchmarks: BenchmarkTable;   // generated, committed, never hand-edited
```
