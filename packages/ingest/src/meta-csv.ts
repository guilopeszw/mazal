// ─── packages/ingest/src/meta-csv.ts ─────────────────────────────────────
// Parses a Meta Ads Manager CSV export into CampaignDay[].
// Match columns loosely. Ignore rate columns. Handle all the quirks.

import type { CampaignDay } from '@mazal/contracts';
import { parseCsvLine, normaliseDate } from './csv.ts';

/** Column mapping: normalised header substring → CampaignDay field or metadata key. */
const COLUMN_MAP: Array<{ match: string; field: keyof CampaignDay | '_dateEnd' | '_skip' }> = [
  { match: 'reporting start',             field: 'date' },
  { match: 'reporting end',               field: '_dateEnd' },
  { match: 'campaign name',               field: 'campaignId' },
  { match: 'purchases conversion value',  field: 'revenue' },
  // Rate columns — skip them entirely (must be mapped before field matches they contain, e.g. 'cost per' before 'link click')
  { match: 'cost per',                    field: '_skip' },
  { match: 'ctr',                         field: '_skip' },
  { match: 'cpc',                         field: '_skip' },
  { match: 'cpm',                         field: '_skip' },
  { match: 'roas',                        field: '_skip' },
  { match: 'frequency',                   field: '_skip' },
  { match: 'amount spent',                field: 'spend' },
  { match: 'impressions',                 field: 'impressions' },
  { match: 'reach',                       field: 'reach' },
  // Value columns before their count twins, for the same reason
  // 'purchases conversion value' is listed above 'purchases': matching is by
  // substring, so "Adds to cart conversion value" would otherwise land in the
  // add-to-cart *count* and write reais where a number of carts belongs. The
  // contract has no home for cart value, so these are dropped rather than kept.
  { match: 'adds to cart conversion value',     field: '_skip' },
  { match: 'add to cart conversion value',      field: '_skip' },
  { match: 'checkouts initiated conversion value', field: '_skip' },
  { match: 'adds to cart',                field: 'addToCarts' },
  { match: 'add to cart',                 field: 'addToCarts' },
  { match: 'checkouts initiated',         field: 'checkoutsInitiated' },
  // "CTR (link click-through rate)" is caught by the `ctr` skip above, but the
  // spelled-out header contains no `ctr` substring and would match 'link click'
  // — landing a percentage in the click count, `1.53%` parsed as 1.53 clicks.
  { match: 'link click through rate',     field: '_skip' },
  { match: 'link click-through rate',     field: '_skip' },
  { match: 'link click',                  field: 'clicks' },
  { match: 'purchases',                   field: 'purchases' },
  // Other skippable columns
  { match: 'ad set name',                 field: '_skip' },
  { match: 'ad name',                     field: '_skip' },
];

export type MetaCsvResult = {
  days: CampaignDay[];
  warnings: string[];
  currency?: string;
};

/** The numeric fields on CampaignDay that we parse from CSV values. */
const NUMERIC_FIELDS: ReadonlySet<string> = new Set([
  'spend', 'impressions', 'reach', 'clicks',
  'addToCarts', 'checkoutsInitiated', 'purchases', 'revenue',
]);

/** True when the comma is the decimal point rather than a thousands separator. */
function commaIsDecimal(value: string): boolean {
  const lastComma = value.lastIndexOf(',');
  return lastComma >= 0 && lastComma > value.lastIndexOf('.');
}

/** Missing value sentinels. */
function isMissingValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '—' || trimmed === '--' || trimmed === '-';
}

type ColumnInfo = { field: keyof CampaignDay | '_dateEnd' | '_skip' } | null;

/** Map each header to ColumnInfo by iterating COLUMN_MAP in declared order. */
function mapColumns(headers: string[]): ColumnInfo[] {
  return headers.map(raw => {
    const normalised = normaliseHeader(raw);

    for (const col of COLUMN_MAP) {
      if (normalised.includes(col.match)) {
        return { field: col.field };
      }
    }

    return null;
  });
}

/** Normalise: lowercase, strip parenthetical suffixes, strip punctuation except spaces. */
function normaliseHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')       // strip (BRL), (link click-through rate), etc.
    .replace(/[^a-z0-9\s]/g, ' ')    // replace punctuation with spaces
    .replace(/\s+/g, ' ')            // collapse multiple spaces
    .trim();
}

/** Extract currency code from parenthetical in headers like "Amount spent (BRL)". */
function extractCurrency(headers: string[]): string | undefined {
  for (const h of headers) {
    const match = h.match(/amount spent\s*\((\w+)\)/i);
    if (match) return match[1]!.toUpperCase();   // one capture group, so a match has it
  }
  return undefined;
}

/**
 * Scans a numeric column across data rows to detect if it uses pt-BR formatting
 * (dots as thousands separators e.g. "10.240" or comma as decimal e.g. "0,50").
 */
function detectColumnPtBr(rows: string[][], colIdx: number): boolean {
  for (const row of rows) {
    if (colIdx >= row.length) continue;
    const val = row[colIdx]!.trim().replace(/%$/, '');   // colIdx < row.length, checked above
    if (isMissingValue(val)) continue;

    // Dots grouping thousands ("10.240", "1.240.500"), or a comma sitting to the
    // right of any dot, which only happens when the comma is the decimal point.
    if (/\b\d{1,3}(\.\d{3})+/.test(val)) return true;
    if (commaIsDecimal(val)) return true;
  }

  return false;
}

/**
 * Parses a numeric string using column-level pt-BR formatting rules.
 */
function parseNumberValue(raw: string, isPtBrColumn: boolean): { num: number; isValid: boolean } {
  let value = raw.trim().replace(/%$/, '');
  if (value === '') return { num: 0, isValid: true };

  if (isPtBrColumn && commaIsDecimal(value)) {
    // "1.240,50" or "1240,50" — dots group thousands, the comma is the point.
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (isPtBrColumn && /\b\d{1,3}(\.\d{3})+\b/.test(value)) {
    // "10.240" — dots group thousands and there is no decimal part.
    value = value.replace(/\./g, '');
  } else {
    // "1,240.50" — commas group thousands. True of US columns and of a pt-BR column
    // whose values happen to be written the other way round.
    value = value.replace(/,/g, '');
  }

  const num = Number(value);
  const isValid = !Number.isNaN(num);
  return { num: isValid ? num : 0, isValid };
}

/**
 * Parses a Meta Ads Manager CSV export into CampaignDay[].
 * Handles pt-BR numbers, missing values, date formats, aggregated rows, and totals.
 */
export function parseMetaCsv(text: string): MetaCsvResult {
  const warnings: string[] = [];
  const days: CampaignDay[] = [];
  let currency: string | undefined;

  const lines = text.split('\n');

  // Parse header
  const headerLine = lines[0]!;   // String.split always yields at least one element
  const headers = parseCsvLine(headerLine);

  // Extract currency from header
  currency = extractCurrency(headers);

  if (lines.length < 2) {
    warnings.push('CSV has no data rows');
    return { days, warnings, currency };
  }

  // Map each column index to a CampaignDay field
  const columnMapping = mapColumns(headers);

  // Check if any recognized columns matched
  const hasDateCol = columnMapping.some(c => c?.field === 'date');
  const hasMetricCol = columnMapping.some(c => c && NUMERIC_FIELDS.has(c.field as string));

  if (!hasDateCol && !hasMetricCol) {
    warnings.push('No recognised Meta Ads headers found in CSV');
    return { days, warnings, currency };
  }

  // Check for missing metric columns in the preset and emit top-level warnings
  const mappedFields = new Set(columnMapping.filter(Boolean).map(c => c!.field));
  for (const field of NUMERIC_FIELDS) {
    if (!mappedFields.has(field as keyof CampaignDay)) {
      warnings.push(`Column "${field}" missing from CSV export — values defaulted to 0`);
    }
  }

  // Split and clean data rows
  const dataRows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    dataRows.push(parseCsvLine(line));
  }

  if (dataRows.length === 0) {
    warnings.push('CSV has no data rows');
    return { days, warnings, currency };
  }

  // Hoist column lookups
  const campaignIdx = columnMapping.findIndex(c => c?.field === 'campaignId');
  const dateIdx = columnMapping.findIndex(c => c?.field === 'date');

  // Detect pt-BR formatting per column
  const ptBrColumns: boolean[] = columnMapping.map((col, idx) => {
    if (!col || !NUMERIC_FIELDS.has(col.field as string)) return false;
    return detectColumnPtBr(dataRows, idx);
  });

  // Process data rows
  for (const values of dataRows) {
    // Detect totals rows: any cell starting with "Total", or campaign name is empty and date is empty
    const campaignVal = campaignIdx >= 0 ? (values[campaignIdx] ?? '').trim() : '';
    const dateVal = dateIdx >= 0 ? (values[dateIdx] ?? '').trim() : '';
    const isTotalRow = values.some(v => v.trim().toLowerCase().startsWith('total')) ||
      (campaignVal === '' && (dateVal === '' || dateVal.toLowerCase().startsWith('total')));

    if (isTotalRow) {
      warnings.push('Dropped totals row');
      continue;
    }

    // First pass: resolve dates and campaignId
    let date = '';
    let dateEnd = '';
    let campaignId = '';

    for (let i = 0; i < columnMapping.length; i++) {
      const col = columnMapping[i];
      if (!col || col.field === '_skip') continue;
      const raw = values[i] ?? '';

      if (col.field === 'date') {
        const norm = normaliseDate(raw);
        date = norm.date;
        if (norm.warning) warnings.push(norm.warning);
      } else if (col.field === '_dateEnd') {
        const norm = normaliseDate(raw);
        dateEnd = norm.date;
        if (norm.warning) warnings.push(norm.warning);
      } else if (col.field === 'campaignId') {
        campaignId = raw.trim();
      }
    }

    // Detect aggregated rows (start !== end): drop from daily array with warning
    if (dateEnd && date && dateEnd !== date) {
      warnings.push(`Dropped aggregated row (${date} to ${dateEnd}) for ${campaignId || 'unknown'}`);
      continue;
    }

    // Second pass: process numeric fields with date resolved
    const numericValues: Record<string, number> = {};

    for (let i = 0; i < columnMapping.length; i++) {
      const col = columnMapping[i];
      if (!col || col.field === '_skip') continue;
      if (!NUMERIC_FIELDS.has(col.field as string)) continue;

      const fieldName = col.field as string;
      const raw = values[i] ?? '';

      /*
       * Two columns can map to the same field — `Link clicks` and `Unique link
       * clicks`, `Adds to cart` and `Website adds to cart` — and exports
       * routinely carry both. The write used to be unconditional, so whichever
       * Meta placed last won, silently: unique counts are always the smaller
       * ones, so the funnel shrank by an amount decided by column order.
       *
       * First write wins and the second is spoken aloud. The `_skip` list above
       * is still the right answer for value columns, which should be dropped
       * rather than first-won — this is the net underneath it, because a skip
       * list can never be complete for a vocabulary Meta keeps extending.
       */
      if (fieldName in numericValues) {
        warnings.push(
          `Two columns both map to ${fieldName} — using the first, ignoring "${headers[i] ?? ''}"`,
        );
        continue;
      }

      if (isMissingValue(raw)) {
        // Noted, not claimed. Writing a 0 here let a blank column win the field
        // ahead of a real one beside it — and Meta prints "—" for a
        // zero-conversion day, so `Purchases` blank with `Website purchases`
        // populated is an ordinary export, not a contrived one. Leaving the
        // field unset lets a later column fill it; all-missing still lands on
        // 0 through the `?? 0` below.
        warnings.push(`${fieldName} missing on ${date || 'unknown date'}`);
      } else {
        const isPtBr = ptBrColumns[i] ?? false;
        const { num, isValid } = parseNumberValue(raw, isPtBr);
        numericValues[fieldName] = num;

        if (!isValid) {
          warnings.push(`Unparseable ${fieldName} value "${raw.trim()}" on ${date || 'unknown date'}`);
        }
      }
    }

    const day: CampaignDay = {
      date,
      campaignId,
      spend: numericValues['spend'] ?? 0,
      impressions: numericValues['impressions'] ?? 0,
      reach: numericValues['reach'] ?? 0,
      clicks: numericValues['clicks'] ?? 0,
      addToCarts: numericValues['addToCarts'] ?? 0,
      checkoutsInitiated: numericValues['checkoutsInitiated'] ?? 0,
      purchases: numericValues['purchases'] ?? 0,
      revenue: numericValues['revenue'] ?? 0,
    };

    days.push(day);
  }

  return { days, warnings, currency };
}
