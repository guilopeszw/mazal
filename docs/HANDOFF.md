# Handoff

Current state of the build. **Read this first, before anything else in the repo** — `AGENTS.md` tells you the rules, this file tells you where things actually stand right now.

Append a new entry when you stop working, when you hand off to someone else, or when you hit something the next session needs to know. Newest entry at the top. Do not rewrite old entries — this is a log, and knowing what someone believed at 02:00 is often how you find the bug at 09:00.

Entry format:

```
## <date> <time> · <who> · <what you were doing>
**Done:** what actually landed, with commit hashes where useful.
**Next:** the single next action, concrete enough to start without deciding anything.
**Blocked / watch out:** anything that will bite the next person. "Nothing" is a valid answer.
```

---

## Who is who

| Letter | Person | Brief |
|---|---|---|
| A — engine | Miguel | [`plan/A-engine.md`](plan/A-engine.md) |
| B — data & simulator | Guilherme | [`plan/B-data.md`](plan/B-data.md) |
| C — ingest & contracts | Mateus | [`plan/C-ingest.md`](plan/C-ingest.md) |
| D — frontend | *(unassigned)* | [`plan/D-frontend.md`](plan/D-frontend.md) |
| E — agent, deco, pitch | *(unassigned)* | [`plan/E-agent.md`](plan/E-agent.md) |

Fill a name in as each person starts. If you are opening a session and your letter is not here, ask before assuming one — two people on the same package is worse than one package unstarted.

---

## 2026-08-08 14:05 · Guilherme · branches, scaffold, derivation

**Done:** Two things.

Branch policy changed — **nobody pushes to `main` any more.** Work lands on `stage`, `main` takes a green `stage` at block boundaries. Rules in [`../AGENTS.md`](../AGENTS.md#branches), and `docs/plan/README.md` and `docs/testing.md` point at them (`b3fa8df`, on both branches). Long or cross-package work gets a `stage/<letter>-<thing>` branch off `stage`. Unattended sessions never merge to `main`.

Repo scaffolded and `packages/data` started (`ac20346`, on `stage`). pnpm workspace over `packages/*` and `apps/*`, vitest at the root, `pnpm test` green and `pnpm typecheck` clean. Node 24 runs TypeScript natively, so there is no build step and no `tsx`: `pnpm derive` is `node packages/data/derive.ts`. `derive.ts` is written end to end — products joined to order items to orders to reviews, median/p25/p75/n per metric per category, the generated `OlistCategory` union, categories under 30 orders skipped. Four tests cover the CSV parser and the quantiles.

**Next:** Download the two Kaggle datasets into `data/raw/` (gitignored) and run `pnpm derive`. That needs a Kaggle account, which is why it has not happened yet — a browser download of both zips into `data/raw/` works exactly as well as the CLI:

```
kaggle datasets download -d olistbr/brazilian-ecommerce --unzip -p data/raw
kaggle datasets download -d madislemsalu/facebook-ad-campaign --unzip -p data/raw
```

Then commit `benchmarks.json` and `categories.ts`, and write `packages/data/index.ts` — it is deliberately absent, because it imports a `benchmarks.json` that does not exist yet and would fail typecheck.

**Blocked / watch out:** `packages/contracts` still does not exist — Mateus has not pushed. Nothing in `packages/data` imports it yet (`derive.ts` is standalone by design), but `index.ts` and the whole simulator do. If contracts is still missing at the SAT-A gate, that is the thing to escalate, not the benchmarks.

Two shapes in `derive.ts` to check when the real numbers land: an order's category is its first item's, and `deliveryDays` is the *promised* ETA (`order_estimated_delivery_date` − `order_purchase_timestamp`), not the delivery that happened — the engine reasons about what the buyer saw on the PDP. `atcRate` and `icRate` are published priors, not measured; they are flagged `source: 'kaggle_meta'` and the UI must print them as estimates.

---

## 2026-08-08 · Guilherme · ownership settled

**Done:** Miguel on A, Mateus on C. Mateus is already writing `packages/contracts`, so it stays his, exactly as [`plan/C-ingest.md`](plan/C-ingest.md) describes — brief unchanged, guardian duty his. An earlier entry moved it to Guilherme; that reassignment is cancelled and was never acted on.

**Next:** Guilherme goes straight to `packages/data` — Olist download, `derive.ts`, per-category distributions — then the simulator. Nobody is waiting on Guilherme now.

**Blocked / watch out:** Review `packages/contracts` against [`../contracts.md`](../contracts.md) once Mateus pushes, before anyone builds on it. The one thing to check hardest: no type carries a rate field, and `metrics.ts` has the assertion that `ctr(aggregate(days))` differs from the mean of daily CTRs. Everything downstream inherits whatever lands there. D and E are still unassigned.

---

## 2026-08-08 · Guilherme · planning

**Done:** All planning docs written and pushed — `AGENTS.md`, `docs/contracts.md`, `docs/testing.md`, `docs/acceptance.md`, `docs/plan/` (`a444a70`, `8a535e9`). No production code exists yet. Repo has no `package.json`, no workspace, no packages.

**Next:** `packages/contracts` — the six types from `docs/contracts.md` plus `metrics.ts` with its three assertions. This is C's package, but it is the only hard blocker for the other four people and B is the only one online, so B ships it and hands guardianship to C on arrival. Twenty minutes. Then `packages/data` (Olist derivation), then the simulator.

**Blocked / watch out:** Nobody else is online yet. A arrives Saturday night and takes `packages/engine`; tell them about the A/B firewall the moment they start, because it is the one rule that cannot be fixed retroactively — once B's fault-injection logic has been read by A, the backtest number is worthless for the rest of the weekend.
