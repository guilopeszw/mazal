// ─── packages/sim/run-allocator.ts ───────────────────────────────────────
// Does the Allocator actually find the money?
//
// The backtest asks whether `diagnose` names the right fault. This asks the
// equivalent question of `allocate`, and it is the only honest way to put a
// number on the feature: generate accounts whose true response curves we know,
// hand the engine only what a seller would have, and measure the gap between
// the profit it captures and the profit that was there.
//
// `regret` is that gap. optimization.md §5: "profit at the true optimum minus
// profit at Mazal's recommendation."
//
// Two baselines, both named, because a number with nothing to beat is decoration:
//
//   status quo — what the seller is already doing
//   greedy     — everything on the highest-ROAS product, which is what sellers
//                actually do, and which is wrong for one reason: the best
//                product fills up
//
// Run: pnpm sim:allocator

import { allocate, fitCurve, marginalRevenue, priorCurve, reallocate, valueAt } from '@mazal/engine';
import { benchmarks } from '@mazal/data';
import { generateAccount, type AccountProduct } from './account.ts';

const ACCOUNTS = 200;
const brl = (n: number) => `R$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Profit from the TRUE curve — the only scoring that is not marking our own homework. */
const trueProfit = (p: AccountProduct, spend: number): number =>
  spend <= 0
    ? 0
    : valueAt(
        { vMax: p.truth.vMax, k: p.truth.k, alpha: 1, n: 0, source: 'prior' },
        spend,
      ) * p.truth.valuePerConversion - spend;

/** The best profit achievable at this budget, found on the true curves. */
function bestPossible(products: AccountProduct[], budget: number): number {
  const best = allocate(
    products.map((p) => ({
      id: p.id,
      curve: { vMax: p.truth.vMax, k: p.truth.k, alpha: 1, n: 0, source: 'prior' as const },
      valuePerConversion: p.truth.valuePerConversion,
    })),
    { budget },
  );
  return best.split.reduce(
    (sum, s) => sum + trueProfit(products.find((p) => p.id === s.id)!, s.spend),
    0,
  );
}

let captured = 0;
let statusQuoCaptured = 0;
let greedyCaptured = 0;
let evenCaptured = 0;
let scored = 0;
let refused = 0;
let unprofitable = 0;

/**
 * `k` itself is often unidentifiable and that is fine — a seller who tested
 * R$40 to R$200 has no evidence about a ceiling at R$2,000, and no method can
 * invent it. What has to be right is the MARGINAL return where the money
 * actually sits, because that is the only quantity the allocation depends on.
 * Measuring `k` would report a failure the feature does not have.
 */
const marginalErrors: number[] = [];

for (let seed = 1; seed <= ACCOUNTS; seed++) {
  const account = generateAccount(seed * 977, { products: 3 });
  const { products, budget } = account;

  // What the engine gets: the days, the card. Never the truth.
  const funded = products.map((p) => {
    const m = benchmarks[p.card.category].metrics;
    const cpc = m.ctr.median > 0 ? m.cpm.median / 1000 / m.ctr.median : 0;
    const spent = p.days.filter((d) => d.spend > 0);
    const typical = spent.reduce((s, d) => s + d.spend, 0) / Math.max(1, spent.length);
    const curve = fitCurve(
      p.days,
      priorCurve({ cpc, cvr: m.cvr.median, typicalSpend: typical }),
    );
    return {
      id: p.id,
      curve,
      valuePerConversion: p.card.price * p.card.grossMargin,
      spend: p.currentSpend,
    };
  });

  // A seller whose curves cannot be identified is one we decline to advise.
  if (funded.every((f) => f.curve.source !== 'fitted')) {
    refused++;
    continue;
  }
  for (const f of funded) {
    if (f.curve.source !== 'fitted') continue;
    const p = products.find((x) => x.id === f.id)!;
    const truthCurve = { vMax: p.truth.vMax, k: p.truth.k, alpha: 1, n: 0, source: 'prior' as const };
    const want = marginalRevenue(truthCurve, p.currentSpend, p.truth.valuePerConversion);
    const got = marginalRevenue(f.curve, p.currentSpend, f.valuePerConversion);
    if (want > 0) marginalErrors.push(Math.abs(got - want) / want);
  }

  const advice = reallocate(funded, {});
  const ceiling = bestPossible(products, budget);
  // An account with no profitable spend anywhere has nothing to allocate, and
  // scoring against a negative ceiling is meaningless. Counted, not hidden.
  if (!(ceiling > 0)) {
    unprofitable++;
    continue;
  }

  const mazal = advice.best.reduce(
    (sum, s) => sum + trueProfit(products.find((p) => p.id === s.id)!, s.spend),
    0,
  );
  const status = products.reduce((sum, p) => sum + trueProfit(p, p.currentSpend), 0);

  // An even split is the fairer baseline. "Status quo" here is wherever each
  // product's simulated budget walk happened to stop, which is arbitrary — a
  // real seller's split is not random, so beating it proves less than it looks.
  const even = products.reduce((sum, p) => sum + trueProfit(p, budget / products.length), 0);

  // Greedy: everything on whichever product looks best on its own history.
  const roasOf = (p: AccountProduct) => {
    const rev = p.days.reduce((s, d) => s + d.revenue, 0);
    const sp = p.days.reduce((s, d) => s + d.spend, 0);
    return sp > 0 ? rev / sp : 0;
  };
  const pick = products.reduce((a, b) => (roasOf(a) >= roasOf(b) ? a : b));
  const greedy = trueProfit(pick, budget);

  captured += mazal / ceiling;
  statusQuoCaptured += status / ceiling;
  greedyCaptured += greedy / ceiling;
  evenCaptured += even / ceiling;
  scored++;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

console.log('\n  The Allocator, against ground truth');
console.log('  ───────────────────────────────────────────────');
console.log(`  accounts generated       ${ACCOUNTS}`);
console.log(`  declined to advise       ${refused}   (no identifiable curve)`);
console.log(`  no profitable spend      ${unprofitable}   (nothing to allocate)`);
console.log(`  scored                   ${scored}\n`);
console.log(`  profit captured — Mazal        ${pct(captured / scored)}`);
console.log(`  profit captured — status quo   ${pct(statusQuoCaptured / scored)}`);
console.log(`  profit captured — even split   ${pct(evenCaptured / scored)}`);
console.log(`  profit captured — greedy       ${pct(greedyCaptured / scored)}`);
console.log(`\n  median error in the marginal   ${pct(median(marginalErrors))}   (at the spend the money is at)`);
console.log('\n  Greedy puts the whole budget on the product with the best');
console.log('  historical ROAS. It loses for one reason: that product fills up.');
console.log('\n  Read status quo with care: it is wherever each simulated budget');
console.log('  walk happened to stop, which is arbitrary. A real seller\'s split is');
console.log('  not random, so the even split is the fairer thing to beat.\n');

// One worked example, so the number has a face.
const example = generateAccount(977 * 7, { products: 3 });
const funded = example.products.map((p) => {
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
console.log(`  One account, ${brl(advice.budget)}/day held constant:\n`);
for (const m of advice.moves) {
  const dir = m.delta > 0 ? '+' : '';
  console.log(`    ${m.id.padEnd(30)} ${brl(m.from).padStart(7)} → ${brl(m.to).padStart(7)}   ${dir}${brl(m.delta)}`);
}
console.log(`\n    left on the table  ${brl(advice.gain)}/day  (${brl(advice.gain * 30)}/month)\n`);
