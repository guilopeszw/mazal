// ─── packages/meta/src/csv.ts ────────────────────────────────────────────
// The same days, written the way Ads Manager exports them.
//
// Why both a payload and a CSV: the CSV is the format a seller can actually
// produce today — no OAuth, no app review, "Export → Download report" — and
// `docs/acceptance.md` claim 6 rests on it. The payload is what an integration
// would send instead. Emitting both from one source, and then testing that
// `parseMetaCsv` and `fromMetaInsights` land on the same numbers, is what keeps
// the two doors into the engine from drifting apart.

import type { CampaignDay } from '@mazal/contracts';
import { cpc, cpm, ctr, roas, safeDiv } from '@mazal/contracts/metrics';
import type { MetaEntityDays } from './account.ts';

/**
 * pt-BR, because that is what an account set to Brazil exports: comma decimal,
 * dot thousands. `parseMetaCsv` detects the convention per column and both this
 * and the en-US form parse — this is the one a Brazilian seller will hand over.
 */
function ptBr(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole = '0', fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = value < 0 ? '-' : '';
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

const cell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export type AdsManagerCsvOptions = {
  currency?: string;
  /**
   * One row per entity per day, with the ad set column. Off by default: the
   * parser emits one `CampaignDay` per row and does not fold by date, so an
   * export like this reaches `diagnose` as N rows per day unless the caller
   * folds it first.
   */
  perEntity?: boolean;
};

/**
 * Write entities as an Ads Manager export.
 *
 * The rate columns are decoration — `parseMetaCsv` skips every one of them —
 * but they are in a real export and a fixture without them would not exercise
 * the column collisions the parser is built to survive (`Cost per link click`
 * must not be read as `Link clicks`). They are computed with the contract's own
 * metric functions rather than by hand here, because a second definition of CTR
 * is exactly what that rule exists to prevent.
 */
export function toAdsManagerCsv(entities: MetaEntityDays[], options: AdsManagerCsvOptions = {}): string {
  const { currency = 'BRL', perEntity = false } = options;

  const header = [
    'Reporting starts',
    'Reporting ends',
    'Campaign name',
    ...(perEntity ? ['Ad set name'] : []),
    `Amount spent (${currency})`,
    'Impressions',
    'Reach',
    'Frequency',
    'Link clicks',
    `Cost per link click (${currency})`,
    'CTR (link click-through rate)',
    'CPM (cost per 1,000 impressions)',
    'Adds to cart',
    'Checkouts initiated',
    'Purchases',
    'Purchases conversion value',
    'Website purchase ROAS (return on ad spend)',
  ];

  const campaignName = entities[0]?.name ?? 'Campaign';

  const rows: string[][] = [];
  for (const entity of entities) {
    for (const day of entity.days) {
      rows.push([
        day.date,
        day.date,
        perEntity ? campaignName : entity.name,
        ...(perEntity ? [entity.name] : []),
        ptBr(day.spend, 2),
        String(day.impressions),
        String(day.reach),
        ptBr(safeDiv(day.impressions, day.reach), 2),
        String(day.clicks),
        ptBr(cpc(day), 2),
        `${ptBr(ctr(day) * 100, 2)}%`,
        ptBr(cpm(day), 2),
        String(day.addToCarts),
        String(day.checkoutsInitiated),
        String(day.purchases),
        ptBr(day.revenue, 2),
        ptBr(roas(day), 2),
      ]);
    }
  }

  // Sorted by date so a per-entity export reads like Ads Manager's own, which
  // groups a day's ad sets together rather than one ad set's whole history.
  rows.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));

  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

/** The account rolled into one series, for the export a seller uploads. */
export function totalAsEntity(name: string, days: CampaignDay[]): MetaEntityDays {
  return { id: name, name, level: 'campaign', days };
}
