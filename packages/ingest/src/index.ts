// ─── packages/ingest/src/index.ts ────────────────────────────────────────
// Public API: the exports other packages consume.

export { parseMetaCsv, type MetaCsvResult } from './meta-csv.ts';
export { parseEventLog, storeEventSchema, storeEventTypeSchema } from './event-log.ts';
export { productCardSchema } from './product-card.ts';
