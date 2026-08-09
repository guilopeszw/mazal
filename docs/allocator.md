# The Allocator

The diagnostic engine answers *"what's broken?"* The Allocator answers the next question: **"given what I can spend, what is the most I can make, and how far from it am I standing?"**

It lives in `packages/engine/src/allocate.ts`. Full plan and reasoning in [`optimization.md`](../optimization.md); this file records what is actually built and where the ideas came from.

## What is built

Layers 1 and 2 of the plan, and nothing else.

| | | |
|---|---|---|
| **Layer 1 — response curves** | `fitCurve`, `priorCurve`, `valueAt` | built |
| **Layer 2 — marginal-return allocation** | `allocate`, `reallocate`, `marginalRevenue` | built |
| Layer 3 — bandits / Bayesian optimization | — | not built |
| Layer 4 — effective ROAS with organic amplification | — | not built |
| Layer 5 — archetype clustering | — | not built |

Layers 3–5 need live evaluation loops or data we do not have. A solver that always converges is worth more than a half-built one that sometimes does.

## The two objects

**The response curve.** Conversions per day as a function of daily spend, per adset:

```
V(s) = vMax · s^α / (k^α + s^α)
```

`vMax` is the ceiling, `k` the spend at which half of it is reached, `α` how sharply it bends.

**α is fixed at 1 rather than fitted.** That leaves two free parameters instead of three, which a seller with nine days of history can actually identify, and at α ≤ 1 the curve is concave everywhere — which is what makes the allocation exactly solvable. Above 1 the curve gains an S-bend, the marginal return stops being monotone, and a solver can settle on a local optimum. A parameter we cannot estimate honestly, which also costs us the guarantee, is not worth having.

For a fixed `k` the best `vMax` is closed-form, so the fit is a one-dimensional geometric sweep over `k` with two refinement passes. No gradients, no initialisation, no local minima, and the same input always returns the same answer.

**Cold start.** Below eight days of the campaign's own history the fit is pulled toward the category prior in proportion to the evidence behind it, and `ResponseCurve.source` reports which of `prior` / `blended` / `fitted` you are looking at. A curve that is mostly its category must not be shown as though the seller's own campaign had earned it.

**The allocation.** Equal marginal return: at the optimum the next real earns the same wherever it lands. If it did not, moving money from the low adset to the high one would pay. Solved by bisection on the shared marginal — exact, instant, deterministic.

That is also why *"put everything on the best adset"* is wrong, and both baselines are pinned as tests: **the best adset fills up.**

## Why it cannot raise a seller's spend

`allocate` takes the budget as an input and returns a split that sums to it. `reallocate` does not choose a budget at all — it reads the total the seller already spends and redistributes exactly that, so the moves sum to zero by construction rather than by a check someone could forget.

`profitMaxBudget` — where the last real earns back exactly itself — is reported so a seller can spend **less**. Sellers routinely spend past that point and read rising revenue as scaling working, while profit is already falling.

This keeps the Allocator inside the guarantee the rest of the product holds to: no operation in Mazal can increase what a seller spends.

## Model selection

Simple, and deliberately so. No neural network, no training step, no dependency, no randomness — every number here is closed-form or a bisection.

That is not a shortcut, it is the finding. Jha et al. ran LSTM, GRU and RNN against linear regression and gradient boosting on exactly this problem — 2M rows of Amazon campaign data — and the deep models lost: **R² 0.56–0.57 against 0.74 for linear regression.** Their own words are that the deep models "were not easily explainable, and the data required was quite large." They preferred an explainable approach for that reason.

Hu et al. reach the same conclusion from the other side, justifying a smaller model over attention-heavy ones on the grounds that those **overfit small, volatile datasets** — which is this data regime exactly.

On ad campaign optimization, simple beats deep and explainable beats both. Mazal already holds that the LLM never does arithmetic; this extends it — the arithmetic is not a neural net either.

## Sources

The ideas here are taken from four sources of unequal weight, and the difference matters:

- **Jha, A., Sharma, P., Upmanyu, R., Sharma, Y. & Tiwari, K. (2024).** *Machine Learning-Based Optimization of E-Commerce Advertising Campaigns.* ICAART 2024, vol. 2, pp. 531–541. DOI: [10.5220/0012456700003636](https://doi.org/10.5220/0012456700003636)
  Peer-reviewed and directly on topic. The model-selection argument above is theirs, as is the observation that log CPC ↔ log ACOS is the frame to work in.

- **Hu, H., Cai, J. & Xu, C. (2026).** *A Mathematical Framework for E-Commerce Sales Prediction Using Attention-Enhanced BiLSTM and Bayesian Optimization.* Mathematical and Computational Applications 31(17). DOI: [10.3390/mca31010017](https://doi.org/10.3390/mca31010017)
  Peer-reviewed and recent. **We take the second half, not the first** — their BiLSTM forecasts on a large dataset and their reported RMSE/MAPE/R² is on their data, not ours; it is not quoted as though it transfers. Their Bayesian optimization formulation is the basis of Layer 3, which is **not built**.

- **Liu, Y., Liang, X. & Liu, Y. (2022).** *The Application of Mathematical Modeling in e-Commerce Mode in Digital Marketing Mode.* IEESASM 2022. DOI: [10.25236/ieesasm.2022.004](https://doi.org/10.25236/ieesasm.2022.004)
  **Concept only — not cited as evidence.** Its three references are to papers on hydrology, fish taxonomy and information retrieval in digital cities, unrelated to its own content. We take one idea: the profit skeleton `F = [(P − d) − C₁]·Q − C₂ − Cₙ` where quantity is a function of price, discount and ad spend. The paper states that relationship and never estimates it. `fitCurve` estimates it — that is the whole feature in one line.

- **Chua, M. (2025).** *The Math Behind Going Viral.* mervynchua.com
  **A practitioner blog post, not research.** Source of the K-factor amplification idea behind Layer 4, which is **not built**. If it is ever built, K is estimated from proxies, carries wide error bars, and must be shown as a range labelled *modelled estimate* — an over-claimed K is the one place this feature could deservedly be torn apart.
