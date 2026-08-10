import { benchmarks } from '@mazal/data';
import {
  predict,
  MEASURED_STAGES,
  SELF_MIN_BASELINE_DAYS,
  SELF_WINDOW_DAYS,
  WINDOW_DAYS,
} from '@mazal/engine';
import { aggregate } from '@mazal/contracts/metrics';
import type { Diagnosis } from '@mazal/contracts';
import { describe, expect, test } from 'vitest';

import { apparelCard, healthyDays, stockoutDiagnosis } from '../tools/test-fixtures.js';
import { bandViewModel, diagnosisViewModel } from './view-data.js';

const healthyDiagnosis: Diagnosis = {
  primary: null,
  secondary: [],
  suspectedCause: 'none',
};

describe('diagnosisViewModel', () => {
  test('a healthy campaign renders every slice ok and no leak anywhere', () => {
    const vm = diagnosisViewModel(healthyDays(), healthyDiagnosis);

    expect(vm.slices).toHaveLength(5);
    expect(vm.slices.every((s) => s.tone === 'ok')).toBe(true);
    expect(vm.stages.some((s) => s.state === 'broken')).toBe(false);
    expect(vm.headline).toContain('No stage broke');
  });

  test('funnel counts are read straight off the aggregated window', () => {
    const days = healthyDays();
    const window = aggregate(days.slice(-WINDOW_DAYS));
    const vm = diagnosisViewModel(days, healthyDiagnosis);

    expect(vm.slices.map((s) => s.value)).toEqual([
      window.impressions,
      window.clicks,
      window.addToCarts,
      window.checkoutsInitiated,
      window.purchases,
    ]);
  });

  test('the leak stage is marked and downstream stages are symptoms, not causes', () => {
    const vm = diagnosisViewModel(healthyDays(), stockoutDiagnosis);

    const tones = Object.fromEntries(vm.slices.map((s) => [s.label, s.tone]));
    expect(tones['Delivery']).toBe('ok');
    expect(tones['Attention']).toBe('ok');
    expect(tones['Product interest']).toBe('leak');
    expect(tones['Intent']).toBe('after');
    expect(tones['Purchase']).toBe('after');

    const broken = vm.stages.filter((s) => s.state === 'broken');
    expect(broken).toHaveLength(1);
    expect(broken[0]!.name).toContain('Product interest');
    // The observed value comes from the Finding, formatted — never recomputed —
    // and reads as a sentence, not a metric code.
    expect(broken[0]!.value).toBe('1.0% of clicks add to cart');

    const downstream = vm.stages.filter((s) => s.value === 'symptom');
    expect(downstream.map((s) => s.name)).toEqual([
      expect.stringContaining('Intent'),
      expect.stringContaining('Purchase'),
      expect.stringContaining('Economics'),
    ]);
  });

  test('the headline is the decision; the evidence line carries the finding verbatim', () => {
    const vm = diagnosisViewModel(healthyDays(), stockoutDiagnosis);

    // Decision first, in the seller's words — the date rides the sentence.
    expect(vm.headline).toBe('Your product page broke on 24 July.');
    // The evidence: observed, reference, and the sample it was measured on.
    // No sigma, no metric codes, no rule ids — the raw diagnosis rides the
    // tool result for anyone auditing; the tile is for the seller.
    expect(vm.detail).toContain('1.0% of clicks add to cart');
    expect(vm.detail).toContain('8.0%');
    expect(vm.detail).toContain('1,540 clicks');
  });

  test('self mode windows on the engine\'s shorter window, not the benchmark one', () => {
    // `diagnose` measures self mode over SELF_WINDOW_DAYS and checks every
    // stage's minSample against *that* window. The view aggregated seven days
    // regardless, so its sample was always the larger one and a stage the
    // engine had skipped rendered ok with a value.
    const days = healthyDays();
    const vm = diagnosisViewModel(days, healthyDiagnosis, { kind: 'self', baselineDays: 20 });
    const window = aggregate(days.slice(-SELF_WINDOW_DAYS));

    expect(vm.slices.map((s) => s.value)).toEqual([
      window.impressions,
      window.clicks,
      window.addToCarts,
      window.checkoutsInitiated,
      window.purchases,
    ]);

    // Every stage the engine could not have judged on this window is silent.
    for (const spec of MEASURED_STAGES) {
      if (spec.sample(window) >= spec.minSample) continue;
      const row = vm.stages.find((s) => s.name.startsWith(`${spec.stage} ·`))!;
      expect(row.state, `stage ${spec.stage}`).toBe('mute');
    }
  });

  test('no baseline is not health: silence must not render as "no stage broke"', () => {
    // Under SELF_MIN_BASELINE_DAYS of baseline, `selfReference` returns null for
    // every stage, so `diagnose` compares nothing and returns primary: null —
    // the same shape a genuinely healthy campaign returns. They must not read
    // the same on screen.
    const days = healthyDays();
    const vm = diagnosisViewModel(days, healthyDiagnosis, {
      kind: 'self',
      baselineDays: SELF_MIN_BASELINE_DAYS - 1,
    });

    expect(vm.headline).not.toContain('No stage broke');
    expect(vm.headline).toContain('Not enough history');
    expect(vm.stages.some((s) => s.state === 'ok')).toBe(false);

    // A real healthy answer, same days, still says so.
    const healthy = diagnosisViewModel(days, healthyDiagnosis, { kind: 'benchmark', table: benchmarks });
    expect(healthy.headline).toContain('No stage broke');
  });

  test('stage 2 is never judged: the store sends no analytics', () => {
    const vm = diagnosisViewModel(healthyDays(), healthyDiagnosis);
    const landing = vm.stages.find((s) => s.name.includes('Landing'));

    expect(landing?.state).toBe('mute');
    expect(landing?.tag).toBe('skipped');
  });

  test('a stage below the engine minimum sample is silent, and silence is not health', () => {
    // Zero purchases in the window: stage 6's sample (purchases) sits below the
    // engine's own minSample, so the engine never judged it — the row must not
    // print a value that reads as a verdict.
    const days = healthyDays().map((d) => ({ ...d, purchases: 0, revenue: 0 }));
    const vm = diagnosisViewModel(days, healthyDiagnosis);
    const economics = vm.stages.find((s) => s.name.includes('Economics'));

    expect(economics?.state).toBe('mute');
    expect(economics?.value).toContain('too few sales to judge');

    // The engine's threshold is the source of the silence, not a UI constant.
    const spec = MEASURED_STAGES.find((s) => s.stage === 6)!;
    expect(spec.minSample).toBeGreaterThan(0);
  });
});

describe('bandViewModel', () => {
  const verdict = predict({ card: apparelCard, table: benchmarks });

  test('every printed number is the verdict, re-expressed as reais per real spent', () => {
    const vm = bandViewModel(verdict);
    // ROAS 2.38 and "R$2.38 back per R$1 spent" are the same number in the
    // seller's unit — a label translation, not arithmetic.
    const money = (v: number) =>
      new Intl.NumberFormat('en', { style: 'currency', currency: 'BRL' }).format(v);

    expect(vm.ends).toEqual([
      `worst case ${money(verdict.predictedRoas.p10)}`,
      `most likely ${money(verdict.predictedRoas.p50)}`,
      `best case ${money(verdict.predictedRoas.p90)}`,
    ]);
    expect(vm.breakEvenLabel).toBe(money(verdict.breakEvenRoas));
    expect(vm.decision).toBe(verdict.decision);
  });

  test('band geometry mirrors the web sheet: percent positions on a shared scale', () => {
    const vm = bandViewModel(verdict);
    const { p10, p50, p90 } = verdict.predictedRoas;
    const scale = Math.max(p90, verdict.breakEvenRoas) * 1.06 || 1;
    const at = (v: number) => Math.min(100, Math.max(0, (v / scale) * 100));

    expect(vm.fill.left).toBeCloseTo(at(p10));
    expect(vm.fill.width).toBeCloseTo(at(p90) - at(p10));
    expect(vm.mid).toBeCloseTo(at(p50));
    expect(vm.breakEven).toBeCloseTo(at(verdict.breakEvenRoas));
    // Everything stays on the track.
    for (const v of [vm.fill.left, vm.fill.left + vm.fill.width, vm.mid, vm.breakEven]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test('engine prose is rendered only when set, with its jargon translated and values intact', () => {
    const bare = bandViewModel({
      decision: 'launch',
      predictedRoas: { p10: 1, p50: 2, p90: 3 },
      breakEvenRoas: 1.5,
    });
    expect(bare.limitingFactor).toBeUndefined();
    expect(bare.killTrigger).toBeUndefined();

    // The three shapes `predict` actually emits (packages/engine/src/predict.ts).
    const full = bandViewModel({
      decision: 'launch_small',
      predictedRoas: { p10: 1, p50: 2, p90: 3 },
      breakEvenRoas: 1.5,
      killTrigger:
        'Stop if ROAS is below 1.50 after 100 clicks. Cvr is at 34% of the category median — the factor holding this band down.',
      limitingFactor: 'cvr is at 34% of the category median — the factor holding this band down',
    });
    // The value survives; the labels do not.
    expect(full.limitingFactor).toContain('34%');
    expect(full.limitingFactor).toContain('clicks that turn into sales');
    expect(full.killTrigger).toContain('R$1.50');
    expect(full.killTrigger).toContain('100 clicks');

    const noHistory = bandViewModel({
      decision: 'launch',
      predictedRoas: { p10: 1, p50: 2, p90: 3 },
      breakEvenRoas: 1.5,
      limitingFactor:
        'no campaign history yet, so the band is category-wide — instrument atcRate first, it is the widest factor here',
    });
    expect(noHistory.limitingFactor).toContain('clicks that add to cart');
  });

  test('no view string puts the analytical weight back on the seller', () => {
    // The product owner's ban list, enforced over every string either view can
    // render — labels translated, values untouched.
    const banned = /p10|p90|p50|\bband\b|median|percentile|sigma|σ|\bcvr\b|\bctr\b|atcRate|icRate|\baov\b|\bROAS\b|limiting factor|banda|mediana|percentil/i;

    const days = healthyDays();
    for (const diagnosis of [healthyDiagnosis, stockoutDiagnosis]) {
      const vm = diagnosisViewModel(days, diagnosis);
      const strings = [
        vm.headline,
        vm.detail ?? '',
        vm.evidence ?? '',
        ...vm.slices.map((s) => `${s.label} ${s.display}`),
        ...vm.stages.map((s) => `${s.name} ${s.value} ${s.tag ?? ''}`),
      ];
      for (const text of strings) expect(text).not.toMatch(banned);
    }

    // Every factor `predict` can name, not just the one that was easy to
    // transcribe. `killTrigger` capitalises the factor at sentence start, and
    // AtcRate/IcRate reached the seller verbatim while this loop was one case.
    for (const factor of ['ctr', 'atcRate', 'icRate', 'cvr', 'aov']) {
      const sentence = `${factor} is at 34% of the category median — the factor holding this band down`;
      const capitalised = `${factor.charAt(0).toUpperCase()}${factor.slice(1)}`;
      const band = bandViewModel({
        decision: 'launch_small',
        predictedRoas: { p10: 0.28, p50: 1.66, p90: 9.97 },
        breakEvenRoas: 2.38,
        killTrigger: `Stop if ROAS is below 2.38 after 100 clicks. ${capitalised} is at 34% of the category median — the factor holding this band down.`,
        limitingFactor: sentence,
      });
      for (const text of [...band.ends, band.breakEvenLabel, band.limitingFactor!, band.killTrigger!]) {
        expect(text, `${factor}: ${text}`).not.toMatch(banned);
      }
      // The value survives the translation.
      expect(band.limitingFactor).toContain('34%');
      // And it reads as a sentence: no orphaned article, no lowercase start.
      for (const text of [band.limitingFactor!, band.killTrigger!]) {
        expect(text, `${factor}: ${text}`).not.toContain('the what is typical');
      }
      expect(band.killTrigger).toMatch(/\. [A-Z]/);
    }

    // The two shapes with no factor name in them still have to survive.
    for (const limitingFactor of [
      'every factor is at or near the category median — the band is limited by category spread, not by this account',
      'no campaign history yet, so the band is category-wide — instrument aov first, it is the widest factor here',
    ]) {
      const band = bandViewModel({
        decision: 'launch',
        predictedRoas: { p10: 1, p50: 2, p90: 3 },
        breakEvenRoas: 1.5,
        limitingFactor,
      });
      expect(band.limitingFactor).not.toMatch(banned);
      expect(band.limitingFactor).not.toContain('the what is typical');
    }
  });
});
