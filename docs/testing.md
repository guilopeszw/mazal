# Testing

## Where TDD is mandatory

| Package | TDD | Why |
|---|---|---|
| `packages/engine` | **Mandatory** | Pure functions, obvious contracts, and it is the thing judges audit. Every claim on screen traces to a rule here. |
| `packages/ingest` | **Mandatory** | Parsers fail on data you did not imagine. A test is how you record the row that broke it. |
| `packages/contracts` | Types only | Nothing to test. `metrics.ts` gets three assertions and no more. |
| `packages/sim` | Exempt | Its test is the backtest. A simulator that passes unit tests can still generate nonsense; only the backtest catches that. |
| `apps/mcp` | Exempt | Thin wrappers over `engine`. Testing them tests the SDK. |
| `apps/web` | Exempt | Writing a component test at 22:00 Sunday is how teams lose. |

Exempt means *do not write tests here this weekend*. It does not mean the code is unimportant.

## The loop

Red, green, commit. One behaviour at a time.

**Step 1 — write the failing test.**

```ts
// packages/engine/src/localise.test.ts
import { expect, test } from 'vitest';
import { diagnose } from './index.js';
import { healthyDays, benchmarkRef, apparelCard } from '../test/fixtures.js';

test('names stage 3 when ATC is far below the category median and everything upstream is fine', () => {
  const days = healthyDays().map((d) => ({ ...d, addToCarts: Math.round(d.clicks * 0.011) }));

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(3);
  expect(result.primary?.metric).toBe('atcRate');
  expect(result.suspectedCause).toBe('thin_pdp');
});
```

**Step 2 — run it, watch it fail.**

```bash
pnpm --filter @mazal/engine test localise
```

Expected: fails with `diagnose is not a function`, or a null `primary`. If it passes before you write anything, the test asserts nothing.

**Step 3 — minimal implementation.** The smallest thing that turns it green. Not the general case, not the other five stages.

**Step 4 — run it, watch it pass.** Same command.

**Step 5 — commit.**

```bash
git add packages/engine
git commit -m "engine: flag stage 3 when ATC is below benchmark"
```

Then the next behaviour. Stage 4. Stage 5. Each one is a test, an implementation, a commit.

## The three test shapes this codebase needs

**A pure engine assertion against a fixture** — the example above. The fixture is a named function in `packages/engine/test/fixtures.ts` that returns a `CampaignDay[]`, and the test names which fixture it loads. Fixtures are built by hand from the contract, not copied out of the simulator: the engine never sees simulator output in its own tests, or the firewall leaks through the test directory.

**A parser assertion against real CSV text**

```ts
// packages/ingest/src/meta-csv.test.ts
test('reads an em-dash as a missing value, not as zero', () => {
  const csv = [
    'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Purchases,Purchases conversion value',
    '2026-07-01,Verao 2026,"1.240,50",84210,1802,—,12,"3.480,00"',
  ].join('\n');

  const { days, warnings } = parseMetaCsv(csv);

  expect(days[0].spend).toBe(1240.5);
  expect(days[0].addToCarts).toBe(0);
  expect(warnings).toContain('addToCarts missing on 2026-07-01');
});
```

Two things at once: the pt-BR number format (`1.240,50` is one thousand two hundred forty and fifty centavos) and the em-dash null. Both are real, both silently corrupt every downstream rate, and neither is visible by reading the code. Every new quirk C finds in a real export becomes another row in this test.

**A backtest assertion with a floor, not an equality**

```ts
// packages/sim/test/backtest.test.ts
test('root cause accuracy clears the floor we are willing to present', () => {
  const report = runBacktest(heldOutCampaigns);

  expect(report.n).toBeGreaterThanOrEqual(100);
  expect(report.top1).toBeGreaterThan(0.5);
  expect(report.falseAlarmRate).toBeLessThan(0.2);
});
```

A floor, never `toBe(0.87)`. An equality assertion on an accuracy number is an invitation to tune the engine until the test passes, which is exactly the thing that makes the number meaningless. The floor is the level below which the demo needs a different story; the real number goes on the slide as measured.

## Fixtures live in files

A test asserts on behaviour against a named fixture. Inline literals scattered through a test file drift apart and nobody notices; a fixture has one definition and every test that loads it moves together.

```
packages/engine/test/fixtures.ts     ← hand-built CampaignDay[] and ProductCard
packages/ingest/test/meta-export.csv ← real column names, hand-typed from Meta's docs
packages/sim/fixtures/demo-*.json    ← seeded, committed, byte-reproducible
```

The demo fixtures are the ones that matter most on Sunday. They are generated from a fixed seed and committed, so the demo produces identical numbers on every machine and every run.

## Commit on green, every time

Five people push to `stage`. A red `stage` blocks four people, and finding out at 03:00 that it went red at 22:00 costs the night. Run the test, watch it pass, commit, push. Small commits, often.

`main` only ever receives a green `stage` — see [Branches](../AGENTS.md#branches). If you break `stage`, say so in the group before you start fixing it.
