import { STORE_EVENT_TYPES } from '@mazal/contracts';
import { describe, expect, test } from 'vitest';

import { META_TOOLS } from './allowlist.js';
import { fetchSignalEvents } from './signal.js';
import { stubClient } from './test-doubles.js';

const query = {
  accountId: 'act_1234567890',
  campaignId: '23851234567890123',
  since: '2026-07-01',
  until: '2026-07-30',
};

describe('fetchSignalEvents', () => {
  test('turns a broken dataset into exactly one pixel_error event', async () => {
    const client = stubClient({
      [META_TOOLS.signal]: {
        status: 'broken',
        reason: 'No purchase events received for 6 days',
        since: '2026-07-12',
      },
    });

    const events = await fetchSignalEvents(client, query);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('pixel_error');
    expect(events[0]?.date).toBe('2026-07-12');
    expect(events[0]?.detail).toContain('No purchase events received for 6 days');
  });

  test('marks the event as coming from Meta, not from the seller', async () => {
    const client = stubClient({
      [META_TOOLS.signal]: { status: 'broken', reason: 'r', since: '2026-07-12' },
    });

    const [event] = await fetchSignalEvents(client, query);
    // StoreEvent has no provenance field and packages/contracts is not ours to
    // change, so provenance lives in the one field a seller actually reads.
    expect(event?.detail).toMatch(/Meta Ads MCP, not the seller/);
  });

  test('degraded also counts as a break', async () => {
    const client = stubClient({
      [META_TOOLS.signal]: { status: 'degraded', reason: 'partial', since: '2026-07-20' },
    });
    expect(await fetchSignalEvents(client, query)).toHaveLength(1);
  });

  test('a healthy dataset produces no event at all', async () => {
    const client = stubClient({ [META_TOOLS.signal]: { status: 'healthy' } });
    expect(await fetchSignalEvents(client, query)).toEqual([]);
  });

  /**
   * Silence is silence. An unrecognised status must not be read as a break:
   * a synthesized pixel_error short-circuits the engine's cause attribution
   * outright, so guessing here would let Meta name a cause it never claimed.
   */
  test('an unknown status produces no event', async () => {
    const client = stubClient({ [META_TOOLS.signal]: { status: 'under_review' } });
    expect(await fetchSignalEvents(client, query)).toEqual([]);
  });

  test('a malformed response produces no event rather than throwing', async () => {
    const client = stubClient({ [META_TOOLS.signal]: 'the pixel looks fine to me' });
    expect(await fetchSignalEvents(client, query)).toEqual([]);
  });

  test('a tool failure produces no event and does not sink the diagnosis', async () => {
    const client = stubClient({});
    expect(await fetchSignalEvents(client, query)).toEqual([]);
  });

  test('falls back to the end of the window when no date is given', async () => {
    const client = stubClient({
      [META_TOOLS.signal]: { status: 'broken', reason: 'r' },
    });
    const [event] = await fetchSignalEvents(client, query);
    expect(event?.date).toBe(query.until);
  });

  test('ignores a date outside the window under diagnosis', async () => {
    const client = stubClient({
      [META_TOOLS.signal]: { status: 'broken', reason: 'r', since: '2019-01-01' },
    });
    const [event] = await fetchSignalEvents(client, query);
    expect(event?.date).toBe(query.until);
  });

  test('emits a type the contract actually declares', async () => {
    const client = stubClient({
      [META_TOOLS.signal]: { status: 'broken', reason: 'r', since: '2026-07-12' },
    });
    const [event] = await fetchSignalEvents(client, query);
    expect(STORE_EVENT_TYPES).toContain(event?.type);
  });
});
