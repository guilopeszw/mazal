# Mazal — The Allocator

**Feature plan: optimization, regression and ML for best campaign outcome per real spent**
Companion to `prd.md` · derived from four source papers

---

## 0. What this feature is, in one sentence

The diagnostic engine in the PRD answers *"what's broken?"* The Allocator answers the next question — **"given what I can spend, what is the most money I can make, and how far from it am I right now?"**

The whole feature reduces to one object the seller sees: **the response curve.** Spend on the x-axis, profit on the y-axis, a dot for where they are, a dot for where they could be. Everything below is how you compute those two dots honestly.

---

## 1. What each paper actually gives you

Being precise about this matters, because two of these papers are strong and two are not, and you should use them differently.

### Jha et al., ICAART 2024 — *ML-Based Optimization of E-Commerce Advertising Campaigns*
**Peer-reviewed, directly on-topic. The most useful paper in the set.**

Its most valuable contribution to you is a **negative result you can lean on**. They ran LSTM, GRU, RNN against linear regression, gradient boosting and SVM on exactly this problem (Amazon campaign data, 2M rows). The deep models lost:

| Model | R² | Classification accuracy |
|---|---|---|
| Linear Regression | **0.74** | — |
| LSTM | 0.56 | — |
| GRU | 0.57 | — |
| RNN | 0.56 | — |
| Gradient Boosting | — | 0.74 |
| SVM | — | **0.86** |

Their words: the deep models "were not easily explainable, and the data required was quite large. Hence, we resorted to first using simpler ML models." They ultimately preferred a **joint probability distribution / Gaussian** approach explicitly *because* it was explainable.

That's your model-selection argument, published and citable: **on ad campaign optimization, simple beats deep, and explainable beats both.** You already committed to "the LLM never does arithmetic." This extends it: *the arithmetic isn't a neural net either.*

Also take:
- **ACOS** = (ad cost / sales through ad) × 100 — the inverse of ROAS, and the metric sellers actually feel. Worth showing alongside ROAS.
- **log(CPC) ↔ log(ACOS)** shows a real relationship; work in log space for the spend regressions.
- **k-means + BIC** to cluster campaigns into performance archetypes (see §5).
- **Decision tree predicting ROAS from bid values: 87.98% accuracy — rising to 90.92% when restricted to the top 20th percentile of bid data.** Note what that means: the model gets better when you *narrow it to the regime you care about*. Fit your curves per-regime rather than globally.
- **Joint probability curves over (bid, budget) → (ROAS, impression share)**, so you can answer "how does profitability change if I move the budget?" as a *distribution*, not a point. This is the same object as the PRD's p10–p90 ROAS band. Reuse the machinery.

### Hu, Cai & Xu, *Math. Comput. Appl.* 2026 — *Attention-Enhanced BiLSTM and Bayesian Optimization*
**Peer-reviewed, recent (published January 2026), strong. But take the second half, not the first.**

The BiLSTM is not your model — it forecasts cross-border sales volume on a large dataset, and you have neither the data nor the hours. Their reported RMSE 13.2 / MAPE 8.7% / R² 0.92 is on their data, not yours; don't quote it as if it transfers.

**The transferable gift is Bayesian optimization**, and it's the single most important idea for "best results for the least money."

They use it to tune hyperparameters. You use the identical machinery to tune *campaign parameters*. The formulation is the same:

```
θ* = argmin  L(θ)         over a bounded feasible space Θ
L(θ) ~ GP(μ(θ), k(θ,θ') + σ²)          ← Gaussian Process surrogate
EI(θ) = (f_best − μ)·Φ(z) + σ·φ(z)     ← Expected Improvement acquisition
```

Why this is *the* right tool: Bayesian optimization is designed for **expensive black-box functions** — where each evaluation costs real money and you can only afford a few. That is precisely a seller testing an ad configuration. Grid search and "test everything" are what sellers do now; BO is the formal version of "test the fewest things to find the best one."

One more thing worth stealing: they justify BiLSTM over Transformers on the grounds that attention-heavy models **overfit small, volatile datasets**. That's your data regime exactly, and it's a second published citation for staying simple.

### Liu, Liang & Liu, 2022 — *Mathematical Modeling in e-Commerce Digital Marketing*
**Weakest of the four. Use one idea from it; do not cite it as evidence.**

Be aware of what you're holding: its three references are to papers on hydrology, fish taxonomy, and information retrieval in digital cities — unrelated to its own content. It's a padded conference paper. Also the oldest (2022), against your "recent" filter.

But it contains one genuinely good **UI** idea. It applies **Earned Value Management** — a 1967 US DoD project-control framework — to marketing performance:

```
Price/cost variance   PV  = planned − actual cost
Volume variance       SV  = actual − planned volume
Cost Performance      PPI = planned / actual cost      >1 = under budget
Schedule Performance  SPI = actual / planned volume    >1 = ahead of plan
```

Two ratios, both centred on 1, both instantly readable: **above 1 is good, below 1 is bad.** For a seller on a busy day, that is a far better headline than fourteen metrics. Take the framework, drop the paper.

And its profit function is a correct, useful skeleton for your objective:

```
F = [(P − d) − C₁]·Q − C₂ − Cₙ
Q = f(P, d, C₁, A, M, T)
```

Profit = unit margin after discount × quantity − fixed − marketing. Quantity is a *function of* price, discount, and ad spend. **That function Q(·) is exactly what the Allocator estimates.** The paper states the relationship and never estimates it; you estimate it. That's the whole feature in one line.

### Chua, 2025 — *The Math Behind Going Viral*
**A consultant's blog post, not research. Treat the number as a modelled estimate, never a measurement.**

The idea worth taking is the **K-factor**: `K = i × c` (invites per user × conversion rate of invites), with K > 1 meaning self-sustaining growth.

Straight K-factor is a SaaS invite metric and does not port to a Shopee seller. But the *amplification* concept does, and it's what makes Mazal's optimizer different from every bid optimizer on the market:

```
effective_conversions = paid_conversions / (1 − K),   for K < 1
```

A campaign with K = 0.4 delivers **1.67× the conversions it paid for** through the organic tail — shares, saves, word of mouth, repeat purchase. A campaign with K = 0 buys exactly what it pays for and stops.

**Consequence for the optimizer:** you should maximise *effective* ROAS, not paid ROAS. A creative with a lower paid CTR but a much higher share/save rate can be the better buy, and no bid optimizer on the market will ever tell a seller that, because they only see the paid ledger.

Be honest in the UI and on stage: K is estimated from proxies (share rate, save rate, referral traffic lift, repeat-purchase rate within N days), it carries wide error bars, and you display it as a range with a "modelled estimate" label. An over-claimed K would be the one place this feature could deservedly get torn apart.

---

## 2. The math stack

Five layers. Build them in this order; each is useful alone.

### Layer 1 — Response curves (regression)

Everything rests on one estimated function: **conversions as a function of spend**, per adset. Two standard forms, both concave, both with 2–3 parameters:

```
Hill / saturation:     V(s) = V_max · s^α / (k^α + s^α)
Exponential:           V(s) = V_max · (1 − e^(−λs))
```

`V_max` = ceiling (how big the addressable demand is), `k` = the spend at which you hit half the ceiling, `α` = how sharply it bends.

**Fit hierarchically.** This is how you solve the cold-start problem the PRD already flagged. A new campaign has almost no data, so its curve is mostly the **category prior**; as its own data accumulates, the fit shifts toward its own evidence. Partial pooling is the statistically correct answer to sparse data, and it is the same shrinkage logic already behind the PRD's p10–p90 band — one idea, two uses.

Fit in log space where the relationship is multiplicative — Jha et al. found the log CPC ↔ log ACOS relationship significant, which is a hint that log-space regression is the right frame here.

**Why this single object matters more than anything else in the feature:** diminishing returns is why doubling budget does not double sales. Every seller half-knows this and none of them can see it. Showing them their own curve is the moment the product justifies itself.

### Layer 2 — Marginal-return allocation (optimization)

Given a curve per adset, the optimal split of a fixed budget follows one principle:

> **Equal marginal return.** At the optimum, the next real spent anywhere earns the same. If it doesn't, move money from the low-marginal adset to the high-marginal one.

Formally: maximise `Σ margin·Vᵢ(sᵢ) − Σsᵢ` subject to `Σsᵢ ≤ B`, plus per-adset floors/caps and a minimum-volume constraint so you don't starve an adset below Meta's learning phase.

Because the curves are concave, **this is a convex problem** — exactly solvable, fast, and deterministic. No black box, no training, no GPU. A projected-gradient or water-filling solver is a couple hundred lines. It always returns the same answer for the same input, which matters for a demo.

Three outputs, each a sentence a seller understands:

1. **The reallocation.** *"Move R$40/day from Adset B to Adset A → +R$180/week at exactly the same spend."* Free money, no extra budget. This is the headline.
2. **The profit-maximising budget** — where marginal ROAS falls to break-even. Almost always *lower* than the revenue-maximising budget. Sellers routinely spend past this point and think scaling is working because revenue still rises while profit falls. Naming that is genuinely valuable.
3. **The efficient frontier** — sweep total budget, plot max achievable profit at each level. That's the chart.

**This layer is the one to build first.** It needs no ML libraries, no training data, and no dependencies — and it alone produces both the hero chart and the headline sentence.

### Layer 3 — Sequential experimentation (Bayesian optimization + bandits)

This is where "least amount of money" is actually earned, and it comes straight from Hu et al.

**In-flight → contextual bandit (Thompson sampling).** Across live variants (creative × audience × placement), allocate the next impression share in proportion to each variant's probability of being best. It converges on the winner while progressively starving the losers. A fixed 50/50 A/B split keeps paying full price for the loser until the test ends; a bandit doesn't. Same information, less money — which is the entire product promise, expressed as an algorithm.

**Pre-flight → Bayesian optimization.** Over continuous knobs (daily budget, bid cap, audience breadth, discount depth), fit a GP surrogate and pick the next configuration by Expected Improvement. Each real-world evaluation costs money and days, which is exactly the regime BO exists for.

Cold-start honesty: with no history, BO's first proposals come from running the acquisition function over your **causal simulator**, not over the seller's account. Say so plainly — it's a warm start from a prior, and it's still better than a guess.

Seller-facing framing, no jargon: *"Mazal is testing four versions. It's already moved most of your budget onto the two that are working. Expected to pick a winner in 3 days instead of 9, for R$310 less."*

### Layer 4 — Effective ROAS (organic amplification)

Apply the K-factor multiplier from Chua so the optimizer's objective is `effective ROAS`, not `paid ROAS`. Estimate K from share rate, save rate, direct/organic traffic lift during the campaign window, and repeat purchase within 30 days. Regularise it hard toward zero — the prior should be "no amplification" and the data has to earn its way up.

This changes recommendations in a way nothing else on the market does. Ship it labelled as an estimate with a visible range.

### Layer 5 — Archetypes (clustering, from Jha et al.)

k-means with BIC-selected k over campaign feature vectors, then hand-label the clusters in plain Portuguese/English:

- **Hungry** — marginal ROAS well above break-even. Spend more.
- **Saturated** — on the flat part of the curve. More budget buys nothing.
- **Fatiguing** — frequency climbing, CTR decaying. Refresh creative.
- **Leaky** — media healthy, funnel losing people below the click. (Hands straight off to the PRD's diagnostic engine.)
- **Dead** — broken. Stop.

Two jobs: it gives a brand-new campaign a prior by matching it to its nearest cluster (cold start again), and it gives the dashboard a **label**. Sellers remember "your campaign is Saturated" and act on it. They do not remember a marginal ROAS of 0.97.

---

## 3. Model selection — the defensible stance

Write this down and say it on stage, because it's evidence-backed and most teams will have the opposite instinct:

| Job | Model | Why |
|---|---|---|
| Response curves | Hierarchical Hill/exponential regression | Concave by construction, 3 parameters, works on tiny data |
| Budget allocation | Convex optimization | Exact, instant, deterministic, auditable |
| Tabular prediction (ROAS, CPA) | Gradient boosting | Jha et al.: GB/SVM beat LSTM/GRU/RNN on this exact problem |
| Configuration search | Bayesian optimization (GP + EI) | Hu et al.: built for expensive evaluations |
| Live variant allocation | Thompson sampling | Spends less on losers than A/B |
| Archetypes | k-means + BIC | Jha et al.; gives cold-start priors and human labels |
| Uncertainty | Monte Carlo over fitted factor distributions | Already in the PRD; reuse |
| **Deep learning** | **None in v1** | **Both papers say it overfits small volatile data and can't explain itself** |

BiLSTM earns a place only once a seller has 12+ months of daily history across many SKUs — which is a real V3 feature, not a hackathon one. Put it on the roadmap slide as "when the data earns it." Saying *no* to the fashionable model, with two citations, reads as judgment rather than limitation.

---

## 4. The dashboard

Design rule, and hold it against every addition: **one number, one curve, one action.** Everything else is a drill-down behind a click. Your user is mid-shift with WhatsApp going off.

### Screen 1 — The Money Line

**Hero number** (largest element on the page, no chart at all):

> ### You're leaving R$1,240 on the table this month.
> Same budget. Different split.

That's the gap between their current point and the optimum. If the gap is near zero, it says so and congratulates them — a tool that sometimes says "you're fine" is a tool people trust.

**The one chart.** Spend (x) against profit (y). Single axis, single series:

- the fitted response curve
- a shaded uncertainty band around it
- **You are here** — a labelled dot
- **Best point** — a second labelled dot
- a horizontal break-even line
- the region past the profit-max point shaded as "overspending"

Direct-label those two dots. No legend needed for one series. Never put revenue and profit on two y-axes — if you want both, that's two stacked charts sharing an x-axis.

**Two indices** (the EVM idea, renamed for humans — no one says "Cost Performance Index"):

```
Efficiency   1.14  ↑     getting more per real than planned
Pace         0.87  ↓     behind on volume
```

Above 1 good, below 1 bad, arrow and word alongside the color so it never reads by color alone.

**Four tiles, not fourteen:**

| Tile | Shown as |
|---|---|
| ROAS | value vs. break-even line |
| CPA | value vs. target |
| Effective ROAS | with the organic tail, labelled *estimate* |
| **Marginal ROAS** | **what the *next* real earns** |

Marginal ROAS is the one nobody else displays and the only one that answers "should I spend more?" Make it the tile that draws the eye.

The full fourteen metrics from your list live one click down, grouped by funnel stage so they inherit the diagnostic engine's structure. Don't delete them — demote them.

### Screen 2 — The Moves

Ranked action cards. Each shows: what changes, expected effect **with a range**, confidence, cost to test, whether it's reversible. Same consent flow the PRD already specifies — **Run all · Edit first · I'll do it myself**. Editing an action re-runs the optimizer and visibly moves the "best point" dot on Screen 1. That live coupling between an edit and the chart is the most persuasive interaction in the product; it's worth real polish time.

### Screen 3 — Where the money goes

Horizontal bars, current vs. recommended budget per adset, with each adset's **marginal ROAS** as a small paired bar. The seller instantly sees which adsets are full and which are still hungry. Sort by marginal ROAS descending — the sort order does the explaining before they read a single number.

### Mapping to the chart components you're already installing

From your `bklit` decision:

| Component | Use |
|---|---|
| profit-loss-line | The Money Line — the response curve, Screen 1 |
| area-chart | Cumulative spend vs. return over the campaign |
| funnel-chart | The leak, from the diagnostic engine (already planned) |
| radar-chart | Archetype fingerprint — this campaign vs. its cluster centroid |

Keep the same categorical hue order across all four so a given adset is the same color everywhere in the product. Color follows the entity, never its rank — if a filter drops an adset, the survivors must not repaint.

### Language rules

Never write **Bayesian, convex, posterior, Gaussian, marginal utility, hyperparameter** anywhere the seller can see. Say *range, best guess, we tested it, the next real you spend, full, hungry*. One sentence per insight. Money in reais with no decimals. If a sentence needs a comma and a clause to survive, cut it.

---

## 5. Proving it works

Extend the causal simulator you already have — this is nearly free because the infrastructure exists.

**Give each simulated campaign a known true response curve.** Then you can measure the only thing that matters:

**Regret** = profit at the true optimum − profit at Mazal's recommendation.

> "Across 200 simulated accounts, Mazal's allocation captured 94% of the achievable profit."

**Beat the baselines, and name them.** This is the demo:

| Baseline | What it is |
|---|---|
| Equal split | Naive |
| Status quo | Whatever the seller is doing |
| **Greedy — all budget to the highest-ROAS adset** | **What sellers actually do, and provably suboptimal** because it ignores saturation |

Greedy is the one to beat visibly. It's intuitive, it's what everyone does, and it's wrong for a reason you can explain in one sentence: *the best adset fills up*.

**Calibration.** Does the p10–p90 band contain the truth ~80% of the time? One chart, and it's the most sophisticated slide in any hackathon deck.

**Bandit efficiency.** Cumulative regret vs. a fixed A/B split → *"found the winner while spending 38% less on the loser."* That number is the product thesis as a measurement.

**Curve recovery.** Does the fitted `V_max`/`k` match the injected truth, and how much data does it take? Answering "how long before Mazal is useful?" honestly is worth more than a high accuracy number.

---

## 6. What to build, and when

You're close to freeze. Be ruthless.

### Tonight — Layers 1 + 2 only (~3–4 hours, one person)

Hill curve fit (least squares over daily spend/conversion pairs, category prior when data is thin) plus the equal-marginal-return allocator. Pure TypeScript, zero dependencies, fully unit-testable, drops straight into `packages/engine` beside the diagnostic engine.

It yields, on its own:
- the Money Line chart
- the hero number
- *"move R$40/day from B to A → +R$180/week"*
- the profit-max vs. revenue-max insight

That is a complete, demoable, mathematically real feature. Everything else in this document is roadmap, and roadmap is a slide, not a build.

**Do not start bandits or Bayesian optimization tonight.** They need live evaluation loops to mean anything, and a half-built GP that doesn't converge on stage is a much worse outcome than a clean convex solver that always does.

### The roadmap slide

| | Feature | Unlocks |
|---|---|---|
| **V1 — tonight** | Response curves + allocation | "Here's your best split, free" |
| **V2 — 2 weeks** | Thompson sampling on live variants | "Finds winners for less" |
| **V3 — 1 month** | Bayesian optimization pre-flight; effective ROAS with K | "Best configuration before you spend"; "the organic tail nobody prices" |
| **V4 — with real history** | Hierarchical Bayes across accounts; BiLSTM forecasting | Cross-account priors; seasonality |

Judges reward a team that knows what it deliberately didn't build tonight. The V4 row with "when the data earns it" written next to it is a stronger slide than a half-working neural net.

---

## 7. The line for the stage

> The diagnostic engine tells you what's broken. The Allocator tells you what's possible.
>
> Every seller is somewhere on a curve they've never seen. Mazal draws it, shows you where you're standing, and shows you where the money is — usually at the same budget you're already spending.
>
> Campaigns shouldn't need luck.

---

## Sources

- Jha, A., Sharma, P., Upmanyu, R., Sharma, Y. & Tiwari, K. (2024). *Machine Learning-Based Optimization of E-Commerce Advertising Campaigns.* ICAART 2024, vol. 2, pp. 531–541. DOI: 10.5220/0012456700003636
- Hu, H., Cai, J. & Xu, C. (2026). *A Mathematical Framework for E-Commerce Sales Prediction Using Attention-Enhanced BiLSTM and Bayesian Optimization.* Mathematical and Computational Applications 31(17). DOI: 10.3390/mca31010017
- Liu, Y., Liang, X. & Liu, Y. (2022). *The Application of Mathematical Modeling in e-Commerce Mode in Digital Marketing Mode.* IEESASM 2022. DOI: 10.25236/ieesasm.2022.004 — *concept only; methodologically weak, references unrelated to content*
- Chua, M. (2025). *The Math Behind Going Viral.* mervynchua.com — *practitioner blog, not peer-reviewed*