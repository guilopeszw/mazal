# Mazal

Mazal is a campaign underwriter for Brazilian e-commerce sellers. Given a Meta Ads export and twelve fields about the product, it finds the earliest broken stage of the sales funnel — the **leak** — names what caused it, and proposes a plan the seller approves before anything runs.

The insight the whole codebase serves: ad performance has four layers — creative, audience, product/offer, and experience. Every existing tool optimises the first two, because that is what lives in Ads Manager. Mazal diagnoses the last two, because that data lives in the store. **Stages 0–2 are a media problem; stages 3–6 are a product, offer, or experience problem.**

Hackathon build. Deadline Sunday 2026-08-09 23:59, code freeze 19:00.

## Hard rules

**Every number comes from deterministic TypeScript.** The LLM narrates findings, drafts plans, and converses. It never computes, estimates, or rounds. If a number appears on screen, a function in `packages/engine` produced it and a `Finding.rule` names the rule that fired.

**The contract stores counts; rates are derived.** No `ctr`, `cvr`, `roas`, `atcRate`, `cpc`, `cpa`, or `cpm` field exists in any type. Import the rate functions from `@mazal/contracts/metrics` — including in components and in tests.

**`packages/contracts` is frozen after SAT-A.** Changing it is announced to everyone before it is pushed. Adding an optional field is cheap; renaming is expensive.

**Engine and simulator have separate owners who do not read each other's code.** `packages/engine` and `packages/sim` share only the `FaultKind` union in `packages/contracts`. B injects a fault; A predicts one; the backtest compares. This is what makes the accuracy number mean something.

**Committed data is aggregate statistics.** Raw Kaggle CSVs live in gitignored `data/raw/`. `packages/data/benchmarks.json` holds medians, quartiles, and sample counts — no rows, no free text. Olist is CC BY-NC-SA; attribute it in the README.

**Actions say who can perform them.** Every `Action` carries `actor: 'mazal' | 'seller'`. Mazal never offers to execute what only the seller can do. Writes are simulated in this build — `execute_plan` appends to a log and returns a receipt.

## Ownership

| Package | Owner | Everyone else |
|---|---|---|
| `packages/contracts` | C | import freely, change only with C and an announcement |
| `packages/engine` | A | call `diagnose`, `predict`, `buildPlan`; do not read the source if you own `sim` |
| `packages/data` | B | import `benchmarks` |
| `packages/sim` | B | call `generateCampaign`, `runBacktest`; do not read the source if you own `engine` |
| `packages/ingest` | C | call `parseMetaCsv`, `parseEventLog`, `productCardSchema` |
| `apps/web` | D (C joins Sunday) | E owns `POST /api/chat` only |
| `apps/mcp` | E | — |

Direct push to `main`. Commit on green, every time — a red `main` blocks four people.

## Tests

TDD is mandatory in `packages/engine` and `packages/ingest`. Everywhere else is exempt this weekend. Details and the loop: [`docs/testing.md`](docs/testing.md).

## Working unattended

The team sleeps Saturday night with sessions running and occasional checks. While unattended, an agent writes code, runs tests, and commits **within its own package**.

Stop and append to [`docs/HANDOFF.md`](docs/HANDOFF.md) when tests go red, when a change would touch `packages/contracts`, or when a change would touch another owner's package. Destructive git is never available: no `reset --hard`, no force push, no branch deletion.

Every session appends to `docs/HANDOFF.md` before it ends, attended or not — what landed, the single next action, and anything that will bite the next person. It is how a new session picks up without being told anything.

## Where to look

- **Starting a session** → [`docs/HANDOFF.md`](docs/HANDOFF.md) — who is who, what landed, what is next. Read it before anything else, and append to it when you stop.
- **Building anything** → [`docs/contracts.md`](docs/contracts.md) — the frozen types and every package's public API.
- **Writing a test** → [`docs/testing.md`](docs/testing.md).
- **Deciding whether something is done** → [`docs/acceptance.md`](docs/acceptance.md) — the ten claims Mazal must be able to make, each with its demo beat and its test.
- **Scheduling, checkpoints, what gets cut** → [`docs/plan/README.md`](docs/plan/README.md).
- **Your own assignment** → `docs/plan/{A-engine,B-data,C-ingest,D-frontend,E-agent}.md`. Read yours; you do not need anyone else's.

## Superseded

`prd.md` and `demo-script.md` are background reading, and this file wins wherever they disagree. Two things in them are stale and must not be built against:

- **The USD benchmark table in `prd.md` §6.** Benchmarks are computed from Olist in BRL and live in `packages/data`.
- **The "real Meta export from the music account" in `prd.md` §6.** No such export exists. The parser fixture is hand-built from Meta's documented column names.
