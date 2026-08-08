# Acceptance — what Mazal has to answer

`questionnaire.md` is a seller-interview script. The team already ran it: calls with sellers and operations people, before this build started. That research is spent, and this file is what it turned into.

Each of the ten questions describes a problem a seller actually has. Each becomes one claim Mazal must be able to make, one demo beat that proves it, and one test that guards it. A claim with no test is a claim that breaks silently at hour 30; a claim with no demo beat is work a judge never sees.

**This is the definition of done.** At the SUN-A checkpoint, walk this table. Anything unproven is either finished in SUN-B or moved to the cut list out loud.

---

## The ten claims

### 1. Mazal states the day the campaign broke

*From Q1: the gap between spending and realising is where the money goes.*

**Claim:** given a daily series, Mazal names the date performance changed, within a day of when it actually did.

**Demo beat:** Case #2 opens on the daily chart with the change-point marked. *"Your campaign broke on the 12th."*

**Test:** `packages/sim` injects a fault on a known day; `Diagnosis.changePoint.date` lands within ±1 day of it across the held-out set.

---

### 2. Mazal names which layer is at fault, with evidence

*From Q2: the single most important question in the set. Sellers have no method, so they default to "make a new creative."*

**Claim:** Mazal identifies the earliest broken funnel stage and reports it as `causeLayer` — media, product, offer, or experience — with the observed value, the reference value, the sample size, and the rule that fired.

**Demo beat:** the funnel visual with exactly one stage lit red, and the finding card beneath it showing all five numbers.

**Test:** backtest top-1 accuracy on held-out campaigns. This is the headline number on slide 6.

---

### 3. When the ad is fine, Mazal says so and tells you not to touch it

*From Q3: sellers rebuild creative repeatedly and it changes nothing, because the cause was price, shipping, or delivery time.*

**Claim:** when stages 0–2 are healthy and a later stage is broken, Mazal explicitly says the campaign is working and proposes no media action.

**Demo beat:** *"People are still clicking. This is not an ad problem. Don't touch the campaign."*

**Test:** on product-layer injected faults, the returned `RecoveryPlan` contains zero actions whose finding had `causeLayer: 'media'`.

---

### 4. Mazal detects an overnight collapse and names the cause

*From Q4: this is Case #2 in the wild. Sellers guess, or they wait.*

**Claim:** for a live campaign, Mazal correlates the break against the event log and reports what changed on that date.

**Demo beat:** *"Add-to-cart went from 6.8% to 0.4% overnight. On the same day, your supplier delivery estimate changed from 9 days to 22."*

**Test:** `Finding.evidence` is populated with the correct `StoreEvent` for `eta_shock`, `stockout`, and `price_change` faults.

---

### 5. One screen reconciles ad spend against product data

*From Q5: ad data and store data never live in the same view, and that seam is exactly where "is it the ad or the product?" becomes unanswerable.*

**Claim:** a single screen shows the media funnel and the product layer together, with no navigation.

**Demo beat:** the whole demo runs on one screen. The time jump between Case #1 and Case #2 changes the data, never the route.

**Test:** none — this is a design constraint, guarded by the one-screen rule in `docs/plan/D-frontend.md`, not by an assertion. Marked so nobody assumes it is covered.

---

### 6. Onboarding is a CSV and a form

*From Q6: exporting from Ads Manager is a habit sellers already have. Every competitor needs a Meta app review before it can say hello.*

**Claim:** Mazal ingests an unmodified Meta Ads Manager export — real column names, pt-BR number format, em-dash nulls — plus twelve typed fields. No OAuth, no app review, no integration.

**Demo beat:** the closing line. *"Zero integration: a CSV export and a two-minute form. We can onboard a dropshipper in four minutes."*

**Test:** `parseMetaCsv` against the real-header fixture in `packages/ingest/test/meta-export.csv`, including the quirk cases.

---

### 7. Every action says who can perform it

*From Q7: this defines the recommendation vocabulary. A dropshipper cannot change a supplier's delivery ETA, so "your SLA is killing you" is a diagnosis they cannot act on.*

**Claim:** every `Action` carries `actor: 'mazal' | 'seller'`. Seller-actor actions render as advice with no Run control. When the root cause is outside the seller's control, Mazal recommends *around* it — set the expectation on the page, change the offer, shift the audience.

**Demo beat:** in the Case #2 plan, one action is visibly the seller's job and has no toggle. Mazal does not offer to do what it cannot do.

**Test:** for `eta_shock` faults, no emitted action has `actor: 'mazal'` and a `change` that alters supplier lead time.

---

### 8. "Don't launch" comes with a number, a band, and a named factor

*From Q8: their evidence bar. Would a predicted ROAS range of 0.7–1.2 be enough, or do they need to know why?*

**Claim:** the pre-flight verdict is a decision, a p10–p90 predicted ROAS band, the seller's own break-even ROAS from their margin, and the specific factor dragging the band down.

**Demo beat:** *"My predicted ROAS is 0.5 to 0.9. Your break-even is 2.2. Don't launch. Fix these three things first and the range moves to 1.8–2.6."*

**Test:** verdict threshold unit tests — `p90 < breakEven` → `dont_launch`; the middle case sets a `killTrigger`. Calibration (does the band contain the realised value ~80% of the time) if it survives the cut ladder.

---

### 9. Mazal admits when it cannot predict

*From Q9: the objection. The most common one is "you can't actually predict that."*

**Claim:** with thin data the band is wide, Mazal says so, and it names which number to instrument first to narrow it. It does not produce a fake precise answer.

**Demo beat:** the band is visibly wider without history than with it, and Mazal names the missing input.

**Test:** `predict` without `history` returns a strictly wider `p90 − p10` than the same input with history.

---

### 10. It proposes, you decide

*From Q10: where the trust line sits. This directly validates the propose → edit → execute design.*

**Claim:** the plan renders as individually-toggleable actions, each showing what changes, expected effect, confidence, and reversibility. Three choices: **Run all · Edit first · I'll do it myself.** Editing an action updates the projection. Execution is logged and receipted, and the demo says out loud that writes are simulated.

**Demo beat:** the pause before clicking. *"It proposes. You decide. It never spends your money without asking."*

**Test:** `execute_plan` appends to the action log and returns a receipt. It has no Meta API client to call — the absence is the guarantee.

---

## The three hypotheses

From `questionnaire.md`'s scoring table. They are why the product exists, and they frame slides 2, 3, and 7.

| | Hypothesis | What Mazal does about it |
|---|---|---|
| **H1** | Sellers blame creative for product and offer problems. | Makes it **actionable**: claims 2, 3, 7 turn a misattribution into a named layer and a plan the seller can execute. |
| **H2** | The loss is material — days of dead spend before anyone acts. | Makes it **measurable**: claims 1, 8 put a number on prevented waste and recovered revenue, on screen, in BRL. |
| **H3** | A verdict changes behaviour. | Makes it **true**: claims 8, 9, 10 supply the evidence bar sellers named — a number, a named cause, and control over what happens next. |

---

## Judge questions

From `prd.md` §10, updated where the answers changed this weekend.

**"Where did your data come from?"**
Two real public datasets and a simulator. Product-layer distributions — price, freight, delivery estimate versus actual, photo count, description length, review scores — come from the Olist Brazilian E-Commerce dataset: 100,000 real orders from Brazilian marketplaces. Ad-layer priors come from a real Meta ad campaign dataset. What nobody publishes is a daily funnel series with a known cause, so we generate that — cause first, effect second — and measure whether the engine recovers the hidden cause. Here is the confusion matrix.

**"Isn't this just a dashboard?"**
A dashboard shows you ROAS is 0.6. Mazal tells you the ad worked and the product page didn't, and hands you actions tagged with who can perform them. We built the opposite of a dashboard: it shows you one thing, the leak.

**"How do you know it isn't hallucinating?"**
The model never touches arithmetic. Every number is deterministic TypeScript, and every finding carries the id of the rule that produced it, the observed value, the reference, and the sample size. Audit any claim on screen right now.

**"Doesn't Meta's own AI do this?"**
Meta optimises inside Meta. It cannot see your margin, your stock, your delivery ETA, or your product page — and it is not incentivised to tell you not to spend. Mazal's most valuable output is "don't launch this."

**"Your benchmarks — where are they from?"**
Computed, not quoted. Per-category medians and quartiles derived from the Olist dataset, in BRL, for Brazilian sellers. Every reference number in the UI prints the sample size behind it.

**"What if it's wrong?"**
It proposes, you approve, and writes are simulated in this build. It reports its own confidence — on thin data it says it cannot predict yet and names the number to instrument first.

**"How is this a business?"**
Zero-integration onboarding: a CSV plus a two-minute form, no Meta app review. Every competitor needs OAuth before it can say hello.
