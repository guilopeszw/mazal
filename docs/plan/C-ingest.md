# C — Ingest and contracts

## Own

`packages/contracts` — the frozen types. You are their guardian.

`packages/ingest` — the Meta CSV parser, the Product Card schema and form, the event log parser.

Then, from SUN-A, you move to the frontend with D. Say that out loud now so nobody is surprised at 08:00 Sunday.

## Consume

From `@mazal/contracts`: your own types. From `zod`: schema validation.

## Produce

```ts
// packages/contracts — the whole surface, see docs/contracts.md
export type { CampaignDay, ProductCard, StoreEvent, Finding, Action, Verdict, /* ... */ };
export * from './metrics.js';

// packages/ingest
export function parseMetaCsv(text: string): { days: CampaignDay[]; warnings: string[] };
export function parseEventLog(text: string): StoreEvent[];
export const productCardSchema: z.ZodType<ProductCard>;
```

## Do not touch

`packages/engine`, `packages/sim`, `packages/data` internals. After SUN-A you are in `apps/web` alongside D, on components D assigns you.

---

## Part 1 — The contract, committed first

Everything in [`docs/contracts.md`](../contracts.md) becomes real TypeScript in `packages/contracts`, in your first hour. Four people are blocked until it exists — they cannot even write an import statement.

Ship it before anything else. Then announce it in the group: *"contracts are in, pull."*

### The governing rule

**Store counts, derive rates.** `metrics.ts` holds every rate function, and no type in the contract has a `ctr`, `cvr`, `roas`, or `atcRate` field. Give `metrics.ts` three assertions — one that `safeDiv` returns 0 rather than NaN for 0/0, one that `aggregate` sums counts, and one that `ctr(aggregate(days))` differs from the mean of daily CTRs on an uneven series. That third assertion is the bug this rule exists to prevent, written down.

### Guardian duty

After SAT-A the contract is frozen. When someone asks for a change:

1. Ask what breaks without it. Most requests are solved by a derived function or a field the requester did not notice.
2. If it is genuinely needed, say so in the group before pushing. Everyone pulls immediately.
3. **Adding an optional field is cheap. Renaming anything is expensive.** Prefer adding.

Frozen is not a bureaucracy — it means the change is announced, not silent. A silent rename at 02:00 costs four people their morning.

---

## Part 2 — The Meta CSV parser

The seller exports from Ads Manager and uploads the file. No OAuth, no app review, no integration. That is the whole go-to-market wedge, and this parser is it.

### Real column names

A Meta Ads Manager export has headers along these lines, and they vary by the seller's column preset:

```
Reporting starts, Reporting ends, Campaign name, Ad set name, Ad name,
Amount spent (BRL), Impressions, Reach, Frequency, Link clicks,
CTR (link click-through rate), CPC (cost per link click), CPM (cost per 1,000 impressions),
Adds to cart, Cost per add to cart, Checkouts initiated, Purchases,
Purchases conversion value, Website purchase ROAS (return on ad spend)
```

**Match columns loosely.** Normalise the header — lowercase, strip punctuation and parenthetical suffixes — then map by substring. `Amount spent (BRL)` and `Amount spent (USD)` must both resolve to `spend`, because the currency lives in the header rather than in the value. Exact-string matching against one seller's preset will fail on the next seller's file, and that failure will happen live.

**Ignore the rate columns.** The export contains CTR, CPC, CPM, and ROAS; the contract does not store them and neither do you. Parse the counts and let `metrics.ts` derive the rest. If Meta's CTR and yours disagree, yours is the one everything else is consistent with.

### The quirks that will bite

| Quirk | What it looks like | What to do |
|---|---|---|
| Missing value | `—` (em-dash), `--`, or empty | Parse as `0`, and push a `warning` naming the field and date. Never silently zero — a stage flagged on a parse artefact is the worst possible finding. |
| pt-BR numbers | `1.240,50` = one thousand two hundred forty and fifty | Detect the separator convention per column, do not assume the locale. |
| Currency in header | `Amount spent (BRL)` | Extract it, record it, surface it in the UI. |
| Date formats | `2026-07-01` or `01/07/2026` | Sniff the format from the first rows; reject ambiguously if unsure rather than guessing day/month. |
| Aggregated rows | One row for the whole period rather than per day | Detect it — `Reporting starts !== Reporting ends` — and return a warning. In-flight diagnosis needs daily rows. |
| Non-campaign rows | Totals rows, empty trailing lines | Drop, with a warning. |

Every quirk you meet becomes a row in `packages/ingest/src/meta-csv.test.ts`. The test file is the specification; the parser is the implementation.

### The fixture

Nobody on the team has a real Meta export this weekend. Hand-build `packages/ingest/test/meta-export.csv` from Meta's documented column names, with the quirks above deliberately present — the em-dash, the pt-BR decimals, a totals row. It is honest and it does the job: the parser meets real column names, real formats, and real nulls before it meets a real file.

If a real export appears before Sunday, run it immediately and add whatever breaks as a test case. That is a fifteen-minute win and worth dropping other work for.

---

## Part 3 — The Product Card

Twelve fields, about two minutes to fill, and the only source of product-layer truth. Schema in [`docs/contracts.md`](../contracts.md).

**Gross margin is the first field.** It sets break-even ROAS at `1 / grossMargin`, and it is what makes the verdict belong to this seller rather than to the category. A 70%-margin product and a 12%-margin product get opposite verdicts on identical metrics.

Form rules:

- Every field has a placeholder showing a plausible value, not an empty box. Sellers abandon empty forms.
- `category` is a select populated from B's generated `OlistCategory` union, English labels.
- `grossMargin` accepts a percentage in the UI and stores 0–1. Validate the range, and show the resulting break-even ROAS live underneath as the seller types — it is the first moment Mazal tells them something they did not know.
- `paymentMethods` is a multi-select with Pix and boleto present. This is Brazil.
- Validate with `productCardSchema` on submit and show field-level errors.

The form component lives in `apps/web` but the schema lives here. D renders it; you own what it means.

---

## Part 4 — The event log

`parseEventLog` reads a small CSV or JSON of `StoreEvent`s — date, type, detail. In v1 the demo supplies it from the simulator fixtures, and the UI lets a seller add an event by hand.

Four fields, and they are what turn *"ATC collapsed"* into *"ATC collapsed the day your supplier ETA moved from 9 days to 22."* Cheap, and it carries the most convincing sentence in the demo.

---

## Deliverables by block

**SAT-A** — `packages/contracts` committed and announced. `metrics.ts` with its three assertions. `parseMetaCsv` reading a clean file into `CampaignDay[]`, TDD.

**SAT-B** — every quirk in the table above handled, each with a test. `productCardSchema` done. `parseEventLog` done. The hand-built fixture committed.

**SUN-A** — real CSV upload wired end to end with D: file in, `CampaignDay[]` out, funnel rendered. Then move to frontend work under D's direction.

**SUN-B** — frontend with D. Guardian duty stays yours: if anyone asks to change a contract type on Sunday, the answer is almost always no.

## First commit

Create `packages/contracts` with `CampaignDay` and `metrics.ts` holding `ctr`, `cpc`, `atcRate`, `safeDiv`, and `aggregate`. Write the three assertions. Commit and push, then tell the group.

Twenty minutes, and it unblocks four people. Nothing else you do today matters as much as doing this first.
