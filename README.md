# mazal

sell shit make money

## Data

Category benchmarks in `packages/data` are derived from two public datasets. Only aggregate statistics — median, p25, p75 and n — are committed; the raw files stay in gitignored `data/raw/`.

- [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — 100k real orders, 2016–2018. Licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- [Facebook Ad Campaign dataset](https://www.kaggle.com/datasets/madislemsalu/facebook-ad-campaign) by Madis Lemsalu — 1,143 rows of ad performance.

Regenerate with `pnpm derive`. Media metrics (`cpm`, `ctr`, `cvr`, `atcRate`, `icRate`) are published priors, not measurements, and carry `n: 0` — `packages/data/derive.ts` says why.

## The Allocator

`packages/engine/src/allocate.ts` fits a response curve per adset — conversions as a function of daily spend — and splits a budget so the next real earns the same wherever it lands. It never proposes a larger budget: `reallocate` reads the total the seller already spends and redistributes exactly that.

No neural network, no training step, no dependency, no randomness. That is the finding rather than the shortcut — see [`docs/allocator.md`](docs/allocator.md) for what is built, what deliberately is not, and the four sources it draws on:

- Jha, A., Sharma, P., Upmanyu, R., Sharma, Y. & Tiwari, K. (2024). *Machine Learning-Based Optimization of E-Commerce Advertising Campaigns.* ICAART 2024, vol. 2, pp. 531–541. [DOI](https://doi.org/10.5220/0012456700003636) — on this exact problem, linear regression scored R² 0.74 against 0.56 for LSTM.
- Hu, H., Cai, J. & Xu, C. (2026). *A Mathematical Framework for E-Commerce Sales Prediction Using Attention-Enhanced BiLSTM and Bayesian Optimization.* Math. Comput. Appl. 31(17). [DOI](https://doi.org/10.3390/mca31010017) — their Bayesian optimization formulation; their forecasting results are on their data, not ours.
- Liu, Y., Liang, X. & Liu, Y. (2022). *The Application of Mathematical Modeling in e-Commerce Mode in Digital Marketing Mode.* IEESASM 2022. [DOI](https://doi.org/10.25236/ieesasm.2022.004) — **concept only, not cited as evidence**; methodologically weak.
- Chua, M. (2025). *The Math Behind Going Viral.* mervynchua.com — **practitioner blog, not peer-reviewed**; the K-factor idea, which is not built.
