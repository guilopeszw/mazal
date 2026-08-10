# @mazal/meta

The payload a Meta Ads integration would hand us, and the one place it becomes the contract.

**The integration itself is not built.** `docs/prds/e-agent/10-meta-read-adapter.md` put it in the last phase, "only if there is buffer", and there was not. What is built is the half that is useful without it: the shape of the response, the normaliser, and three committed payloads carrying the demo.

## What is real here and what is not

| | |
|---|---|
| The adapter | **Real.** `fromMetaInsights` is what `diagnose_campaign` calls on the MCP side and what `apps/web` runs at build time. A live response goes through it unchanged. |
| The payload shape | **Real.** `GET /act_<id>/insights` with `time_increment=1`, numbers as strings, conversions inside `actions[]`. |
| The numbers | **Fixtures.** Re-encodings of `packages/sim/fixtures/demo-case1.json`, `demo-case2.json` and `demo-account.json`, which the simulator generates and guards. |
| The account | **Nobody's.** No Meta account was called. Every payload here carries `__mazal_fixture`, a field the Graph API does not return, and the adapter warns when it sees one. |

## Why it is here and not in `apps/mcp/src/meta/`

`docs/prds/e-agent/10-meta-read-adapter.md` names that path, and asks that no new `packages/*` be added. Two things it did not anticipate made that impossible:

- **`apps/web` needs the adapter too**, and an app cannot import from another app. The demo's days arrive through `fromMetaInsights` at build time.
- **`packages/ingest` is on zod 3 and `apps/mcp` is on zod 4.** The obvious other home would have forced a zod version on both.

So the code moved and the validation is hand-written. The PRD's other boxes, stated rather than quietly left: **no Meta connection is attached**; **no real response was ever captured**, so the fixtures re-encode `packages/sim` and what is validated is a shape we authored — narrowed, not closed, by the documented-field check below; and there is **no separate `schema.ts`**, because the validation is fifty lines inside `adapter.ts` and splitting it would move code without moving risk. `META_ADS_ENABLED` is implemented, off by default, and described below.

## The rule the whole package turns on

**Absence is not zero.** A missing `spend` is refused by name, with the row and the date attached — never read as a campaign that spent nothing. But an `actions: []` that is *present* is a real zero, because Meta omits the action type of something that did not happen, and a day with no sales is a fact rather than a gap.

Those two look identical three functions downstream and mean opposite things. `packages/ingest` makes the other call for CSV — default to 0, warn, carry on — because a spreadsheet is a human artefact with human gaps. An API response is machine output, and a hole in it means the call was wrong.

## No rates, at either end

`ctr`, `cpc`, `cpm` and `frequency` are fields Meta genuinely returns. `MetaInsightsRow` does not declare them, so the adapter cannot read one, and the MCP boundary schema strips them on the way in. Strips rather than rejects: the row describes someone else's API, and refusing a response for carrying a field Meta chose to include would mean no real response could be sent at all. The contract stores counts and derives rates; a rate that exists in the type is a rate someone reads on a busy day instead of calling the function that defines it.

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
| `demo-case1.meta-insights.json` | 30 rows — the pre-flight campaign, one row a day |
| `demo-case1.campaign.csv` | the same, as an Ads Manager export |
| `demo-case2.meta-insights.json` | 90 rows — one campaign, three ad sets, thirty days |
| `demo-case2.adsets.csv` | the same, as an Ads Manager export with the ad set column |
| `demo-case2.campaign.csv` | thirty rows, one a day — the plainest export to upload |
| `demo-account.meta-insights.json` | 90 rows — one account, three products, a campaign each |
| `demo-account.campaigns.csv` | the same, as an export |

The ad-set split is by largest remainder on integer counts and integer cents, so the three rows sum to the committed day exactly. That is what lets the gate assert equality rather than a tolerance, and it does: the payload folds back to the fixture, both CSVs parse back to it, and the diagnosis through the payload is still stage 4 `icRate` at −1.61σ with the change point on 2026-07-12 and the `eta_change` event attached.

Either CSV can be uploaded. `parseMetaCsv` emits one `CampaignDay` per CSV *row* and does not group by date, so an ad-set export arrives as three rows per day — which read as three days, and made `diagnose`'s seven-day window cover two and a bit real ones. `apps/web/app/actions.ts` folds with `foldDaysByDate` now and tells the seller their export was added up. Before that fix the ad-set file diagnosed stage 5 `checkout_friction`; after it, the true stage 4 `eta_shock`.

## `META_ADS_ENABLED`

Off by default, as PRD 10 asks, and it gates the distinction that actually carries risk rather than the whole arm.

A payload carrying `__mazal_fixture` is one we generated, whose every number `pnpm meta:fixtures` asserts. **Anything else is a response nobody on this team has ever seen** — and `diagnose_campaign` refuses to diagnose one until `META_ADS_ENABLED=true`. Turning it off leaves the CSV path and the fixtures working exactly as before, which is what the PRD means by the flag preserving them.

The reason for the refusal is the honest limit below: the adapter has only ever read its own generator's output. Set the flag once a real payload has been read against it.

## What we know about the shape, and what we do not

`packages/meta/src/documented-shape.test.ts` pins every field the adapter reads against Meta's published Ads Insights field list, with the reference URLs and the date they were read. It also asserts the negative: no rate field is ever read, and `clicks` comes from `inline_link_clicks` rather than `clicks`, which counts every click on the ad and would inflate every rate downstream.

**That checks names, not behaviour.** Whether a value arrives as `"12"` or `12`, whether an empty `actions` is omitted or sent as `[]`, and whether three purchase aliases carry the same conversion are assumptions no test here can settle. One real insights response — from any account, a dead campaign, a R$5 test — settles all three in ten minutes, and it is the next action in `docs/HANDOFF.md`.

## What Meta can never tell us

The product card. Price, margin, stock on hand, photos, description length, the delivery promise — the seller's twelve fields live in the store, not in Ads Manager. Stages 0–2 of the funnel are a media problem and Meta can see them; stages 3–6 are a product, offer or experience problem and it cannot. Diagnosing the second half is the entire product, so no integration removes the form.
