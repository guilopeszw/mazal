import { benchmarks } from '@mazal/data';
import { buildPlan, diagnose, predict } from '@mazal/engine';
import { describe, expect, test } from 'vitest';

import { InMemoryActionLog } from '../action-log.js';
import { buildRecoveryPlan } from './build-recovery-plan.js';
import { diagnoseCampaign } from './diagnose-campaign.js';
import { executePlan } from './execute-plan.js';
import { predictCampaign } from './predict-campaign.js';
import {
  apparelCard,
  healthyDays,
  mazalAction,
  sellerAction,
  stockoutDiagnosis,
} from './test-fixtures.js';

describe('diagnose_campaign handler', () => {
  test('injects the server benchmark table and returns the engine diagnosis unchanged', () => {
    const input = {
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark' as const },
    };

    expect(diagnoseCampaign(input)).toEqual(diagnose({
      ...input,
      reference: { kind: 'benchmark', table: benchmarks },
    }));
  });

  test('rejects a benchmark table supplied by the client', () => {
    expect(() => diagnoseCampaign({
      days: healthyDays(),
      card: apparelCard,
      events: [],
      reference: { kind: 'benchmark', table: {} },
    })).toThrow();
  });
});

describe('predict_campaign handler', () => {
  test('injects the server benchmark table and returns the engine verdict unchanged', () => {
    const input = { card: apparelCard, history: healthyDays() };

    expect(predictCampaign(input)).toEqual(predict({ ...input, table: benchmarks }));
  });

  test('rejects a benchmark table supplied by the client', () => {
    expect(() => predictCampaign({ card: apparelCard, table: {} })).toThrow();
  });
});

describe('build_recovery_plan handler', () => {
  test('returns buildPlan output without numeric enrichment', () => {
    expect(buildRecoveryPlan({ diagnosis: stockoutDiagnosis, card: apparelCard })).toEqual(
      buildPlan(stockoutDiagnosis, apparelCard),
    );
  });

  test('rejects a malformed diagnosis before calling the engine', () => {
    expect(() => buildRecoveryPlan({
      diagnosis: { ...stockoutDiagnosis, primary: { ...stockoutDiagnosis.primary, rule: '' } },
      card: apparelCard,
    })).toThrow();
  });
});

describe('execute_plan handler', () => {
  test('logs Mazal actions and returns their deterministic receipt', () => {
    const log = new InMemoryActionLog();

    expect(executePlan({ actions: [mazalAction] }, log)).toEqual({
      receipt: '381e19127b7a4287ea6381debcd8e2cfc89e007e8c714f21648f096bd13a0bd4',
      logged: [mazalAction],
    });
    expect(log.snapshot()).toEqual([mazalAction]);
  });

  test('rejects seller actions without writing any part of the batch', () => {
    const log = new InMemoryActionLog();

    expect(() => executePlan({ actions: [mazalAction, sellerAction] }, log)).toThrow(
      'execute_plan only accepts actions with actor "mazal"',
    );
    expect(log.snapshot()).toEqual([]);
  });
});
