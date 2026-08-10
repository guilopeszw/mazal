// ─── apps/mcp/src/meta-client/insights.ts ────────────────────────────────
// Meta's reporting tool, called until there are no more pages, assembled into
// the payload `@mazal/meta` already knows how to read.
//
// This module deliberately does no arithmetic. It concatenates rows and hands
// them to `fromMetaInsights`, which is the only thing in the product allowed to
// turn Meta's vocabulary into the contract's.

import type { MetaInsightsPayload, MetaInsightsRow } from '@mazal/meta';

import { MAX_INSIGHT_ROWS } from '../schemas.js';
import { META_TOOLS } from './allowlist.js';
import type { MetaMcpClient } from './client.js';
import { MetaMcpError } from './errors.js';

export type MetaQuery = {
  accountId: string;
  campaignId: string;
  since: string;
  until: string;
};

/** Thirty days at campaign level is one page; twenty-five is room for ad sets. */
export const MAX_PAGES = 25;

/** `packages/data` benchmarks are derived from Olist and denominated in BRL. */
const REQUIRED_CURRENCY = 'BRL';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readCursor(page: Record<string, unknown>): string | undefined {
  const paging = page['paging'];
  if (!isRecord(paging)) return undefined;
  const cursors = paging['cursors'];
  if (!isRecord(cursors)) return undefined;
  const after = cursors['after'];
  return typeof after === 'string' && after.length > 0 ? after : undefined;
}

export async function fetchInsights(
  client: MetaMcpClient,
  query: MetaQuery,
): Promise<MetaInsightsPayload> {
  const rows: MetaInsightsRow[] = [];
  let after: string | undefined;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page: unknown = await client.callTool(META_TOOLS.insights, {
      object_id: query.campaignId,
      level: 'campaign',
      // One row per day. `diagnose` reads a trailing window of daily entries and
      // a range row would be a single day thirty times too big.
      time_increment: 1,
      time_range: { since: query.since, until: query.until },
      ...(after ? { after } : {}),
    });
    pages += 1;

    if (!isRecord(page) || !Array.isArray(page['data'])) {
      throw new MetaMcpError(
        'META_MCP_UNREADABLE',
        "Meta's reporting tool returned no `data` array. This product reads insight rows; " +
          'check that the tool and its parameters are the reporting ones.',
      );
    }

    rows.push(...(page['data'] as MetaInsightsRow[]));

    if (rows.length > MAX_INSIGHT_ROWS) {
      throw new MetaMcpError(
        'META_MCP_TOO_MANY_PAGES',
        `Meta returned more than ${MAX_INSIGHT_ROWS} rows for this range. Narrow the dates.`,
      );
    }

    after = readCursor(page);
    if (!after) break;
  }

  if (after) {
    // Reached the cap with Meta still offering more. Half a campaign diagnosed
    // confidently is worse than no diagnosis, so this refuses instead of
    // returning what it has.
    throw new MetaMcpError(
      'META_MCP_TOO_MANY_PAGES',
      `Meta is still paginating after ${MAX_PAGES} pages. Narrow the date range — a partial ` +
        'campaign would be diagnosed as though it were the whole one.',
    );
  }

  if (rows.length === 0) {
    throw new MetaMcpError(
      'META_MCP_UNREADABLE',
      'Meta returned no rows for this campaign and date range. That is an empty result, not a ' +
        'campaign with no sales, and it is not diagnosed as one.',
    );
  }

  /**
   * Benchmarks are BRL. An account billing in another currency would be
   * compared against Olist medians denominated in a currency it does not use,
   * and every finding would be confident and wrong. The adapter warns when a
   * payload MIXES currencies; it says nothing about one that is wholly USD,
   * because from inside a single payload that looks perfectly consistent.
   */
  const currencies = new Set(
    rows
      .map((row) => row.account_currency)
      .filter((c): c is string => typeof c === 'string' && c.length > 0),
  );
  const foreign = [...currencies].filter((c) => c !== REQUIRED_CURRENCY);
  if (foreign.length > 0) {
    throw new MetaMcpError(
      'META_MCP_CURRENCY',
      `This ad account bills in ${foreign.join(', ')} and Mazal's benchmarks are ${REQUIRED_CURRENCY}, ` +
        'derived from Olist. Diagnosing across currencies would compare figures that are not comparable.',
    );
  }

  // No `paging` and no fixture stamp: the pages are already folded in, and a
  // live fetch must never claim to be one of our own fixtures.
  return { data: rows };
}
