# Slide 6 — "How we know it's right"

B's input to E's deck. Every number here comes from [`backtest-results.md`](backtest-results.md), which `pnpm sim:backtest` regenerates from fixed seeds — **if a number on the slide is not in that file, it is wrong.**

`demo-script.md`: *"Slide 6 is the one nobody else will have. Do not cut it for time."*

---

## The slide

> ### How we know it's right
>
> We built a causal simulator: sample a real Brazilian store from 97,000 Olist orders, inject **one** fault, then let 30 days of funnel maths run. The label is never derived from the metrics — it is decided first.
>
> **400 campaigns. 100 held out. Nine fault kinds.**
>
> | | |
> |---|---|
> | Names the right cause | **59%** |
> | Names the right funnel stage | **59%** |
> | False alarms on healthy campaigns | **12%** (3 of 25) |
> | Floor — a diagnoser that always says "you're fine" | **25%** |
>
> **Where it fails, and why:** two of the nine faults it never catches. Both halve add-to-cart rate, which is −0.86σ against a benchmark whose spread runs 4.5%–12%. We flag at −1.0σ. The reference is too wide, not the detector too blunt — and we did not move the threshold to make this slide look better.
>
> **On a sudden break it names the day, 93% of the time within one.** A stockout has a day it happened. Creative fatigue and budget caps do not — they decay a few per cent a day, so no detector can name a day and we do not pretend to.
>
> **When it is wrong, it goes quiet.** All three of our worst classes get called *healthy*, not *something else*. For a monitoring product that is the right way to fail.

---

## What to say out loud, in order

**1. Lead with the floor, not the headline.** *"59% sounds like a number until you know that answering 'nothing is wrong' to everything scores 25% on this cohort. That's what it's measured against."* A judge who has shipped a model will ask for the baseline. Offer it first and the rest of the slide is believed.

**2. Say the firewall broke, before anyone finds it.**

> *"We designed this so the person who wrote the simulator and the person who wrote the diagnoser never read each other's code — that's what makes an accuracy number mean anything. One of them couldn't work on the day, so the same person wrote both. This is a wiring and sanity number, not an independent accuracy claim."*

Then the three things that limit it, fast:
- both tables — the engine's causes and the simulator's faults — were written into the plan **before either package existed**, so the correspondence is specified, not invented;
- **no threshold was tuned to fit**, which is why two classes sit at zero on this slide instead of being quietly rescued;
- `packages/engine` imports nothing from `packages/sim` and its fixtures are hand-built from the contract — what leaked is in one person's head, not the import graph.

**3. Quote the denominator on the false-alarm rate.** 12% is 3 campaigns out of 25. And a cohort a quarter healthy is nothing like a real account, where nearly everything is fine — so it is a floor, not a forecast.

**4. Claim 1 is the one to volunteer.** *"On a sudden break we name the day it happened, within one day, 93% of the time. On a gradual decay we don't — there is no day, and we say so."* That second half is what makes the first half believed.

**5. Name the failure before the strength.** `price_too_high` and `thin_pdp` at 0%. Then `stockout` 100%, `pixel_break` 96%, `none` 93%. In that order. *"Here is the class we cannot catch and why"* is a stronger sentence than a suspicious 99%, and it is the one that survives questions.

---

## Per-class, if the slide has room

Training half — the held-out set reports its aggregate and nothing else.

| fault | recall |
|---|---|
| `stockout` | 100% |
| `pixel_break` | 96% |
| `none` (healthy) | 93% |
| `eta_shock` | 68% |
| `budget_cap` | 39% |
| `creative_fatigue` | 32% |
| `checkout_friction` | 18% |
| `price_too_high` | 0% |
| `thin_pdp` | 0% |

If only one row fits: **`stockout` 100%, `thin_pdp` 0%.** The spread is the honest story.

---

## The other number, and it is not on this slide

Slide 6 is accuracy. The **benchmarks** have their own provenance problem and it belongs wherever they first appear on screen:

> Seven of the twelve benchmarks are computed from 97,000 Olist orders. **Five are published priors, marked `n: 0` in the data and on screen.** The ad dataset we had measures a 0.017% CTR at a CPM of 0.26 in an unstated currency — that is not this market, so we did not ship it as one.

Full detail in [`benchmark-provenance.md`](benchmark-provenance.md). Anything showing a seller a benchmark reads `n` first.

---

## Questions to have an answer ready for

**"Did you tune against the held-out set?"**
No. The split is fixed in `packages/sim/cohort.ts` by position over a round-robin, committed before the first score existed. The per-class breakdown quoted anywhere is the training half.

**"Isn't a simulator just testing your own assumptions?"**
Partly, and that is why the floor is on the slide. What it does test is real: the fault is injected as a *cause* and the metrics fall out of 30 days of funnel arithmetic, so nothing is labelled after the fact. What it cannot test is whether Brazilian sellers break in these nine ways. Only real accounts settle that.

**"Why is the false-alarm rate so high?"**
It is 3 campaigns in 25 and we would rather report it than round it away. The direction matters more than the rate: every one of our worst classes fails by going quiet rather than by inventing a cause, so a seller is more likely to be told nothing than to be sent to fix a working funnel.

**"59% doesn't sound like much."**
Against 25% for saying nothing, and against nine classes rather than two. And the two classes at zero are a benchmark-width problem we have measured and can name — that is a fix with an address, not a mystery.

---

## What we did not do, and would

- **Measure `atcRate` instead of shipping a prior.** It is the single change that would move the two zero classes, and it needs store-level data Olist does not carry.
- **A second machine.** The generators are byte-reproducible on a rerun here; nobody has cloned the repo elsewhere and confirmed it. Say "reproducible from fixed seeds", not "reproducible on any machine", until someone has.
- **Calibration curves.** Cut for time, deliberately — `B-data.md` ranks them below the confusion matrix and they were the first thing to go.
