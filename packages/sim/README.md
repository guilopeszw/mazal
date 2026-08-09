# `@mazal/sim`

Generates labelled synthetic campaigns and scores a diagnoser against them.

**The fault is injected as a cause and only then expressed as metrics.** Nothing here labels a series after generating it, which is the only reason the backtest number means anything.

## What you can use today

`packages/engine` does not exist yet. Everything below works without it.

```ts
import { generateCampaign } from '@mazal/sim';

const c = generateCampaign(20260809, 'eta_shock');
c.days      // CampaignDay[], 30 days of counts — never rates
c.card      // ProductCard drawn from the Olist quartiles
c.events    // the StoreEvent[] the fault would have left behind
c.fault     // { kind: 'eta_shock', injectedOn: '2026-07-18' }
```

Same seed, same output, on any machine. `Math.random()`, `Date.now()` and argless `new Date()` appear nowhere in this package.

**Two committed fixtures** for building against fixed data — the exact campaigns the demo runs on:

| File | Seed | Fault | Shape |
|---|---|---|---|
| `fixtures/demo-case1.json` | 830176 | `thin_pdp` | **pre-flight** — a condition present from day one, in `housewares` |
| `fixtures/demo-case2.json` | 820001 | `eta_shock` | **in-flight** — a sudden break in `watches_gifts`, detected under *both* reference arms |

`pnpm sim:fixtures` asserts what each one has to do and exits non-zero otherwise —
the exact expected values are in [`docs/demo-contract.md`](../../docs/demo-contract.md).
The previous pair both diagnosed as healthy and a frontend was built against them
for hours before anyone noticed, which is why the assertions exist.

**`thin_pdp` is marginal at −1.02σ against a −1.0σ threshold, and `price_too_high`
is not supportable at all** — zero seeds in 900 meet the pre-flight contract. Those
are the only two day-one conditions, so Case 1 is `thin_pdp` or there is none. The
threshold was not lowered to accommodate either.

## Scripts

```
pnpm sim:eyeball     # prints a series per fault, then checks all four groups
pnpm sim:backtest    # runs the fixed cohort and prints the three slide-6 numbers
pnpm sim:fixtures    # regenerates the two demo fixtures; output is committed
```

## Running the backtest for real

`runBacktestWith(campaigns, diagnose)` takes the diagnoser as a parameter, so the whole pipeline is built and runnable now. When `packages/engine` lands, add the dependency and uncomment the three-line `runBacktest` wrapper at the bottom of `backtest.ts` — nothing else in this package changes.

`pnpm sim:backtest` currently runs against `alwaysHealthy`, which is **not a result**. It is the floor: on a cohort that is one quarter healthy, answering "nothing is wrong" every time scores **25% top-1 with a 0% false-alarm rate**. Any real diagnoser below that is worse than silence, and the two numbers belong on the slide together.

## Two things the deck has to say

**`top-2` is stage-level, not cause-level.** `Diagnosis` carries one `suspectedCause` and a `Finding` carries a `causeLayer`, not a `FaultKind`, so no finding has an implied cause to read — and reading it out of the engine is what the A/B firewall forbids. `scoreOne` asks the computable version: did it name the right *stage*? A stockout called a thin PDP is a near miss; both break stage 3 and the seller is sent to the right part of the funnel. The exact metric needs an optional `impliedCause?: FaultKind` on `Finding`, which is C's call.

**The false-alarm rate rests on 25 held-out healthy campaigns.** Quote the denominator, not the percentage alone. A quarter of the cohort being healthy is already unlike a real account, where nearly everything is fine — so it is a floor, not a forecast.

## The firewall

`packages/engine`'s owner does not read this package, and this package does not read theirs. `backtest.ts` takes `diagnose` as a parameter and imports nothing from the engine, which makes that a property of the types rather than a promise. If A can see how a fault deforms the metrics, A can fit to the generator and the number is worthless.

## Tests

There are none, deliberately — `docs/testing.md` exempts this package: *"Its test is the backtest. A simulator that passes unit tests can still generate nonsense."* What it carries instead is `pnpm sim:eyeball`, which asserts every fault deforms the stages `docs/plan/B-data.md` names **and no others**, across 40 seeds each, and reports how many assertions it had to skip for want of sample size.
