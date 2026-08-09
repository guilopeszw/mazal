// ─── packages/sim/write-fixtures.ts ──────────────────────────────────────
// Runnable: pnpm sim:fixtures. Output is committed and never hand-edited.
//
// The two campaigns the demo runs on, and — since the last pair silently did
// not — a check that each one actually does what its demo beat needs.
//
// The first pair were chosen by seed before packages/engine existed and were
// never re-run against it. Both diagnosed as healthy, and the frontend was
// built against them for several hours before anyone noticed. Committed
// fixtures that nothing asserts on are just numbers.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchmarks, sellerBenchmarks } from '@mazal/data';
import { buildPlan, diagnose, predict, profileCard } from '@mazal/engine';
import { generateCampaign } from './index.ts';

/**
 * Case 1 is **pre-flight**: no campaign has run, so there is nothing to
 * diagnose. The tools are `predict` and `profileCard`, and the beat is
 * "should I launch this, and what is different about my store".
 *
 * Case 2 is **in-flight**: a break mid-campaign, diagnosed against the category
 * benchmark, with the store event that explains it attached to the finding.
 *
 * One of each, because they exercise different halves of the product — and
 * because the earlier pairing of two diagnosable cases made the second beat a
 * repeat of the first.
 */
const CASES = [
  { file: 'demo-case1.json', seed: 830176, fault: 'thin_pdp' as const, beat: 'pre-flight' as const },
  { file: 'demo-case2.json', seed: 820001, fault: 'eta_shock' as const, beat: 'in-flight' as const },
];

const failures: string[] = [];
const check = (label: string, ok: boolean) => { if (!ok) failures.push(label); };

for (const c of CASES) {
  const campaign = generateCampaign(c.seed, c.fault);
  writeFileSync(
    join(import.meta.dirname, 'fixtures', c.file),
    `${JSON.stringify(campaign, null, 2)}\n`,
  );

  const { card } = campaign;
  console.log(`${c.file}  seed ${c.seed}  ${c.beat.padEnd(10)} ${card.category}`);

  if (c.beat === 'pre-flight') {
    const verdict = predict({ card, table: benchmarks });
    const profile = profileCard(card, sellerBenchmarks);
    const d = diagnose({
      days: campaign.days, card, events: campaign.events,
      reference: { kind: 'benchmark', table: benchmarks },
    });
    const plan = buildPlan(d, card);

    check(`${c.file}: category has peer data`, profile.length > 0);
    check(`${c.file}: the verdict is not a flat "launch"`, verdict.decision !== 'launch');
    /**
     * The profile has to carry the lever that predicts something — not lead
     * with it. This fixture's worst placement is description length, which the
     * seller data says is a coin flip, and surfacing that honestly ("shortest in
     * your category, and that predicts less than you would think") is a better
     * moment than hiding it. What would be wrong is a profile with no
     * replicating lever in it at all.
     */
    check(`${c.file}: the profile carries a lever that replicates`,
      profile.some((f) => f.evidence === 'replicates'));
    // The label has to be the engine's own answer. A fixture whose injected
    // fault the engine names differently is a caption disagreeing with its
    // photograph, and every downstream narration inherits the disagreement.
    check(`${c.file}: the engine names the injected fault`, d.suspectedCause === c.fault);
    check(`${c.file}: the leak is in the product half of the funnel`, (d.primary?.stage ?? 0) >= 3);
    check(`${c.file}: the cause layer is not media`, d.primary?.causeLayer !== 'media');
    check(`${c.file}: the verdict names a limiting factor`, Boolean(verdict.limitingFactor));
    check(`${c.file}: the plan has actions and a real projection`,
      plan.actions.length > 0 && plan.projected.p50 > 0);

    console.log(`  verdict ${verdict.decision}  band ${verdict.predictedRoas.p10.toFixed(2)}–` +
      `${verdict.predictedRoas.p90.toFixed(2)} vs break-even ${verdict.breakEvenRoas.toFixed(2)}`);
    if (profile[0]) {
      console.log(`  worst lever: ${profile[0].lever} ${profile[0].observed} vs peer median ` +
        `${profile[0].peerMedian} (p${Math.round(profile[0].percentile * 100)}, ${profile[0].evidence})`);
    }
  } else {
    const d = diagnose({
      days: campaign.days, card, events: campaign.events,
      reference: { kind: 'benchmark', table: benchmarks },
    });

    check(`${c.file}: something is actually diagnosed`, d.primary !== null);
    check(`${c.file}: the cause matches the injected fault`, d.suspectedCause === c.fault);
    check(`${c.file}: the leak is stage 4`, d.primary?.stage === 4);
    check(`${c.file}: a change point is named`, d.changePoint !== undefined);
    check(`${c.file}: the change point is within a day of the injection`,
      d.changePoint !== undefined && campaign.fault.injectedOn !== undefined &&
      Math.abs(Date.parse(`${d.changePoint.date}T00:00:00Z`) -
        Date.parse(`${campaign.fault.injectedOn}T00:00:00Z`)) / 86_400_000 <= 1);
    check(`${c.file}: the explaining event is attached`, d.primary?.evidence?.type === 'eta_change');

    // The in-flight beat is the campaign judged against its own history, so it
    // has to hold under the self arm too — not only against the category.
    const self = diagnose({
      days: campaign.days, card, events: campaign.events,
      reference: { kind: 'self', baselineDays: 14 },
    });
    check(`${c.file}: self reference also finds it`, self.primary?.stage === 4);
    check(`${c.file}: self reference names the same cause`, self.suspectedCause === c.fault);

    const plan = buildPlan(d, card);
    check(`${c.file}: the plan has actions`, plan.actions.length > 0);
    // A stage-4 break is an experience problem. Telling a seller to refresh
    // their creative here is the failure the whole product exists to prevent.
    check(`${c.file}: the plan contains no media action`,
      !plan.actions.some((a) => /creative|audience|bid|budget|frequency/i.test(a.change)));
    console.log(`  self reference: stage ${self.primary?.stage} ${self.suspectedCause}`);

    console.log(`  stage ${d.primary?.stage} ${d.primary?.metric} at ` +
      `${d.primary?.deviation.toFixed(2)}σ  cause ${d.suspectedCause}` +
      `  change point ${d.changePoint?.date}  evidence ${d.primary?.evidence?.type ?? 'NONE'}`);
  }
}

if (failures.length > 0) {
  console.log(`\n⚠ THE DEMO FIXTURES DO NOT WORK (${failures.length})`);
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log('  Pick different seeds. Do not weaken the engine to make a demo pass.');
  process.exitCode = 1;
} else {
  console.log('\nboth fixtures do what their demo beat needs. ok');
}
