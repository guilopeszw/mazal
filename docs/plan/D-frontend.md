# D — Frontend

## Own

`apps/web`. Next.js App Router, deployed on Vercel.

**One screen.** The funnel visual on it is the product's identity — the screenshot people share, the image that should be recognisable from across a room. Everything else on the page is chrome.

## Consume

From `@mazal/contracts`: every type, and the metric functions. **Mock against these from minute one.** You never wait on A, B, or C — you write a fixture that satisfies `Diagnosis`, render it, and swap in the real call when it lands.

From your own route handlers, which import `@mazal/engine` directly:

```ts
POST /api/diagnose  → { days, card, events, reference }  → Diagnosis
POST /api/predict   → { card, table, history? }          → Verdict
POST /api/plan      → { diagnosis, card }                → RecoveryPlan
POST /api/execute   → { actions: Action[] }              → { receipt: string; logged: Action[] }
```

You write those four. They are four lines each — parse the body, call the engine function, return JSON.

`POST /api/chat` is **E's**, not yours. It is the only route that touches an LLM. You call it and render what comes back.

## Produce

The screen. And, for E: a way to drive the demo — a fixture switcher that swaps between `demo-case1` and `demo-case2` without a page navigation.

## Do not touch

`packages/*` source, `apps/mcp`. `packages/contracts` after SAT-A.

C joins you as soon as their ingest work is done — possibly Saturday night, not necessarily Sunday morning. Decide on Saturday night which components you will delegate, so the handoff costs five minutes rather than an hour. Ask C when they expect to land.

---

## The screen

One route. Onboarding is a modal, the plan is a panel that slides in, chat is a sidebar. **The demo never navigates** — it time-jumps the data. One layout to make beautiful, and no router state to debug at 22:00 Sunday.

```
┌──────────────────────────────────────────────┬──────────────┐
│  campaign header · spend · ROAS · verdict    │              │
├──────────────────────────────────────────────┤    chat      │
│                                              │   sidebar    │
│           THE FUNNEL VISUAL                  │              │
│      seven stages, one lit red               │  Mazal's     │
│                                              │  short       │
├──────────────────────────────────────────────┤  sentences   │
│  finding card — the evidence                 │              │
├──────────────────────────────────────────────┤              │
│  daily chart, change-point marked            │              │
└──────────────────────────────────────────────┴──────────────┘
        plan panel slides up from the bottom ↑
```

### The funnel visual

Seven stages, ordered, stacked or horizontal. The primary finding's stage is red; everything upstream is green; everything downstream is muted grey, because downstream stages are symptoms and colouring them red is the exact misdiagnosis the product exists to prevent.

Draw the media / product dividing line between stage 2 and stage 3, visibly. That line *is* the thesis: stages 0–2 are a media problem, stages 3–6 are a product, offer, or experience problem.

Spend real time here. It is the one thing that has to look finished.

### The finding card

Renders a `Finding`, and shows all of it:

> **Add-to-cart rate** · observed **1.1%** · category median **7.1%** (n = 4,812)
> 100 clicks · rule `stage3.atc_below_reference`

Observed, reference, sample size behind the reference, and the rule id. A judge should be able to audit any claim in five seconds. Print `Distribution.n` next to every reference value — it is two characters of markup and it carries most of the accuracy argument.

When `Finding.evidence` is present, render the event inline: *"the day your supplier ETA moved from 9 days to 22."*

### The daily chart

Daily series with the change-point marked. Case #2 opens on this. Keep it plain — a line, a marker, a date label.

### The plan panel

The emotional peak of the demo. Design it deliberately.

Each `Action` renders as a row showing what changes, the expected effect (`metric from → to`), confidence, and whether it is reversible.

- `actor: 'mazal'` → a toggle and inclusion in Run all.
- `actor: 'seller'` → renders as advice. **No toggle, no Run control.** Mazal does not offer to do what it cannot do, and the visual difference is the point.

Editing an action's parameters re-projects the outcome visibly. That interaction is what makes Mazal read as a colleague rather than a dashboard.

Three controls, in this order and this wording:

> **Run all · Edit first · I'll do it myself**

Running calls `/api/execute`, which returns a receipt carrying `mode: 'simulated' | 'live'`. Render the receipt and say plainly on screen which one it was — never infer it, and never assume. With no ad-platform credentials the mode is `simulated`: the log is written and nothing is touched, which is what a cold clone does and what the demo runs. With credentials and a valid 15-minute unlock it is `live` and Meta was actually called.

"We paused your campaign" and "we wrote this down" are different claims and only one of them is worth trusting, so the screen reads the mode off the response rather than deciding it. The honesty removes a whole category of risk and judges respect it.

### The chat sidebar

Renders E's narration. **Short sentences.** Verdict first, evidence second, plan third — never the reverse. A long response reads as an LLM; three sharp sentences read as expertise. If E's copy runs long, push back — this is a shared decision and you are the one who sees it on screen.

### The counter

A running savings number, from `demo-script.md` §4. Case #1 ends on *"R$1,840 not spent."* Case #2 ends on *"R$6,200 recovered over 14 days."* Two numbers, two verbs, one product.

---

## Rules

**Mock first, always.** A fixture that satisfies `Diagnosis` is fifteen lines. Write it in SAT-A and build the entire screen against it. Nothing you build should be blocked on another package existing.

**Never compute a rate.** Import from `@mazal/contracts/metrics`. A `clicks / impressions` in a component is how the UI ends up disagreeing with the engine on screen, live.

**Never invent a number.** Everything rendered comes from a contract field. If you need a value the contract does not carry, that is a conversation with C, not a local calculation.

**One screen.** If you find yourself adding a route, stop and ask whether it can be a panel.

---

## Deliverables by block

**SAT-A** — Next.js app running, importing `@mazal/contracts`, deployed to Vercel once so the pipeline is known to work. Fixture satisfying `Diagnosis` written. Funnel visual rendering seven stages from it.

**SAT-B** — finding card, daily chart with change-point, plan panel with toggles and the three controls, chat sidebar shell. All against mocks. The four route handlers written and returning real engine output.

**SUN-A** — real data end to end: C's CSV upload → parse → diagnose → funnel. C joins you; hand them the plan panel or the onboarding modal. Both demo cases render from B's committed fixtures.

**SUN-B** — make it beautiful. The funnel visual gets the remaining time. Onboarding modal polished. Run through the demo script with E and fix what looks wrong on a projector — not on your laptop, on a projector, where contrast lies to you.

## First commit

`pnpm create next-app` in `apps/web`, import a type from `@mazal/contracts` so the workspace wiring is proven, write the `Diagnosis` fixture, and render seven coloured bars from it. Commit.

Thirty minutes. Ugly is fine. The layout being real is what matters.
