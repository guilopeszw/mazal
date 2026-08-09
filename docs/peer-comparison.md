# Peer comparison — where a seller stands in their market

`diagnose` asks what broke in a campaign. This asks a different question: **what is different about this store compared to the stores it competes with.** Same data set, different question, separate export — `profileCard(card, sellerBenchmarks)`.

## What it cannot do, and neither can anyone else

**You cannot compare a seller to a named competitor.** Meta does not expose anyone's campaign performance to anyone. The Ad Library gives you a competitor's *creative* and never their CTR, CVR or ROAS. Any product implying otherwise is guessing or lying, and a judge who buys media knows it.

What is available is the **distribution that competitor sits in**. If Mateus sells the same category, we cannot see his numbers — but we can say what the sellers who out-perform in that category do differently, from 97,000 public Olist orders. For the product layer that is most of the value, and it is honest.

## What a "seller" is here

A seller **within one category**. The same shop sells brooms and headphones and is a different competitor in each, so `health_beauty|seller_x` and `housewares|seller_x` are separate rows.

A seller qualifies at **≥10 sales and ≥5 reviews**. Below that their own averages are noise.

## Two gates, because there are two questions

| question | needs | categories |
|---|---|---|
| where does this card sit? (percentiles) | ≥20 qualifying sellers | **22** of 62 |
| what do the better sellers do differently? (levers) | ≥30, so a quartile is more than four shops | **18** of 62 |

A category below a gate gets **nothing** for that question. `profileCard` returns `[]` rather than a thin answer, the same discipline as `n: 0` on the media priors.

Loosening to ≥5 sales and ≥15 sellers would reach 36 categories and mean shops with five sales defining a quartile. That is not a number worth defending.

## What "better" means — and it is a proxy

Sellers are ranked by **mean review score**. It is the only quality signal Olist carries per seller.

**Order volume was considered and rejected.** Top-reviewed sellers have *fewer* orders in every category measured — −55% in `health_beauty`, −23% in `housewares`, −6% in `sports_leisure`. Ranking on volume would have inverted the question.

Review score is not campaign performance. Say "better-reviewed sellers", never "sellers with better campaigns".

## The finding: one lever replicates, four do not

Across all 18 categories with quartile data, comparing the top quartile of sellers by review score against the bottom:

| lever | direction agrees | median lift |
|---|---|---|
| **`deliveryDays`** | **16 / 18 (89%)** | **−7%** |
| `price` | 11 / 18 (61%) | +10% |
| `freightRatio` | 9 / 18 (50%) | +1% |
| `photos` | 9 / 18 (50%) | +4% |
| `descriptionLength` | 9 / 18 (50%) | +3% |

**Better-reviewed sellers promise shorter delivery.** That is the only one that holds up. Freight ratio, photo count and description length are coin flips at 9 of 18 — indistinguishable from noise.

An earlier read of three categories suggested freight ratio was the lever. It was not; it was an artifact of the sample. The number above is every category with the data.

**Every `CardFinding` carries an `evidence` field** — `'replicates'` or `'inconsistent'` — for exactly this reason. It is **computed by `pnpm derive` and shipped in `seller-benchmarks.json`**, not written into the engine by hand: a kept-by-hand table of facts about the data becomes a lie the first time the data is re-derived, and nothing would catch it. The threshold is two thirds of categories agreeing on direction. A percentile is interesting on its own and misleading without it: a seller told their photo count is p20 will go and add photos, and nothing in this data says that changes anything.

Findings sort worst-placed first, with a replicating lever outranking an inconsistent one at the same percentile, so the first line a seller reads is the one worth acting on.

## Why this matters for the product

Delivery ETA is a **product-layer** variable. It does not appear in Ads Manager, no media tool can see it, and it is the single thing that separates sellers who do well from sellers who do not. That is the thesis of the whole product — *stages 0–2 are a media problem; 3–6 are a product, offer or experience problem* — arriving independently out of the seller data.

It is also what `eta_shock` already diagnoses in-campaign. The pre-flight and the in-flight answer point at the same lever.

## Reproducing

```
pnpm derive     # writes benchmarks.json, categories.ts and seller-benchmarks.json
```

Byte-identical on a rerun. Raw Olist stays in gitignored `data/raw/`; only aggregates are committed, and no per-seller row is ever published — the file carries quartiles, never the sellers behind them.
