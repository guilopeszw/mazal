// ─── packages/ingest/src/event-log.ts ────────────────────────────────────
// Parses a small CSV or JSON of StoreEvents.
// Auto-detects format: if text starts with '[', parse as JSON; otherwise CSV.

import type { StoreEvent, StoreEventType } from '@mazal/contracts';

const VALID_EVENT_TYPES: ReadonlySet<string> = new Set<StoreEventType>([
  'stockout',
  'price_change',
  'eta_change',
  'creative_refresh',
  'budget_change',
  'pixel_error',
  'policy_flag',
]);

/**
 * Parses a CSV or JSON string into StoreEvent[].
 * CSV format: date,type,detail (with header row).
 * JSON format: array of { date, type, detail } objects.
 */
export function parseEventLog(text: string): StoreEvent[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];

  if (trimmed.startsWith('[')) {
    return parseJson(trimmed);
  }

  return parseCsv(trimmed);
}

function parseJson(text: string): StoreEvent[] {
  const raw = JSON.parse(text) as Array<{ date: string; type: string; detail: string }>;

  return raw.map((entry, i) => {
    validateEventType(entry.type, i);
    return {
      date: normaliseDate(entry.date),
      type: entry.type as StoreEventType,
      detail: entry.detail,
    };
  });
}

function parseCsv(text: string): StoreEvent[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const events: StoreEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    const fields = parseCsvLine(line);
    if (fields.length < 3) continue;

    const [rawDate, type, ...detailParts] = fields;
    const detail = detailParts.join(','); // rejoin if detail was split

    validateEventType(type.trim(), i);

    events.push({
      date: normaliseDate(rawDate.trim()),
      type: type.trim() as StoreEventType,
      detail: detail.trim(),
    });
  }

  return events;
}

/** Parse a CSV line, handling quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
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

function validateEventType(type: string, index: number): void {
  if (!VALID_EVENT_TYPES.has(type.trim())) {
    throw new Error(`Invalid event type "${type}" at entry ${index}. Valid types: ${[...VALID_EVENT_TYPES].join(', ')}`);
  }
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

  return trimmed;
}
