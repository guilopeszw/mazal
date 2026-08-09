# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Brazilian e-commerce sellers who spend their own or a client's money on Meta Ads —
dropshippers, Shopee and Mercado Livre sellers, small agency media buyers. They run a store
and a campaign at the same time and have no method for telling which of the two is broken.

Their job when they open Mazal: decide whether to launch a campaign, or find out why a
running one stopped working — and know what to change.

**The primary viewer of `apps/web` is a hackathon judge watching a five-minute demo on a
projector, and that resolves conflicts.** Where the judge and the seller want different
things from the same pixel, the judge wins: read at distance, one idea per viewport, the
funnel dominant. No auditable value is deleted to buy that — it recedes, it does not vanish,
because the audit surface is the product's central claim.

## Product Purpose

Given a Meta Ads export and twelve fields about the product, Mazal finds the earliest broken
stage of the sales funnel — the leak — names what caused it, and proposes a plan the seller
approves before anything runs.

Success is the seller sent to the right part of the funnel. A campaign is not "underperforming";
either the ad failed to earn a click, or the click reached a page that did not deserve it.

## Positioning

**Campaign underwriting.** Ad spend is the last large business expense nobody prices the risk
of before the money moves.

Ad performance has four layers — creative, audience, product/offer, and experience. Every
existing tool optimises the first two, because that is what lives in Ads Manager. Mazal
diagnoses the last two, because that data lives in the store. Stages 0–2 are a media problem;
stages 3–6 are a product, offer, or experience problem, and that dividing line is the product.

**The headline promise is "don't launch."** Mazal is a restraint product in a category of
throughput products: it promises fewer campaigns launched and less money spent, not more of
anything. The recovery of a live campaign is the second act, not the pitch.

Note the tension with `docs/plan/README.md`, which says to finish the in-flight case first if
only one can be finished. That is a risk decision about build order and does not change which
promise leads.

## Operating Context

- **Onboarding is a CSV and a form.** An unmodified Ads Manager export plus twelve typed
  fields. No OAuth, no Meta app review, no integration. Exporting from Ads Manager is a habit
  sellers already have.
- **The evaluation scene is a projector, not a laptop.** Five minutes, timed, in a room, with
  a presenter narrating. Contrast that survives a laptop will not survive the projector.
- **The demo is presenter-driven and never navigates.** It time-jumps the data between two
  moments of the same product's life. A second person narrates through the chat sidebar.
- **Hackathon build.** Submission Sunday 2026-08-09 23:59, hard code freeze 19:00 that day.

## Capabilities and Constraints

- **Every number on screen comes from deterministic TypeScript.** The model narrates and
  converses; it never computes, estimates, or rounds. Every finding carries the id of the rule
  that produced it, so any claim on screen can be audited in seconds.
- **The contract stores counts; rates are functions.** No `ctr`, `cvr`, `roas`, `atcRate`,
  `cpc`, `cpa`, or `cpm` field exists in any type. `packages/contracts` is frozen.
- **One screen.** Onboarding is a modal, the plan is a panel, chat is a sidebar. No routes.
- **Every action says who can perform it.** `actor: 'mazal'` gets a toggle and a Run control;
  `actor: 'seller'` renders as advice with neither. A dropshipper cannot change a supplier's
  lead time, so a diagnosis they cannot act on is not offered as one.
- **Writes are simulated in this build** and the screen says so out loud. `execute_plan`
  appends to a log and returns a receipt; there is no Meta API client, and the absence is the
  guarantee.
- **Interface language is pt-BR**, with one binding exception: the three plan controls read
  **Run all · Edit first · I'll do it myself**, in that order and that wording. Rule ids,
  metric names, and `FaultKind` values are identifiers and are never translated.
- **Sixty-two of Olist's seventy-one categories** are supported, covering 99.84% of orders.
  The category field is a select over that list; free text fails validation.

### Known engine limits this surface must not paper over

- `thin_pdp` and `price_too_high` are never detected — both halve add-to-cart, which is −0.86σ
  against a threshold of −1.0.
- `buildPlan` returns `projected: {p10: 0, p50: 0, p90: 0}`. The projection is not modelled and
  must stay off screen.
- Both committed demo fixtures currently diagnose as healthy. Logged in `docs/HANDOFF.md`.

## Brand Commitments

**Mazal** means luck, or fortune. The product is the opposite of luck, and the name creates the
question the tagline answers:

> Mazal — campanhas não deveriam depender de sorte.

Voice is causal and specific. Mazal never says "your ROAS is low" — a sentence with no
information in it. Verdict first, evidence second, plan third, in short sentences. A long
response reads as a language model; three sharp sentences read as expertise.

## Evidence on Hand

- **Olist Brazilian E-Commerce dataset** — ~100,000 real orders. Per-category medians and
  quartiles in BRL at `packages/data/benchmarks.json`.
- **Benchmark provenance is mixed and the split is public.** Seven of twelve metrics are
  measured from Olist; five (`cpm`, `ctr`, `cvr`, `atcRate`, `icRate`) are published industry
  priors carrying `source: 'prior'` and `n: 0`, with no per-number citation. Documented at
  `docs/benchmark-provenance.md`. Anything quoting a benchmark reads `n` first.
- **Backtest, on 100 held-out simulated campaigns:** 59.0% top-1, 12.0% false alarms on 25
  healthy campaigns, against an always-healthy floor of 25.0% at 0% false alarms. The floor
  belongs beside the number every time it is quoted.
- **The A/B firewall did not hold.** The same person wrote the simulator and the engine after
  the engine's owner dropped out. This is a wiring and sanity number, not an independent
  accuracy claim, and it is disclosed rather than hidden.

### Absences future work must not fill in

**No seller research was conducted.** `questionnaire.md` was written and never run.
`docs/acceptance.md` states that the team "already ran it: calls with sellers and operations
people" — **that sentence is false** and the ten claims it frames are design intent, not
findings. There are no seller quotes, no response counts, no self-reported waste figures, and
no validated hypotheses.

There are also no customers, no pricing, no case studies, no press, and no real Meta export
from any account — the parser fixture is hand-built from Meta's documented column names. None
of these may be invented, implied, or illustrated on any surface.

## Product Principles

1. **Name the layer, never the symptom.** The earliest broken stage is the cause; everything
   downstream is a consequence. Colouring a downstream stage as the problem is the exact
   misdiagnosis the product exists to prevent.
2. **Auditable beats impressive.** Every claim shows its observed value, its reference, the
   sample behind both, and the rule that fired. A judge who cannot check a number does not
   believe the next one.
3. **Say the provenance, not just the number.** A measured quartile and a published estimate
   are not the same kind of fact and must not look the same.
4. **It proposes, you decide.** Mazal never spends money without asking and never offers to do
   what only the seller can do.
5. **Disclose the weakness.** A stated limitation with its fix reads as rigour; a suspicious
   number gets interrogated.

## Accessibility & Inclusion

The binding requirement is **projector legibility**: contrast and type size verified on
projected output, not on a laptop panel, where both lie. Colour is never the only carrier of
meaning — the leak stage, the healthy stages, and the muted downstream stages must remain
distinguishable without hue, since the funnel's whole message is encoded in exactly that
distinction.