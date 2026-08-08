# mazal

sell shit make money

## Data

Category benchmarks in `packages/data` are derived from two public datasets. Only aggregate statistics — median, p25, p75 and n — are committed; the raw files stay in gitignored `data/raw/`.

- [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — 100k real orders, 2016–2018. Licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- [Facebook Ad Campaign dataset](https://www.kaggle.com/datasets/madislemsalu/facebook-ad-campaign) by Madis Lemsalu — 1,143 rows of ad performance.

Regenerate with `pnpm derive`. Media metrics (`cpm`, `ctr`, `cvr`, `atcRate`, `icRate`) are published priors, not measurements, and carry `n: 0` — `packages/data/derive.ts` says why.
