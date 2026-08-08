// ─── packages/sim/eyeball.ts ─────────────────────────────────────────────
// Runnable: pnpm sim:eyeball
//
// packages/sim is test-exempt (docs/testing.md) — its real check is the
// backtest. This script is the interim one: it prints what the simulator
// produced so a human can look at it, which is exactly what B-data.md asks
// for ("Eyeball one series per fault: does the chart look like something a
// media buyer would recognise?").

import type { CampaignDay } from '@mazal/contracts';
import { aggregate, atcRate, ctr, cvr, icRate, roas } from '@mazal/contracts/metrics';
import type { Diagnosis, Finding, FunnelStage } from '@mazal/contracts';
import { COHORT_SIZE, FAULT_KINDS, HELD_OUT, cohortPlan, generateCampaign, score, splitCohort } from './index.ts';
import { makeRng } from './rng.ts';
import { sampleStore } from './store.ts';

function checkDeterminism(): void {
  const a = makeRng(42).float();
  const b = makeRng(42).float();
  if (a !== b) throw new Error('same seed gave a different first draw');

  const stream = makeRng(42);
  const five = Array.from({ length: 5 }, () => stream.float());
  if (new Set(five).size !== 5) throw new Error('the stream is not advancing');

  console.log(`determinism: seed 42 → ${a.toFixed(6)} twice, and the stream advances. ok\n`);
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

function printSeries(label: string, days: CampaignDay[]): void {
  console.log(`── ${label} ${'─'.repeat(Math.max(0, 62 - label.length))}`);
  console.log('date'.padEnd(12), 'impr'.padStart(8), 'reach'.padStart(8), 'clicks'.padStart(7),
    'atc'.padStart(6), 'ic'.padStart(5), 'buy'.padStart(5),
    'ctr%'.padStart(7), 'atc%'.padStart(7), 'ic%'.padStart(7), 'buy%'.padStart(7), 'freq'.padStart(6));

  for (const d of days) {
    // purchases per checkout — the stage checkout_friction deforms.
    const buyRate = d.checkoutsInitiated === 0 ? 0 : d.purchases / d.checkoutsInitiated;
    console.log(
      d.date.padEnd(12),
      String(d.impressions).padStart(8),
      String(d.reach).padStart(8),
      String(d.clicks).padStart(7),
      String(d.addToCarts).padStart(6),
      String(d.checkoutsInitiated).padStart(5),
      String(d.purchases).padStart(5),
      (ctr(d) * 100).toFixed(2).padStart(7),
      (atcRate(d) * 100).toFixed(2).padStart(7),
      (icRate(d) * 100).toFixed(2).padStart(7),
      (buyRate * 100).toFixed(1).padStart(7),
      (d.impressions / Math.max(d.reach, 1)).toFixed(2).padStart(6),
    );
  }

  const total = aggregate(days);
  console.log(
    `  30-day: ctr ${(ctr(total) * 100).toFixed(2)}%  atc ${(atcRate(total) * 100).toFixed(2)}%` +
      `  ic ${(icRate(total) * 100).toFixed(2)}%  cvr ${(cvr(total) * 100).toFixed(2)}%` +
      `  roas ${roas(total).toFixed(2)}  freq ${(total.impressions / Math.max(total.reach, 1)).toFixed(2)}\n`,
  );
}

/**
 * The per-fault signatures from B-data.md's table, as assertions. packages/sim is
 * test-exempt and this is not a test suite — it is the one runnable check the
 * script carries, and it exists because the alternative is a human reading 270
 * rows and believing they did. A fault that deforms a stage it should not is
 * invisible in the aggregate and shows up only as a confused backtest much later.
 */
function checkSignatures(): void {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  const fails: string[] = [];
  let skipped = 0;

  /**
   * `ok` is null when the campaign is too small to measure the thing at all —
   * a fault injected on day 7 of a R$50/day campaign leaves eight checkouts
   * behind it, and any ratio built on eight events is rounding noise rather
   * than evidence. Those are counted and printed, never silently passed.
   */
  const check = (kind: string, what: string, ok: boolean | null) => {
    if (ok === null) skipped += 1;
    else if (!ok) fails.push(`${kind}: ${what}`);
  };

  /**
   * A rate needs enough trials *and* enough successes before a ratio built on it
   * means anything. 8 checkouts out of 36 add-to-carts clears any trial count and
   * still carries ±30% relative noise, which reads as a fault that moved a stage
   * it never touched.
   */
  const MIN_DENOM = 30;
  const MIN_NUMER = 15;

  // Swept over many seeds, not one: the backtest runs 400 campaigns, and a
  // signature that only holds on a lucky seed is worse than one that never holds
  // — it passes here and confuses the confusion matrix.
  const SEEDS = 40;
  for (const [i, kind] of FAULT_KINDS.entries()) {
   for (let s = 0; s < SEEDS; s++) {
    const c = generateCampaign(500 + i * 1000 + s, kind);
    const at = c.fault.injectedOn ? c.days.findIndex((d) => d.date === c.fault.injectedOn) : -1;
    const before = at > 0 ? c.days.slice(0, at) : [];
    const after = at > 0 ? c.days.slice(at) : [];

    // A break must name the day it started, a condition must not.
    const isBreak = ['stockout', 'eta_shock', 'creative_fatigue', 'checkout_friction', 'pixel_break', 'budget_cap']
      .includes(kind);
    check(kind, 'break names an injectedOn date', !isBreak || at > 0);
    check(kind, 'condition names no injectedOn date',
      isBreak || kind === 'none' || c.fault.injectedOn === undefined);

    // Every stage stays inside the one above it, on every day.
    check(kind, 'counts never exceed the stage above', c.days.every((d) =>
      d.clicks <= d.impressions && d.addToCarts <= d.clicks &&
      d.checkoutsInitiated <= d.addToCarts && d.purchases <= d.checkoutsInitiated));

    // aggregate() first, then the rate once — never the mean of daily rates.
    // AGENTS.md and metrics.ts both say those two numbers differ and the second
    // is wrong, and at one checkout a day the daily mean is pure rounding noise.
    const ratio = (f: (d: CampaignDay) => number, denom: (d: CampaignDay) => number) => {
      if (!before.length || !after.length) return null;
      const pre = aggregate(before);
      if (denom(pre) < MIN_DENOM) return null;
      if (f(pre) * denom(pre) < MIN_NUMER) return null;
      return f(aggregate(after)) / f(pre);
    };

    const near1 = (r: number | null, tol: number) => (r === null ? null : Math.abs(r - 1) < tol);
    const below = (r: number | null, x: number) => (r === null ? null : r < x);
    const above = (r: number | null, x: number) => (r === null ? null : r > x);

    const impressions = (d: CampaignDay) => d.impressions;
    const clicks = (d: CampaignDay) => d.clicks;
    const carts = (d: CampaignDay) => d.addToCarts;
    const checkouts = (d: CampaignDay) => d.checkoutsInitiated;

    switch (kind) {
      case 'none':
        check(kind, 'the healthy class actually converts', mean(c.days.map((d) => d.purchases)) > 0);
        check(kind, 'no injected date', c.fault.injectedOn === undefined);
        break;
      case 'stockout':
        check(kind, 'ATC collapses', below(ratio(atcRate, clicks), 0.3));
        check(kind, 'CTR is left alone', near1(ratio(ctr, impressions), 0.25));
        break;
      case 'eta_shock':
        // 0.7, not the 0.31 the fault actually targets: these are binomial rates
        // on a few dozen events, so the bound has to clear the sampling noise. It
        // still fails loudly on the thing it is for — a fault that did nothing.
        check(kind, 'IC collapses', below(ratio(icRate, carts), 0.7));
        check(kind, 'ATC is left alone', near1(ratio(atcRate, clicks), 0.3));
        break;
      case 'creative_fatigue': {
        const freq = (d: CampaignDay) => d.impressions / Math.max(d.reach, 1);
        check(kind, 'CTR decays', below(ratio(ctr, impressions), 0.85));
        check(kind, 'frequency passes 4', Math.max(...c.days.map(freq)) > 4);
        check(kind, 'ATC is left alone', near1(ratio(atcRate, clicks), 0.3));
        break;
      }
      case 'price_too_high':
      case 'thin_pdp':
        check(kind, 'ATC is low from day one', atcRate(aggregate(c.days.slice(0, 7))) < 0.06);
        break;
      case 'checkout_friction': {
        const buyRate = (d: CampaignDay) => (d.checkoutsInitiated === 0 ? 0 : d.purchases / d.checkoutsInitiated);
        check(kind, 'purchases per checkout drop', below(ratio(buyRate, checkouts), 0.7));
        check(kind, 'IC is left alone', near1(ratio(icRate, carts), 0.3));
        break;
      }
      case 'pixel_break':
        check(kind, 'the whole tail flattens', below(ratio(atcRate, clicks), 0.3));
        check(kind, 'spend keeps running', mean(after.map((d) => d.spend)) > 0);
        break;
      case 'budget_cap':
        check(kind, 'CPM rises',
          above(ratio((d) => (d.impressions === 0 ? 0 : (d.spend * 1000) / d.impressions), impressions), 1.1));
        check(kind, 'CTR is left alone', near1(ratio(ctr, impressions), 0.3));
        break;
    }
   }
  }

  const total = FAULT_KINDS.length * SEEDS;
  if (fails.length > 0) {
    const byReason = new Map<string, number>();
    for (const f of fails) byReason.set(f, (byReason.get(f) ?? 0) + 1);
    console.log(`\nSIGNATURE CHECKS FAILED on ${fails.length} of ${total} campaigns`);
    for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
      console.log(`  ✗ ${String(n).padStart(3)}/${SEEDS}  ${reason}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`signatures: ${total} campaigns, every fault deforms the stages B-data.md names and no others. ok` +
    `\n  (${skipped} assertions skipped — campaigns too small pre-injection to measure a ratio on)`);
}

/**
 * Scoring is a pure function of (label, diagnosis) pairs, so it can be checked
 * against hand-made diagnoses long before packages/engine exists. These are the
 * three numbers slide 6 shows; getting them wrong is worse than not having them.
 */
function checkScoring(): void {
  const finding = (stage: FunnelStage): Finding => ({
    stage, severity: 'primary', metric: 'atcRate', observed: 0.01, reference: 0.08,
    spread: 0.02, deviation: -3.5, sampleSize: 400, rule: 'test', causeLayer: 'product',
  });
  const dx = (suspectedCause: Diagnosis['suspectedCause'], primary: Finding | null,
    secondary: Finding[] = []): Diagnosis => ({ primary, secondary, suspectedCause });

  const fails: string[] = [];
  const expect = (what: string, ok: boolean) => { if (!ok) fails.push(what); };

  // Exactly right.
  const exact = score([{ fault: { kind: 'stockout' }, diagnosis: dx('stockout', finding(3)) }]);
  expect('top1 counts an exact hit', exact.top1 === 1 && exact.top2 === 1);

  // Wrong cause, right stage — both break stage 3, so the seller is sent to the
  // right part of the funnel. A near miss, not a hit.
  const near = score([{ fault: { kind: 'stockout' }, diagnosis: dx('thin_pdp', finding(3)) }]);
  expect('a wrong cause on the right stage is top2 but not top1', near.top1 === 0 && near.top2 === 1);

  // Wrong cause, wrong stage.
  const miss = score([{ fault: { kind: 'stockout' }, diagnosis: dx('budget_cap', finding(0)) }]);
  expect('a wrong cause on the wrong stage scores nothing', miss.top1 === 0 && miss.top2 === 0);

  // A healthy campaign with any primary finding is a false alarm.
  const alarm = score([
    { fault: { kind: 'none' }, diagnosis: dx('none', finding(3)) },
    { fault: { kind: 'none' }, diagnosis: dx('none', null) },
  ]);
  expect('false alarms are counted on the none class only',
    alarm.falseAlarmRate === 0.5 && alarm.n === 2);

  // 'none' has no stages, so a missed healthy campaign cannot collect a free top2.
  const freebie = score([{ fault: { kind: 'none' }, diagnosis: dx('stockout', finding(3)) }]);
  expect('a false alarm earns no top2 credit', freebie.top2 === 0);

  if (fails.length > 0) {
    console.log('\nSCORING CHECKS FAILED');
    for (const f of fails) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log('scoring: top-1, top-2 and the false-alarm rate behave. ok');
}

/** The cohort must be fixed and balanced before any score is ever seen. */
function checkCohort(): void {
  const plan = cohortPlan();
  const { train, held } = splitCohort(plan);
  const kindsIn = (xs: { fault: string }[]) => new Set(xs.map((x) => x.fault));

  const fails: string[] = [];
  if (plan.length !== COHORT_SIZE) fails.push(`cohort is ${plan.length}, not ${COHORT_SIZE}`);
  if (held.length !== HELD_OUT) fails.push(`held-out is ${held.length}, not ${HELD_OUT}`);
  if (new Set(plan.map((p) => p.seed)).size !== plan.length) fails.push('seeds are not unique');
  if (kindsIn(train).size !== FAULT_KINDS.length) fails.push('a fault kind is missing from the training half');
  if (kindsIn(held).size !== FAULT_KINDS.length) fails.push('a fault kind is missing from the held-out half');

  if (fails.length > 0) {
    console.log('\nCOHORT CHECKS FAILED');
    for (const f of fails) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  const noneCount = plan.filter((p) => p.fault === 'none').length;
  console.log(`cohort: ${COHORT_SIZE} campaigns, ${HELD_OUT} held out, every fault in both halves. ok` +
    `\n  (the false-alarm rate will rest on ${noneCount} healthy campaigns — quote that denominator)`);
}

function printFaults(): void {
  for (const [i, kind] of FAULT_KINDS.entries()) {
    const c = generateCampaign(101 + i, kind);
    const on = c.fault.injectedOn ? ` injected ${c.fault.injectedOn}` : ' (from day one)';
    printSeries(`${kind}${on} — ${c.card.category}`, c.days);
    console.log('  events:', c.events.length === 0 ? '(none)' :
      c.events.map((e) => `${e.date} ${e.type} "${e.detail}"`).join('; '), '\n');
  }
}

checkDeterminism();
printStores();
printFaults();
checkSignatures();
checkScoring();
checkCohort();
