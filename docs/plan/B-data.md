# B — Data and simulator

## Own

`packages/data` — real-world benchmark distributions, derived from public datasets and committed as JSON.

`packages/sim` — the causal simulator that generates labelled campaigns, and the backtest harness that measures whether the engine recovers the hidden cause.

You are the reason the accuracy number means anything. You are also the only person who touches raw data files.

## Firewall

**You do not read `packages/engine`'s source.** You call its public API — `diagnose(input)` — and score what comes back. You never look at how it decides.

You own the fault labels. If A sees how you deform the metrics, A can fit to your generator, and the backtest becomes a machine that grades its own homework. A judge will spot it, and it will be the worst moment of the presentation.

## Consume

From `@mazal/contracts`: `CampaignDay`, `ProductCard`, `StoreEvent`, `FaultKind`, `BenchmarkTable`, `Benchmark`, `Distribution`, `OlistCategory`, and the metric functions.

From `@mazal/engine`: `diagnose` and its `Diagnosis` type. Nothing else.

## Produce

```ts
// packages/data
export const benchmarks: BenchmarkTable;                  // generated, committed, never hand-edited
export type { OlistCategory };                            // generated union, English labels

// packages/sim
export function generateCampaign(seed: number, fault?: FaultKind): LabelledCampaign;
export function runBacktest(campaigns: LabelledCampaign[]): BacktestReport;
```

Shapes are in [`docs/contracts.md`](../contracts.md).

Also produce, as committed files: `packages/sim/fixtures/demo-case1.json` and `demo-case2.json` — the exact two campaigns the demo runs on, generated from fixed seeds so every machine produces identical numbers.

## Do not touch

`packages/engine` source, `packages/ingest`, `apps/*`. `packages/contracts` after SAT-A.

---

## Part 1 — Benchmarks from real data

### Sources

**[Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)** — 100,000 real orders from Brazilian marketplaces, 2016–2018. This is where the product layer becomes real:

| Olist column | Feeds |
|---|---|
| `price` (order_items) | `price` distribution per category |
| `freight_value` (order_items) | `freightRatio` = freight / price |
| `order_estimated_delivery_date` − `order_purchase_timestamp` (orders) | `deliveryDays` |
| `review_score` (reviews) | `reviewAvg` |
| `product_photos_qty` (products) | `photos` |
| `product_description_lenght` (products) | `descriptionLength` — note the typo, it is in the source data |
| `product_category_name` + `product_category_name_translation.csv` | the `OlistCategory` union |
| order totals per order | `aov` |

**[`madislemsalu/facebook-ad-campaign`](https://www.kaggle.com/datasets/madislemsalu/facebook-ad-campaign)** — 1,143 real rows of Meta ad performance: impressions, clicks, spend, conversions. Feeds `cpm`, `ctr`, `cvr`, and the shape of their variance. It has no mid-funnel, so `atcRate` and `icRate` priors are derived from published category medians and flagged in the JSON as `source: 'kaggle_meta'` where they are not directly measured. Say which is which — do not launder an estimate as a measurement.

### Licence

Olist is CC BY-NC-SA. Non-commercial use is fine for this; share-alike is why **raw CSVs never enter the repo.**

- Download to `data/raw/`, which is gitignored.
- `pnpm derive` reads `data/raw/` and writes `packages/data/benchmarks.json` — **aggregate statistics only**: median, p25, p75, and n, per metric per category. No rows, no identifiers, no free text.
- Attribute both datasets in the README with links.

You are the only person who needs the raw files. Nobody else downloads anything: they `git pull` and import `benchmarks`. If someone else does need raw access later, they download it themselves in three minutes — do not put a 45MB zip in a group chat and start a conversation about which version everyone has.

### The derivation script

One TypeScript file, `packages/data/derive.ts`, run by hand, output committed. No Python, no notebooks, no pandas — at hour 30 nobody should need a second toolchain installed to regenerate a number.

Print the row counts as it runs. `n` per distribution goes into the JSON and gets shown in the UI next to every reference value, which is most of the accuracy argument for free.

---

## Part 2 — The causal simulator

### Direction: cause first, effect second

This is the whole point. Do not generate metrics and then label them. Generate:

1. **Sample a store** — category, price, margin, AOV, delivery ETA, review count and average, photo count, description length, stock. Draw each from the Olist distributions you just derived, so a simulated store is a plausible Brazilian store rather than a made-up one.
2. **Sample a campaign** — daily budget, audience size, creative quality.
3. **Inject exactly one fault**, or none, from the `FaultKind` union.
4. **Forward-simulate 30 days** of daily funnel counts with realistic noise, where the fault deforms exactly the stages it should and nothing else.
5. **Store the label separately** from the metrics.

Emit `CampaignDay[]` — counts, never rates. The metric functions derive the rest.

Also emit the `StoreEvent[]` the fault would have produced in the real world: a stockout writes a `stockout` event, an ETA shock writes an `eta_change` with the detail string `"supplier ETA 9d → 22d"`. The event log is how the engine turns a broken stage into a named cause, so a simulated fault that leaves no trace in the event log is not simulating reality.

### The faults

| `FaultKind` | Deforms | Shape |
|---|---|---|
| `none` | nothing | healthy campaign with normal noise — **the most important class** |
| `stockout` | stage 3 | ATC → near zero from a day, CTR unchanged |
| `eta_shock` | stage 4 | IC rate collapses from a day, ATC unchanged |
| `creative_fatigue` | stages 0–1 | frequency climbs past 4, CTR decays gradually, CPM flat |
| `price_too_high` | stages 3, 6 | ATC depressed from day one, AOV fine — a pre-flight fault, not a break |
| `checkout_friction` | stage 5 | CVR depressed, IC fine |
| `pixel_break` | all | everything drops to near zero on one day |
| `budget_cap` | stage 0 | impressions flatten, CPM rises, spend pinned |
| `thin_pdp` | stage 3 | ATC depressed from day one, with a low photo count and short description on the card |

Note which are **breaks** (start mid-campaign, Case #2) and which are **conditions** (present from day one, Case #1). Both matter; they exercise the two reference modes.

`none` deserves the most care. False alarms are what get an agent uninstalled, and the false-alarm rate is the number a judge who has shipped a monitoring product will ask about first.

### The backtest

Generate 400 labelled campaigns. **Hold out 100 that A never sees**, and do not show A a per-class breakdown of the held-out set — only the aggregate.

`runBacktest` reports:

- **top-1** — `diagnosis.suspectedCause === fault.kind`
- **top-2** — correct within the primary or the strongest secondary finding's implied cause
- **false-alarm rate** — fraction of `fault: 'none'` campaigns where `primary !== null`
- **confusion matrix** — `FaultKind` × `FaultKind`, for the slide

Report what you measure. If a class does badly, say which and why on the slide — *"we confuse pixel breaks with policy blocks because both flatten everything at once, and here is how we would separate them"* is a stronger answer than a suspicious 99%, and it is the kind of sentence that wins slide 6.

**No tuning against the held-out set after looking at it.** If A wants to improve, A improves the rules against the training half and you re-run.

---

## Deliverables by block

**SAT-A** — Kaggle datasets downloaded to gitignored `data/raw/`. `derive.ts` written. `benchmarks.json` and the `OlistCategory` union committed. **This unblocks A and D, so it is the first thing that ships this weekend.**

**SAT-B** — `generateCampaign` producing 30-day series for `none`, `stockout`, and `eta_shock`, with matching event logs. Eyeball one series per fault: does the chart look like something a media buyer would recognise? If it does not, the backtest number is meaningless.

**SUN-A** — all nine fault kinds. 400 campaigns generated, 100 held out. First backtest run against A's public API. **A real accuracy number in hand by 13:00.**

**SUN-B** — final backtest, confusion matrix exported for the deck, calibration check if it survives the cut ladder. Demo fixtures seeded, committed, verified byte-reproducible on a second machine.

## First commit

Download Olist. Write `derive.ts` far enough to emit one category's `price` distribution — median, p25, p75, n — and commit the JSON. That single number unblocks A's reference mode and D's UI copy.

Thirty minutes. Do not build the simulator first; four people are waiting on the benchmarks.
