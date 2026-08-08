# @mazal/ingest

The ingest package parses seller inputs into standard `@mazal/contracts` types for the Mazal diagnosis engine.

## Public Exports

1. `parseMetaCsv(text: string): MetaCsvResult`
   - Parses Meta Ads Manager CSV export text into `CampaignDay[]`.
   - Returns `{ days: CampaignDay[]; warnings: string[]; currency?: string }`.
   - Handles pt-BR thousands separators (`10.240` -> `10240`, `1.240,50` -> `1240.50`), parenthetical currencies (`Amount spent (BRL)`), totals rows dropping, missing value sentinels (`—`, `--`, `-`), and rate column filtering.

2. `parseEventLog(text: string): { events: StoreEvent[]; warnings: string[] }`
   - Parses store event log CSV or JSON text into `StoreEvent[]`.
   - Validates event types against `StoreEventType` union using Zod.

3. `productCardSchema`
   - Strict Zod schema for validating the 12 ProductCard fields.

## Key Design Rules & Quirks

- **No rate calculations during parsing**: Store counts only. Rate columns in Meta Ads exports (CPC, CTR, CPM, ROAS, Cost per ATC, Cost per link click) are skipped.
- **Per-column separator detection**: Scans numeric column values to detect pt-BR thousands separators (`\d{1,3}(\.\d{3})+`) vs standard US numeric formatting.
- **Explicit warnings with dates**: Missing or unparseable values generate descriptive warnings including the line's resolved date.
