// ─── packages/ingest/src/event-log.test.ts ───────────────────────────────
// Tests for the event log parser.

import { describe, expect, test } from 'vitest';
import { parseEventLog } from './event-log.ts';

describe('parseEventLog', () => {
  test('parses CSV format', () => {
    const csv = [
      'date,type,detail',
      '2026-07-03,stockout,Supplier ran out of SKU-1234',
      '2026-07-05,price_change,Price increased R$89.90 → R$109.90',
    ].join('\n');

    const events = parseEventLog(csv);

    expect(events).toHaveLength(2);
    expect(events[0]!.date).toBe('2026-07-03');
    expect(events[0]!.type).toBe('stockout');
    expect(events[0]!.detail).toBe('Supplier ran out of SKU-1234');
    expect(events[1]!.type).toBe('price_change');
  });

  test('parses JSON format', () => {
    const json = JSON.stringify([
      { date: '2026-07-03', type: 'eta_change', detail: 'supplier ETA 9d → 22d' },
      { date: '2026-07-06', type: 'creative_refresh', detail: 'New video creative uploaded' },
    ]);

    const events = parseEventLog(json);

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('eta_change');
    expect(events[0]!.detail).toBe('supplier ETA 9d → 22d');
    expect(events[1]!.type).toBe('creative_refresh');
  });

  test('validates event type against StoreEventType union', () => {
    const json = JSON.stringify([
      { date: '2026-07-03', type: 'invalid_type', detail: 'This should fail' },
    ]);

    expect(() => parseEventLog(json)).toThrow();
  });

  test('handles all valid event types', () => {
    const validTypes = [
      'stockout', 'price_change', 'eta_change',
      'creative_refresh', 'budget_change', 'pixel_error', 'policy_flag',
    ];

    for (const type of validTypes) {
      const json = JSON.stringify([{ date: '2026-07-01', type, detail: `Test ${type}` }]);
      const events = parseEventLog(json);
      expect(events[0]!.type).toBe(type);
    }
  });

  test('handles DD/MM/YYYY date format in CSV', () => {
    const csv = [
      'date,type,detail',
      '15/07/2026,stockout,Out of stock',
    ].join('\n');

    const events = parseEventLog(csv);

    expect(events[0]!.date).toBe('2026-07-15');
  });

  test('handles empty input', () => {
    expect(parseEventLog('')).toHaveLength(0);
    expect(parseEventLog('date,type,detail')).toHaveLength(0);
  });

  test('handles CSV with detail containing commas via quoting', () => {
    const csv = [
      'date,type,detail',
      '2026-07-03,price_change,"Price changed from R$89,90 to R$109,90"',
    ].join('\n');

    const events = parseEventLog(csv);

    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toBe('Price changed from R$89,90 to R$109,90');
  });
});
