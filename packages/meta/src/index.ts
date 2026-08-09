// ─── packages/meta/src/index.ts ──────────────────────────────────────────
// The payload a Meta Ads MCP would return, and the normaliser that turns it
// into the contract. See ../README.md for what is real here and what is not.
//
// This module deliberately re-exports nothing from @mazal/ingest, @mazal/engine
// or @mazal/sim. They appear in the generator and in the tests only, which is
// what keeps this package a leaf that apps/mcp can bundle.

export { fromMetaInsights } from './adapter.ts';
export { foldDaysByDate } from './fold.ts';
export { MetaInsightsError, type MetaInsightsErrorCode, type MissingField } from './errors.ts';
export { fromCents, parseMetaCount, parseMetaNumber, splitLargestRemainder, toCents } from './numbers.ts';
export { toAdsManagerCsv, totalAsEntity, type AdsManagerCsvOptions } from './csv.ts';
export { ACTION_ALIASES } from './types.ts';
export type {
  CountedAction,
  FixtureStamp,
  MetaAction,
  MetaInsightsPayload,
  MetaInsightsRow,
  MetaPaging,
} from './types.ts';
export type { MetaAccount, MetaEntityDays } from './account.ts';
