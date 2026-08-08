# HANDOFF — Agent Continuation

**Timestamp:** 2026-08-08T14:12 BRT (Saturday afternoon)
**Block:** mid-SAT-A
**Author:** C-agent (ingest + contracts owner)
**Tests green:** yes — `pnpm -r test` passes 41 tests (3 contracts + 38 ingest), `pnpm -r build` succeeds.

---

## What was done

### 1. `packages/contracts` — COMPLETE, FROZEN

All six types, all composite types, all engine API types, and all metric functions committed and building.

| File | Status | Contents |
|---|---|---|
| `src/index.ts` (182 lines) | ✅ Done | `CampaignDay`, `ProductCard`, `StoreEvent`, `Finding`, `Action`, `Verdict`, `FaultKind`, `ReferenceMode`, `BenchmarkTable`, `Benchmark`, `Distribution`, `BenchmarkMetric`, `OlistCategory`, `DiagnoseInput`, `Diagnosis`, `PredictInput`, `RecoveryPlan`, `FunnelStage`, `CauseLayer`, `PaymentMethod`, `OfferType`, `StoreEventType` — re-exports all metrics |
| `src/metrics.ts` (60 lines) | ✅ Done | `safeDiv`, `aggregate`, `ctr`, `cpc`, `cpm`, `atcRate`, `icRate`, `cvr`, `cpa`, `aov`, `roas`, `costPerAtc` |
| `src/metrics.test.ts` (73 lines) | ✅ Done | The three mandatory assertions: safeDiv 0/0, aggregate sums counts, `ctr(aggregate(days)) ≠ mean(daily CTRs)` |
| `tsconfig.json` | ✅ Done | Extends `../../tsconfig.base.json`, NodeNext module resolution |
| `package.json` | ✅ Done | `@mazal/contracts`, dual exports (`.` and `./metrics`), devDeps: typescript + vitest |

**The contract is frozen.** Any change must be announced to the entire team before pushing. Adding an optional field is cheap; renaming is expensive. This is per AGENTS.md.

### 2. `packages/ingest` — COMPLETE (all 3 exports done)

| File | Status | Contents |
|---|---|---|
| `src/meta-csv.ts` (282 lines) | ✅ Done | Full Meta Ads Manager CSV parser. Handles: loose column matching (normalised headers + substring), pt-BR number format (`1.240,50` → `1240.5`), em-dash/double-dash/empty missing values with warnings, ISO and DD/MM/YYYY dates, aggregated row detection, totals row dropping, rate column skipping (CTR, CPC, CPM, ROAS), currency extraction from header parenthetical. Returns `{ days: CampaignDay[]; warnings: string[]; currency?: string }`. |
| `src/meta-csv.test.ts` (267 lines) | ✅ Done | 16 tests. Covers: clean file parsing, em-dash missing values, double-dash missing values, empty field missing values, pt-BR number format, standard number format, currency extraction (BRL and USD), DD/MM/YYYY dates, ISO dates, aggregated rows, totals rows, empty trailing lines, rate column ignoring, fixture integration (end-to-end with `test/meta-export.csv`), multiple campaigns. |
| `src/event-log.ts` (126 lines) | ✅ Done | Parses CSV or JSON `StoreEvent[]`. Auto-detects format by leading `[`. CSV format: `date,type,detail` with header. Validates against `StoreEventType` union, normalises dates. Handles quoted fields. |
| `src/event-log.test.ts` (87 lines) | ✅ Done | 7 tests. Covers: CSV format, JSON format, invalid event type rejection, all valid types, DD/MM/YYYY in CSV, empty input, commas in quoted detail field. |
| `src/product-card.ts` (25 lines) | ✅ Done | Zod schema for `ProductCard`. Validates: category non-empty, price positive, grossMargin 0–1, shippingCost ≥0, deliveryEtaDays positive int, stockOnHand ≥0 int, reviewCount ≥0 int, reviewAvg 1–5, pdpImages ≥0 int, pdpDescriptionLength ≥0 int, returnPolicyDays ≥0 int, paymentMethods at least 1 valid, offer valid enum. |
| `src/product-card.test.ts` (117 lines) | ✅ Done | 15 tests. Covers: valid card, grossMargin boundaries (0, 1, <0, >1), empty paymentMethods, invalid payment method, reviewAvg boundaries, negative price, non-integer deliveryEtaDays, invalid offer type, field-level errors, all valid payment methods, all valid offer types, free shipping. |
| `src/index.ts` (7 lines) | ✅ Done | Re-exports `parseMetaCsv`, `parseEventLog`, `productCardSchema`. |
| `test/meta-export.csv` (10 lines) | ✅ Done | Hand-built fixture with real Meta column names. Contains: pt-BR numbers, em-dash nulls, double-dash nulls, empty field (non-missing, between rate columns), aggregated row (date range), totals row, empty trailing lines. 5 daily rows + 1 aggregated + 1 totals + 2 empty lines. |
| `package.json` | ✅ Done | `@mazal/ingest`, deps: `@mazal/contracts` (workspace:\*), `zod` ^3.25.0; devDeps: `typescript`, `vitest`, `@types/node` ^26.2.0. |

### 3. Infrastructure

| Item | Status | Detail |
|---|---|---|
| `tsconfig.base.json` | ✅ Done | ES2022 target, NodeNext module + moduleResolution, strict, esModuleInterop, skipLibCheck, resolveJsonModule, declaration, declarationMap, sourceMap. |
| `package.json` (root) | ✅ Done | Private workspace root, `pnpm@9.15.4`, scripts: `build` and `test` (both `pnpm -r`). |
| `pnpm-workspace.yaml` | ✅ Done | `packages/*` and `apps/*`. |
| `.gitignore` | ✅ Done | Ignores: `.serena`, `.claude`, `node_modules`, `.next`, `.turbo`, `dist`, `data/raw/`. |

---

## What is NOT committed to git

**CRITICAL:** All the work above is in the working tree but **untracked** (`git status` shows `??` for `package.json`, `packages/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`). The last commit on `main` is `8a535e9` ("Document dependency graph and staggered-arrival transfers") and contains only docs.

**First action for any agent continuing:** commit everything now.

```bash
git add package.json packages/ pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json
git commit -m "chore: scaffold packages/contracts and packages/ingest — SAT-A deliverables

- packages/contracts: all frozen types, metrics functions, 3 assertions
- packages/ingest: parseMetaCsv (16 tests), parseEventLog (7 tests), productCardSchema (15 tests)
- Root workspace config with pnpm, TypeScript base config"
```

---

## What is unresolved

### Blocking other owners

| What | Who is blocked | Action needed |
|---|---|---|
| `packages/data` does not exist | A (needs `benchmarks` for reference mode), D (needs reference values for UI) | **B must create this.** Download Olist to `data/raw/`, write `derive.ts`, emit `benchmarks.json`. See `docs/plan/B-data.md` part 1. If B is delayed past 20:00 Sat, hand to E per the plan. |
| `packages/engine` does not exist | D (needs `Diagnosis` to render funnel), E (needs `diagnose` to wrap as MCP tool) | **A must create this.** Start with the stage-3 failing test from `docs/testing.md`. D and E can mock against the contract in the meantime. |
| `packages/sim` does not exist | A (needs backtest), the whole team (needs demo fixtures) | **B must create this.** Second priority after `packages/data`. |
| `apps/web` does not exist | Team (demo) | **D must scaffold** `apps/web` with Next.js App Router, import a type from `@mazal/contracts`, render seven bars. See `docs/plan/D-frontend.md`. |
| `apps/mcp` does not exist | E (insurance policy demo path) | **E must scaffold** with `@modelcontextprotocol/sdk` and hono. See `docs/plan/E-agent.md`. |

### Non-blocking issues

1. **`@types/node` was just added** to `packages/ingest/devDependencies` to fix `Cannot find module 'node:url'` IDE error. It's in the lockfile. If any other package needs `node:fs`/`node:path`/`node:url`, it will also need `@types/node` added to its own devDependencies.

2. **The `parseMetaCsv` return type** includes `currency?: string` which is NOT in the contract's stated API signature (`{ days: CampaignDay[]; warnings: string[] }`). The implementation type is `MetaCsvResult` which adds `currency`. This is an enhancement — the contract's API is satisfied (days + warnings are there), and currency is additional. Downstream consumers (D's frontend) should use the full `MetaCsvResult` type.

3. **No `reach` column** is parsed from the CSV fixture. The fixture has Reach but `meta-csv.ts` DOES map it (priority 94, match: `'reach'`). The fixture's Reach column maps correctly. However, if a seller's export lacks a Reach column, it will default to 0 — this is acceptable since `frequency = impressions / reach` will safeDiv to 0.

4. **`bounceRate` aggregation** — `metrics.ts` `aggregate()` explicitly does NOT sum `bounceRate` (it's a rate, not a count). A comment notes consumers should compute it from sessions data. This is correct but means any code needing aggregate bounce rate needs a separate function.

---

## What to look at first

### If you are owner A (engine):
1. Commit the current work (see above).
2. Create `packages/engine/` with `package.json` importing `@mazal/contracts` (workspace:\*).
3. Copy the failing test from `docs/testing.md` verbatim into `src/localise.test.ts`.
4. Create `test/fixtures.ts` with hand-built `CampaignDay[]` and `ProductCard` objects. **Do NOT import from `packages/sim`.**
5. Implement `diagnose()` for stage 3 first. Then stages 0–6 one at a time, each red → green → commit.
6. Reference: `docs/plan/A-engine.md` for the full algorithm, stage table, deviation scoring, and cause attribution table.
7. You need `benchmarks` from B for the benchmark reference mode — until then, stub a two-category table in your own fixtures.

### If you are owner B (data + sim):
1. Commit the current work (see above).
2. **Highest priority:** Download Olist dataset to `data/raw/` and create `packages/data/`. Write `derive.ts`, output `benchmarks.json` with per-category medians, quartiles, and sample counts. This unblocks A and D.
3. After `packages/data` is done, create `packages/sim/` with `generateCampaign` and `runBacktest`.
4. Reference: `docs/plan/B-data.md` for column mappings, fault deformation rules, and backtest protocol.

### If you are owner D (frontend):
1. Commit the current work (see above).
2. Scaffold `apps/web` with Next.js App Router. Import a type from `@mazal/contracts`.
3. Write a `Diagnosis` fixture (15 lines satisfying the type) and render seven coloured bars.
4. You can mock everything — never wait on engine or ingest.
5. Reference: `docs/plan/D-frontend.md` for the screen layout, funnel visual, finding card, plan panel, and chat sidebar.
6. **C (ingest) will join you** as soon as their work is done (it IS done — assign C frontend components now).

### If you are owner E (agent/MCP):
1. Commit the current work (see above).
2. Scaffold `apps/mcp` with `@modelcontextprotocol/sdk` and hono.
3. Expose `diagnose_campaign` returning a hardcoded `Diagnosis` that satisfies the contract.
4. Deploy to Vercel immediately — a deployed URL that returns valid JSON matters more than correctness right now.
5. Set up deco Studio org and Custom Connection.
6. Reference: `docs/plan/E-agent.md`.
7. **If B hasn't committed `benchmarks.json` by 20:00,** take `packages/data` from them (see `docs/plan/E-agent.md` SAT-A note).

---

## Package dependency graph

```
@mazal/contracts  ← consumed by everyone, no dependencies
       ↓
@mazal/ingest     ← depends on contracts + zod
@mazal/data       ← depends on contracts (NOT YET CREATED)
@mazal/engine     ← depends on contracts + data (NOT YET CREATED)
@mazal/sim        ← depends on contracts + engine (NOT YET CREATED)
       ↓
apps/web          ← depends on contracts + engine + ingest (NOT YET CREATED)
apps/mcp          ← depends on contracts + engine + data (NOT YET CREATED)
```

---

## Tests — current state

```
packages/contracts: 3 passed (metrics.test.ts)
packages/ingest:   38 passed (meta-csv.test.ts: 16, event-log.test.ts: 7, product-card.test.ts: 15)
─────────────────
Total:             41 passed, 0 failed
```

`pnpm -r build` succeeds for both packages. No type errors.

---

## SAT-A checklist status

| Deliverable | Status |
|---|---|
| `packages/contracts` committed and imported by every package | ✅ Committed to working tree (needs `git add` + `git commit`) |
| Repo scaffolded, `pnpm test` green on empty suites | ✅ Green on real suites (41 tests) |
| `metrics.ts` with three assertions | ✅ Done |
| `parseMetaCsv` reading a clean file into `CampaignDay[]`, TDD | ✅ Done (16 tests) |
| B has `benchmarks.json` derived from Olist and committed | ❌ Not started — `packages/data` doesn't exist yet |
| Everyone's first commit is in | ❌ Only C's work exists. A, B, D, E have no packages yet. |

---

## Schedule reference

Current time: Saturday 14:12 BRT. SAT-A ends at 20:00. SAT-B runs 20:00–02:00.

**Remaining SAT-A work for C:** Done. C should now move to help D with frontend (per `docs/plan/C-ingest.md` part 4: "move to the frontend with D as soon as ingest is done").

**SAT-B deliverables for C (now in frontend):** Real CSV upload wired end to end with D — file in, `CampaignDay[]` out, funnel rendered.
