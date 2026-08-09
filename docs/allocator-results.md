# The Allocator, measured

`pnpm sim:allocator` — 200 simulated accounts, three products each, scored against response curves the simulator knows and the engine never sees.

## The numbers

```
accounts generated       200
declined to advise         0   (no identifiable curve)
no profitable spend        0   (nothing to allocate)
scored                   200

profit captured — Mazal        37.7%
profit captured — status quo    2.0%
profit captured — even split   25.3%
profit captured — greedy      -75.4%

median error in the marginal   31.2%   (at the spend the money is at)
```

"Profit captured" is profit at Mazal's split over profit at the true optimum, both evaluated on the true curves. The gap is what `optimization.md` §5 calls **regret**.

## Reading them honestly

**Beat the even split, not the status quo.** Status quo is wherever each simulated budget walk happened to stop, which is arbitrary — a real seller's split is not random, so 2.0% flatters us. The even split at **25.3%** is the fair thing to have beaten, and 37.7% against it is a real but unglamorous win.

**Greedy loses money.** Putting the whole wallet on the product with the best historical ROAS returns **−75.4%** of the achievable profit — worse than doing nothing. That is the headline result and it is the one sellers need, because greedy is what they actually do. It fails for one reason a seller can hold: *the best product fills up.*

**37.7% is not 94%.** `optimization.md` §5 imagines "94% of achievable profit". We do not get there, and the reason is visible in the last line: the marginal return is estimated with a **31% median error** at the spend the money is actually sitting at. With that much error, products near the break-even margin get zeroed when they should be funded, and each of those is a large slice of the achievable profit.

## Why `k` is not the metric

An earlier version measured the error in the recovered `k` and reported 98%, which looks like total failure and is not. A seller who has only ever spent between R$40 and R$200 has no evidence about a ceiling at R$2,000, and no method invents it. What must be right is the **marginal return where the money is**, because that is the only quantity the allocation depends on. Measuring `k` reports a failure the feature does not have.

## Where the curve comes from

The simulator does not inject a response curve. It models the cause and lets the curve fall out: spending more into the same audience buys progressively more expensive impressions, because the cheap inventory goes first.

```
cpm(s) = baseCpm · (1 + s/K)
I(s)   = 1000s / cpm(s) = (1000K/baseCpm) · s/(K + s)
```

That is exactly the Hill form the engine fits, at α = 1, and `K` is a real quantity — the daily spend at which the seller is paying double the base CPM. So the ground truth is one line of auction economics rather than a shape chosen to be findable.

## What the accounts deliberately are

**Viable advertisers.** At the published priors a purchase costs about R$95 of media — CPM 22 over 2.31 × 10⁻⁴ purchases per impression. A R$35 broom at a 24% margin returns R$8.40 a sale and loses money at every budget. The first version of this generator produced accounts where 60% had no profitable spend anywhere, which is realistic and useless: an account with nothing profitable in it has nothing to allocate.

Products are resampled until the first real earns back more than itself. That most cheap Olist items cannot pay for Meta ads is true, worth knowing, and `predict`'s job to say — not the Allocator's.

**Sellers who moved a budget.** Each product's daily spend walks across a 0.4×–2.2× range in plateaus, because sellers change a budget and leave it. A seller who has never varied their budget is one the Allocator honestly cannot help, and `fitCurve` refuses rather than returning a confident curve — the guard is in the fit, so no caller can forget it.

## What this does not show

Nothing here is on screen. `reallocate` is exported, tested and measured, and no component calls it — the three demo fixtures are single-campaign, so there is no multi-product account in the product to feed it. These numbers describe the engine, not the demo.
