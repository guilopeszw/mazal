// ─── packages/ingest/src/index.ts ────────────────────────────────────────
// Public API: the three exports every other package consumes.

export { parseMetaCsv } from './meta-csv.js';
export { parseEventLog } from './event-log.js';
export { productCardSchema } from './product-card.js';
