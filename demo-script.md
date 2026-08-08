# Mazal — Positioning & Demo Script

---

## 1. The naming gift

You named it Mazal — luck, fortune. That name hands you the tagline, because the product is the *opposite* of luck:

> ## Mazal
> ### Campaigns shouldn't need luck.

Use this. The name creates a tiny question in the judge's head ("why luck?") and the tagline answers it in four words. That's a complete brand in one slide, and you got it for free.

Alternates if you want range:
- *"Stop betting. Start underwriting."*
- *"The agent that tells you when the ad isn't the problem."* ← the most accurate description of what you built
- *"Good luck is a system."*

---

## 2. Answering your own question: better sales, or faster sales?

Neither. And this is the interesting part of your pitch.

Most agents at this hackathon will promise **more** — more creatives, more listings, more messages answered, more speed. Mazal promises **less**: fewer campaigns launched, less money spent, fewer bad bets. It is a *restraint* agent in a room full of *throughput* agents.

That's not a weakness to hide, it's your entire differentiation. Say it explicitly:

> "Every other agent here makes you do more, faster. Mazal is the one that stops you from doing the wrong thing. Because in paid media, the highest-ROI action is usually the campaign you don't launch."

The category name to plant: **campaign underwriting.** Underwriters exist in insurance and lending for exactly this reason — someone has to price the risk before the money moves. Ad spend is the only major business expense where nobody does. Judges remember a category name far longer than a feature list.

---

## 3. Tie it to the hackathon's own language

Deco's brief says money "slips through the cracks every single day across dozens of small touchpoints, trapped in repetitive tasks no one has the time to do properly."

Echo it back on your first slide:

> "You said money slips through the cracks. We measured one crack. The average seller spends 3 days and R$X before realising a campaign is dead — and then fixes the wrong thing, because the tools only let them see half the funnel. Mazal sees the whole funnel and names the leak."

Fill in R$X from your questionnaire results. A number you gathered yourself, from real sellers, in the last 24 hours, is worth more than any market-size slide.

---

## 4. The two savings — quantify both

Judges want a money number. You have two, and they're different in kind:

**Prevented waste** — campaigns Mazal stops before launch.
`(campaigns blocked) × (average spend before manual kill)`

**Recovered revenue** — campaigns Mazal saves mid-flight.
`(days of downtime avoided) × (daily revenue at baseline)`

In the demo, put a running counter on screen. Case #1 ends with *"R$1,840 not spent."* Case #2 ends with *"R$6,200 recovered over 14 days."* Two numbers, two verbs, one product.

---

## 5. Demo script (5 minutes)

One store, one product, two moments in its life. Do **not** demo two unrelated things — the whole thesis is that they're the same engine, and the demo should make that self-evident.

### 0:00–0:30 — Cold open, no slides
Screen shows a Meta Ads Manager-style view: ROAS 0.4, R$1,840 spent, 3 sales.

> "This is a real campaign shape. The seller's next move is to make a new creative. It's the wrong move, and it'll cost them another two thousand reais. Let me show you why."

Do not introduce yourselves yet. Start in the problem.

### 0:30–2:00 — Case #1, pre-flight

Seller is about to launch campaign #2 for the same product. Mazal is asked: should I?

Show the funnel visual. Attention stage is **green** — CTR 2.1% against a 1.9% apparel median. Product interest stage is **red** — ATC 1.1% against a 7.1% median.

Mazal speaks:

> "Your ad worked. People clicked more than the category average — the communication is not your problem. Then 99% of them left without adding to cart. The leak is your product page: your price is 34% above category median, you have four photos and no reviews, and your delivery estimate is 22 days.
>
> If you launch this campaign as-is, my predicted ROAS is 0.5 to 0.9. Your break-even is 2.2. **Don't launch.**
>
> Fix these three things first and the predicted range moves to 1.8–2.6."

Show the confidence band moving as the fixes are toggled on. **That interaction is the whole demo.** If you polish one thing, polish this.

> "That's R$1,840 not spent."

### 2:00–3:45 — Case #2, in-flight

Time-jump. Seller fixed the product, launched, two great weeks — then three days of zero sales.

Mazal has already detected it. Show the daily chart with the change-point marked.

> "Your campaign broke on the 12th. Everything upstream is healthy — impressions steady, CTR unchanged at 2.0%, frequency at 2.3, no fatigue. Your ads are still working.
>
> Add-to-cart went from 6.8% to 0.4% overnight. On the same day, your supplier delivery estimate changed from 9 days to 22. People are still clicking. They're seeing the ETA and leaving.
>
> This is not an ad problem. Don't touch the campaign."

Then the plan — four discrete, toggleable actions with expected effect and confidence on each. Edit one live so the projection updates. Then the moment that matters:

> **Run all · Edit first · I'll do it myself**

Pause on that screen for a beat before clicking. Say:

> "It proposes. You decide. It never spends your money without asking."

That sentence is what people will remember about Mazal.

### 3:45–4:30 — How we know it's right

One slide. Confusion matrix and calibration plot.

> "Root cause identified correctly 87% of the time on 100 held-out campaigns, 96% within top two, 4% false alarms on healthy ones. The model never does arithmetic — every number is deterministic and every finding shows the rule that fired. You can audit any claim on screen."

This slide is where you win against teams with prettier demos.

### 4:30–5:00 — Close

> "Campaigns are the last big business expense nobody underwrites. Mazal underwrites them — before the money moves, and while it's moving.
>
> Zero integration: a CSV export and a two-minute form. We can onboard a dropshipper in four minutes.
>
> Mazal. Campaigns shouldn't need luck."

---

## 6. Demo craft notes

**Show the funnel, always.** The visual with one stage lit red is your product's identity. It should be recognisable from across the room. Everything else is chrome.

**Let Mazal say short sentences.** The instinct will be to have the agent produce a long analysis. Resist it. A long response reads as an LLM; three sharp sentences read as expertise. Verdict first, evidence second, plan third — never the reverse.

**Never say "ROAS is low."** That's the thing every existing tool already says. Mazal's voice is causal and specific, always.

**Show one thing you got wrong.** If the backtest has a weak class, put it on the slide with your fix. Teams that disclose a limitation get read as rigorous; teams that claim 99% get interrogated.

**Watch the clock in rehearsal.** Five minutes is much shorter than it sounds. Rehearse three times minimum, out loud, timed. Cut whatever runs long — it's always the setup, never the payoff.

---

## 7. Slide order (7 slides, that's all)

1. **Mazal — campaigns shouldn't need luck.**
2. **The crack:** sellers fix creative when the product is the problem. (Your questionnaire quote here — a real seller's words beat any statistic.)
3. **The insight:** 4 layers, 2 of them invisible to every existing tool. The media/product dividing line.
4. **Live demo** (the 5 minutes above)
5. **How it works:** funnel leak localisation. One diagram.
6. **How we know it's right:** confusion matrix, calibration, expert agreement.
7. **Why it's a business:** zero-integration onboarding, and the two savings numbers.

Slide 6 is the one nobody else will have. Do not cut it for time.
