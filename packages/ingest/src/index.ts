// ─── packages/ingest/src/index.ts ────────────────────────────────────────
// Public API: the exports other packages consume.

export { parseMetaCsv, type MetaCsvResult } from './meta-csv.js';
export { parseEventLog, storeEventSchema, storeEventTypeSchema } from './event-log.js';
export { productCardSchema } from './product-card.js';
