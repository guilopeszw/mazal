// ─── packages/ingest/src/meta-csv.ts ─────────────────────────────────────
// Parses a Meta Ads Manager CSV export into CampaignDay[].
// Match columns loosely. Ignore rate columns. Handle all the quirks.

import type { CampaignDay } from '@mazal/contracts';

/** Column mapping: normalised header substring → CampaignDay field or metadata key. */
const COLUMN_MAP: Array<{ match: string; field: keyof CampaignDay | '_dateEnd' | '_skip'; priority: number }> = [
  // Higher priority = matched first. Order matters for overlapping substrings.
  { match: 'reporting start',             field: 'date',                priority: 100 },
  { match: 'reporting end',               field: '_dateEnd',            priority: 99 },
  { match: 'campaign name',               field: 'campaignId',          priority: 98 },
  { match: 'purchases conversion value',  field: 'revenue',             priority: 97 },
  { match: 'amount spent',                field: 'spend',               priority: 96 },
  { match: 'impressions',                 field: 'impressions',         priority: 95 },
  { match: 'reach',                       field: 'reach',               priority: 94 },
  { match: 'link click',                  field: 'clicks',              priority: 93 },
  { match: 'adds to cart',                field: 'addToCarts',          priority: 92 },
  { match: 'add to cart',                 field: 'addToCarts',          priority: 91 },
  { match: 'checkouts initiated',         field: 'checkoutsInitiated',  priority: 90 },
  { match: 'purchases',                   field: 'purchases',           priority: 50 }, // low priority — "purchases conversion value" must match first
  // Rate columns — skip them entirely (must be higher priority than field matches they contain)
  { match: 'cost per',                    field: '_skip',               priority: 93 },
  { match: 'ctr',                         field: '_skip',               priority: 80 },
  { match: 'cpc',                         field: '_skip',               priority: 79 },
  { match: 'cpm',                         field: '_skip',               priority: 78 },
  { match: 'roas',                        field: '_skip',               priority: 77 },
  { match: 'frequency',                   field: '_skip',               priority: 75 },
  // Other skippable columns
  { match: 'ad set name',                 field: '_skip',               priority: 60 },
  { match: 'ad name',                     field: '_skip',               priority: 59 },
];

// Sort by priority descending so higher-priority matches are tested first
const SORTED_COLUMNS = [...COLUMN_MAP].sort((a, b) => b.priority - a.priority);

export type MetaCsvResult = {
  days: CampaignDay[];
  warnings: string[];
  currency?: string;
};

/**
 * Parses a Meta Ads Manager CSV export into CampaignDay[].
 * Handles pt-BR numbers, missing values, date formats, aggregated rows, and totals.
 */
export function parseMetaCsv(text: string): MetaCsvResult {
  const warnings: string[] = [];
  const days: CampaignDay[] = [];
  let currency: string | undefined;

  const lines = text.split('\n');
  if (lines.length < 2) {
    return { days, warnings, currency };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);

  // Map each column index to a CampaignDay field
  const columnMapping = mapColumns(headers);

  // Extract currency from header
  currency = extractCurrency(headers);

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue; // skip empty lines

    const values = parseCsvLine(line);

    // Detect totals rows: campaign name is empty or starts with "Total"
    const campaignIdx = columnMapping.findIndex(c => c?.field === 'campaignId');
    const campaignValue = campaignIdx >= 0 ? values[campaignIdx]?.trim() : undefined;

    if (campaignValue !== undefined && (campaignValue === '' || campaignValue.toLowerCase().startsWith('total'))) {
      warnings.push('Dropped totals row');
      continue;
    }

    // Build the CampaignDay
    const day = buildCampaignDay(values, columnMapping, warnings);
    if (day) {
      days.push(day);
    }
  }

  return { days, warnings, currency };
}

// ─── internal helpers ────────────────────────────────────────────────────

type ColumnInfo = { field: keyof CampaignDay | '_dateEnd' | '_skip'; header: string } | null;

function mapColumns(headers: string[]): ColumnInfo[] {
  return headers.map(raw => {
    const normalised = normaliseHeader(raw);

    for (const col of SORTED_COLUMNS) {
      if (normalised.includes(col.match)) {
        return { field: col.field, header: raw };
      }
    }

    return null; // unknown column, ignore
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
    if (match) return match[1].toUpperCase();
  }
  return undefined;
}

/** Parse a single CSV line, handling quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

/** The numeric fields on CampaignDay that we parse from CSV values. */
const NUMERIC_FIELDS: ReadonlySet<string> = new Set([
  'spend', 'impressions', 'reach', 'clicks',
  'addToCarts', 'checkoutsInitiated', 'purchases', 'revenue',
]);

/** Missing value sentinels. */
function isMissingValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '—' || trimmed === '--' || trimmed === '-';
}

/**
 * Parse a numeric string, handling pt-BR format.
 * pt-BR: "1.240,50" = 1240.50 (dots as thousands separators, comma as decimal)
 * Standard: "1240.50" or "1,240.50"
 */
function parseNumber(raw: string): number {
  let value = raw.trim();

  // Strip percentage signs
  value = value.replace(/%$/, '');

  if (value === '') return 0;

  // Detect pt-BR: if value has comma AND digits after comma that look like decimals
  // pt-BR pattern: dots for thousands, comma for decimal → "1.240,50"
  // US pattern: commas for thousands, dot for decimal → "1,240.50"
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Comma comes after dot → pt-BR format: "1.240,50"
    // Dots are thousands separators, comma is decimal
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma >= 0) {
    // Dot comes after comma → US format: "1,240.50"
    // Commas are thousands separators
    value = value.replace(/,/g, '');
  }
  // If only comma (no dot): "1240,50" → pt-BR decimal
  else if (lastComma >= 0 && lastDot < 0) {
    value = value.replace(',', '.');
  }
  // If only dot: "1240.50" → standard decimal (no change needed)

  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

/** Normalise date to ISO 8601 YYYY-MM-DD. */
function normaliseDate(raw: string): string {
  const trimmed = raw.trim();

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY format
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback: return as-is
  return trimmed;
}

function buildCampaignDay(
  values: string[],
  columnMapping: ColumnInfo[],
  warnings: string[],
): CampaignDay | null {
  let date = '';
  let dateEnd = '';
  let campaignId = '';
  const numericValues: Record<string, number> = {};

  for (let i = 0; i < columnMapping.length; i++) {
    const col = columnMapping[i];
    if (!col || col.field === '_skip') continue;

    const raw = i < values.length ? values[i] : '';

    if (col.field === 'date') {
      date = normaliseDate(raw);
    } else if (col.field === '_dateEnd') {
      dateEnd = normaliseDate(raw);
    } else if (col.field === 'campaignId') {
      campaignId = raw.trim();
    } else if (NUMERIC_FIELDS.has(col.field)) {
      if (isMissingValue(raw)) {
        numericValues[col.field] = 0;
        const fieldLabel = col.field as string;
        warnings.push(`${fieldLabel} missing on ${date}`);
      } else {
        numericValues[col.field] = parseNumber(raw);
      }
    }
  }

  // Detect aggregated rows
  if (dateEnd && date && dateEnd !== date) {
    warnings.push(`Row for ${campaignId || 'unknown'} is aggregated (${date} to ${dateEnd}), in-flight diagnosis needs daily rows`);
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

  return day;
}
