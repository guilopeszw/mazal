// ─── packages/ingest/src/index.ts ────────────────────────────────────────
// Public API: the three exports every other package consumes.

export { parseMetaCsv } from './meta-csv.ts';
export { parseEventLog } from './event-log.ts';
export { productCardSchema } from './product-card.ts';
