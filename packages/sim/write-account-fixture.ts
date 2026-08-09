// ─── packages/sim/write-account-fixture.ts ───────────────────────────────
// The demo account: one seller, three products, one wallet.
//
// Same contract as `write-fixtures.ts` — it writes a JSON file and then asserts
// that the file still does what the demo beat needs, exiting non-zero if it does
// not. The campaign fixtures once both diagnosed healthy and nobody noticed
// until a commit message mentioned it; this guard exists so that cannot happen
// twice.
//
// Seed 977 was chosen by sweeping 400 seeds for an account that is *ordinary*:
// a budget a Brazilian seller would recognise, a gain worth acting on but not a
// miracle, three different categories, and every product still funded at the
// end. An account where the advice is "kill this product" is a different
// conversation and a worse demo.
//
// Run: pnpm sim:fixtures

import { writeFileSync } from 'node:fs';
import { fitCurve, priorCurve, reallocate } from '@mazal/engine';
import { benchmarks } from '@mazal/data';
import { generateAccount } from './account.ts';

const SEED = 977;
const OUT = new URL('./fixtures/demo-account.json', import.meta.url);

const account = generateAccount(SEED, { products: 3 });

/**
 * The truth is stripped before writing.
 *
 * `AccountProduct` carries the response curve the simulator generated from, and
 * nothing downstream may ever see it — the whole claim of the backtest is that
 * the engine recovers the curve from the days alone. A fixture that shipped the
 * answer alongside the question would make every number in the UI unfalsifiable.
 */
const fixture = {
  seed: SEED,
  products: account.products.map((p) => ({
    id: p.id,
    card: p.card,
    days: p.days,
    currentSpend: Math.round(p.currentSpend * 100) / 100,
  })),
};

writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);

// ─── the guard ───────────────────────────────────────────────────────────

const funded = fixture.products.map((p) => {
  const m = benchmarks[p.card.category].metrics;
  const cpc = m.ctr.median > 0 ? m.cpm.median / 1000 / m.ctr.median : 0;
  const spent = p.days.filter((d) => d.spend > 0);
  const typical = spent.reduce((s, d) => s + d.spend, 0) / Math.max(1, spent.length);
  return {
    id: p.id,
    curve: fitCurve(p.days, priorCurve({ cpc, cvr: m.cvr.median, typicalSpend: typical })),
    valuePerConversion: p.card.price * p.card.grossMargin,
    spend: p.currentSpend,
  };
});

const advice = reallocate(funded, {});
const fail: string[] = [];

for (const f of funded) {
  if (f.curve.source !== 'fitted') {
    fail.push(`${f.id}: curve is '${f.curve.source}', not 'fitted' — the UI must not present it as the seller's own`);
  }
}
if (advice.gain <= 0) fail.push(`no money to find: gain is ${advice.gain.toFixed(2)}`);
if (advice.moves.length < 2) fail.push(`only ${advice.moves.length} move — a reallocation needs somewhere to come from and somewhere to go`);

const sum = advice.moves.reduce((s, m) => s + m.delta, 0);
if (Math.abs(sum) > 0.01) fail.push(`moves do not sum to zero: ${sum.toFixed(4)} — the budget is supposed to be held`);
if (advice.best.some((b) => b.spend <= 5)) fail.push('a product is cut to nothing — that is a different conversation than reallocation');
if (advice.budget < 150 || advice.budget > 600) fail.push(`budget ${advice.budget.toFixed(0)} is outside what a small seller would recognise`);

const categories = new Set(fixture.products.map((p) => p.card.category));
if (categories.size !== 3) fail.push('products share a category — the point is that margins differ');

if (fail.length > 0) {
  console.error('\n  demo-account.json does not do what the demo beat needs:\n');
  for (const f of fail) console.error(`    - ${f}`);
  console.error('');
  process.exit(1);
}

const brl = (n: number) => `R$${Math.round(n)}`;
console.log(`  demo-account.json — ${brl(advice.budget)}/day held, ${brl(advice.gain)}/day found. ok`);
for (const m of advice.moves) {
  console.log(`    ${m.id.padEnd(42)} ${brl(m.from).padStart(6)} → ${brl(m.to).padStart(6)}`);
}
