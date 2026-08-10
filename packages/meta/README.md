# @mazal/meta

The payload a Meta Ads integration would hand us, and the one place it becomes the contract.

**The integration itself is not built.** `docs/prds/e-agent/10-meta-read-adapter.md` put it in the last phase, "only if there is buffer", and there was not. What is built is the half that is useful without it: the shape of the response, the normaliser, and two committed payloads carrying the demo.

## What is real here and what is not

| | |
|---|---|
| The adapter | **Real.** `fromMetaInsights` is what `diagnose_campaign` calls on the MCP side and what `apps/web` runs at build time. A live response goes through it unchanged. |
| The payload shape | **Real.** `GET /act_<id>/insights` with `time_increment=1`, numbers as strings, conversions inside `actions[]`. |
| The numbers | **Fixtures.** Re-encodings of `packages/sim/fixtures/demo-case2.json` and `demo-account.json`, which the simulator generates and guards. |
| The account | **Nobody's.** No Meta account was called. Every payload here carries `__mazal_fixture`, a field the Graph API does not return, and the adapter warns when it sees one. |

## Why it is here and not in `apps/mcp/src/meta/`

`docs/prds/e-agent/10-meta-read-adapter.md` names that path, and asks that no new `packages/*` be added. Two things it did not anticipate made that impossible:

- **`apps/web` needs the adapter too**, and an app cannot import from another app. The demo's days arrive through `fromMetaInsights` at build time.
- **`packages/ingest` is on zod 3 and `apps/mcp` is on zod 4.** The obvious other home would have forced a zod version on both.

So the code moved and the validation is hand-written. The PRD's other boxes: no Meta connection is attached, no *observed* response schema was ever captured — the fixtures re-encode `packages/sim`, so what is validated is a shape we authored — there is no separate `schema.ts`, and `META_ADS_ENABLED` is skipped for the reason at the end of this file.

## The rule the whole package turns on

**Absence is not zero.** A missing `spend` is refused by name, with the row and the date attached — never read as a campaign that spent nothing. But an `actions: []` that is *present* is a real zero, because Meta omits the action type of something that did not happen, and a day with no sales is a fact rather than a gap.

Those two look identical three functions downstream and mean opposite things. `packages/ingest` makes the other call for CSV — default to 0, warn, carry on — because a spreadsheet is a human artefact with human gaps. An API response is machine output, and a hole in it means the call was wrong.

## No rates, at either end

`ctr`, `cpc`, `cpm` and `frequency` are fields Meta genuinely returns. `MetaInsightsRow` does not declare them and the MCP boundary schema rejects them outright. The contract stores counts and derives rates; a rate that exists in the type is a rate someone reads on a busy day instead of calling the function that defines it.

The CSV emitter does write those columns, because a real export has them and the parser has to survive the collisions they cause — `Cost per link click` must not be read as `Link clicks`. It computes them with `@mazal/contracts/metrics`, never locally.

## No zod

`packages/ingest` is on zod 3 and `apps/mcp` is on zod 4. A package both of them import cannot depend on it, so the validation here is hand-written. It also keeps the esbuild bundle for the Vercel Function small.

## The fixtures

```
pnpm meta:fixtures
```

Writes the files, then asserts they still carry the demo, exiting non-zero if they do not — the same contract as `pnpm sim:fixtures`, and for the same reason: both demo campaigns once diagnosed healthy and nobody found out until a commit message mentioned it.

| file | what it is |
|---|---|
| `demo-case2.meta-insights.json` | 90 rows — one campaign, three ad sets, thirty days |
| `demo-case2.adsets.csv` | the same, as an Ads Manager export with the ad set column |
| `demo-case2.campaign.csv` | thirty rows, folded to one a day — **this is the one to upload in the demo** |
| `demo-account.meta-insights.json` | 90 rows — one account, three products, a campaign each |
| `demo-account.campaigns.csv` | the same, as an export |

The ad-set split is by largest remainder on integer counts and integer cents, so the three rows sum to the committed day exactly. That is what lets the gate assert equality rather than a tolerance, and it does: the payload folds back to the fixture, both CSVs parse back to it, and the diagnosis through the payload is still stage 4 `icRate` at −1.61σ with the change point on 2026-07-12 and the `eta_change` event attached.

**Upload `demo-case2.campaign.csv`, not the ad-set one**, unless the caller folds first. `parseMetaCsv` emits one `CampaignDay` per CSV *row* and does not group by date, so an export broken out by ad set arrives as three rows per day and `diagnose`'s seven-day window silently covers two and a bit real days. `foldDaysByDate` is the fix and is exported here; `apps/web`'s upload path does not call it yet.

## `META_ADS_ENABLED`

The PRD asks for a flag defaulting to off. It governs **live connections**, which do not exist yet. The fixture arm is not gated by it and should not be: it makes no network call, reaches no account, and needs no credential. Do not switch the demo off believing the PRD asked for that.

## What Meta can never tell us

The product card. Price, margin, stock on hand, photos, description length, the delivery promise — the seller's twelve fields live in the store, not in Ads Manager. Stages 0–2 of the funnel are a media problem and Meta can see them; stages 3–6 are a product, offer or experience problem and it cannot. Diagnosing the second half is the entire product, so no integration removes the form.
