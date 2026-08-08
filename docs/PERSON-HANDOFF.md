> **This is C's snapshot of Saturday 14:12, kept for its architecture overview and its
> account of `packages/contracts` and `packages/ingest`. It is not the state channel.**
> [`HANDOFF.md`](HANDOFF.md) is — append there, read there. Parts of this file are
> already out of date: contracts and ingest are committed, `packages/data` exists, and
> there is no build step.

# Developer Handoff — Mazal Campaign Underwriter

**Date:** Saturday 2026-08-08, 14:12 BRT
**Deadline:** Sunday 2026-08-09, 23:59 BRT (code freeze 19:00)
**Handoff by:** C — Ingest & Contracts owner

---

## What is Mazal

Mazal is a campaign underwriter for Brazilian e-commerce sellers. It takes a Meta Ads Manager CSV export and twelve fields about the product, finds the earliest broken stage of the sales funnel — the **leak** — names what caused it, and proposes a plan the seller approves before anything runs.

**The core insight:** ad performance has four layers — creative, audience, product/offer, and experience. Every existing tool optimises the first two (they live in Ads Manager). Mazal diagnoses the last two (that data lives in the store). **Stages 0–2 are a media problem; stages 3–6 are a product, offer, or experience problem.**

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monorepo (pnpm)                         │
│                                                                 │
│  packages/contracts  ← Frozen types, metric functions           │
│  packages/ingest     ← CSV parser, event log parser, Zod schema│
│  packages/data       ← Olist benchmarks (NOT YET CREATED)       │
│  packages/engine     ← Deterministic funnel diagnosis (NOT YET) │
│  packages/sim        ← Causal simulator + backtest (NOT YET)    │
│                                                                 │
│  apps/web            ← Next.js App Router frontend (NOT YET)    │
│  apps/mcp            ← MCP server for deco Studio (NOT YET)     │
└─────────────────────────────────────────────────────────────────┘
```

**Tech stack:** TypeScript (ES2022, NodeNext), pnpm workspaces, Vitest for tests, Zod for validation. Frontend will be Next.js App Router on Vercel. MCP server with `@modelcontextprotocol/sdk` + hono.

## Current status — what exists and works

### ✅ `packages/contracts` (Owner: C — FROZEN)

The shared type system and arithmetic vocabulary. **This is frozen.** Any changes require team announcement.

**Types defined (see `src/index.ts`):**
- **Inputs:** `CampaignDay` (daily funnel counts), `ProductCard` (12 fields about the product), `StoreEvent` (date + type + detail)
- **Outputs:** `Finding` (one deviation with audit trail), `Action` (one recommendation with actor), `Verdict` (launch/don't launch with predicted ROAS band)
- **Composite:** `FaultKind` (9 fault types), `ReferenceMode` (benchmark or self-referencing), `BenchmarkTable`, `Distribution`, `Diagnosis`, `RecoveryPlan`

**Metric functions (see `src/metrics.ts`):**
- `safeDiv(a, b)` — returns 0 for 0/0 instead of NaN
- `aggregate(days)` — sums a window of CampaignDay[] into one CampaignDay
- Rate functions: `ctr`, `cpc`, `cpm`, `atcRate`, `icRate`, `cvr`, `cpa`, `aov`, `roas`, `costPerAtc`

**Critical rule:** No rate fields exist in any type. Import these functions. A local `clicks / impressions` will produce inconsistencies.

**Tests:** 3 passing (safeDiv 0/0, aggregate sums, aggregate-then-rate ≠ mean-of-rates)

**How to import:**
```typescript
import type { CampaignDay, Diagnosis, Finding } from '@mazal/contracts';
import { ctr, atcRate, aggregate } from '@mazal/contracts/metrics';
```

### ✅ `packages/ingest` (Owner: C — COMPLETE)

Three exports, all working and tested:

#### `parseMetaCsv(text: string): MetaCsvResult`
Parses a real Meta Ads Manager CSV export. Handles:
- Loose column matching via normalised headers (lowercase, strip parentheticals, substring match)
- pt-BR number format: `"1.240,50"` → `1240.5`
- Missing values: em-dash `—`, double-dash `--`, empty field → `0` + warning
- Date formats: ISO `YYYY-MM-DD` and `DD/MM/YYYY`
- Aggregated rows (start ≠ end date): kept with warning
- Totals rows: dropped with warning
- Rate columns (CTR, CPC, CPM, ROAS): ignored entirely
- Currency extraction from header: `"Amount spent (BRL)"` → `currency: 'BRL'`

**Tests:** 16 passing, including a full end-to-end test against the hand-built fixture (`test/meta-export.csv`).

#### `parseEventLog(text: string): StoreEvent[]`
Parses CSV or JSON store events. Auto-detects format. Validates `StoreEventType` union. Normalises dates.

**Tests:** 7 passing.

#### `productCardSchema: z.ZodType<ProductCard>`
Zod schema with field-level validation for all 12 ProductCard fields. Includes range checks, integer requirements, and enum constraints.

**Tests:** 15 passing.

### ✅ Infrastructure

| Component | Detail |
|---|---|
| Package manager | pnpm 9.15.4 |
| Workspace | `packages/*` + `apps/*` |
| TypeScript | ES2022 target, NodeNext module resolution, strict mode |
| Test runner | Vitest 3.x |
| Total tests | 41 passing, 0 failing |
| Build | `pnpm -r build` succeeds |

## What does NOT exist yet

### ❌ `packages/data` — Benchmark distributions
**Owner:** B
**What it needs to be:** Per-category medians, quartiles, and sample counts derived from the Olist Brazilian E-Commerce dataset. Committed as `benchmarks.json`.
**Blocks:** A (engine needs reference values), D (UI needs reference values for finding cards)
**Key files to create:**
- `derive.ts` — reads Olist CSVs from gitignored `data/raw/`, outputs aggregate stats
- `benchmarks.json` — the committed output (aggregate statistics only, no rows)
- `index.ts` — exports `benchmarks: BenchmarkTable`
**Reference:** `docs/plan/B-data.md`

### ❌ `packages/engine` — Funnel leak localisation
**Owner:** A
**What it needs to be:** The deterministic core. Three functions: `diagnose()`, `predict()`, `buildPlan()`.
**Key algorithm:**
1. Map each metric to a funnel stage (0–6)
2. Compare observed rates to reference (benchmark or self-history)
3. Flag stages where deviation < -1.0 sigma AND sample > minimum
4. Earliest flagged stage = primary finding (cause); later stages = secondary (symptoms)
5. Attribute cause using the stage + event log + product card → `FaultKind`
**Blocks:** D (needs real Diagnosis), E (needs engine for MCP tools)
**Critical rules:** Never call an LLM. Hand-built test fixtures only (never use sim output). Use metric functions from contracts.
**Reference:** `docs/plan/A-engine.md`

### ❌ `packages/sim` — Causal simulator + backtest
**Owner:** B
**What it needs to be:** Generate labelled campaigns (cause first, effect second) and measure engine accuracy.
**Firewall:** B does not read engine source. A does not read sim source. They share only `FaultKind`.
**Blocks:** Slide 6 (the accuracy number)
**Reference:** `docs/plan/B-data.md`

### ❌ `apps/web` — Frontend
**Owner:** D (C joins after ingest is done — ingest IS done)
**What it needs to be:** One-screen Next.js App Router app. Funnel visual (seven stages), finding card, daily chart with change-point, plan panel with toggleable actions, chat sidebar.
**Key design constraint:** One screen, no navigation. The demo time-jumps the data, never changes routes.
**Reference:** `docs/plan/D-frontend.md`

### ❌ `apps/mcp` — MCP server
**Owner:** E
**What it needs to be:** Four MCP tools wrapping engine functions, deployed on Vercel, registered in deco Studio.
**Reference:** `docs/plan/E-agent.md`

## ⚠️ CRITICAL: Nothing is committed to git yet

The last git commit is `8a535e9` (docs only). All code (`packages/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`) is **untracked**.

**Run this immediately:**
```bash
cd /Users/mateusdias/mazal
git add package.json packages/ pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json
git commit -m "SAT-A: contracts (frozen) + ingest (complete) + workspace scaffolding

packages/contracts:
  - All types from docs/contracts.md implemented
  - metrics.ts with safeDiv, aggregate, and 10 rate functions
  - 3 mandatory assertions passing

packages/ingest:
  - parseMetaCsv: 16 tests, handles pt-BR numbers, em-dash nulls, loose column matching
  - parseEventLog: 7 tests, CSV + JSON auto-detection
  - productCardSchema: 15 tests, Zod validation for all 12 fields
  - Hand-built meta-export.csv fixture with real Meta column names

Infrastructure:
  - pnpm workspace with packages/* and apps/*
  - tsconfig.base.json (ES2022, NodeNext, strict)
  - 41 tests passing, build clean"
```

## Hard rules (from AGENTS.md — read it in full)

1. **Every number comes from deterministic TypeScript.** The LLM narrates, drafts, and converses. It never computes or rounds.
2. **Store counts, derive rates.** No `ctr`, `cvr`, `roas`, `atcRate`, `cpc`, `cpa`, or `cpm` field in any type. Import the functions from `@mazal/contracts/metrics`.
3. **`packages/contracts` is frozen.** Announce before changing. Optional fields are cheap; renames are expensive.
4. **Engine and simulator have separate owners** who do not read each other's code. They share only `FaultKind`.
5. **Committed data is aggregate statistics.** Raw CSVs live in gitignored `data/raw/`.
6. **Actions say who can perform them.** `actor: 'mazal' | 'seller'`. Mazal never offers to execute what only the seller can do.
7. **Direct push to `main`.** Commit on green, every time.

## Ownership map

| Package | Owner | Everyone else |
|---|---|---|
| `packages/contracts` | C | Import freely, change only with C + announcement |
| `packages/engine` | A | Call `diagnose`, `predict`, `buildPlan`; don't read source if you own sim |
| `packages/data` | B | Import `benchmarks` |
| `packages/sim` | B | Call `generateCampaign`, `runBacktest`; don't read source if you own engine |
| `packages/ingest` | C | Call `parseMetaCsv`, `parseEventLog`, `productCardSchema` |
| `apps/web` | D (C joins Sunday) | E owns `POST /api/chat` only |
| `apps/mcp` | E | — |

## The ten acceptance claims

The project must satisfy ten claims by demo time. Each has a demo beat and a test. Full details in `docs/acceptance.md`. The ones most relevant to what's built:

| # | Claim | Status |
|---|---|---|
| 1 | States the day the campaign broke | ❌ Needs engine |
| 2 | Names which layer is at fault, with evidence | ❌ Needs engine |
| 3 | When the ad is fine, says so | ❌ Needs engine |
| 4 | Detects overnight collapse, names the cause | ❌ Needs engine + event correlation |
| 5 | One screen reconciles ad spend and product data | ❌ Needs frontend |
| **6** | **Onboarding is a CSV and a form** | **✅ parseMetaCsv + productCardSchema done** |
| 7 | Every action says who can perform it | ❌ Needs engine `buildPlan` |
| 8 | "Don't launch" comes with a number and band | ❌ Needs engine `predict` |
| 9 | Admits when it cannot predict | ❌ Needs engine |
| 10 | It proposes, you decide | ❌ Needs frontend + execute_plan |

## Schedule remaining

| Block | Window | Key deliverables |
|---|---|---|
| **SAT-A** (NOW → 20:00) | ~6 hours left | B: benchmarks.json. A: first diagnose. D: scaffold frontend. E: scaffold MCP. |
| **SAT-B** (20:00 → 02:00) | 6 hours | Engine produces real Findings. Web renders funnel from mocked data. MCP answers one tool call. |
| **Sleep** (02:00 → 08:00) | agents continue | Unattended policy: write code, run tests, commit within own package. Stop and write HANDOFF.md if tests go red or changes touch another package. |
| **SUN-A** (08:00 → 13:00) | 5 hours | First backtest number. Both demo cases demoable. C moves to frontend. |
| **SUN-B** (13:00 → 19:00) | 6 hours | Funnel visual finished. Deck done. Demo fixtures seeded. Full demo run once. |
| **SUN-C** (19:00 → 23:59) | **FROZEN** | Rehearse ×3, record backup video, submit. |

## Cut ladder (when time runs out, cut in this order)

1. PDP URL autofill
2. Monte Carlo → deterministic 3-point sensitivity
3. Calibration plot
4. Expert-agreement calls
5. Case #1's live "toggle a fix" interaction → two static states

Below #5 is the demo itself and is not on the ladder.

## Key documentation

| Document | What it covers |
|---|---|
| `AGENTS.md` | The master rules doc. Wins over all other docs. |
| `docs/contracts.md` | The frozen types and every package's public API |
| `docs/testing.md` | TDD scope, the loop, the three test shapes |
| `docs/acceptance.md` | The ten claims, their demo beats, and their tests |
| `docs/plan/README.md` | Schedule, checkpoints, cut decisions |
| `docs/plan/A-engine.md` | Full engine algorithm, stage table, cause attribution |
| `docs/plan/B-data.md` | Olist derivation, simulator design, backtest protocol |
| `docs/plan/C-ingest.md` | Parser quirks, product card form rules |
| `docs/plan/D-frontend.md` | Screen layout, funnel visual, plan panel |
| `docs/plan/E-agent.md` | MCP tools, narration, deco Studio, deck, demo |
| `prd.md` | Background (stale in places — AGENTS.md wins) |
| `demo-script.md` | Background (stale in places — AGENTS.md wins) |

## How to get running

```bash
# Clone and install
git clone <repo-url>
cd mazal
pnpm install

# Run all tests
pnpm -r test

# Build all packages
pnpm -r build

# Run tests for a specific package
pnpm --filter @mazal/contracts test
pnpm --filter @mazal/ingest test

# Watch mode for development
pnpm --filter @mazal/ingest test:watch
```

## File tree (existing code only)

```
mazal/
├── AGENTS.md                          ← Master rules (read first)
├── CLAUDE.md                          ← Points to AGENTS.md
├── package.json                       ← Root workspace
├── pnpm-workspace.yaml                ← packages/* + apps/*
├── pnpm-lock.yaml
├── tsconfig.base.json                 ← Shared TypeScript config
├── .gitignore
│
├── docs/
│   ├── contracts.md                   ← Frozen type documentation
│   ├── testing.md                     ← TDD rules and examples
│   ├── acceptance.md                  ← The 10 claims Mazal must satisfy
│   ├── HANDOFF.md                     ← Agent handoff (this session)
│   └── plan/
│       ├── README.md                  ← Schedule, checkpoints, cuts
│       ├── A-engine.md
│       ├── B-data.md
│       ├── C-ingest.md
│       ├── D-frontend.md
│       └── E-agent.md
│
├── packages/
│   ├── contracts/
│   │   ├── package.json               ← @mazal/contracts
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts               ← All types + re-exports metrics
│   │       ├── metrics.ts             ← safeDiv, aggregate, 10 rate fns
│   │       └── metrics.test.ts        ← 3 assertions
│   │
│   └── ingest/
│       ├── package.json               ← @mazal/ingest
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts               ← Re-exports 3 public APIs
│       │   ├── meta-csv.ts            ← parseMetaCsv (282 lines)
│       │   ├── meta-csv.test.ts       ← 16 tests
│       │   ├── event-log.ts           ← parseEventLog (126 lines)
│       │   ├── event-log.test.ts      ← 7 tests
│       │   ├── product-card.ts        ← productCardSchema (25 lines)
│       │   └── product-card.test.ts   ← 15 tests
│       └── test/
│           └── meta-export.csv        ← Hand-built fixture (10 lines)
│
├── prd.md                             ← Background (stale in places)
├── demo-script.md                     ← Background (stale in places)
└── questionnaire.md                   ← Seller interview script
```

## Known edge cases and decisions

1. **pt-BR number detection** uses last-comma vs last-dot position heuristic. If a value has comma after dot → pt-BR. If dot after comma → US. If only comma → pt-BR decimal. If only dot → standard. This correctly handles all fixture cases.

2. **Missing values produce both a 0 and a warning.** The engine must check warnings to distinguish "no add-to-carts" from "add-to-carts data missing." This is by design: a stage flagged on a parse artifact is the worst possible finding.

3. **Column matching is by substring on normalised headers.** Priority ordering prevents ambiguity (e.g., `'purchases conversion value'` at priority 97 matches before `'purchases'` at priority 50). Rate columns like `'cost per'` are skipped via `_skip` sentinel.

4. **`OlistCategory` is typed as a union with a `string` escape hatch** (`'health_beauty' | 'bed_bath_table' | 'sports_leisure' | string`). B will generate the full union from Olist's translation CSV. The escape hatch prevents type errors until then.

5. **No `apps/` directory exists yet.** The `pnpm-workspace.yaml` includes `apps/*` but there are no apps. D and E need to create them.
