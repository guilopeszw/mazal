# A — Engine

## Own

`packages/engine`. The deterministic core: given a campaign's daily numbers, a product card, and an event log, it names the earliest stage of the funnel that is broken, says what caused it, and drafts the plan. Every number Mazal ever shows a seller comes out of this package.

This is the crown jewel. Judges will audit it. Nothing here calls an LLM.

## Firewall

**You do not read `packages/sim`.** Not the generator, not the fixtures, not the fault list beyond the `FaultKind` union in `packages/contracts`. B injects faults; you predict them; the backtest compares. If you look at how B deforms the metrics, the accuracy number is worthless and a judge will find out by asking one question.

Your own tests use hand-built fixtures in `packages/engine/test/fixtures.ts`, built from the contract. Never simulator output.

## Consume

From `@mazal/contracts`:

```ts
type CampaignDay, ProductCard, StoreEvent, Finding, Action, Verdict
type FunnelStage, CauseLayer, FaultKind, ReferenceMode, BenchmarkTable, Distribution
import { ctr, cpc, cpm, atcRate, icRate, cvr, cpa, aov, roas, costPerAtc, aggregate } from '@mazal/contracts/metrics';
```

From `@mazal/data`: `benchmarks: BenchmarkTable` — available once B commits it in SAT-A. Until then, hand-write a two-category stub in your own test fixtures.

**Never compute a rate inline.** Use the imported functions. A local `clicks / impressions` is how the two definitions of CTR get born.

## Produce

Three functions. Everyone else calls these and nothing else.

```ts
export function diagnose(input: DiagnoseInput): Diagnosis;
export function predict(input: PredictInput): Verdict;
export function buildPlan(diagnosis: Diagnosis, card: ProductCard): RecoveryPlan;
```

Signatures and result types are in [`docs/contracts.md`](../contracts.md). They are frozen. E wraps them as MCP tools; D renders their output.

## Do not touch

`packages/sim`, `packages/data`, `packages/ingest`, `apps/*`. `packages/contracts` after SAT-A.

---

## The algorithm

### Funnel leak localisation

Every metric belongs to exactly one stage. Stages are ordered. **The first stage that deviates from reference is the cause; everything downstream is a symptom.** That rule is the whole engine, and it is why Mazal never says "your ROAS is low" — a sentence with no information in it.

| Stage | Metrics | `causeLayer` | Min sample to flag |
|---|---|---|---|
| 0 Delivery | `impressions`, `cpm`, frequency (`impressions / reach`) | `media` | 1,000 impressions |
| 1 Attention | `ctr`, `cpc` | `media` | 1,000 impressions |
| 2 Landing | `bounceRate`, `sessions` | `experience` | 200 sessions — **skip the stage entirely if absent** |
| 3 Product interest | `atcRate`, `costPerAtc` | `product` | 100 clicks |
| 4 Intent | `icRate` | `experience` | 30 add-to-carts |
| 5 Purchase | `cvr`, `cpa` | `experience` | 100 clicks |
| 6 Economics | `aov`, `roas` | `offer` | 5 purchases |

**Stages 0–2 are a media problem. Stages 3–6 are a product, offer, or experience problem.** That dividing line is the product.

Below the minimum sample, a stage is not flagged. Not "flagged with low confidence" — not flagged. An agent that cries wolf on 40 clicks gets uninstalled, and this is the rule that stops it.

### Deviation scoring

```
spread    = (reference.p75 − reference.p25) / 1.349     // robust sigma
deviation = (observed − reference.median) / spread
```

Flag a stage when `deviation < −1.0` **and** the sample clears the minimum. Emit the earliest flagged stage as `severity: 'primary'`; all later flagged stages as `'secondary'`.

Two reference modes, one code path:

- `{ kind: 'benchmark', table }` — pre-flight, or a campaign with no history. Reference is the category row from `@mazal/data`.
- `{ kind: 'self', baselineDays }` — in-flight. Reference is the campaign's own trailing baseline, and the comparison window is the rolling 3-day mean. Change-point: the first date where the 3-day window crosses the threshold against the trailing baseline.

Use `aggregate(days)` for every window. A 3-day CTR is `ctr(aggregate(window))`, never the average of three daily CTRs — those are different numbers and the second one is wrong.

### Cause attribution

`Diagnosis.suspectedCause` is a `FaultKind`, derived deterministically from the primary stage plus the event log plus the product card. This is what the backtest scores, so it must always be set.

| Primary stage | Additional condition | `suspectedCause` |
|---|---|---|
| none flagged | — | `none` |
| every stage flagged, same date | — | `pixel_break` |
| 0 | `budget_change` event, or spend flat at a cap | `budget_cap` |
| 0 or 1 | frequency > 4 | `creative_fatigue` |
| 1 | otherwise | `creative_fatigue` |
| 3 | `stockout` event, or `card.stockOnHand === 0` | `stockout` |
| 3 | `price_change` event, or `card.price` above category p75 | `price_too_high` |
| 3 | otherwise | `thin_pdp` |
| 4 | `eta_change` event, or `card.deliveryEtaDays` above category p75 | `eta_shock` |
| 4 or 5 | otherwise | `checkout_friction` |
| 6 | — | `price_too_high` |

When a `StoreEvent` fires within ±1 day of the change-point and matches the stage, attach it to `Finding.evidence`. That attachment is what turns *"ATC collapsed"* into *"ATC collapsed the day your supplier ETA moved from 9 days to 22"* — the single most convincing sentence in the demo.

### Signatures

Six recognisable patterns. Real media buyers know these by sight, which is exactly why they belong in the demo.

| Pattern | Cause | Plan |
|---|---|---|
| Frequency > 4, CTR down, CPM stable | Creative fatigue | Refresh creative, expand audience, cap frequency |
| Impressions collapse, CPM up | Outbid, budget cap, or auction spike | Raise bid or accept lower volume |
| CTR stable, ATC → 0 | Stockout, price change, or a broken page | Check stock and price. The ad is fine — don't touch it. |
| ATC stable, IC down | Shipping cost or delivery ETA shock at cart | Free-shipping threshold, show the ETA earlier on the page |
| IC stable, CVR down | Payment failure, checkout bug, or trust | Test checkout, add a payment method, add trust signals |
| Everything down uniformly, sudden | Tracking break or policy action | Verify the pixel and account status before spending another real |

That last row earns its place: the most common real-world "my campaign died" cause is a broken pixel, and an agent that checks for it before recommending creative changes will land with anyone who has lived it.

### Prediction

```
ROAS = (ctr × atcRate × icRate × cvr × aov) / cpc
```

Draw each factor from its `Distribution` — account history when present, category prior when not — run 5,000 Monte Carlo samples, report p10 / p50 / p90.

Two properties make this defensible. It is **honest**: no history means a wide band, and Mazal says it cannot predict yet and names which factor to instrument first. It is **decomposable**: because ROAS is a product of factors, you can say *which* factor is dragging the band down, and that is the pre-flight recommendation.

If the cut ladder reaches Monte Carlo, replace it with a deterministic three-point evaluation — each factor at p25, median, p75 — same output shape, same visual, about fifteen minutes of work. The `Verdict` type does not change.

Verdict thresholds against `breakEvenRoas = 1 / card.grossMargin`:

- `p90 < breakEven` → `dont_launch`
- `p10 < breakEven < p90` → `launch_small`, and **`killTrigger` must be set** — name the metric and the threshold at which the seller kills it
- `p10 > breakEven` → `launch`

### Plans

`buildPlan` turns findings into `Action[]`. Each action carries the expected effect as a metric moving from its observed value to its reference value, a confidence, whether it is reversible, and `actor`.

`actor` is not decoration. A dropshipper cannot change a supplier's lead time, so an action that requires that is `actor: 'seller'` and renders as advice with no Run control. When the root cause is outside the seller's control, recommend *around* it: set the expectation on the page, change the offer, shift the audience to less impatient buyers. Mazal never offers to do what it cannot do.

When `causeLayer` is not `media`, emit **zero** media actions. Telling a seller whose product page is broken to refresh their creative is the exact failure the whole product exists to prevent.

---

## Deliverables by block

**SAT-A** — package scaffolded, importing `@mazal/contracts`, `pnpm --filter @mazal/engine test` runs. `diagnose` flags stage 3 against a benchmark reference, with a test. Hand-built fixtures file exists.

**SAT-B** — all seven stages flagged, earliest-wins ordering, minimum-sample gating, `suspectedCause` set for every branch of the table above. Self-mode reference and change-point detection. Six signatures matched. Each behaviour arrived by red → green → commit.

**SUN-A** — `predict` and the verdict thresholds. `buildPlan` emitting actions with `actor` set correctly. B runs the first backtest against your public API; you tune the *rules*, never against the held-out set.

**SUN-B** — final tuning frozen. Sit with E and check that every narration line traces to a real `Finding` field. If E's script says something the engine cannot produce, one of you is wrong and it is better to find out now.

## First commit

Write the failing test in `packages/engine/src/localise.test.ts` from [`docs/testing.md`](../testing.md) — the stage-3 one, copy it verbatim. Run it. Watch it fail. Then write the smallest `diagnose` that makes it pass: one stage, one metric, one reference mode. Commit.

Thirty minutes. Do not design the whole engine first.
