# E — Agent, deco, and the pitch

## Own

`apps/mcp` — the MCP server exposing the engine as four tools, registered in deco Studio as a Custom Connection.

`POST /api/chat` in `apps/web` — the only route in the whole product that touches an LLM.

The narration prompts. The deck. The demo.

From SUN-B you own the demo laptop and touch nothing else.

## Consume

From `@mazal/engine`: `diagnose`, `predict`, `buildPlan` and their types.
From `@mazal/contracts`: every type.
From `@mazal/data`: `benchmarks`.

## Produce

Four MCP tools:

```ts
diagnose_campaign     ({ days, card, events, reference })  → Diagnosis
predict_campaign      ({ card, history? })                 → Verdict
build_recovery_plan   ({ diagnosis, card })                → RecoveryPlan
execute_plan          ({ actions })                        → { receipt, logged }
```

Four, not five. `explain_metric` was dropped: the agent explains from the `Finding` it already holds, and a separate tool is a round trip for nothing. Fewer tools means better tool selection, which means fewer failed demos.

Every tool returns typed JSON straight from the deterministic engine. The tools are thin — parse, call, return.

## Do not touch

`packages/*` source. `apps/web` except your one route handler. `packages/contracts` after SAT-A.

---

## The hard rule

**The model never does arithmetic.** Every number comes from deterministic TypeScript. The LLM does exactly three things: **narrate** a finding, **draft** a plan in the seller's language, and **converse**.

This is the answer to *"how do you know it isn't hallucinating"*, and it is also what keeps you inside the token budget. Enforce it in the prompt: the model receives a `Diagnosis` as JSON and is instructed to state only values present in it. It never estimates, never rounds to a rounder number, never fills a gap.

If the model ever produces a number that is not in the JSON it was given, that is a bug on the demo path, and it is the bug that loses the room.

---

## Narration

Mazal's voice, and it is a specific voice:

- **Verdict first, evidence second, plan third.** Never the reverse.
- **Short sentences.** Three sharp ones read as expertise; a paragraph reads as an LLM.
- **Never "your ROAS is low."** That is the sentence every existing tool already says, and it carries no information. Mazal is causal and specific, always: *"your ad worked; your product page didn't."*
- **Name the layer, then the fix.** The seller needs to know where to look before they need to know what to do.

The lines in `demo-script.md` §5 are the target register. Write the templates so the model lands near them consistently.

Two calls per user interaction, maximum. Cache every response keyed by scenario.

## deco Studio

Depth: **connection only.** The engine ships as a plain TS MCP server you deploy on Vercel; deco Studio registers it as a Custom Connection. You do not adopt their Workers runtime — that is five unfamiliar hours you do not have.

What it buys, in about forty minutes:

- **Free AI Gateway credits** for a new org, which removes the token-budget risk from the risk table entirely.
- **An agent surface** — Mazal answering *"what happened to my campaign?"* inside deco Studio. This is your insurance policy: if the frontend slips, you demo here and still have a complete product.
- **A token and cost monitor** — a real screen showing cost per tool call. Judges built that; showing them it in use is worth more than saying you used it.

Setup: sign up at studio.decocms.com, create the org, Settings → Connections → Add connection → Custom Connection, point it at your deployed MCP URL, select the four tools. Docs: `docs.decocms.com/deco-studio`.

**The connection must work by SUN-A.** It is the fallback, and a fallback that is not ready by the time you need it is not a fallback.

## Demo safety

At SUN-B, run the entire demo path once and **capture every LLM response as a fixture.** The demo then replays from disk. Wifi will fail, rate limits will hit, and a model will produce a weird sentence on the one run that matters — assume all three.

Fixtures come from B's seeded campaigns, so the numbers are byte-reproducible across machines and runs.

Record the three-minute backup video at SUN-C, before rehearsing. If everything breaks on stage you play the video, and the room never knows the difference.

---

## The deck

Seven slides, from `demo-script.md` §7. Start it at SAT-B — a deck written at hour 30 shows.

1. **Mazal — campaigns shouldn't need luck.**
2. **The crack:** sellers fix creative when the product is the problem. Put a real seller's words here from the calls the team already made — a quote beats a statistic.
3. **The insight:** four layers, two of them invisible to every existing tool. The media / product dividing line.
4. **Live demo.**
5. **How it works:** funnel leak localisation, one diagram.
6. **How we know it's right:** confusion matrix, false-alarm rate, calibration if it survived the cut ladder.
7. **Why it's a business:** zero-integration onboarding, and the two savings numbers.

**Slide 6 is the one nobody else will have. Do not cut it for time.**

Put the real backtest number on it, whatever it is. If a fault class does badly, name it and say how you would fix it — teams that disclose a limitation read as rigorous, teams that claim 99% get interrogated and lose the room in one question.

## The demo

Five minutes, from `demo-script.md` §5. One store, one product, two moments in its life — not two unrelated demos, because the thesis is that it is one engine with two reference frames, and the demo should make that self-evident.

Open cold, no slides, inside the problem. Pause before clicking **Run all** and say the line the whole product rests on:

> *"It proposes. You decide. It never spends your money without asking."*

Rehearse three times minimum, out loud, timed. Five minutes is much shorter than it sounds. Cut whatever runs long — it is always the setup, never the payoff.

---

## Deliverables by block

**SAT-A** — `apps/mcp` scaffolded with the MCP SDK, one tool answering with a hardcoded `Diagnosis`. deco Studio org created.

**SAT-B** — all four tools wired to the real engine. Deployed. Narration prompt drafted and producing something in the right register. Deck outline started.

**SUN-A** — **deco Studio connection live and answering "what happened to my campaign?" end to end.** This is the insurance policy and it must work today. `/api/chat` wired into D's sidebar.

**SUN-B** — full demo run once, every LLM response captured as a fixture. Deck done, with B's real numbers on slide 6. Sit with A and verify every narration line traces to an actual `Finding` field — if the script says something the engine cannot produce, fix the script.

**SUN-C** — you own the laptop. Backup video recorded. Rehearse three times. Two of you take judge Q&A from `docs/acceptance.md`.

## First commit

Scaffold `apps/mcp` with `@modelcontextprotocol/sdk` and hono, expose `diagnose_campaign` returning a hardcoded `Diagnosis` that satisfies the contract, and deploy it. Commit.

Thirty minutes. A deployed URL that returns valid JSON is worth more today than a correct tool that runs only on your machine.
