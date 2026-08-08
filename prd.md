# Mazal — PRD & 24h Build Plan

**Agents for Commerce · Deco Hackathon**
Team of 5 · 24 hours · Meta Ads only

---

## 1. The one-sentence product

Mazal is a campaign underwriter for e-commerce sellers: before you launch it tells you whether the campaign can work and what's blocking it, and while it runs it detects when performance breaks, names the cause, and proposes a recovery plan you approve before it acts.

## 2. The insight the whole product rests on

Ad performance is a function of four layers: **creative, audience, product/offer, and experience.** Every tool on the market optimises the first two, because that's what lives inside Ads Manager. Nobody diagnoses the last two, because that data lives in the store.

So when a campaign fails, the seller does the only thing their tools support: they make another creative. And when the real cause was a 22-day delivery estimate, a price 40% above category median, or four product photos of a white background — they burn another R$800 finding out nothing.

**Mazal's wedge: it is the agent that tells you when the ad is not the problem.**

This is also why the two cases you described are the same product. Both are "localise the leak in the funnel." Case #1 localises it against **category benchmarks** at t=0. Case #2 localises it against **the campaign's own history** at t=n. One engine, two reference frames.

## 3. Users

**Primary:** the operator who is personally spending the money. Dropshippers, Shopee/Mercado Livre/Shopify sellers, small brand owners. 1–20 SKUs, R$1k–50k/month ad spend, no analyst, no data team. They read Ads Manager and they guess.

**Explicit non-user for v1:** agencies and enterprise brands. They have analysts. They'd want multi-account, multi-channel, permissions — all of which is scope you don't have.

## 4. Scope: in and out

**In (v1, 24h)**
- Meta Ads only
- CSV ingestion (Ads Manager export) + a Product Card the seller fills in
- Funnel Leak Localisation engine (deterministic, no LLM math)
- Pre-flight verdict with predicted ROAS range
- In-flight anomaly detection + root cause + recovery plan
- Propose → edit → execute consent flow (execute = simulated/logged in v1)
- Chat interface where the agent explains itself

**Out (say this out loud in the pitch so it reads as focus, not omission)**
- Google/TikTok Ads
- Real write access to Meta's API
- Creative generation
- Multi-account, auth, billing

---

## 5. The engine (build this first, it is the product)

### 5.1 Funnel Leak Localisation

Every metric maps to exactly one funnel stage. Stages are ordered. **The first stage that deviates significantly from reference is the cause; everything downstream is a symptom.** That rule is the whole algorithm and it is why Mazal never says "your ROAS is low" — a statement with zero information content.

| # | Stage | Metrics | If this is the first break, the cause layer is |
|---|---|---|---|
| 0 | Delivery | Impressions, CPM, Impression Share, Frequency | Budget, bid, auction competition, ad fatigue, policy |
| 1 | Attention | CTR, CPC | Creative hook + audience match |
| 2 | Landing | Bounce rate, session duration, LCP | Message match, page speed |
| 3 | **Product interest** | **ATC rate, Cost per ATC** | **Price, offer, PDP quality, reviews, stock** |
| 4 | Intent | Initiate Checkout rate | Shipping cost shock, delivery ETA (SLA), account-required friction |
| 5 | Purchase | CVR, CPA | Payment methods, trust, final price |
| 6 | Economics | AOV, ROAS, LTV | Offer structure, margin |

**Stages 0–2 = media problem. Stages 3–6 = product/offer/experience problem.** That single dividing line is the sentence you put on the slide.

The verdict language:

> "Your ad worked. 2.1% CTR, above the 1.9% apparel median — people wanted what you showed them. Then 1.1% of them added to cart against a 7.1% category median. The leak is not the campaign. It's the page they landed on."

### 5.2 Deviation scoring

For each stage compute a z-like deviation against the reference:

```
dev(stage) = (observed − reference) / reference_spread
```

Two reference modes:
- **Benchmark mode** (pre-flight / no history): category medians, seeded table below.
- **Self mode** (in-flight): the campaign's own first-N-day baseline, plus change-point detection on the daily series.

Flag a stage when `dev < −1.0` **and** the sample is large enough to matter (minimum impressions/clicks/sessions thresholds — say this in the pitch, it signals rigour). Report the earliest flagged stage as **primary cause**, later ones as **secondary**.

### 5.3 Predicted ROAS with a range

Do not ask an LLM to predict ROAS. Compose it:

```
ROAS = (CTR × ATC × IC × CVR × AOV) / CPC
```

Draw each factor from a distribution (account history if available, category prior if not), run 5,000 Monte Carlo samples, report the **p10–p90 band** plus a point estimate.

Two properties that make this defensible in front of judges:

1. **Uncertainty is honest.** No history → wide band → Mazal says *"I can't predict this yet, and here's exactly which number to instrument first to narrow it."* That's a better answer than a fake precise one, and judges reward it.
2. **It's decomposable.** Mazal can say *which factor* is dragging the band down, because it's a product of factors. That's the pre-flight recommendation.

Verdict thresholds against **break-even ROAS = 1 / gross margin** (the seller enters margin in the Product Card — this is the number that makes the output actually theirs):

- p90 < break-even → **Don't launch.** Fix the named factor first.
- p10 < break-even < p90 → **Launch small, with a kill trigger.** Mazal names the trigger.
- p10 > break-even → **Launch.**

### 5.4 In-flight anomaly → cause

1. Detect the break: rolling 3-day mean vs. trailing 14-day baseline, per metric.
2. Order the breaks by funnel stage; earliest wins.
3. Correlate with **event log** — did stock hit zero, did price change, did the creative refresh, did frequency cross 4, did daily budget cap, did delivery ETA change? The event log is what turns "ATC collapsed" into "ATC collapsed the day your supplier ETA moved from 9 to 22 days."
4. Emit a plan.

Common signatures to hardcode (these are the demo's credibility — real media buyers will recognise them instantly):

| Signature | Cause | Plan |
|---|---|---|
| Frequency >4, CTR ↓, CPM stable | Creative fatigue | Refresh creative, expand audience, cap frequency |
| Impressions collapse, CPM ↑ | Outbid / budget cap / seasonal auction spike | Raise bid or accept lower volume; check for competitor event |
| CTR stable, ATC → 0 | Stockout, price change, PDP broke | Check inventory & price; the ad is fine, don't touch it |
| ATC stable, IC ↓ | Shipping cost or ETA shock at cart | Free-shipping threshold, show ETA earlier on PDP |
| IC stable, CVR ↓ | Payment failure, checkout bug, trust | Test checkout, add payment method, add trust signals |
| Everything ↓ uniformly, sudden | Tracking/pixel break or policy action | Verify pixel and account status before spending another real |

That last row matters: the most common "campaign died" cause in the real world is a broken pixel, and an agent that checks for it before recommending creative changes will impress anyone who has lived it.

### 5.5 Hard rule: the LLM never does arithmetic

All numbers come from deterministic TypeScript. The LLM does three things only: **narrate** the finding, **draft** the plan in the seller's language, and **converse**. This is your answer to "how do you know it's not hallucinating" and it also keeps you inside the free deco token budget.

---

## 6. Data strategy (your biggest risk — this is the plan)

You have no credentials and no data. Turn that into an architectural decision instead of a hole.

### Tier 0 — Synthetic causal simulator (**build this in hour 1–4, it unblocks everyone**)

Write a generator that goes **cause → effect**, not the other way around:

1. Sample a store: category, price, margin, AOV, SLA, review count, PDP quality score.
2. Sample a campaign: budget, audience size, creative quality.
3. **Inject a known fault** from a fixed list (stockout on day 12, ETA change, creative fatigue, price too high, checkout friction, pixel break, or *no fault*).
4. Forward-simulate 30 days of daily funnel metrics with realistic noise, where the fault deforms exactly the stages it should.
5. Store the fault label separately.

This gives you: unlimited data, deterministic seeded reproducibility for the demo, and — critically — **ground truth**. Mazal is shown the metrics; the label is hidden; you measure whether it names the right cause.

Because you generate the data, one person owns this file and it must be *honest*: whoever writes the simulator must not write the engine. Different people, hour 1. Otherwise you've built a machine that grades its own homework, a judge will spot it, and it will be the worst moment of your presentation.

### Tier 1 — One real dataset (your music account)

Export the Meta campaign from your Instagram/music account as CSV from Ads Manager. It's not a store and it has no purchases — that's fine. Its job is to prove the **ingestion path is real**: your parser eats a genuine, unmodified Meta export with real column names, real date formats, real currency, real "—" for null. That is the single most common thing hackathon demos fake, and the one thing you can trivially not fake.

In the pitch: *"the top of the funnel here is real data from a live Meta account; the commerce funnel below it is simulated because we're not putting a stranger's store data in a hackathon repo."* Honest, and it lands better than a fake real story.

### Tier 2 — Real seller data (stretch, and the actual go-to-market)

Onboarding = "upload your Ads Manager export + fill in 12 fields about your product." **No OAuth, no app review, no integration.** A dropshipper can be running in 4 minutes. Frame this as a deliberate wedge, not a limitation: every competitor needs a Meta app review to even say hello.

If you can get **one** real export from a real seller before the deadline (ask in Q10 of the questionnaire), run Mazal on it live in the demo. One real case beats a thousand simulated ones for a judge.

### The Product Card (answers "what product data do we need")

12 fields, ~2 minutes, this is where product-layer diagnosis comes from:

| Field | Why it matters | Diagnostic use |
|---|---|---|
| Price | vs category median | Stage 3 |
| COGS / gross margin | sets break-even ROAS | Everything |
| Shipping cost to customer | #1 cart abandonment cause | Stage 4 |
| **Delivery ETA (SLA)** | your instinct is right — it's top-3 | Stage 4 |
| Stock on hand | silent campaign killer | Stage 3 |
| Review count + average rating | trust proxy | Stage 3/5 |
| Number of PDP images | thin PDP = low ATC | Stage 3 |
| PDP description length | thin content = low ATC | Stage 3 |
| Return policy (days) | trust | Stage 5 |
| Payment methods (incl. Pix/boleto) | huge in BR | Stage 5 |
| Offer type (none / discount / bundle / free shipping threshold) | offer strength | Stage 6 |
| Category | selects the benchmark row | Everything |

**Stretch (do it if you're ahead at hour 12, it's a great demo beat):** the seller pastes a PDP URL and Mazal fetches it — counting images, measuring description length, reading price, and pulling LCP from the free PageSpeed Insights API — filling the card automatically. Autofill from a URL feels like magic in a demo and is maybe 90 minutes of work.

### Seed benchmark table (research already done — put these in a JSON file)

Blended Meta e-commerce medians: **CPM ~$13.48 · CTR ~2.19% · CVR ~1.57% · CPA ~$38.19 · ROAS ~1.86**

| Category | CPM | CVR | ATC rate |
|---|---|---|---|
| Food & Beverage | ~$8.14 | 2.02% | 13.14% |
| Beauty & Health | ~$12.46 | 1.40% | 10.14% |
| Fashion / Apparel | ~$9–10 | ~1.5% | 7.12% |
| Consumer Goods | — | — | 5.98% |
| Home & Furniture | — | — | 4.36% |
| Pets | ~$9.56 | 1.53% | 3.49% |
| Electronics | ~$10–12 | 1.20% | — |
| **Global ATC average** | | | **6.34%** |

Cite the sources in the repo README. "We didn't invent our benchmarks" is a free credibility point. Note these are USD/global — flag the currency assumption in the UI rather than quietly pretending they're BRL.

---

## 7. Architecture & stack

**Recommendation: normal GitHub monorepo, TypeScript, with a deco Studio MCP app wrapping the engine.**

Reasoning: your engine must be unit-testable and iterable at speed by 3 people in parallel — that wants a plain repo. But exposing it as MCP tools on deco Studio costs you maybe 90 minutes, gives you a working agent chat surface for free, and means your answer to "did you use deco?" is a demo, not a sentence.

```
mazal/
├─ packages/engine/     ← pure TS. funnel localisation, monte carlo, signatures.
│                         zero deps. 100% unit tested. THE CROWN JEWEL.
├─ packages/sim/        ← causal synthetic generator + backtest harness
├─ packages/ingest/     ← Meta CSV parser, Product Card schema, event log
├─ apps/mcp/            ← deco Studio MCP app: tools + agent prompts
│                         diagnose_campaign · predict_campaign · build_recovery_plan
│                         · explain_metric · execute_plan (simulated)
└─ apps/web/            ← Next.js. Custom UI + chat. Deploy Vercel.
```

**Custom UI or deco.chat?** Build custom — you asked for it and you're all fullstack. But make the MCP app work *first* (hour 8–10), so if the frontend slips you demo in deco.chat and still have a complete product. That's your insurance policy and it costs nothing to hold.

**Token budget.** Free deco tokens are limited and it would be a genuinely stupid way to lose. Rules: max 2 LLM calls per user interaction; cache every response keyed by scenario; run the *entire* demo path once at hour 20 and commit the responses as fixtures. If the demo bombs from rate limiting at hour 24, nothing else you built matters.

**Consent flow (Case #2's emotional peak — design it deliberately).**
Plan renders as discrete, individually-toggleable actions. Each shows: what it changes, expected effect, confidence, and reversibility. Three buttons: **Run all · Edit first · I'll do it myself.** Editing an action and re-running should visibly update the projected outcome — that interaction is what makes it feel like a colleague rather than a dashboard. `execute_plan` writes to a log and shows a receipt; say clearly in the demo that writes are simulated. Judges respect the honesty and it removes an entire category of risk.

---

## 8. How you prove accuracy in 24 hours

You cannot train and validate a model. Don't pretend to. Do these three things instead and you'll have a stronger answer than most teams who claim they did.

**A. Causal backtest (the headline number).**
Generate 400 campaigns with injected faults. Hold out 100 the engine authors never see. Measure **root-cause top-1 accuracy** and **top-2 accuracy**, plus **false-alarm rate on the no-fault campaigns** (this one matters most — an agent that cries wolf gets uninstalled). Report as a confusion matrix in the deck.

> "On 100 held-out campaigns with injected faults, Mazal named the correct root cause first 87% of the time, and within its top two 96%. On healthy campaigns it raised a false alarm 4% of the time."

Whatever the real numbers are, report them. If a class does badly, say so and say why — *"we're weak at distinguishing pixel breaks from policy blocks because both flatten everything at once; here's how we'd fix it"* is a stronger answer than a suspicious 99%.

**B. Prediction calibration.**
For pre-flight ROAS, check whether the p10–p90 band actually contains the realised value ~80% of the time on held-out sims. A calibration plot is one chart and it's the single most sophisticated thing you can put in a hackathon deck.

**C. Expert agreement.**
Take 10 scenarios, print them as anonymised metric sheets, and get 2–3 experienced media buyers (WhatsApp, 15 minutes each) to name the cause. Compare against Mazal. **Human–agent agreement rate** is the answer to "but does it think like a real buyer?" Even n=2 is worth having — you're not claiming statistical power, you're claiming you checked.

Also: every finding shows its evidence. Metric, observed value, reference value, sample size, and the rule that fired. A judge should be able to audit any claim in five seconds. Explainability is not a feature here — it's the accuracy argument.

---

## 9. 24-hour roadmap

Five people, all fullstack. Roles are ownership, not walls. **Hard demo freeze at T-4h** — no exceptions, this is where hackathons die.

### Phase 0 — H0–H1 · Everyone
Lock the two demo scenarios end to end, on paper, before writing code. Write the exact sentences Mazal will say. **Freeze the data contract** (`CampaignDay`, `ProductCard`, `EventLog`, `Finding`, `Plan`) in one file and commit it — everyone codes against types immediately, nobody blocks. Repo, CI, Vercel, deco Studio project created.

### Phase 1 — H1–H8 · Parallel build

| Owner | Deliverable by H8 |
|---|---|
| **A — Engine** | Funnel localisation + deviation scoring + signature matching. Unit tested. Never sees the simulator internals. |
| **B — Simulator** | Causal generator + 400 labelled campaigns + backtest harness. Never sees the engine internals. |
| **C — Ingest & data** | Meta CSV parser (test on the real music-account export), Product Card schema + form, benchmark JSON, event log |
| **D — Frontend** | Next.js shell, campaign view, funnel visual, finding cards, plan/consent UI. Mock data from the frozen contract. |
| **E — Agent & narrative** | MCP app skeleton, tool definitions, system prompts, narration templates. Starts deck at H6. |

**H8 checkpoint (30 min, all hands):** engine runs on simulator output, produces a Finding. If not, cut scope now — drop the Monte Carlo prediction and ship Case #2 only.

### Phase 2 — H8–H14 · Integration
- A+B: first backtest run. Real accuracy number in hand by **H12**. Tune. Re-run.
- A+E: Monte Carlo ROAS prediction + calibration check.
- C+D: real CSV → parsed → rendered in UI, end to end.
- E: MCP tools live in deco Studio; agent answers "what happened to my campaign?" **This is your insurance policy — it must work by H14.**

**H14 checkpoint:** both scenarios demoable, however ugly. Anything not started is now cut. Write the cut list down and keep it — "here's what we deliberately didn't build" is a good slide.

### Phase 3 — H14–H20 · Polish
- D: make it beautiful. The funnel visual with the leak highlighted is the screenshot that gets shared — spend real time on it.
- A+B: final backtest, confusion matrix, calibration plot.
- E: deck done, expert agreement calls (2–3 media buyers, 15 min each).
- C: seed the exact demo fixtures with fixed random seeds. **The demo must be byte-reproducible.**

### Phase 4 — H20–H24 · Freeze
- **H20: code freeze on demo path.** Run the full demo live once, capture every LLM response as a fixture.
- Record a 3-minute backup video. Run it twice more. Assume the wifi will fail, because it will.
- One person owns the demo laptop and touches nothing else.
- Two people rehearse judge Q&A using section 10.
- Sleep in shifts. A team that presents alert beats a team that shipped one more feature.

---

## 10. Judge questions, and your answers

**"Where did your data come from?"**
Real Meta export for the ad layer; a causal simulator for the commerce funnel, because we won't put a stranger's store data in a hackathon repo. We generate cause→effect and measure whether the engine recovers the hidden cause. Here's the confusion matrix.

**"Isn't this just a dashboard?"**
A dashboard shows you ROAS is 0.6. Mazal tells you the ad worked and the product page didn't, and hands you five actions. Also, we deliberately built the opposite of a dashboard — Mazal shows you one thing, the leak.

**"How do you know it isn't hallucinating?"**
The model never touches arithmetic. Every number is deterministic TypeScript, and every finding shows its evidence and the rule that fired. Audit any claim on screen right now.

**"Doesn't Meta's own AI do this?"**
Meta optimises inside Meta. It cannot see your margin, your stock, your delivery ETA, or your PDP — and it isn't incentivised to tell you not to spend. Mazal's most valuable output is "don't launch this."

**"What if it's wrong?"**
It proposes, you approve. And it reports its own confidence — on thin data it tells you it can't predict yet and names the number to instrument first.

**"How is this a business?"**
Zero-integration onboarding — CSV plus a 2-minute form, no Meta app review. Every competitor needs OAuth before they can say hello. We can onboard a dropshipper in four minutes.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| **Demo dies live** (tokens, wifi, rate limits) | Fixture-cached responses, seeded data, recorded backup video, H20 freeze |
| **Simulator grades its own homework** | Separate owners for sim and engine, held-out set, disclose the method openly |
| **Custom frontend eats all 24h** | MCP-on-deco.chat path working by H14 as a complete fallback |
| **Scope creep to multi-channel** | Meta only, written on the wall. "Out of scope" is a slide, not an apology. |
| **Judges see a wrapper** | Lead with the deterministic engine and the backtest, not the chat |
| **Both cases half-built** | Case #2 (in-flight rescue) is the hero. If you can only finish one, finish that one. |
