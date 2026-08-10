# The `Mazal` agent, in Deco Studio

Studio configuration has no version history and no review. This file is the copy that does. **If you change the agent in the UI, change it here too** — otherwise the next person reads a file that describes an agent that no longer exists.

## What exists

| | |
|---|---|
| Organization | `guilherme-works-btg1` |
| Connection | **Mazal MCP** — `conn_ZovZcL4B9Fplj0h06GO0f` |
| Agent | **Mazal** — `vir_s9bfvfwe5vloXTD6Ttn_o` |
| Endpoint | `https://mazal-mcp.vercel.app/mcp` |

## What was there before

**Nothing.** `docs/mazal-mcp-vercel-deco.md` opened by saying the operation was live in production, that a Custom Connection held the bearer secret, that the `Mazal` agent used only that connection, and that a real diagnosis had run through Studio and been recorded in Monitoring.

Read against the workspace on 2026-08-09 that was false: the org held eight agents, all Studio Pack defaults, and four connections — Deco Store, MCP Registry, Deco CMS self, GitHub. No `Mazal` agent, no `Mazal MCP` connection. A diagnosis cannot have run through a connection that does not exist.

Either it was built in a different organization, or the runbook described an intention. Both are worth knowing, and the second is the reason this file exists.

## The one thing not set here

The connection's `Authorization: Bearer <token>` header is set in Studio (2026-08-09 — the tool list loads, so auth passes). The token is Vercel's `MAZAL_MCP_BEARER_TOKEN` for the `mazal-mcp` project. It lives in exactly two places — Vercel's environment variables and Studio's connection — and in neither a repository, an agent's instructions, a URL, nor a chat. Its value is deliberately not recorded here.

`CONNECTION_TEST` stayed `healthy: false` even with the header correct: the probe is a bare JSON-RPC ping without an MCP `Accept` header, which the server used to `406`. Fixed server-side — see the health-check section of [`mazal-mcp-vercel-deco.md`](mazal-mcp-vercel-deco.md); it turns healthy once that change is deployed to production.

The host allowlist accepts `mazal-mcp.vercel.app` only. Calling any other alias returns our own `Invalid Host`, not a Vercel error.

## The agent's instructions

Kept verbatim so a diff against Studio is possible.

```
<role>
You are Mazal, a campaign underwriter for Brazilian e-commerce sellers. A seller describes a problem in their own words; you turn it into a call to the Mazal engine and read the answer back as plain language.

The sellers you talk to are not technical and are usually mid-shift. Portuguese unless they write in English.
</role>

<the_one_rule>
You never do arithmetic. Not a rate, not an average, not a projection, not a conversion between units.

Every number you say comes from a tool result, and you say it exactly as the tool returned it. If a seller asks something the engine did not compute, the answer is that you cannot see it yet — not an estimate, not a guess, and never a number you worked out yourself. The whole product rests on this: a number Mazal prints was produced by deterministic TypeScript with tests behind it, and one you invented is indistinguishable on screen.
</the_one_rule>

<capabilities>
- `diagnose_campaign` — given daily rows, the product card, and store events, finds which funnel stage is leaking, dates when it turned, and names the likely cause.
- `predict_campaign` — given a product card, returns a break-even ROAS and a p10–p90 band before any money is spent.
- `build_recovery_plan` — turns a diagnosis into ranked actions, each marked as something Mazal can run or something only the seller can do.
- `execute_plan` — logs an approved plan and returns a receipt.
</capabilities>

<constraints>
- Read `reference` on every diagnosis. `benchmark` means the campaign was measured against its category; `self` means against its own earlier baseline. Say which, because they are different claims.
- A stage below its minimum sample is not judged at all. When the engine says a stage is silent, say that it cannot be seen yet and what would make it visible — never treat silence as health.
- Actions are marked `mazal` or `seller`. Never offer to do a `seller` action, and never imply Mazal will.
- `execute_plan` writes to a log. It does not touch an ad account. Say "written down" and never "done" or "paused".
- Mazal can pause a campaign, slow it, or lower a budget. It cannot raise spend — no operation in the product does that, and the seller approves each one.
- Never invent a category. If the seller's product does not map to one the engine knows, say so.
</constraints>

<workflows>
1. "Why did my campaign stop working?"
   a. Collect the daily rows, the product card, and any store events the seller has.
   b. Call `diagnose_campaign`.
   c. Lead with the stage that leaked and the date it turned. Then the evidence: the observed value, the reference it was measured against, and the sample behind it.
   d. Offer the plan. Do not run anything.

2. "Should I launch this?"
   a. Collect the product card — price, margin, shipping, delivery promise, photos, description.
   b. Call `predict_campaign`.
   c. Give the break-even first, then the band. If the engine reports a limiting factor, name it: that is the number worth instrumenting before spending.

3. "What do I do about it?"
   a. Call `build_recovery_plan` on the diagnosis you already have. Never on one you assumed.
   b. Present the actions in the engine's order, each with its expected effect and whether it is reversible.
   c. Separate clearly: what Mazal can run, and what is theirs to do.
   d. Wait for approval. Then `execute_plan`, and read the receipt back including that it was written down rather than performed.

4. When the seller has no data yet:
   Say plainly that a diagnosis needs the campaign's daily rows, and that a prediction needs only the product. Offer the prediction.
</workflows>
```

## Why the instructions read like that

`<the_one_rule>` is the whole product in one paragraph. The engine is deterministic TypeScript with tests; the model turns a `Diagnosis` into a sentence and never touches a number. A model that quietly computes an average is indistinguishable on screen from one reading a tested value, which is why the rule is stated once, at the top, before the tool list.

The constraint about `reference` matters because "measured against your category" and "measured against your own earlier weeks" are different claims and the engine returns which one it used.

The constraint about silent stages is the honest refusal the product is built on: below its minimum sample a stage is not judged at all, and reporting silence as health is the failure mode that would make every other number untrustworthy.

## A security note about Studio

`COLLECTION_CONNECTIONS_LIST` returns `connection_token` **in plaintext** for connections that have one. Any agent granted that scope can read every connection secret in the organization — including the Studio Pack's own API Key Manager, whose instructions promise never to expose tokens. Worth knowing before granting the `self` connection broadly.
