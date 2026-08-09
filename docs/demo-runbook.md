# Demo runbook

What to run, in what order, and what to say. Numbers here are measured, not
remembered — every one has a command beside it that reproduces it.

## Before you stand up

```bash
pnpm install
pnpm typecheck        # tsc --build, plus apps/mcp
pnpm test             # 164 tests
pnpm sim:fixtures     # asserts both demo beats still hold
pnpm --filter web build && PORT=3117 pnpm --filter web start
```

`sim:fixtures` is the one that matters. It exits non-zero if either demo fixture
stops doing what its beat needs — the guard exists because both fixtures once
diagnosed healthy and nobody noticed until a commit message mentioned it.

If the port is stuck: `lsof -ti tcp:3117 | xargs kill -9`. `pkill -f "PORT=3117"`
never matches.

## The three beats

**1 — "Why did my campaign stop working?"**

The funnel localises the leak, the change point dates it, and the store event
explains it. Say: *every number on this screen was computed by TypeScript we
wrote; the model chose the words, not the arithmetic.*

The provenance line under the answer is worth reading aloud. It names the rule
that fired, the reference it was measured against, and how many of the category
benchmarks are measured versus published priors.

**2 — The plan.**

Three choices: Run all · Edit first · I'll do it myself. Some actions are marked
*yours to do — Mazal can't*, and that is the point rather than a limitation.

Say: *Mazal can pause your campaign, slow it, or lower its budget. It cannot
raise your spend — there is no operation in the product that does that, and you
approve each one.*

If asked whether it really executes: with no credentials the receipt says
`simulated` and nothing was touched. With credentials and a 15-minute unlock it
says `live` and Meta was called. The screen reads the mode off the response and
never guesses.

**3 — "Will this campaign work before I spend?"**

The band, and the honest refusal. On a small budget the checkout stage cannot
reach its minimum sample inside the window, so Mazal says which number it cannot
see yet rather than inventing one.

## Numbers you can defend

| | | reproduce |
|---|---|---|
| Top-1 accuracy on held-out simulated campaigns | **59%** | `pnpm sim:backtest` |
| Chance floor (always answer "healthy") | 25% | same report |
| False alarms on 25 healthy campaigns | 12% | same report |
| Change point named on detected breaks | 100% | same report |
| Change point within ±1 day, **sudden** breaks | 93% | same report |
| Change point within ±1 day, **gradual** ramps | 0% | same report |
| Tests | 164 | `pnpm test` |

Report sudden and gradual separately. The 70% average lies in both directions,
and volunteering the split is worth more than the number.

`thin_pdp` and `price_too_high` score 0%. That is a benchmark-width problem —
−0.86σ against a 4.5–12% IQR — and it was deliberately not fixed by moving the
−1.0σ threshold, because moving a threshold to pass your own test is how you
stop being able to trust it.

## Questions you will get

**"Is this just ChatGPT with a prompt?"** No. `packages/engine` is deterministic
TypeScript with 164 tests. The model turns a `Diagnosis` into a sentence and
never touches a number.

**"How do I know it isn't guessing?"** Every finding carries the rule that fired,
the observed value, the reference, and the sample size behind it. Below the
minimum sample a stage is not judged at all — it says so.

**"What if the benchmark doesn't cover my category?"** 62 categories from Olist.
The nine uncovered ones are 0.16% of orders. Below the sample floor it falls back
to the campaign's own baseline and labels which reference it used.

**"Can it spend my money?"** Covered above. Say the sentence exactly.

## What not to claim

- **The Allocator does not render.** The maths is built and tested — response
  curves and equal-marginal allocation, `packages/engine/src/allocate.ts` — but a
  campaign held at a flat daily budget contains no evidence about any other
  budget, and both demo fixtures vary spend by only 1.15× and 1.20×. The chart
  refuses to draw rather than fit a curve it cannot identify. Say that if asked;
  it is a better answer than a number.
- **Live execution reaches our account, not a seller's.** Standard Access only
  covers accounts our own developers own or administer.
- **The audit log survives a demo, not a deployment.** Serverless has no durable
  disk.
