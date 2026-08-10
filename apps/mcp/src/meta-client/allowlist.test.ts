import { describe, expect, test } from 'vitest';

import { assertToolAllowed, META_TOOLS, META_TOOL_ALLOWLIST } from './allowlist.js';
import { MetaMcpError } from './errors.js';

/**
 * Segments, not substrings.
 *
 * `get_dataset_health` contains "set_" and is a read; `set_frequency_cap`
 * *is* a write. Splitting on underscores tells them apart, and matching on
 * whole segments is what keeps the next read tool from tripping this.
 */
const WRITE_MARKERS = new Set([
  'create', 'update', 'delete', 'remove', 'pause', 'set', 'upload',
  'budget', 'duplicate', 'archive', 'write', 'edit', 'publish',
]);

function writeMarkerIn(name: string): string | null {
  for (const segment of name.toLowerCase().split(/[_.\-/]/)) {
    if (WRITE_MARKERS.has(segment)) return segment;
  }
  return null;
}

describe('the Meta tool allowlist', () => {
  test('holds exactly two tools', () => {
    expect(META_TOOL_ALLOWLIST).toHaveLength(2);
    expect([...META_TOOL_ALLOWLIST].sort())
      .toEqual([META_TOOLS.insights, META_TOOLS.signal].sort());
  });

  test('allows the two read tools', () => {
    expect(() => assertToolAllowed(META_TOOLS.insights)).not.toThrow();
    expect(() => assertToolAllowed(META_TOOLS.signal)).not.toThrow();
  });

  test('refuses anything else by name', () => {
    expect(() => assertToolAllowed('create_campaign')).toThrow(MetaMcpError);
    try {
      assertToolAllowed('create_campaign');
    } catch (error) {
      expect((error as MetaMcpError).code).toBe('META_MCP_TOOL_NOT_ALLOWED');
    }
  });

  /**
   * The guard that matters. Mirrors packages/engine/src/execution.test.ts,
   * which fails the moment a spend-raising member joins `ExecutableOp`.
   *
   * A future edit that adds a Meta write tool to this list — to "just pause
   * one campaign" — breaks the promise the product makes on stage. It should
   * break a test on the way.
   */
  test('no allowlisted tool name looks like a write', () => {
    for (const name of META_TOOL_ALLOWLIST) {
      expect(writeMarkerIn(name), `"${name}" looks like a write tool`).toBeNull();
    }
  });

  /**
   * The detector, proved against names it must catch and names it must not.
   *
   * Without this, the test above passes by doing nothing — and `docs/HANDOFF.md`
   * records three defects this weekend that were checks which could not fail.
   * The `dataset` / `set_` collision below is the specific reason matching is on
   * underscore-delimited segments rather than substrings: `get_dataset_health`
   * contains "set_" and is a read.
   */
  test('the write-marker detector catches writes and clears reads', () => {
    for (const write of [
      'create_campaign', 'create_adset', 'update_ad', 'update_ad_creative',
      'delete_campaign', 'pause_campaign', 'set_frequency_cap',
      'upload_ad_image', 'create_budget_schedule', 'archive_ad',
    ]) {
      expect(writeMarkerIn(write), `"${write}" should be caught`).not.toBeNull();
    }

    for (const read of [
      'get_insights', 'get_dataset_health', 'get_campaigns',
      'list_ad_accounts', 'get_adset_details',
    ]) {
      expect(writeMarkerIn(read), `"${read}" should be cleared`).toBeNull();
    }
  });

  test('refusal names the tool that was asked for, so a log says what happened', () => {
    expect(() => assertToolAllowed('update_adset')).toThrow(/update_adset/);
  });
});
