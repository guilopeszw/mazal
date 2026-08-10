import { expect, test } from "vitest";
import type { CampaignDay, ProductCard } from "@mazal/contracts";

import { buildUploadAnswer } from "./answers.ts";

/**
 * A bakery selling frozen goods through iFood and WhatsApp. Meta reports the
 * ad delivery honestly — spend, impressions, reach, link clicks — and reports
 * zero for every column that would need its pixel on a checkout it never sees.
 *
 * The engine already declines to judge stages 3-6 for this seller. This is the
 * other half: the screen must not turn that silence into "your funnel is fine".
 */
function offPixelDays(): CampaignDay[] {
  return Array.from({ length: 30 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    campaignId: "congelados",
    spend: 45,
    impressions: 6_000 + i * 40,
    reach: 4_200 + i * 30,
    clicks: 90 + (i % 7) * 6,
    addToCarts: 0,
    checkoutsInitiated: 0,
    purchases: 0,
    revenue: 0,
  }));
}

const frozenGoods: ProductCard = {
  category: "food",
  price: 39.9,
  grossMargin: 0.45,
  shippingCost: 12,
  deliveryEtaDays: 2,
  stockOnHand: 80,
  reviewCount: 12,
  reviewAvg: 4.6,
  pdpImages: 5,
  pdpDescriptionLength: 380,
  returnPolicyDays: 7,
  paymentMethods: ["credit", "pix"],
  offer: "none",
};

test("an unobservable funnel is never reported as a healthy one", () => {
  const answer = buildUploadAnswer(offPixelDays(), frozenGoods, [], "Diagnose export.csv");
  const verdict = answer.verdict.map((v) => v.text).join("");

  // The old answer, and the reason this test exists.
  expect(verdict).not.toContain("No leak found");
  expect(answer.said).not.toContain("Nothing deviated");

  // What it must say instead: the ads ran, the rest is unseen.
  expect(verdict).toContain("cannot see");
  expect(answer.said).toContain("no add-to-carts");
  // Named, so the seller knows why rather than being told a number is missing.
  expect(answer.said).toMatch(/iFood|WhatsApp|marketplace/);
});

test("a campaign whose pixel does report is still diagnosed normally", () => {
  // One add-to-cart a day is a working pixel and a terrible rate. The screen
  // must judge it, not excuse it — the guard keys on nothing ever being
  // reported, never on the number being small.
  const days = offPixelDays().map((d) => ({ ...d, addToCarts: 1 }));
  const answer = buildUploadAnswer(days, frozenGoods, [], "Diagnose export.csv");
  const verdict = answer.verdict.map((v) => v.text).join("");

  expect(verdict).not.toContain("cannot see");
});
