// ─── packages/ingest/src/event-log.ts ────────────────────────────────────
// Parses a small CSV or JSON of StoreEvents with Zod validation.
// Auto-detects format: if text starts with '[', parse as JSON; otherwise CSV.

import { z } from 'zod';
import type { StoreEvent, StoreEventType } from '@mazal/contracts';
import { parseCsvLine, normaliseDate } from './csv.js';

export const storeEventTypeSchema = z.enum([
  'stockout',
  'price_change',
  'eta_change',
  'creative_refresh',
  'budget_change',
  'pixel_error',
  'policy_flag',
]);

export const storeEventSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  type: storeEventTypeSchema,
  detail: z.string().default(''),
});

/**
 * Parses a CSV or JSON string into StoreEvent[].
 * CSV format: date,type,detail (optional header row).
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const events: StoreEvent[] = [];

  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;

    const res = storeEventSchema.safeParse(entry);
    if (!res.success) continue;

    const { date } = normaliseDate(res.data.date);
    if (!date) continue;

    events.push({
      date,
      type: res.data.type as StoreEventType,
      detail: res.data.detail,
    });
  }

  return events;
}

function parseCsv(text: string): StoreEvent[] {
  const lines = text.split('\n');
  if (lines.length === 0) return [];

  const events: StoreEvent[] = [];

  // Determine if line 0 is a header (e.g. contains "date" and "type")
  const firstLineFields = parseCsvLine(lines[0].trim());
  const hasHeader = firstLineFields.length >= 2 &&
    firstLineFields[0].toLowerCase().includes('date') &&
    firstLineFields[1].toLowerCase().includes('type');

  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    const fields = parseCsvLine(line);
    if (fields.length < 2) continue;

    const [rawDate, typeStr, ...detailParts] = fields;
    const detail = detailParts.join(',');

    const res = storeEventSchema.safeParse({
      date: rawDate.trim(),
      type: typeStr.trim(),
      detail: detail.trim(),
    });

    if (!res.success) continue;

    const { date } = normaliseDate(res.data.date);
    if (!date) continue;

    events.push({
      date,
      type: res.data.type as StoreEventType,
      detail: res.data.detail,
    });
  }

  return events;
}
