# Mazal

Mazal is a campaign underwriter for Brazilian e-commerce sellers. Given a Meta Ads export and twelve fields about the product, it finds the earliest broken stage of the sales funnel — the **leak** — names what caused it, and proposes a plan the seller approves before anything runs.

Ad performance has four layers: creative, audience, product/offer, and experience. Every existing tool optimises the first two, because that is what lives in Ads Manager. Mazal diagnoses the last two, because that data lives in the store.

> **Stages 0–2 are a media problem. Stages 3–6 are a product, offer, or experience problem.**
> That dividing line is the product.

Hackathon build. Working rules, ownership, and branch policy live in [`AGENTS.md`](AGENTS.md) — read it before touching anything here.

## The one rule that shapes the codebase

**Every number comes from deterministic TypeScript.** The LLM narrates findings, drafts plans, and converses. It never computes, estimates, or rounds. If a number appears on screen, a function in `packages/engine` produced it and a `Finding.rule` names the rule that fired — so *"how do I know it isn't hallucinating"* is answered with a rule id and a formula, not a paragraph.

Two consequences worth knowing before you write a line:

- **The contract stores counts; rates are derived.** No `ctr`, `cvr`, `roas`, `atcRate`, `cpc`, `cpa`, or `cpm` field exists in any type. Import the rate functions from `@mazal/contracts/metrics` — in components and in tests too.
- **A stage below its minimum sample is not judged.** It renders "not judged", never a value. The engine declines rather than guesses.

## Quick start

Requires Node ≥ 24 and pnpm 11.

```bash
pnpm install
pnpm typecheck                 # tsc --build, plus apps/mcp
pnpm test                      # 294 tests across 39 files
pnpm --filter web dev          # the app on :3000
```

Before a demo, run the guards as well — [`docs/demo-runbook.md`](docs/demo-runbook.md) has the full order and the script:

```bash
pnpm sim:fixtures              # fails if either demo fixture stops proving its beat
pnpm meta:fixtures             # fails if the Meta payloads stop folding back to those fixtures
```

Other scripts: `pnpm derive` rebuilds the benchmarks from the raw datasets, `pnpm sim:backtest` regenerates [`docs/backtest-results.md`](docs/backtest-results.md), `pnpm sim:allocator` regenerates [`docs/allocator-results.md`](docs/allocator-results.md), `pnpm sim:eyeball` prints a generated campaign to look at.

## Layout

```
packages/contracts   the six types, the rate functions — frozen, changed only with an announcement
packages/engine      diagnose · predict · buildPlan · allocate. Deterministic, no LLM, no randomness
packages/data        category benchmarks derived from Olist. Aggregate statistics only
packages/sim         labelled campaign generator and the backtest harness
packages/ingest      Meta CSV parser, event-log parser, product-card schema
packages/meta        the raw Meta insights payload and its adapter to CampaignDay
apps/web             Next.js app — the funnel, the plan, the chat
apps/mcp             the MCP server: diagnose_campaign · predict_campaign · build_recovery_plan · execute_plan
```

**`packages/engine` and `packages/sim` have separate owners who do not read each other's code.** They share only the `FaultKind` union in `packages/contracts`. The simulator injects a fault, the engine predicts one, the backtest compares — that firewall is what makes the accuracy number mean anything. It did not fully hold for the numbers below; [`docs/backtest-results.md`](docs/backtest-results.md) says so at the top.

Every package's public API is specified in [`docs/contracts.md`](docs/contracts.md).

## How a diagnosis works

1. **Ingest.** A Meta Ads CSV becomes `CampaignDay[]` — counts and money, one row per campaign per day. The seller fills a twelve-field `ProductCard`; `grossMargin` is first, because break-even ROAS is `1 / grossMargin` and it is what makes the verdict belong to this seller rather than to the category.
2. **Compare.** Each stage's metric is scored against a reference — the category benchmark, or the campaign's own trailing baseline — in robust sigmas off the interquartile range. A stage more than one sigma below is flagged, and only if it clears its minimum sample.
3. **Localise.** The *first* flagged stage is the cause; everything after it is a symptom. This is why Mazal never says "your ROAS is low", a sentence with no information in it.
4. **Date it.** A rolling window scanned forward names the day the metric turned.
5. **Explain it.** A `StoreEvent` within a day of that change point, and of a type that stage can produce, becomes the finding's evidence. *"Add-to-cart went from 6.8% to 0.4% overnight. On the same day, your supplier delivery estimate changed from 9 days to 22."* That sentence is the difference between Mazal and a dashboard, and it costs four fields.
6. **Plan.** Every `Action` carries `actor: 'mazal' | 'seller'`. Mazal never offers to execute what only the seller can do, and it has no operation that raises spend. Writes are simulated in this build: `execute_plan` appends to a log and returns a receipt marked `simulated`.

## Measured results

Reproduce each of these with the command beside it. Read the caveats in the linked files before quoting any of them.

| | | reproduce |
|---|---|---|
| Top-1 cause accuracy, 100 held-out campaigns | **59.0%** | `pnpm sim:backtest` |
| Floor — always answer "healthy" | 25.0% | same report |
| False alarms, 25 healthy campaigns | 12.0% | same report |
| Change point named on detected breaks | 100% | same report |
| Change point within ±1 day — sudden breaks | 93% | same report |
| Change point within ±1 day — gradual ramps | 0% | same report |
| Profit captured by the allocator | 71.4% | `pnpm sim:allocator` |
| Profit captured by an even split | 25.3% | same report |
| Profit captured by greedy | −75.4% | same report |

The floor belongs next to the accuracy number: a diagnoser that answers *"nothing is wrong"* to everything scores 25% on this cohort, so anything below that is worse than silence. And the allocator's headline is the last row, not the first — putting the whole wallet on the best historical ROAS returns *less than doing nothing*, because the best product fills up. That is what sellers actually do.

## Data

Category benchmarks in `packages/data` are derived from two public datasets. Only aggregate statistics — median, p25, p75 and n — are committed; the raw files stay in gitignored `data/raw/`.

- [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — 100k real orders, 2016–2018. Licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- [Facebook Ad Campaign dataset](https://www.kaggle.com/datasets/madislemsalu/facebook-ad-campaign) by Madis Lemsalu — 1,143 rows of ad performance.

Regenerate with `pnpm derive`. Media metrics (`cpm`, `ctr`, `cvr`, `atcRate`, `icRate`) are published priors, not measurements, and carry `n: 0` — `packages/data/derive.ts` says why. Provenance per row: [`docs/benchmark-provenance.md`](docs/benchmark-provenance.md).

The campaigns in the demo and in the backtest are generated by `packages/sim`, and the Meta insights payloads in `packages/meta` are fixtures derived from them. The Meta integration itself is not built, and the fixtures say so in the file.

## The Allocator

`packages/engine/src/allocate.ts` fits a response curve per adset — conversions as a function of daily spend — and splits a budget so the next real earns the same wherever it lands. It never proposes a larger budget: `reallocate` reads the total the seller already spends and redistributes exactly that.

No neural network, no training step, no dependency, no randomness. That is the finding rather than the shortcut — see [`docs/allocator.md`](docs/allocator.md) for what is built, what deliberately is not, and the four sources it draws on:

- Jha, A., Sharma, P., Upmanyu, R., Sharma, Y. & Tiwari, K. (2024). *Machine Learning-Based Optimization of E-Commerce Advertising Campaigns.* ICAART 2024, vol. 2, pp. 531–541. [DOI](https://doi.org/10.5220/0012456700003636) — on this exact problem, linear regression scored R² 0.74 against 0.56 for LSTM.
- Hu, H., Cai, J. & Xu, C. (2026). *A Mathematical Framework for E-Commerce Sales Prediction Using Attention-Enhanced BiLSTM and Bayesian Optimization.* Math. Comput. Appl. 31(17). [DOI](https://doi.org/10.3390/mca31010017) — their Bayesian optimization formulation; their forecasting results are on their data, not ours.
- Liu, Y., Liang, X. & Liu, Y. (2022). *The Application of Mathematical Modeling in e-Commerce Mode in Digital Marketing Mode.* IEESASM 2022. [DOI](https://doi.org/10.25236/ieesasm.2022.004) — **concept only, not cited as evidence**; methodologically weak.
- Chua, M. (2025). *The Math Behind Going Viral.* mervynchua.com — **practitioner blog, not peer-reviewed**; the K-factor idea, which is not built.

## The MCP server

`apps/mcp` exposes the engine as four MCP tools — `diagnose_campaign`, `predict_campaign`, `build_recovery_plan`, `execute_plan` — plus two `ui://` resources (MCP Apps extension) so a tool result renders as the funnel chart or the prediction band instead of prose. Every number in a view is engine output or a contract rate function.

Deployment, the Deco Studio connection, and the agent's configuration: [`docs/mazal-mcp-vercel-deco.md`](docs/mazal-mcp-vercel-deco.md) and [`docs/deco-agent.md`](docs/deco-agent.md).

Environment variables, all server-side:

| | |
|---|---|
| `MAZAL_MCP_BEARER_TOKEN` | required; requests without it get 401 |
| `MAZAL_MCP_ALLOWED_HOSTS` / `MAZAL_MCP_ALLOWED_ORIGINS` | hostname allowlist; off-list gets 403 |
| `MAZAL_CHAT_SESSION_SECRET` | ≥ 32 bytes, required by `POST /api/chat` |
| `MAZAL_CHAT_ALLOWED_HOSTS` | host/origin allowlist for the chat route |
| `NARRATION_MODE` | `fixture` \| `template` \| `live`; production runs `fixture` |
| `MAZAL_EXECUTE_SECRET` | gates the simulated-execution unlock in the web app |

`.mcp.json` registers the Deco Studio workspace so any agent working in this repo gets the deco tools without configuring them by hand. It holds a URL and nothing else; authenticate once per machine (`/mcp` → `deco-studio` in Claude Code). The credential never enters the repo.

## Where to look next

| | |
|---|---|
| Starting a session | [`docs/HANDOFF.md`](docs/HANDOFF.md) — who is who, what landed, what is next |
| Building anything | [`docs/contracts.md`](docs/contracts.md) — the frozen types and every package's public API |
| Writing a test | [`docs/testing.md`](docs/testing.md) — TDD is mandatory in `engine` and `ingest` |
| Deciding whether something is done | [`docs/acceptance.md`](docs/acceptance.md) — the ten claims, each with its demo beat and its test |
| Scheduling and the cut list | [`docs/plan/README.md`](docs/plan/README.md) |

`prd.md` and `demo-script.md` are background reading. `AGENTS.md` wins wherever they disagree, and it lists the two things in them that are stale.

## License

[MIT](LICENSE). The Olist dataset it derives benchmarks from is CC BY-NC-SA 4.0 and is not redistributed here.
