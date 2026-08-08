// ─── packages/ingest/src/event-log.ts ────────────────────────────────────
// Parses a small CSV or JSON of StoreEvents with Zod validation.
// Auto-detects format: if text starts with '[', parse as JSON; otherwise CSV.

import { z } from 'zod';
import { STORE_EVENT_TYPES, type StoreEvent } from '@mazal/contracts';
import { parseCsvLine, normaliseDate } from './csv.ts';

export const storeEventTypeSchema = z.enum(STORE_EVENT_TYPES);

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

/** Validate one raw row and normalise its date. Returns null for anything that fails. */
function toEvent(raw: unknown): StoreEvent | null {
  const res = storeEventSchema.safeParse(raw);
  if (!res.success) return null;

  const { date } = normaliseDate(res.data.date);
  if (!date) return null;

  return { date, type: res.data.type, detail: res.data.detail };
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
    const event = toEvent(entry);
    if (event) events.push(event);
  }

  return events;
}

function parseCsv(text: string): StoreEvent[] {
  const lines = text.split('\n');
  const events: StoreEvent[] = [];

  // Determine if line 0 is a header (e.g. contains "date" and "type")
  const firstLineFields = parseCsvLine(lines[0]!.trim());   // split always yields one element
  const hasHeader =
    (firstLineFields[0] ?? '').toLowerCase().includes('date') &&
    (firstLineFields[1] ?? '').toLowerCase().includes('type');

  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    const fields = parseCsvLine(line);
    if (fields.length < 2) continue;

    // fields.length >= 2, checked above.
    const rawDate = fields[0]!;
    const typeStr = fields[1]!;
    const detail = fields.slice(2).join(',');

    const event = toEvent({ date: rawDate.trim(), type: typeStr.trim(), detail: detail.trim() });
    if (event) events.push(event);
  }

  return events;
}
