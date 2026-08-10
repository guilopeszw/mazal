// ─── packages/meta/src/adapter.ts ────────────────────────────────────────
// Meta's payload in, the contract out. The only translation in the product.
//
// It exists so that no agent, route handler or component ever maps a Meta field
// to a contract field by hand. If they did, the numbers on screen would come
// from an arithmetic nothing in this repo tests, which is the failure the whole
// "every number comes from deterministic TypeScript" rule is built to prevent.

import type { CampaignDay } from '@mazal/contracts';
import type { MetaAccount, MetaEntityDays } from './account.ts';
import { incomplete, MetaInsightsError, type MissingField } from './errors.ts';
import { foldDaysByDate } from './fold.ts';
import { fromCents, parseMetaCount, parseMetaMoneyCents, parseMetaNumber, toCents } from './numbers.ts';
import {
  ACTION_ALIASES,
  type CountedAction,
  type FixtureStamp,
  type MetaAction,
  type MetaInsightsRow,
} from './types.ts';

const COUNTED: CountedAction[] = ['addToCarts', 'checkoutsInitiated', 'purchases'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read one conversion kind out of `actions[]` — from **one** alias, not all of
 * them.
 *
 * The three aliases are the same purchase seen through three integrations, and
 * an account wired through the pixel while also reporting omni carries all
 * three rows with the same value. Summing them counted every sale three times:
 * `cvr` and `roas` tripled, `cpa` fell to a third, and `predict` compared a 3×
 * ROAS against break-even — while `icRate` stayed correct, because both of its
 * terms inflated together. That is the worst possible shape for the error: the
 * headline finding still reads right and the money underneath it does not.
 *
 * First alias in the list wins. When more than one is present with different
 * values they are not overlapping views of the same thing, and the caller is
 * told rather than having one silently picked.
 */
function readActions(
  entries: MetaAction[],
  aliases: readonly string[],
  /** Money is accumulated in integer cents, like every other sum in this package. */
  asCents = false,
): { total: number; unreadable: string | null; conflict: string[] } {
  const byAlias = new Map<string, { total: number; unreadable: string | null }>();

  for (const entry of entries) {
    if (!aliases.includes(entry.action_type)) continue;
    const found = byAlias.get(entry.action_type) ?? { total: 0, unreadable: null };
    const value = parseMetaNumber(entry.value);
    if (value === null || value < 0) found.unreadable = entry.action_type;
    else found.total += asCents ? toCents(value) : value;
    byAlias.set(entry.action_type, found);
  }

  const present = aliases.filter((alias) => byAlias.has(alias));
  if (present.length === 0) return { total: 0, unreadable: null, conflict: [] };

  const chosen = byAlias.get(present[0]!)!;
  const disagreeing = present.filter((alias) => byAlias.get(alias)!.total !== chosen.total);

  return {
    total: chosen.total,
    unreadable: chosen.unreadable,
    conflict: disagreeing.length > 0 ? present : [],
  };
}

function actionEntries(raw: unknown): MetaAction[] | null {
  if (!Array.isArray(raw)) return null;
  const entries: MetaAction[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry['action_type'] !== 'string') return null;
    entries.push({ action_type: entry['action_type'], value: String(entry['value'] ?? '') });
  }
  return entries;
}

function readStamp(raw: unknown): FixtureStamp | undefined {
  if (!isRecord(raw) || raw['kind'] !== 'fixture') return undefined;
  return {
    kind: 'fixture',
    generator: String(raw['generator'] ?? ''),
    derivedFrom: String(raw['derivedFrom'] ?? ''),
    note: String(raw['note'] ?? ''),
  };
}

/**
 * Normalise an insights response into the contract's `CampaignDay`.
 *
 * Hand-written rather than schema-validated: `packages/ingest` is on zod 3 and
 * `apps/mcp` is on zod 4, so a package both of them import cannot depend on
 * zod at all.
 */
export function fromMetaInsights(payload: unknown): MetaAccount {
  if (!isRecord(payload) || !Array.isArray(payload['data'])) {
    throw new MetaInsightsError(
      'META_INSIGHTS_MALFORMED',
      'Not an insights response: expected an object with a `data` array.',
    );
  }

  const warnings: string[] = [];
  const missing: MissingField[] = [];
  const rows = payload['data'] as unknown[];

  const paging = payload['paging'];
  if (isRecord(paging) && typeof paging['next'] === 'string' && paging['next'].length > 0) {
    // One page is half a campaign, and half a campaign diagnosed confidently is
    // worse than no diagnosis. Said rather than silently followed: this package
    // makes no network calls.
    warnings.push('Payload is paginated and only the first page is here (`paging.next` is set).');
  }

  const stamp = readStamp(payload['__mazal_fixture']);
  if (stamp) {
    warnings.push(
      `This payload is a committed fixture, generated by ${stamp.generator}. No Meta account was called.`,
    );
  }

  const entities = new Map<string, MetaEntityDays>();
  const unknownActions = new Set<string>();
  const campaignIds = new Set<string>();
  const currencies = new Set<string>();
  const conflicts = new Set<string>();
  let currency: string | undefined;

  /**
   * Whether this response carries conversion data at all.
   *
   * The Graph API omits an empty field rather than sending `[]`, so a day with
   * no sales has no `actions` key and refusing it would refuse most real
   * campaigns before their first order. But a caller who never asked for
   * `actions` in `fields` gets rows with no key either — and reading *that* as
   * zero would report a dead funnel for a campaign that is selling fine.
   *
   * The two are told apart at the level of the payload, not the row: if no row
   * anywhere carries the key, the field was not requested and we refuse. If
   * some rows carry it, the ones that do not are Meta's zeros.
   */
  const anyRowHas = (field: 'actions' | 'action_values'): boolean =>
    rows.some((raw) => isRecord(raw) && Array.isArray(raw[field]));
  const requested = { actions: anyRowHas('actions'), action_values: anyRowHas('action_values') };

  rows.forEach((raw, rowIndex) => {
    if (!isRecord(raw)) {
      missing.push({ rowIndex, fields: ['<row is not an object>'] });
      return;
    }
    const row = raw as unknown as MetaInsightsRow;

    const date = typeof row.date_start === 'string' ? row.date_start : undefined;
    const stop = typeof row.date_stop === 'string' ? row.date_stop : undefined;

    // An aggregated row is a range, not a day. `parseMetaCsv` drops these too,
    // and for the same reason: a thirty-day total cannot sit in a series whose
    // every other member is one day.
    if (date && stop && date !== stop) {
      warnings.push(`Dropped aggregated row (${date} to ${stop}).`);
      return;
    }
    // Without `date_stop` there is nothing saying this row is a single day, and
    // a range that walks in unchallenged becomes a day thirty times too big.
    if (date && !stop) {
      missing.push({ rowIndex, date, fields: ['date_stop'] });
      return;
    }

    const level: 'campaign' | 'adset' = typeof row.adset_id === 'string' ? 'adset' : 'campaign';
    const id = level === 'adset' ? row.adset_id! : row.campaign_id;
    const name = (level === 'adset' ? row.adset_name : row.campaign_name) ?? id;
    if (typeof row.campaign_id === 'string' && row.campaign_id.length > 0) campaignIds.add(row.campaign_id);

    if (typeof row.account_currency === 'string') {
      currencies.add(row.account_currency);
      currency ??= row.account_currency;
    }

    const gaps: string[] = [];
    if (!date) gaps.push('date_start');
    if (typeof id !== 'string' || id.length === 0) gaps.push(level === 'adset' ? 'adset_id' : 'campaign_id');

    const spendCents = (() => {
      const cents = parseMetaMoneyCents(row.spend);
      if (cents === null) {
        gaps.push('spend');
        return 0;
      }
      return cents;
    })();

    const counts: Record<'impressions' | 'reach' | 'clicks', number> = {
      impressions: 0,
      reach: 0,
      clicks: 0,
    };
    for (const [field, source] of [
      ['impressions', row.impressions],
      ['reach', row.reach],
      ['clicks', row.inline_link_clicks],
    ] as const) {
      const value = parseMetaCount(source);
      if (value === null) gaps.push(field === 'clicks' ? 'inline_link_clicks' : field);
      else counts[field] = value;
    }

    /**
     * An absent key is Meta's zero here, not a hole — see `requested` above for
     * the one case where it is not, which is caught at the payload level. A key
     * that is present but is not an array of actions is still a hole: that is
     * a malformed response rather than an omitted one.
     */
    const actions = row.actions === undefined ? [] : actionEntries(row.actions);
    const actionValues = row.action_values === undefined ? [] : actionEntries(row.action_values);
    if (actions === null) gaps.push('actions');
    if (actionValues === null) gaps.push('action_values');

    const converted: Record<CountedAction, number> = {
      addToCarts: 0,
      checkoutsInitiated: 0,
      purchases: 0,
    };
    if (actions) {
      for (const key of COUNTED) {
        const { total, unreadable, conflict } = readActions(actions, ACTION_ALIASES[key]);
        // Named for the alias that actually failed, not the first one in the
        // list — pointing the reader at a field that is fine wastes the trip.
        if (unreadable) gaps.push(`actions.${unreadable}`);
        if (conflict.length > 0) conflicts.add(conflict.join(' / '));
        converted[key] = total;
      }
      for (const entry of actions) {
        const known = COUNTED.some((key) => (ACTION_ALIASES[key] as readonly string[]).includes(entry.action_type));
        if (!known) unknownActions.add(entry.action_type);
      }
    }

    let revenueCents = 0;
    if (actionValues) {
      const { total, unreadable, conflict } = readActions(actionValues, ACTION_ALIASES.purchases, true);
      if (unreadable) gaps.push(`action_values.${unreadable}`);
      if (conflict.length > 0) conflicts.add(conflict.join(' / '));
      revenueCents = total;
    }

    if (gaps.length > 0) {
      missing.push({ rowIndex, ...(date ? { date } : {}), ...(id ? { entityId: id } : {}), fields: gaps });
      return;
    }

    const day: CampaignDay = {
      date: date!,
      campaignId: id,
      spend: fromCents(spendCents),
      impressions: counts.impressions,
      reach: counts.reach,
      clicks: counts.clicks,
      addToCarts: converted.addToCarts,
      checkoutsInitiated: converted.checkoutsInitiated,
      purchases: converted.purchases,
      revenue: fromCents(revenueCents),
    };

    const entity = entities.get(id);
    if (entity) entity.days.push(day);
    else entities.set(id, { id, name, level, days: [day] });
  });

  /**
   * A row we cannot read is dropped and named. It is not read as zero, and it
   * does not take the other twenty-nine with it.
   *
   * The earlier version threw on the first hole, which meant one unreadable day
   * refused a month of perfectly good data. Refusing the field is right;
   * refusing the campaign is a different and much bigger decision, and
   * `packages/ingest` reaches the same shape from the CSV side. The dropped
   * dates are in `warnings` for a caller to render, and the reason they matter
   * is said there too: `diagnose` reads the last seven *entries*, so a gap
   * stretches its window over more calendar days than it thinks.
   */
  if (missing.length > 0) {
    const named = incomplete(missing);
    warnings.push(
      `${named.message} Those rows were dropped; the days around them were kept, so the trailing window covers more calendar days than it has entries.`,
    );
  }

  if (!requested.actions) {
    // Not one row in the whole response carries `actions`. That is a query that
    // never asked for conversions, and reading it as a funnel of zeros would
    // report a dead campaign to a seller who is selling.
    throw new MetaInsightsError(
      'META_INSIGHTS_INCOMPLETE',
      'No row in this payload carries `actions`, so no conversion was requested from Meta. ' +
        'Add `actions` and `action_values` to the `fields` of the insights call — a payload without them ' +
        'is not a campaign with no sales.',
    );
  }

  if (conflicts.size > 0) {
    warnings.push(
      `Two action types for the same conversion disagreed (${[...conflicts].join('; ')}). ` +
        'The first was used. They are normally the same event seen through different integrations, so a ' +
        'disagreement means one of them is measuring something else.',
    );
  }

  if (currencies.size > 1) {
    warnings.push(
      `The payload mixes currencies (${[...currencies].sort().join(', ')}) and every figure here is added up as though it did not. ` +
        'Split the request by account.',
    );
  }

  if (unknownActions.size > 0) {
    warnings.push(
      `Ignored ${unknownActions.size} action type${unknownActions.size === 1 ? '' : 's'} this product does not read: ${[...unknownActions].sort().join(', ')}.`,
    );
  }

  const list = [...entities.values()].map((entity) => ({
    ...entity,
    days: [...entity.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }));

  if (list.length === 0) {
    // Everything was dropped, so there is nothing to be honest *about*. This is
    // the case where refusing is the only answer left.
    throw missing.length > 0
      ? incomplete(missing)
      : new MetaInsightsError('META_INSIGHTS_MALFORMED', 'No usable rows in the insights payload.');
  }

  if (campaignIds.size > 1) {
    /**
     * `total` sums campaigns that do not share a funnel.
     *
     * Three ad sets under one campaign are one funnel seen in pieces, which is
     * what `total` is for. Three campaigns are three funnels, usually three
     * products, and adding them up produces a stage-by-stage picture of nothing
     * that exists — a leak in one of them is diluted by the two that are fine.
     * Read `.entities` and diagnose them one at a time.
     */
    warnings.push(
      `This payload holds ${campaignIds.size} campaigns and \`total\` adds them together. ` +
        'That total is not a funnel — diagnose each campaign from `entities` instead.',
    );
  }

  if (list.length > 1) {
    // Reach is deduplicated per entity by Meta and cannot be added up: the same
    // person reached by two ad sets is one person. The total below is an upper
    // bound and the only figure in this package that is not exact.
    warnings.push(
      'Reach was summed across entities. Meta deduplicates reach within an entity but not between them, so the total is an upper bound.',
    );
  }

  /**
   * The same fold the CSV path uses, so the two routes into the engine cannot
   * disagree about what a day is.
   *
   * When every row belongs to one campaign, the total is that campaign and
   * carries its id — not the id of whichever ad set happened to be first in the
   * response. Three ad sets under one campaign are one funnel seen in pieces,
   * and the piece that was written down first is not the name of the whole.
   */
  const [onlyCampaign] = campaignIds;
  const total = foldDaysByDate(list.flatMap((entity) => entity.days)).map((day) =>
    campaignIds.size === 1 && onlyCampaign ? { ...day, campaignId: onlyCampaign } : day,
  );

  return {
    total,
    entities: list,
    ...(currency ? { currency } : {}),
    warnings,
    ...(stamp ? { fixture: stamp } : {}),
  };
}
