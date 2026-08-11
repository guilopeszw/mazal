// ─── apps/mcp/src/meta-client/signal.ts ──────────────────────────────────
// Meta's dataset health, as a StoreEvent the engine already knows what to do
// with.
//
// `packages/engine/src/index.ts` gives an explicit `pixel_error` event absolute
// precedence over pattern inference, because a pixel break and a thin product
// page look identical in the numbers. Today `pixel_break` is inferred from
// funnel shape; Meta's dataset reporting itself broken is the explicit evidence
// that rule was written for.
//
// That makes this module powerful enough to be dangerous: one event here
// overrides the engine's own reasoning. So it is deliberately literal —
// an explicit broken/degraded status, or nothing.

import type { StoreEvent } from '@mazal/contracts';

import { META_TOOLS } from './allowlist.js';
import type { MetaMcpClient } from './client.js';
import type { MetaQuery } from './insights.js';

/** Only these mean "broken". Anything else, including unknown, means silence. */
const BROKEN_STATUSES = new Set(['broken', 'degraded']);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Signal health is evidence, not the diagnosis.
 *
 * If the tool is missing, fails, or answers in a shape we do not recognise,
 * this returns no events and the engine falls back to its own pattern rule,
 * exactly as it behaves today. A campaign should not go undiagnosed because a
 * secondary read failed.
 */
export async function fetchSignalEvents(
  client: MetaMcpClient,
  query: MetaQuery,
): Promise<StoreEvent[]> {
  let report: unknown;
  try {
    report = await client.callTool(META_TOOLS.signal, { object_id: query.accountId });
  } catch {
    return [];
  }

  if (!isRecord(report)) return [];

  const status = report['status'];
  if (typeof status !== 'string' || !BROKEN_STATUSES.has(status.toLowerCase())) return [];

  const since = report['since'];
  /**
   * A date outside the window under diagnosis is not usable as evidence: the
   * engine correlates an event against the days it was given, and a 2019 date
   * would silently never match. Falling back to the end of the window keeps
   * the event inside the range it is evidence about.
   */
  const withinWindow =
    typeof since === 'string' &&
    ISO_DATE.test(since) &&
    since >= query.since &&
    since <= query.until;

  const reason =
    typeof report['reason'] === 'string' && report['reason'].length > 0
      ? report['reason']
      : `dataset reported ${status}`;

  return [
    {
      date: withinWindow ? since : query.until,
      type: 'pixel_error',
      // Provenance in `detail`, because StoreEvent has no provenance field and
      // packages/contracts is frozen and someone else's. A seller reading this
      // finding can tell the event was not one of theirs.
      detail:
        `Meta dataset diagnostics: ${reason}. Source: Meta Ads MCP, not the seller.`.slice(0, 600),
    },
  ];
}
