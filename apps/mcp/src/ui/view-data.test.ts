import { benchmarks } from '@mazal/data';
import { predict, MEASURED_STAGES, WINDOW_DAYS } from '@mazal/engine';
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
    // The observed value comes from the Finding, formatted — never recomputed.
    expect(broken[0]!.value).toContain('1.0%');

    const downstream = vm.stages.filter((s) => s.value === 'symptom');
    expect(downstream.map((s) => s.name)).toEqual([
      expect.stringContaining('Intent'),
      expect.stringContaining('Purchase'),
      expect.stringContaining('Economics'),
    ]);
  });

  test('the headline carries the finding verbatim: observed, reference, rule id', () => {
    const vm = diagnosisViewModel(healthyDays(), stockoutDiagnosis);

    expect(vm.headline).toContain('1.0%');
    expect(vm.headline).toContain('8.0%');
    expect(vm.headline).toContain('stage3.atcRate_below_benchmark');
    expect(vm.changePoint).toBe('24 July');
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
    expect(economics?.value).toContain('not judged');

    // The engine's threshold is the source of the silence, not a UI constant.
    const spec = MEASURED_STAGES.find((s) => s.stage === 6)!;
    expect(spec.minSample).toBeGreaterThan(0);
  });
});

describe('bandViewModel', () => {
  const verdict = predict({ card: apparelCard, table: benchmarks });

  test('every printed number is the verdict, formatted, never recomputed', () => {
    const vm = bandViewModel(verdict);
    const fmt = (v: number) =>
      `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(v)}×`;

    expect(vm.ends).toEqual([
      fmt(verdict.predictedRoas.p10),
      `likely ${fmt(verdict.predictedRoas.p50)}`,
      fmt(verdict.predictedRoas.p90),
    ]);
    expect(vm.breakEvenLabel).toBe(fmt(verdict.breakEvenRoas));
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

  test('limiting factor and kill trigger pass through only when the engine set them', () => {
    const bare = bandViewModel({
      decision: 'launch',
      predictedRoas: { p10: 1, p50: 2, p90: 3 },
      breakEvenRoas: 1.5,
    });
    expect(bare.limitingFactor).toBeUndefined();
    expect(bare.killTrigger).toBeUndefined();

    const full = bandViewModel({
      decision: 'launch_small',
      predictedRoas: { p10: 1, p50: 2, p90: 3 },
      breakEvenRoas: 1.5,
      killTrigger: 'stop if ROAS stays under 1.5 after 200 clicks',
      limitingFactor: 'the delivery promise is the factor dragging the band down',
    });
    expect(full.limitingFactor).toContain('delivery promise');
    expect(full.killTrigger).toContain('200 clicks');
  });
});
