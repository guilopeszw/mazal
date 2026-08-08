# Mazal — Validation Questionnaire

**Purpose:** falsify the idea before you build it. Every question is written in past tense about real behaviour, not future tense about hypothetical interest. People will tell you your idea is great; they will not lie about what they did last month.

**Who to ask:** anyone who has personally spent their own or a client's money on Meta Ads for a store in the last 6 months. Dropshippers, Shopee/Mercado Livre sellers, agency media buyers, in-house performance people. Target: 12–15 responses. You can get this from WhatsApp groups and Discord/Telegram seller communities in under 3 hours.

**How to run it:** 10 minutes, voice or text. Do not describe Mazal until question 9. If you describe the product first, every answer afterwards is contaminated.

---

## The 10 questions

### 1. Think about the last campaign you launched that flopped. Walk me through what happened — what did you spend, and when did you realise it wasn't working?

*Listening for:* the delay between "spending" and "realising". If they say "day 1, I killed it fast," the pre-flight problem is small. If they say "I let it run a week because I thought it needed to learn," that gap is the money Mazal saves.

**Kill signal:** everyone says they catch failures within 24h and lose under R$100. Then there's no wasted spend to recover and the product has no wedge.

---

### 2. When a campaign underperforms, how do you decide whether it's the ad, the audience, or the product itself?

*Listening for:* whether they have a method at all, or whether they default to "make a new creative." This is the single most important question in the set — Mazal's entire thesis is that people misattribute product problems to creative problems.

**Kill signal:** they describe a clean, confident diagnostic process they already trust. (In practice, almost nobody does — but if 8/10 do, you're building a solved thing.)

---

### 3. In the last 6 months, how many times did you rebuild a creative or change targeting and it made no difference?

*Listening for:* a number. Two or more is a strong pain signal. Then ask: *what did you eventually find was wrong?* If the answer is frequently "price," "shipping cost," "delivery time," or "the product just didn't sell," your thesis is confirmed by their own hindsight.

**Kill signal:** "never, it usually works" — means creative iteration is genuinely sufficient for their catalogue.

---

### 4. Has a campaign ever gone from performing well to dead almost overnight? What did you do in the first 48 hours?

*Listening for:* Case #2 in the wild. Specifically: did they know *why*, or did they guess? Did they pause, double budget, or wait? How long until they took action?

**Kill signal:** it doesn't happen to them, or it happens and they have a reliable playbook that works.

---

### 5. Where do you look at your numbers day to day — Ads Manager, a spreadsheet, the store back office, a dashboard tool? How many places total?

*Listening for:* fragmentation, and where the seam is. The ads data and the store data almost never live in the same view — that seam is exactly where "is it the ad or the product?" becomes unanswerable. Also tells you what your ingestion input should be.

**Kill signal:** everything is already in one tool that reconciles ad spend against product-level data.

---

### 6. Do you export data out of Ads Manager? How, and how often?

*Listening for:* whether CSV export is a habit they already have (it's Mazal's onboarding path with zero integration work). If they've never exported, you need to be prepared to walk them through it, and that's onboarding friction to design around.

---

### 7. Besides price, what do you actually change about a product when it isn't selling? What can you change quickly, and what can't you?

*Listening for:* the action space Mazal is allowed to recommend into. If a dropshipper can't change delivery time (supplier-bound) then "your SLA is killing you" is a diagnosis they can't act on, and you need to recommend around it (e.g. set expectation on the PDP, change the offer, change the audience to less impatient buyers). This question defines your recommendation vocabulary.

---

### 8. If a tool told you "don't launch this campaign, it will lose money" — what would it have to show you for you to actually not launch it?

*Listening for:* their evidence bar. Do they want a number? A comparison to a past campaign? A named cause? This is how you find out whether the confidence interval is credibility or noise. Push: *would a predicted ROAS range of 0.7–1.2 be enough, or would you need to know why?*

**Kill signal:** "nothing, I'd launch anyway to test." If most people say this, Mazal's pre-flight case is dead and you go all-in on the mid-flight case.

---

### 9. Now describe Mazal in 30 seconds, then ask: what part of this do you not believe?

*Listening for:* the objection. Do not defend. Write it down verbatim. The most common objection becomes the thing your demo must pre-empt.

---

### 10. If Mazal produced a recovery plan, would you want it to execute the changes, propose them for your approval, or just tell you and stay out of your account?

*Listening for:* where the trust line sits, and whether it moves with account size. Small sellers may want full autonomy; agencies managing client money almost never will. This directly validates your propose→edit→execute design.

---

## Optional closer (not one of the 10, but ask it)

> "Would you give me a Meta Ads export from one campaign — winner or loser — to test this against?"

Every "yes" is a real dataset and a design partner. This question is worth more than the other ten combined during a 24h build.

---

## Scoring the results

You need three things to be true. Track them explicitly:

| Hypothesis | Confirmed if | Questions |
|---|---|---|
| **H1 — Misattribution is real.** Sellers blame creative for product/offer problems. | ≥60% describe at least one case where they iterated creative and the real cause was elsewhere | 2, 3 |
| **H2 — The loss is material.** Wasted spend is big enough to pay for a tool. | Median self-reported waste per bad campaign ≥ R$500, or ≥3 days of dead spend before action | 1, 4 |
| **H3 — A verdict changes behaviour.** They'd act on a diagnosis rather than launching anyway. | ≥50% name a concrete evidence bar in Q8 rather than "I'd launch anyway" | 8, 10 |

If H1 fails, you have a dashboard, not an agent. If H2 fails, it's a nice-to-have. If H3 fails, pivot entirely to the mid-flight case (Case #2), where the campaign is already running and the seller has no choice but to act.
