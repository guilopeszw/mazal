# `packages/sim` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate labelled synthetic campaigns whose faults are injected as causes and only then expressed as metrics, so that scoring A's `diagnose` against them measures something real.

**Architecture:** A seeded PRNG makes every run reproducible from an integer. `sampleStore` draws a `ProductCard` from the Olist quartiles already in `packages/data`. `simulateFunnel` walks impressions → clicks → add-to-carts → checkouts → purchases → revenue for 30 days, and a fault is a small object that deforms *named stages on named days* plus the `StoreEvent` it would have left behind. `generateCampaign` composes those three. `runBacktest` calls A's `diagnose` and tallies.

**Tech Stack:** TypeScript run natively by Node 24 (no build step, no `tsx`). Vitest exists at the repo root but **is not used in this package** — see Global Constraints. Imports come from `@mazal/contracts` and `@mazal/data` only.

## Global Constraints

- **`packages/sim` is test-exempt.** `docs/testing.md`: "`packages/sim` | Exempt | Its test is the backtest. A simulator that passes unit tests can still generate nonsense; only the backtest catches that." and "Exempt means *do not write tests here this weekend*." **Do not create `*.test.ts` in this package.** Every task instead ends in a runnable script whose output you read.
- **The A/B firewall.** `docs/plan/B-data.md`: "**You do not read `packages/engine`'s source.** You call its public API — `diagnose(input)` — and score what comes back." Never open a file under `packages/engine/`. If a task seems to need it, stop and write it up in `docs/HANDOFF.md` instead.
- **Counts, never rates.** `AGENTS.md`: "The contract stores counts; rates are derived." `CampaignDay` carries integers and BRL. Never add a `ctr`/`cvr`/`atcRate` field. Import rate functions from `@mazal/contracts/metrics` when you need to print one.
- **Determinism.** `docs/plan/B-data.md`: fixtures are "generated from fixed seeds so every machine produces identical numbers." **Never call `Math.random()`, `Date.now()`, or `new Date()` with no argument** anywhere in this package. All randomness comes from the seeded `Rng`; all dates are derived from a fixed start date constant.
- **No build step.** Relative imports inside the package end in `.ts` (`'./rng.ts'`), matching `packages/data` and `packages/ingest` on `stage`.
- **Branch policy.** `AGENTS.md`: branch off `stage` as `feat/packages-sim`, commit on green, merge back with `--no-ff`. Never commit to `stage` directly.
- **Node ≥ 24, pnpm 11.5.1.** Root scripts are `pnpm test`, `pnpm typecheck`, `pnpm derive`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/sim/package.json` | `@mazal/sim`, exports `./index.ts`, depends on `@mazal/contracts` and `@mazal/data` |
| `packages/sim/rng.ts` | Seeded PRNG and the four draws built on it. The only source of randomness in the package. |
| `packages/sim/store.ts` | `sampleStore(rng, category?)` → `ProductCard`, drawn from `benchmarks` quartiles |
| `packages/sim/funnel.ts` | `simulateFunnel(...)` → `CampaignDay[]`. Healthy behaviour only; knows nothing about faults. |
| `packages/sim/faults.ts` | One `FaultSpec` per `FaultKind`: which stage multipliers it applies, from which day, and what `StoreEvent` it writes |
| `packages/sim/index.ts` | `generateCampaign`, `runBacktest`, re-exports |
| `packages/sim/backtest.ts` | `runBacktest(campaigns)` → `BacktestReport` |
| `packages/sim/eyeball.ts` | Runnable: prints one series per fault as a table. **This is the SAT-B acceptance check.** |
| `packages/sim/fixtures/demo-case1.json`, `demo-case2.json` | The two campaigns the demo runs on, committed |

`funnel.ts` never imports `faults.ts`. The fault deforms the funnel by handing `simulateFunnel` a per-day multiplier set, which is what keeps "cause first, effect second" true in the code and not just in the comments.

---

### Task 1: Package scaffold and the seeded PRNG

**Files:**
- Create: `packages/sim/package.json`
- Create: `packages/sim/rng.ts`
- Create: `packages/sim/eyeball.ts`
- Modify: `package.json` (root) — add a `sim:eyeball` script

**Interfaces:**
- Consumes: nothing.
- Produces: `type Rng = { float(): number; int(lo: number, hi: number): number; normal(mean: number, sd: number): number; lognormal(median: number, sigma: number): number; pick<T>(xs: readonly T[]): T }` and `makeRng(seed: number): Rng`, all from `packages/sim/rng.ts`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/guilhermelopes/Documents/Coding/mazal
git checkout stage && git pull --ff-only origin stage
git checkout -b feat/packages-sim
```

- [ ] **Step 2: Write `packages/sim/package.json`**

```json
{
  "name": "@mazal/sim",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts"
  },
  "scripts": {
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@mazal/contracts": "workspace:*",
    "@mazal/data": "workspace:*"
  }
}
```

The `test` script is `--passWithNoTests` on purpose: this package is test-exempt, and the script exists only so `pnpm -r test` does not error.

- [ ] **Step 3: Write `packages/sim/rng.ts`**

```ts
// ─── packages/sim/rng.ts ─────────────────────────────────────────────────
// The only randomness in this package. Everything else takes an Rng.
//
// Math.random() cannot appear anywhere in packages/sim: docs/plan/B-data.md
// requires the demo fixtures to be "generated from fixed seeds so every machine
// produces identical numbers", and a single unseeded call anywhere in the tree
// breaks that for the whole run.

export type Rng = {
  /** Uniform on [0, 1). */
  float(): number;
  /** Uniform integer on [lo, hi], both inclusive. */
  int(lo: number, hi: number): number;
  /** Normal draw. Box–Muller, so it consumes two floats. */
  normal(mean: number, sd: number): number;
  /** Positive draw whose median is `median` and whose log has spread `sigma`. */
  lognormal(median: number, sigma: number): number;
  /** Uniform choice from a non-empty array. */
  pick<T>(xs: readonly T[]): T;
};

/**
 * mulberry32 — 32 bits of state, one multiply-shift round. Chosen because it is
 * eight lines, has no dependency, and gives the same stream on every engine,
 * which is the only property that matters here.
 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;

  const float = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = (mean: number, sd: number): number => {
    // Box–Muller. u1 is nudged off zero because Math.log(0) is -Infinity.
    const u1 = float() || Number.EPSILON;
    const u2 = float();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  return {
    float,
    normal,
    int: (lo, hi) => lo + Math.floor(float() * (hi - lo + 1)),
    lognormal: (median, sigma) => median * Math.exp(normal(0, sigma)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(float() * xs.length)]!,
  };
}
```

- [ ] **Step 4: Write `packages/sim/eyeball.ts` — the harness this task delivers**

At this task it only proves the PRNG is deterministic and stream-stable. Later tasks extend it.

```ts
// ─── packages/sim/eyeball.ts ─────────────────────────────────────────────
// Runnable: pnpm sim:eyeball
//
// packages/sim is test-exempt (docs/testing.md) — its real check is the
// backtest. This script is the interim one: it prints what the simulator
// produced so a human can look at it, which is exactly what B-data.md asks
// for ("Eyeball one series per fault: does the chart look like something a
// media buyer would recognise?").

import { makeRng } from './rng.ts';

function checkDeterminism(): void {
  const a = Array.from({ length: 5 }, () => makeRng(42).float());
  const b = Array.from({ length: 5 }, () => makeRng(42).float());
  const stream = makeRng(42);
  const firstFive = Array.from({ length: 5 }, () => stream.float());

  console.log('seed 42, five fresh generators :', a.map((n) => n.toFixed(6)).join(' '));
  console.log('same again                    :', b.map((n) => n.toFixed(6)).join(' '));
  console.log('seed 42, one generator ×5     :', firstFive.map((n) => n.toFixed(6)).join(' '));
  console.log('seed 43, one generator ×5     :',
    Array.from({ length: 5 }, () => makeRng(43).float()).map((n) => n.toFixed(6)).join(' '));

  if (a.join() !== b.join()) throw new Error('same seed gave a different first draw');
  if (new Set(firstFive).size !== 5) throw new Error('the stream is not advancing');
}

checkDeterminism();
```

- [ ] **Step 5: Add the root script**

In `/Users/guilhermelopes/Documents/Coding/mazal/package.json`, inside `"scripts"`, after the `"derive"` line, add:

```json
    "sim:eyeball": "node packages/sim/eyeball.ts",
```

- [ ] **Step 6: Install and run it**

```bash
pnpm install
pnpm sim:eyeball
```

Expected: the first two lines are identical to each other, the third line's five numbers are all different, the seed-43 line differs from the seed-42 line, and the process exits 0.

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/sim package.json pnpm-lock.yaml
git commit -m "feat(sim): seeded PRNG and the eyeball harness

Math.random cannot appear in this package — B-data.md needs the demo
fixtures reproducible from an integer on any machine, and one unseeded
call anywhere breaks that for the whole run. mulberry32 is eight lines
and gives the same stream on every engine.

packages/sim is test-exempt per docs/testing.md, so the check this
package ships is a script whose output a human reads, not a suite."
```

---

### Task 2: Sample a plausible Brazilian store

**Files:**
- Create: `packages/sim/store.ts`
- Modify: `packages/sim/eyeball.ts`

**Interfaces:**
- Consumes: `makeRng`, `Rng` from `./rng.ts`.
- Produces: `sampleStore(rng: Rng, category?: OlistCategory): ProductCard` and `sampleFromQuartiles(rng: Rng, d: Distribution): number`, both from `packages/sim/store.ts`.

`B-data.md`: "Draw each from the Olist distributions you just derived, so a simulated store is a plausible Brazilian store rather than a made-up one."

- [ ] **Step 1: Write `packages/sim/store.ts`**

```ts
// ─── packages/sim/store.ts ───────────────────────────────────────────────
// A simulated store is drawn from the Olist quartiles in packages/data, so it
// is a plausible Brazilian store rather than a made-up one. B-data.md, Part 2,
// step 1.

import { OLIST_CATEGORIES, type Distribution, type OlistCategory, type ProductCard } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import type { Rng } from './rng.ts';

/**
 * Draws a value whose quartiles match `d`. Piecewise-linear through p25, median
 * and p75, with the outer eighths extrapolated one half-IQR further out so the
 * tails are not clipped flat.
 *
 * We have three points of a distribution, not its shape, and this is the
 * cheapest curve that honours all three. A metric with n: 0 — the five media
 * priors — is drawn the same way; it is only ever as good as the prior.
 */
export function sampleFromQuartiles(rng: Rng, d: Distribution): number {
  const u = rng.float();
  const iqr = Math.max(d.p75 - d.p25, 0);

  if (u < 0.125) return d.p25 - iqr * (0.125 - u) * 4;
  if (u < 0.5) return d.p25 + (d.median - d.p25) * ((u - 0.125) / 0.375);
  if (u < 0.875) return d.median + (d.p75 - d.median) * ((u - 0.5) / 0.375);
  return d.p75 + iqr * (u - 0.875) * 4;
}

const PAYMENT_SETS = [
  ['credit', 'pix'],
  ['credit', 'pix', 'boleto'],
  ['credit', 'debit', 'pix', 'boleto', 'installments'],
  ['credit', 'installments'],
] as const satisfies readonly (readonly ProductCard['paymentMethods'][number][])[];

/** A ProductCard drawn from one category's Olist distributions. */
export function sampleStore(rng: Rng, category?: OlistCategory): ProductCard {
  const cat = category ?? rng.pick(OLIST_CATEGORIES);
  const m = benchmarks[cat].metrics;

  const positive = (x: number, floor: number) => Math.max(x, floor);
  const wholeAtLeast = (x: number, floor: number) => Math.max(Math.round(x), floor);

  return {
    category: cat,
    price: Number(positive(sampleFromQuartiles(rng, m.price), 5).toFixed(2)),
    // Not in Olist — Brazilian retail gross margin, centred at 45%.
    grossMargin: Number(Math.min(Math.max(rng.normal(0.45, 0.12), 0.05), 0.9).toFixed(3)),
    shippingCost: Number(positive(
      sampleFromQuartiles(rng, m.price) * sampleFromQuartiles(rng, m.freightRatio), 0,
    ).toFixed(2)),
    deliveryEtaDays: wholeAtLeast(sampleFromQuartiles(rng, m.deliveryDays), 1),
    stockOnHand: rng.int(20, 800),
    reviewCount: wholeAtLeast(rng.lognormal(40, 1.1), 0),
    reviewAvg: Number(Math.min(Math.max(sampleFromQuartiles(rng, m.reviewAvg), 1), 5).toFixed(2)),
    pdpImages: wholeAtLeast(sampleFromQuartiles(rng, m.photos), 1),
    pdpDescriptionLength: wholeAtLeast(sampleFromQuartiles(rng, m.descriptionLength), 0),
    returnPolicyDays: rng.pick([7, 7, 14, 30] as const),
    paymentMethods: [...rng.pick(PAYMENT_SETS)],
    offer: rng.pick(['none', 'none', 'discount', 'free_shipping_threshold', 'bundle'] as const),
  };
}
```

- [ ] **Step 2: Extend `packages/sim/eyeball.ts`**

Replace the whole file with:

```ts
// ─── packages/sim/eyeball.ts ─────────────────────────────────────────────
// Runnable: pnpm sim:eyeball
//
// packages/sim is test-exempt (docs/testing.md) — its real check is the
// backtest. This script is the interim one: it prints what the simulator
// produced so a human can look at it, which is exactly what B-data.md asks
// for ("Eyeball one series per fault: does the chart look like something a
// media buyer would recognise?").

import { makeRng } from './rng.ts';
import { sampleStore } from './store.ts';

function checkDeterminism(): void {
  const a = makeRng(42).float();
  const b = makeRng(42).float();
  if (a !== b) throw new Error('same seed gave a different first draw');
  console.log(`determinism: seed 42 → ${a.toFixed(6)} twice. ok\n`);
}

function printStores(): void {
  console.log('five sampled stores');
  console.log('cat'.padEnd(34), 'price'.padStart(9), 'ship'.padStart(8), 'eta'.padStart(4),
    'rev'.padStart(6), 'avg'.padStart(5), 'img'.padStart(4), 'desc'.padStart(6), 'margin'.padStart(7));

  const rng = makeRng(7);
  for (let i = 0; i < 5; i++) {
    const s = sampleStore(rng);
    console.log(
      s.category.padEnd(34),
      s.price.toFixed(2).padStart(9),
      s.shippingCost.toFixed(2).padStart(8),
      String(s.deliveryEtaDays).padStart(4),
      String(s.reviewCount).padStart(6),
      s.reviewAvg.toFixed(2).padStart(5),
      String(s.pdpImages).padStart(4),
      String(s.pdpDescriptionLength).padStart(6),
      s.grossMargin.toFixed(3).padStart(7),
    );
  }
  console.log();
}

checkDeterminism();
printStores();
```

- [ ] **Step 3: Run it and read the numbers**

```bash
pnpm sim:eyeball
```

Expected, and **you must actually check this, because nothing else will**: prices are BRL two-figure-to-three-figure numbers, not `0` and not `1e6`; `eta` is roughly 8–40 days; `avg` is between 1 and 5; `img` is at least 1; `margin` is between 0.05 and 0.9. Sanity anchors from `docs/HANDOFF.md`: `health_beauty` median price R$79.90, freight ratio 21%, promised ETA 23 days, review median 5, photos 1.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): draw stores from the Olist quartiles

A simulated store has to be a plausible Brazilian store or the backtest
scores A against fiction. sampleFromQuartiles is piecewise-linear through
p25, median and p75 — we have three points of a distribution, not its
shape, and that is the cheapest curve honouring all three.

grossMargin and stockOnHand are not in Olist and are drawn from stated
priors instead; they are the two fields a seller types rather than the
store reporting."
```

---

### Task 3: The healthy funnel — `fault: 'none'`

**Files:**
- Create: `packages/sim/funnel.ts`
- Modify: `packages/sim/eyeball.ts`

**Interfaces:**
- Consumes: `Rng` from `./rng.ts`.
- Produces, from `packages/sim/funnel.ts`:
  - `type StageMultipliers = { impressions: number; ctr: number; atcRate: number; icRate: number; purchaseRate: number; aov: number; cpm: number }`
  - `const NEUTRAL: StageMultipliers`
  - `type FunnelParams = { campaignId: string; dailyBudget: number; baseCpm: number; baseCtr: number; baseAtcRate: number; baseIcRate: number; basePurchaseRate: number; aov: number; days: number; startDate: string }`
  - `function sampleFunnelParams(rng: Rng, card: ProductCard): FunnelParams`
  - `function simulateFunnel(rng: Rng, p: FunnelParams, perDay: StageMultipliers[]): CampaignDay[]`
  - `function addDays(isoDate: string, n: number): string`

`B-data.md`: "`none` | nothing | healthy campaign with normal noise — **the most important class**" and "False alarms are what get an agent uninstalled."

- [ ] **Step 1: Write `packages/sim/funnel.ts`**

```ts
// ─── packages/sim/funnel.ts ──────────────────────────────────────────────
// Forward-simulates 30 days of funnel counts. This file knows nothing about
// faults: a fault reaches it only as a per-day set of multipliers, which is
// what keeps "cause first, effect second" true in the code and not only in
// the comments.

import type { CampaignDay, ProductCard } from '@mazal/contracts';
import type { Rng } from './rng.ts';

/** One multiplier per funnel stage. 1 means untouched. */
export type StageMultipliers = {
  impressions: number;
  ctr: number;
  atcRate: number;
  icRate: number;
  purchaseRate: number;
  aov: number;
  cpm: number;
};

export const NEUTRAL: StageMultipliers = {
  impressions: 1, ctr: 1, atcRate: 1, icRate: 1, purchaseRate: 1, aov: 1, cpm: 1,
};

export type FunnelParams = {
  campaignId: string;
  dailyBudget: number;             // BRL
  baseCpm: number;                 // BRL per 1000 impressions
  baseCtr: number;
  baseAtcRate: number;             // add-to-carts per click
  baseIcRate: number;              // checkouts per add-to-cart
  basePurchaseRate: number;        // purchases per checkout initiated
  aov: number;                     // BRL
  days: number;
  startDate: string;               // ISO 8601
};

/**
 * The published BRL priors that ship in benchmarks.json, restated here as the
 * generator's centre. cvr 0.021 = atcRate 0.08 × icRate 0.45 × purchaseRate,
 * so purchaseRate is 0.583 and the four rates are mutually consistent — a
 * generator whose stages disagree with its own funnel rate teaches the engine
 * a relationship that does not hold.
 */
const PRIOR = { cpm: 22, ctr: 0.011, atcRate: 0.08, icRate: 0.45, purchaseRate: 0.583 } as const;

/** No timezone maths: the whole package runs on UTC midnights. */
export function addDays(isoDate: string, n: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function sampleFunnelParams(rng: Rng, card: ProductCard): FunnelParams {
  return {
    campaignId: `sim-${rng.int(100000, 999999)}`,
    dailyBudget: Math.round(rng.lognormal(180, 0.6)),
    baseCpm: PRIOR.cpm * rng.lognormal(1, 0.25),
    baseCtr: PRIOR.ctr * rng.lognormal(1, 0.3),
    baseAtcRate: PRIOR.atcRate * rng.lognormal(1, 0.3),
    baseIcRate: PRIOR.icRate * rng.lognormal(1, 0.2),
    basePurchaseRate: PRIOR.purchaseRate * rng.lognormal(1, 0.15),
    aov: card.price + card.shippingCost,
    days: 30,
    // Fixed: nothing in this package may read the clock (see Global Constraints).
    startDate: '2026-07-01',
  };
}

/**
 * `perDay[i]` is the multiplier set for day i. Pass `NEUTRAL` for a healthy day.
 *
 * Counts are rounded at every stage and clamped so a later stage can never
 * exceed the earlier one it draws from. Without that clamp, day-level noise
 * occasionally produces more purchases than checkouts, and a seller who spots
 * that in the UI stops believing the rest of the screen.
 */
export function simulateFunnel(rng: Rng, p: FunnelParams, perDay: StageMultipliers[]): CampaignDay[] {
  const days: CampaignDay[] = [];

  for (let i = 0; i < p.days; i++) {
    const m = perDay[i] ?? NEUTRAL;
    const noise = () => rng.lognormal(1, 0.12);

    const cpm = p.baseCpm * m.cpm * rng.lognormal(1, 0.08);
    const spend = p.dailyBudget * m.impressions * rng.lognormal(1, 0.05);
    const impressions = Math.max(0, Math.round((spend / cpm) * 1000));

    const clicks = Math.min(impressions, Math.round(impressions * p.baseCtr * m.ctr * noise()));
    const addToCarts = Math.min(clicks, Math.round(clicks * p.baseAtcRate * m.atcRate * noise()));
    const checkoutsInitiated = Math.min(addToCarts, Math.round(addToCarts * p.baseIcRate * m.icRate * noise()));
    const purchases = Math.min(checkoutsInitiated,
      Math.round(checkoutsInitiated * p.basePurchaseRate * m.purchaseRate * noise()));

    days.push({
      date: addDays(p.startDate, i),
      campaignId: p.campaignId,
      spend: Number(spend.toFixed(2)),
      impressions,
      // Meta reach is below impressions; frequency climbs slowly over a flight.
      reach: Math.round(impressions / (1.15 + i * 0.03)),
      clicks,
      addToCarts,
      checkoutsInitiated,
      purchases,
      revenue: Number((purchases * p.aov * m.aov).toFixed(2)),
    });
  }

  return days;
}
```

- [ ] **Step 2: Extend `packages/sim/eyeball.ts`**

Add these imports below the existing ones:

```ts
import { aggregate, atcRate, ctr, cvr, icRate, roas } from '@mazal/contracts/metrics';
import { NEUTRAL, sampleFunnelParams, simulateFunnel } from './funnel.ts';
```

Add this function above the call block at the bottom of the file:

```ts
function printSeries(label: string, days: import('@mazal/contracts').CampaignDay[]): void {
  console.log(`── ${label} ${'─'.repeat(Math.max(0, 58 - label.length))}`);
  console.log('date'.padEnd(12), 'impr'.padStart(8), 'clicks'.padStart(7), 'atc'.padStart(6),
    'ic'.padStart(5), 'buy'.padStart(5), 'ctr%'.padStart(7), 'atc%'.padStart(7), 'ic%'.padStart(7));

  for (const d of days) {
    console.log(
      d.date.padEnd(12),
      String(d.impressions).padStart(8),
      String(d.clicks).padStart(7),
      String(d.addToCarts).padStart(6),
      String(d.checkoutsInitiated).padStart(5),
      String(d.purchases).padStart(5),
      (ctr(d) * 100).toFixed(2).padStart(7),
      (atcRate(d) * 100).toFixed(2).padStart(7),
      (icRate(d) * 100).toFixed(2).padStart(7),
    );
  }

  const total = aggregate(days);
  console.log(`  30-day: ctr ${(ctr(total) * 100).toFixed(2)}%  atc ${(atcRate(total) * 100).toFixed(2)}%` +
    `  ic ${(icRate(total) * 100).toFixed(2)}%  cvr ${(cvr(total) * 100).toFixed(2)}%  roas ${roas(total).toFixed(2)}\n`);
}

function printHealthy(): void {
  const rng = makeRng(101);
  const card = sampleStore(rng);
  const params = sampleFunnelParams(rng, card);
  const days = simulateFunnel(rng, params, Array.from({ length: params.days }, () => NEUTRAL));
  printSeries(`none — ${card.category}`, days);
}
```

Replace the bottom call block with:

```ts
checkDeterminism();
printStores();
printHealthy();
```

- [ ] **Step 3: Run it and read the series**

```bash
pnpm sim:eyeball
```

Expected, and this is the judgement call the task exists for: the 30-day `ctr` lands near 1.1%, `atc` near 8%, `ic` near 45%, `cvr` near 2.1%. Day-to-day columns wobble but show **no step change and no trend** — a healthy campaign is the class the false-alarm rate is measured on, so a drift here becomes a false positive later. `buy` is never above `ic`, `ic` never above `atc`, `atc` never above `clicks`.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): forward-simulate a healthy 30-day funnel

funnel.ts does not import faults.ts and never will. A fault reaches it as
a per-day multiplier set, which is what keeps cause-first-effect-second
true in the code rather than only in the comment above it.

The four base rates are mutually consistent — cvr 0.021 is atcRate 0.08 x
icRate 0.45 x purchaseRate 0.583 — because a generator whose stages
disagree with its own funnel rate teaches the engine a relationship that
does not hold. Every stage is clamped to the one above it: unclamped
noise occasionally prints more purchases than checkouts, and a seller who
sees that stops believing the rest of the screen."
```

---

### Task 4: The two break faults — `stockout` and `eta_shock`

**Files:**
- Create: `packages/sim/faults.ts`
- Create: `packages/sim/index.ts`
- Modify: `packages/sim/eyeball.ts`

**Interfaces:**
- Consumes: `StageMultipliers`, `NEUTRAL`, `FunnelParams`, `addDays`, `sampleFunnelParams`, `simulateFunnel` from `./funnel.ts`; `sampleStore` from `./store.ts`; `makeRng`, `Rng` from `./rng.ts`.
- Produces:
  - from `packages/sim/faults.ts`: `type FaultPlan = { multipliers: StageMultipliers[]; events: StoreEvent[]; injectedOn?: string }` and `function planFault(rng: Rng, kind: FaultKind, card: ProductCard, p: FunnelParams): FaultPlan`
  - from `packages/sim/index.ts`: `function generateCampaign(seed: number, fault?: FaultKind): LabelledCampaign`

`B-data.md`: "a stockout writes a `stockout` event, an ETA shock writes an `eta_change` with the detail string `\"supplier ETA 9d → 22d\"`… a simulated fault that leaves no trace in the event log is not simulating reality."

- [ ] **Step 1: Write `packages/sim/faults.ts`**

Only three kinds are implemented in this task. The `default` arm throws by name so Task 5 cannot silently ship a fault that generates a healthy series and is then scored as if it were broken.

```ts
// ─── packages/sim/faults.ts ──────────────────────────────────────────────
// One fault, injected as a cause. Each kind returns the per-day multipliers it
// applies and the StoreEvent it would have left in the real world.
//
// B-data.md: "a simulated fault that leaves no trace in the event log is not
// simulating reality" — the event log is how the engine turns a broken stage
// into a named cause.

import type { FaultKind, ProductCard, StoreEvent } from '@mazal/contracts';
import { NEUTRAL, addDays, type FunnelParams, type StageMultipliers } from './funnel.ts';
import type { Rng } from './rng.ts';

export type FaultPlan = {
  multipliers: StageMultipliers[];
  events: StoreEvent[];
  /** ISO date the fault starts. Absent for `none` and for day-one conditions. */
  injectedOn?: string;
};

const neutralDays = (n: number): StageMultipliers[] => Array.from({ length: n }, () => ({ ...NEUTRAL }));

export function planFault(rng: Rng, kind: FaultKind, card: ProductCard, p: FunnelParams): FaultPlan {
  const multipliers = neutralDays(p.days);

  switch (kind) {
    case 'none':
      return { multipliers, events: [] };

    case 'stockout': {
      // Stage 3. "ATC → near zero from a day, CTR unchanged."
      const day = rng.int(8, 22);
      const date = addDays(p.startDate, day);
      for (let i = day; i < p.days; i++) multipliers[i]!.atcRate = rng.lognormal(0.06, 0.3);
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'stockout', detail: `stock on hand ${card.stockOnHand} → 0` }],
      };
    }

    case 'eta_shock': {
      // Stage 4. "IC rate collapses from a day, ATC unchanged."
      const day = rng.int(8, 22);
      const date = addDays(p.startDate, day);
      const to = card.deliveryEtaDays + rng.int(9, 16);
      for (let i = day; i < p.days; i++) multipliers[i]!.icRate = rng.lognormal(0.35, 0.25);
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'eta_change', detail: `supplier ETA ${card.deliveryEtaDays}d → ${to}d` }],
      };
    }

    default:
      throw new Error(
        `planFault: '${kind}' is not implemented yet. Implement it in faults.ts before generating it — ` +
          `a fault that produces a healthy series but carries a fault label poisons the backtest silently.`,
      );
  }
}
```

- [ ] **Step 2: Write `packages/sim/index.ts`**

```ts
// ─── packages/sim/index.ts ───────────────────────────────────────────────
// docs/contracts.md § packages/sim.

import type { FaultKind, LabelledCampaign } from '@mazal/contracts';
import { planFault } from './faults.ts';
import { sampleFunnelParams, simulateFunnel } from './funnel.ts';
import { makeRng } from './rng.ts';
import { sampleStore } from './store.ts';

/**
 * Cause first, effect second: sample a store, sample a campaign, decide the
 * fault, and only then let the funnel run. The label is returned beside the
 * metrics and is never derivable from them by construction.
 *
 * The same seed and the same fault give byte-identical output on any machine.
 */
export function generateCampaign(seed: number, fault: FaultKind = 'none'): LabelledCampaign {
  const rng = makeRng(seed);
  const card = sampleStore(rng);
  const params = sampleFunnelParams(rng, card);
  const plan = planFault(rng, fault, card, params);
  const days = simulateFunnel(rng, params, plan.multipliers);

  return {
    days,
    card,
    events: plan.events,
    fault: plan.injectedOn ? { kind: fault, injectedOn: plan.injectedOn } : { kind: fault },
  };
}

export { makeRng, type Rng } from './rng.ts';
export { sampleStore } from './store.ts';
```

- [ ] **Step 3: Extend `packages/sim/eyeball.ts`**

Add the import:

```ts
import { generateCampaign } from './index.ts';
```

Replace `printHealthy` and the bottom call block with:

```ts
const IMPLEMENTED = ['none', 'stockout', 'eta_shock'] as const;

function printFaults(): void {
  for (const [i, kind] of IMPLEMENTED.entries()) {
    const c = generateCampaign(101 + i, kind);
    const on = c.fault.injectedOn ? ` injected ${c.fault.injectedOn}` : '';
    printSeries(`${kind}${on} — ${c.card.category}`, c.days);
    console.log('  events:', c.events.length === 0 ? '(none)' :
      c.events.map((e) => `${e.date} ${e.type} "${e.detail}"`).join('; '), '\n');
  }
}

checkDeterminism();
printStores();
printFaults();
```

- [ ] **Step 4: Run it and read all three series**

```bash
pnpm sim:eyeball
```

Expected, per `B-data.md`'s fault table — **read the columns, this is the acceptance check for SAT-B**:
- `none`: no step change anywhere.
- `stockout`: `atc%` falls to near zero on the injected date and stays there; **`ctr%` is visibly unchanged** across that date. One `stockout` event on that date.
- `eta_shock`: `ic%` drops sharply on the injected date; **`atc%` is unchanged** across it. One `eta_change` event whose detail reads `supplier ETA 9d → 22d`.

If `ctr%` also moves under `stockout`, the fault is deforming a stage it should not and the backtest would be scoring noise. Fix it before committing.

- [ ] **Step 5: Confirm the same seed gives the same campaign**

```bash
node -e "
const a = JSON.stringify((await import('./packages/sim/index.ts')).generateCampaign(5, 'stockout'));
const b = JSON.stringify((await import('./packages/sim/index.ts')).generateCampaign(5, 'stockout'));
console.log(a === b ? 'deterministic: ok' : 'NOT DETERMINISTIC');
" --input-type=module
```

Expected: `deterministic: ok`.

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Commit and merge SAT-B**

```bash
git add packages/sim
git commit -m "feat(sim): generateCampaign with the two break faults

stockout takes stage 3 to near zero from a day and leaves CTR alone;
eta_shock collapses stage 4 and leaves ATC alone. Each writes the
StoreEvent it would have left in the real world, because the event log is
how the engine turns a broken stage into a named cause and a fault with
no trace is not simulating reality.

planFault throws by name on the six kinds that are not built yet. A fault
that generates a healthy series while carrying a fault label poisons the
backtest and nothing downstream would report it."

git checkout stage && git pull --ff-only origin stage
git merge --no-ff feat/packages-sim
pnpm test && pnpm typecheck
git push origin stage
```

**SAT-B is complete at this point.**

---

### Task 5: The remaining six faults

**Files:**
- Modify: `packages/sim/faults.ts`
- Modify: `packages/sim/eyeball.ts`

**Interfaces:**
- Consumes: everything from Task 4.
- Produces: `planFault` handling all nine `FaultKind` values; no `default` throw remains reachable.

- [ ] **Step 1: Add the six cases to `packages/sim/faults.ts`**

Insert these before the `default:` arm.

```ts
    case 'creative_fatigue': {
      // Stages 0–1. "frequency climbs past 4, CTR decays gradually, CPM flat."
      // Reach is impressions / (1.15 + i*0.03) in funnel.ts, so frequency passes
      // 4 around day 25 on its own; the fault is the CTR decay riding on it.
      const start = rng.int(6, 14);
      for (let i = start; i < p.days; i++) {
        multipliers[i]!.ctr = Math.max(0.35, 1 - (i - start) * 0.045);
      }
      return {
        multipliers,
        injectedOn: addDays(p.startDate, start),
        events: [],   // nobody logs an event when a creative gets tired
      };
    }

    case 'price_too_high': {
      // Stages 3 and 6, from day one — a condition, not a break.
      const squeeze = rng.lognormal(0.45, 0.2);
      for (const m of multipliers) { m.atcRate = squeeze; m.aov = 1.25; }
      return { multipliers, events: [] };
    }

    case 'checkout_friction': {
      // Stage 5. "CVR depressed, IC fine." Purchases per checkout, not per click.
      const day = rng.int(6, 20);
      const date = addDays(p.startDate, day);
      for (let i = day; i < p.days; i++) multipliers[i]!.purchaseRate = rng.lognormal(0.3, 0.25);
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'policy_flag', detail: 'checkout step added: address confirmation' }],
      };
    }

    case 'pixel_break': {
      // "everything drops to near zero on one day" — and stays there, because a
      // broken pixel stops reporting until someone fixes it. Spend keeps running,
      // which is exactly what makes it expensive and what makes it detectable.
      const day = rng.int(10, 24);
      const date = addDays(p.startDate, day);
      for (let i = day; i < p.days; i++) {
        multipliers[i]!.atcRate = 0.02;
        multipliers[i]!.icRate = 0.02;
        multipliers[i]!.purchaseRate = 0.02;
      }
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'pixel_error', detail: 'purchase event stopped firing' }],
      };
    }

    case 'budget_cap': {
      // Stage 0. "impressions flatten, CPM rises, spend pinned."
      const day = rng.int(8, 18);
      const date = addDays(p.startDate, day);
      for (let i = day; i < p.days; i++) {
        multipliers[i]!.cpm = 1 + (i - day) * 0.05;
        multipliers[i]!.impressions = 1;      // spend pinned at the daily budget
      }
      return {
        multipliers,
        injectedOn: date,
        events: [{ date, type: 'budget_change', detail: 'daily budget capped by the account spend limit' }],
      };
    }

    case 'thin_pdp': {
      // Stage 3, from day one, "with a low photo count and short description on
      // the card". The card is mutated here because for this fault the card IS
      // the cause — the engine is meant to read it off the PDP fields.
      card.pdpImages = 1;
      card.pdpDescriptionLength = rng.int(40, 160);
      for (const m of multipliers) m.atcRate = rng.lognormal(0.5, 0.2);
      return { multipliers, events: [] };
    }
```

- [ ] **Step 2: Widen the eyeball list**

In `packages/sim/eyeball.ts`, replace the `IMPLEMENTED` constant with:

```ts
import { FAULT_KINDS } from './faults.ts';
const IMPLEMENTED = FAULT_KINDS;
```

and add to the top of `packages/sim/faults.ts`, below the imports:

```ts
/** Every FaultKind, in the order B-data.md's table lists them. */
export const FAULT_KINDS = [
  'none', 'stockout', 'eta_shock', 'creative_fatigue', 'price_too_high',
  'checkout_friction', 'pixel_break', 'budget_cap', 'thin_pdp',
] as const satisfies readonly FaultKind[];
```

- [ ] **Step 3: Run it and read all nine**

```bash
pnpm sim:eyeball
```

Expected, checked against `B-data.md`'s table row by row:

| kind | must move | must **not** move |
|---|---|---|
| `creative_fatigue` | `ctr%` decays gradually | `atc%`, `ic%`; CPM flat |
| `price_too_high` | `atc%` low **from day one** | `ic%`; AOV rises |
| `checkout_friction` | `cvr` drops | `ic%` |
| `pixel_break` | `atc%`, `ic%`, `buy` all near zero on one day | `impr`, `clicks` keep running |
| `budget_cap` | `impr` flattens, spend pinned | `ctr%`, `atc%` |
| `thin_pdp` | `atc%` low from day one, card shows `img 1` | `ic%` |

A break must show a *step*, a condition must be flat-and-low from day one. If a condition looks like a break, the two reference modes are not being exercised and Case #1 and Case #2 in the demo collapse into the same story.

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm typecheck
git add packages/sim
git commit -m "feat(sim): the remaining six faults

Four breaks and two conditions. The split matters beyond the labels: a
condition is present from day one and only a benchmark can catch it, a
break starts mid-flight and the campaign's own history catches it. They
are what exercise the two ReferenceMode arms, and the demo's two cases
are one of each.

thin_pdp mutates the card because for that fault the card is the cause —
the engine reads it off the PDP fields rather than off the funnel."
```

---

### Task 6: `runBacktest`

**Files:**
- Create: `packages/sim/backtest.ts`
- Modify: `packages/sim/index.ts`
- Create: `packages/sim/run-backtest.ts`
- Modify: `package.json` (root) — add `sim:backtest`

**Interfaces:**
- Consumes: `generateCampaign`; `diagnose` from `@mazal/engine` (**public API only — never open its source**); `benchmarks` from `@mazal/data`.
- Produces: `function runBacktest(campaigns: LabelledCampaign[]): BacktestReport` from `packages/sim/backtest.ts`, re-exported from `packages/sim/index.ts`.

**This task is blocked until `packages/engine` exports `diagnose`.** If it does not exist yet, stop here, append to `docs/HANDOFF.md`, and do Task 7 first.

- [ ] **Step 1: Add the engine dependency**

In `packages/sim/package.json`, add to `"dependencies"`:

```json
    "@mazal/engine": "workspace:*",
```

Then `pnpm install`.

- [ ] **Step 2: Write `packages/sim/backtest.ts`**

```ts
// ─── packages/sim/backtest.ts ────────────────────────────────────────────
// Scores A's diagnose against labels A never sees.
//
// The firewall (B-data.md): this file imports diagnose and nothing else from
// the engine. Do not open packages/engine's source — if A can see how the
// faults deform the metrics, A can fit to the generator and the number stops
// meaning anything.

import type { BacktestReport, FaultKind, LabelledCampaign } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import { diagnose } from '@mazal/engine';
import { FAULT_KINDS } from './faults.ts';

const emptyConfusion = (): Record<FaultKind, Record<FaultKind, number>> =>
  Object.fromEntries(FAULT_KINDS.map((actual) => [
    actual, Object.fromEntries(FAULT_KINDS.map((predicted) => [predicted, 0])),
  ])) as Record<FaultKind, Record<FaultKind, number>>;

export function runBacktest(campaigns: LabelledCampaign[]): BacktestReport {
  const confusion = emptyConfusion();
  let top1 = 0;
  let top2 = 0;
  let noneTotal = 0;
  let falseAlarms = 0;

  for (const c of campaigns) {
    const result = diagnose({
      days: c.days,
      card: c.card,
      events: c.events,
      reference: { kind: 'benchmark', table: benchmarks },
    });

    const actual = c.fault.kind;
    const predicted = result.suspectedCause;
    confusion[actual][predicted] += 1;

    if (predicted === actual) {
      top1 += 1;
      top2 += 1;
    } else if (result.secondary.some((f) => f.causeLayer === result.primary?.causeLayer)) {
      // top-2: "correct within the primary or the strongest secondary finding's
      // implied cause". The engine reports a cause per diagnosis, not per
      // finding, so the secondary's cause layer is the only proxy available
      // across the firewall. Say so on the slide rather than implying it is
      // a second guess at the fault kind.
      top2 += 1;
    }

    if (actual === 'none') {
      noneTotal += 1;
      if (result.primary !== null) falseAlarms += 1;
    }
  }

  const n = campaigns.length;
  return {
    top1: n === 0 ? 0 : top1 / n,
    top2: n === 0 ? 0 : top2 / n,
    falseAlarmRate: noneTotal === 0 ? 0 : falseAlarms / noneTotal,
    confusion,
    n,
  };
}
```

- [ ] **Step 3: Re-export from `packages/sim/index.ts`**

Add at the bottom:

```ts
export { runBacktest } from './backtest.ts';
export { FAULT_KINDS } from './faults.ts';
```

- [ ] **Step 4: Write `packages/sim/run-backtest.ts`**

```ts
// ─── packages/sim/run-backtest.ts ────────────────────────────────────────
// Runnable: pnpm sim:backtest
//
// 400 campaigns, seeds 1000–1399. The last 100 are the held-out set A never
// sees, and A is never shown a per-class breakdown of them — only the
// aggregate (B-data.md).

import { FAULT_KINDS, generateCampaign, runBacktest } from './index.ts';
import type { LabelledCampaign } from '@mazal/contracts';

const campaigns: LabelledCampaign[] = [];
for (let i = 0; i < 400; i++) {
  campaigns.push(generateCampaign(1000 + i, FAULT_KINDS[i % FAULT_KINDS.length]!));
}

const train = campaigns.slice(0, 300);
const held = campaigns.slice(300);

const report = runBacktest(held);

console.log(`held-out n=${report.n}`);
console.log(`top-1            ${(report.top1 * 100).toFixed(1)}%`);
console.log(`top-2            ${(report.top2 * 100).toFixed(1)}%`);
console.log(`false alarm rate ${(report.falseAlarmRate * 100).toFixed(1)}%  (on fault: 'none')`);

console.log('\nconfusion — TRAINING half only, safe to show A');
const trainReport = runBacktest(train);
const w = Math.max(...FAULT_KINDS.map((k) => k.length));
console.log(''.padEnd(w), FAULT_KINDS.map((k) => k.slice(0, 6).padStart(7)).join(''));
for (const actual of FAULT_KINDS) {
  console.log(actual.padEnd(w),
    FAULT_KINDS.map((p) => String(trainReport.confusion[actual][p]).padStart(7)).join(''));
}

console.log('\nDo not show A a per-class breakdown of the held-out set — B-data.md.');
```

- [ ] **Step 5: Add the root script**

In root `package.json` `"scripts"`, after `"sim:eyeball"`:

```json
    "sim:backtest": "node packages/sim/run-backtest.ts",
```

- [ ] **Step 6: Run it**

```bash
pnpm sim:backtest
```

Expected: three percentages and a 9×9 matrix. **There is no target number.** `B-data.md`: "Report what you measure. If a class does badly, say which and why on the slide… is a stronger answer than a suspicious 99%." Write down whatever it says and note the two worst-confused pairs for slide 6.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm typecheck
git add packages/sim package.json pnpm-lock.yaml
git commit -m "feat(sim): backtest A's diagnose against held-out labels

400 campaigns from fixed seeds, the last 100 held out. This file imports
diagnose and nothing else from the engine: if A can see how the faults
deform the metrics, A fits the generator and the number stops meaning
anything.

The confusion matrix printed for A is the training half only. Report what
it says — naming the two classes we confuse and why is a stronger slide
than a suspicious 99%."
```

---

### Task 7: Demo fixtures

**Files:**
- Create: `packages/sim/fixtures/demo-case1.json`
- Create: `packages/sim/fixtures/demo-case2.json`
- Create: `packages/sim/write-fixtures.ts`
- Modify: `package.json` (root) — add `sim:fixtures`

**Interfaces:**
- Consumes: `generateCampaign`.
- Produces: two committed JSON files, each a `LabelledCampaign`.

`B-data.md`: "the exact two campaigns the demo runs on, generated from fixed seeds so every machine produces identical numbers." Case #1 is a condition (pre-flight, benchmark reference), Case #2 is a break (in-flight, self reference).

- [ ] **Step 1: Write `packages/sim/write-fixtures.ts`**

```ts
// ─── packages/sim/write-fixtures.ts ──────────────────────────────────────
// Runnable: pnpm sim:fixtures. Output is committed and never hand-edited.
//
// Case 1 is a condition — present from day one, only a benchmark catches it.
// Case 2 is a break — starts mid-flight, the campaign's own history catches it.
// One of each, because they are what exercise the two ReferenceMode arms.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateCampaign } from './index.ts';

const CASES = [
  { file: 'demo-case1.json', seed: 20260809, fault: 'thin_pdp' as const },
  { file: 'demo-case2.json', seed: 20260810, fault: 'eta_shock' as const },
];

for (const c of CASES) {
  const campaign = generateCampaign(c.seed, c.fault);
  const path = join(import.meta.dirname, 'fixtures', c.file);
  writeFileSync(path, `${JSON.stringify(campaign, null, 2)}\n`);
  console.log(`${c.file}  seed ${c.seed}  ${c.fault}  ${campaign.card.category}  ${campaign.days.length} days`);
}
```

- [ ] **Step 2: Create the directory and add the root script**

```bash
mkdir -p packages/sim/fixtures
```

In root `package.json` `"scripts"`, after `"sim:backtest"`:

```json
    "sim:fixtures": "node packages/sim/write-fixtures.ts",
```

- [ ] **Step 3: Generate, then generate again**

```bash
pnpm sim:fixtures
git add packages/sim/fixtures
pnpm sim:fixtures
git diff --stat
```

Expected: `git diff --stat` prints nothing. If it prints anything, something in the package is reading the clock or calling `Math.random()` — find it before going further, because `SUN-B` requires byte-identical output on a second machine and this is the same failure one step earlier.

- [ ] **Step 4: Check the two cases actually differ in kind**

```bash
node -e "
const c1 = require('./packages/sim/fixtures/demo-case1.json');
const c2 = require('./packages/sim/fixtures/demo-case2.json');
console.log('case1', c1.fault, 'events', c1.events.length, 'imgs', c1.card.pdpImages);
console.log('case2', c2.fault, 'events', c2.events.length);
"
```

Expected: case 1 has no `injectedOn` and `pdpImages: 1`; case 2 has an `injectedOn` date and one `eta_change` event.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add packages/sim package.json
git commit -m "feat(sim): commit the two demo fixtures

Generated from fixed seeds and committed, so the demo shows the same
numbers on the presenter's laptop as on a judge's clone. Regenerating
twice leaves git clean — the check that catches a clock read or an
unseeded draw one step before SUN-B needs it on a second machine.

Case 1 is a condition and Case 2 is a break, which is what puts both
ReferenceMode arms on screen."
```

- [ ] **Step 6: Merge and record**

```bash
git checkout stage && git pull --ff-only origin stage
git merge --no-ff feat/packages-sim
pnpm test && pnpm typecheck
git push origin stage
git branch -d feat/packages-sim
```

Then append an entry to `docs/HANDOFF.md` naming the backtest numbers you measured, the two worst-confused classes, and whether the fixtures have yet been regenerated on a second machine.

---

## Self-Review

**Spec coverage.** `B-data.md` Part 2's five generation steps map to Tasks 2 (store), 3 (campaign + forward simulation), 4 and 5 (fault injection and label stored separately). All nine rows of the fault table are in Task 4 or 5 with their "Deforms" and "Shape" columns quoted into the expected-output checks. The four `runBacktest` outputs are in Task 6. The 400/100 split, the "A never sees" rule and the demo fixtures are in Tasks 6 and 7. The `StoreEvent` requirement, including the exact `"supplier ETA 9d → 22d"` detail string, is in Task 4.

**Known gap, deliberate.** `top2` is approximated: `Diagnosis` carries one `suspectedCause` for the whole diagnosis and `Finding` carries a `causeLayer`, not a `FaultKind`, so "the strongest secondary finding's implied cause" cannot be read exactly without opening the engine, which the firewall forbids. Task 6 uses the secondary's cause layer and says so in a comment; the same caveat belongs on slide 6. Resolving it properly needs a contract change — an optional `impliedCause?: FaultKind` on `Finding` — which is C's call and an announcement.

**Type consistency.** `StageMultipliers` has the same seven keys in `funnel.ts`, `NEUTRAL`, and every `case` in `faults.ts`. `FunnelParams.days` is the length used for `neutralDays(p.days)` and for `perDay[i]`. `FaultPlan.injectedOn` is optional and feeds `LabelledCampaign.fault.injectedOn`, which is optional in the contract. `FAULT_KINDS` is declared in `faults.ts` in Task 5 and imported by `eyeball.ts` (Task 5), `backtest.ts` and `run-backtest.ts` (Task 6).
