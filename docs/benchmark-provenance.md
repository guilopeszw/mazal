# Where each benchmark number comes from

`packages/data/benchmarks.json` holds twelve metrics for each of 62 categories. **Seven are measured from Olist. Five are published priors.** They are not the same kind of number and the deck must not present them as if they were.

This file exists because `AGENTS.md` says every number on screen traces to a function that produced it, and "we derived it from a Kaggle dataset" is only true of seven twelfths of this table.

## The seven measured from Olist

| Metric | Derived as | `source` | Typical `n` |
|---|---|---|---|
| `aov` | order total, items + freight, per order | `olist` | 37 – 30,000 |
| `price` | `order_items.price`, per item | `olist` | 38 – 30,000 |
| `freightRatio` | `freight_value / price`, per item | `olist` | 38 – 30,000 |
| `deliveryDays` | `order_estimated_delivery_date − order_purchase_timestamp` | `olist` | 37 – 30,000 |
| `reviewAvg` | `order_reviews.review_score` | `olist` | 37 – 30,000 |
| `photos` | `products.product_photos_qty` | `olist` | **9** – 3,000 |
| `descriptionLength` | `products.product_description_lenght` *(misspelled in the source)* | `olist` | **9** – 3,000 |

Two caveats carry into anything quoting these:

- **`deliveryDays` is the promised ETA, not the delivery that happened.** That is deliberate — the engine reasons about what the buyer saw on the product page — but it is not "how long Olist sellers actually took".
- **`photos` and `descriptionLength` are counted per distinct product, while `MIN_ORDERS` gates on orders.** Six categories clear 30 orders on fewer than 30 products; `tablets_printing_image` quotes both off `n: 9`. **Read `n` before quoting a benchmark to a seller.**

## The five priors

`cpm`, `ctr`, `cvr`, `atcRate`, `icRate` ship as published Brazilian-retail medians in BRL, carrying `source: 'prior'` and `n: 0`.

| Metric | median | p25 | p75 |
|---|---|---|---|
| `cpm` | R$22 | R$14 | R$34 |
| `ctr` | 1.1% | 0.7% | 1.7% |
| `cvr` | 2.1% | 1.2% | 3.4% |
| `atcRate` | 8.0% | 4.5% | 12.0% |
| `icRate` | 45% | 32% | 60% |

**They are estimates written from published industry medians, not measurements, and no per-number citation exists.** That is the honest state of it. `n: 0` marks the kind; this file marks the provenance.

### Why the Kaggle ad dataset was not used

`madislemsalu/facebook-ad-campaign` is in `data/raw/` and `pnpm derive` measures it on every run. It reports:

```
KAG_conversion_data.csv measures cpm 0.2452, ctr 0.0002, cvr 0 over 1139 rows.
Shipping published BRL priors instead: cpm 22, ctr 0.011, cvr 0.021, all n=0.
```

78.5M impressions against 13,293 clicks is a **0.017% CTR at a CPM of 0.26** in an unstated currency, and zero measured conversions. Whatever that is, it is not Brazilian retail media in 2026, and the first judge who has bought media would say so. Shipping it as a benchmark would lose the room; shipping a prior and saying it is a prior does not.

## What slide 6 must say

One sentence, not a footnote:

> Seven of the twelve benchmarks are computed from 97,000 Olist orders. The five media rates are published priors, marked `n: 0` in the data and on screen — the ad dataset we had measures a 0.017% CTR, which is not this market.

And the coverage line, which is stronger than it sounds:

> 62 of Olist's 71 categories, covering **99.84%** of orders. The nine we skip have 159 orders between them.

## Reproducing all of it

```
pnpm derive        # rewrites benchmarks.json and the OlistCategory union
```

Byte-identical on a rerun. Raw CSVs stay in gitignored `data/raw/` — Olist is CC BY-NC-SA, and only aggregates are committed.
