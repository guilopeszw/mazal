# Demo contract — the exact call and the exact answer

The two committed fixtures, the call each one takes, and what the engine returns. **E narrates from these values and states nothing that is not here.**

Regenerate with `pnpm sim:fixtures`, which asserts every claim below and exits non-zero if one stops holding. A committed fixture nothing asserts on is just numbers — the previous pair both diagnosed as healthy and a frontend was built against them for hours before anyone noticed.

## Case 1 — pre-flight · `demo-case1.json` · seed 830176

**Nothing has run yet, so there is nothing to diagnose.** The pre-flight beat is `predict` and `profileCard`. `diagnose` is also shown below because the fixture carries 30 days and the contract requires the leak to be real, but the *demo* opens on the verdict.

```ts
const card = demoCase1.card;                       // housewares
predict({ card, table: benchmarks })
profileCard(card, sellerBenchmarks)
measurability(card, 200, benchmarks)
diagnose({ days, card, events, reference: { kind: 'benchmark', table: benchmarks } })
```

| | |
|---|---|
| `Verdict.decision` | `launch_small` |
| `predictedRoas` | p10 **0.15**, p50 **0.93**, p90 **5.96** |
| `breakEvenRoas` | **4.10** (24% margin) |
| `killTrigger` | *"Stop if ROAS is below 4.10 after 100 clicks."* |
| `limitingFactor` | set — *"no campaign history yet, so the band is category-wide — instrument aov first"* |
| `primary.stage` | **3** · `atcRate` |
| `primary.observed` / `reference` | **2.35%** against **8.00%** |
| `primary.deviation` | **−1.02σ** |
| `primary.causeLayer` | `product` |
| `suspectedCause` | **`thin_pdp`** — the engine's own answer, matching the injected fault |
| `RecoveryPlan.actions` | 2, both `actor: 'seller'` — add photos, expand the description |
| `projected` | p50 **3.17** |

**Profile:** worst placement is `descriptionLength` — **142 characters against a peer median of 572**, p100, and marked `evidence: 'inconsistent'`.

> **Narrate the caveat, do not hide it.** Description length does not predict seller outcomes — it agrees in 9 of 18 categories, a coin flip. The honest line is *"the shortest description in your category, and that matters less than you would think"*. The lever that does replicate is delivery time, and it is in the same profile.

## Case 2 — in-flight · `demo-case2.json` · seed 820001

```ts
diagnose({ days, card, events, reference: { kind: 'benchmark', table: benchmarks } })
// and, for the campaign judged against its own history:
diagnose({ days, card, events, reference: { kind: 'self', baselineDays: 14 } })
```

| | |
|---|---|
| category | `watches_gifts` |
| injected | `eta_shock` on **2026-07-13** |
| `primary.stage` | **4** · `icRate` |
| `primary.deviation` | **−1.61σ** (benchmark) · **−5.04σ** (self) |
| `primary.causeLayer` | `experience` |
| `primary.evidence.type` | **`eta_change`** |
| `suspectedCause` | **`eta_shock`**, under *both* reference modes |
| `changePoint.date` | **2026-07-12** — within a day of injection |
| `RecoveryPlan.actions` | 2, **no media action** |

**The line the demo rests on:** checkouts collapsed on the day the supplier's delivery estimate moved. `Finding.evidence` carries the event, so the sentence is auditable rather than asserted.

## What the engine will not do, stated rather than worked around

**`dont_launch` is rare without history, and that is the design working.** It needs the band's p90 to sit under break-even, and with category-only priors the band is honestly wide — 27 of 1080 sampled cards, 2.5%. `docs/acceptance.md` claim 9 asks for exactly this: *"with thin data the band is wide, Mazal says so"*. A pre-flight verdict that confidently rules products out on category medians alone would be the thing to distrust. Case 1 is `launch_small` with a `killTrigger`, which is also what a seller will almost always see.

**`price_too_high` cannot be a pre-flight case.** Zero seeds in 900 satisfy the full contract — the engine names it only when price exceeds the category p75, and that rarely coincides with a `dont_launch` verdict and a non-empty plan. Do not script a demo beat around it.

**`thin_pdp` is supportable but marginal.** The chosen fixture sits at **−1.02σ against a −1.0σ flag threshold**. That is the honest state of the fault class — it scores 0% recall on the held-out backtest, because halving add-to-cart rate is only −0.86σ against a benchmark whose IQR runs 4.5%–12%. The threshold was **not** lowered to accommodate it, and it must not be.

Those are the only two day-one conditions the simulator has, so Case 1 is `thin_pdp` or there is no pre-flight case at all.

## Green commands

```
pnpm test          219 passed, 29 files
pnpm typecheck     clean
pnpm sim:fixtures  both fixtures pass every assertion; git clean after
pnpm meta:fixtures the Meta payloads fold back to those fixtures; git clean after
pnpm sim:backtest  top-1 59.0%, floor 25.0%, false alarms 12.0% on 25 healthy
```

Case 2's numbers above are re-derived a second way by `pnpm meta:fixtures`,
which runs them through the Meta payload and the adapter and fails if any of
them moves. **Case 1 is not** — it is read straight from `demo-case1.json` and
does not go through that path.
