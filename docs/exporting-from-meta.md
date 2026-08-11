# Getting your campaign out of Meta

What Mazal needs from Ads Manager, and how to get it. Five minutes, once.

## The short version

**Ads Manager → your campaign → Reports → Export → CSV.** Set the date range to
the whole flight, set the breakdown to **by day**, and make sure the columns
below are in the report.

## The columns that matter

Mazal reads counts. It does not read rates — it computes those itself, which is
the whole point, so a report of percentages tells it nothing.

| Needed | Why |
|---|---|
| Reporting starts | one row per day; without it there is no change point to find |
| Amount spent | stage 0 |
| Impressions, Reach | stage 0 and 1 |
| Link clicks | stage 1 |
| Adds to cart | stage 3 |
| Checkouts initiated | stage 4 |
| Purchases | stage 5 |
| Purchases conversion value | stage 6 |

Campaign name is optional and only labels the answer.

## Three things that go wrong

**A report of rates instead of counts.** If your export has *CTR*, *Cost per
purchase* and *Purchase ROAS* but no *Purchases*, Mazal cannot see your funnel.
It will say so rather than guess — but you will have exported the wrong thing.
Add the count columns and export again.

**Not broken down by day.** One row for the whole flight averages the break
away. A stockout on day fifteen reads as −0.16 sigma over thirty days and −1.41
over the last seven; the first is invisible.

**Unique versus total.** Meta offers both *Link clicks* and *Unique link
clicks*. Either works. If your export carries both, Mazal keeps the first and
tells you it ignored the second, so the number on screen is never decided by
column order.

## If you sell on iFood, WhatsApp or a marketplace

Meta has no pixel on those checkouts, so *Adds to cart*, *Checkouts initiated*
and *Purchases* will be zero however you export. That is not your export being
wrong — it is a funnel Mazal cannot see, and it will tell you so instead of
inventing a diagnosis.

What still works for you is the pre-flight: **"Is it worth advertising?"** reads
the product and its category, needs no pixel and no sales history, and answers
whether the product can pay for its own ads at all.

**And it needs no export.** Open the panel next to the composer, skip the drop
zone, fill in the product, and ask. Only *"Diagnose this campaign"* waits on a
file — everything above it is the product, and the product is what this answer
is about. This page is the long way round for you; nothing here is a
prerequisite.
