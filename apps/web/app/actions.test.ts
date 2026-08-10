import { expect, test } from "vitest";

import { preflightUpload } from "./actions.ts";

/**
 * Through the action, not around it.
 *
 * The first version of this feature could never succeed — `productCardSchema`
 * is `.strict()` with fifteen required fields and the action assembled four.
 * Every click returned an error. The test that was supposed to cover it called
 * the answer builder directly, so the suite was green and the button was dead.
 */
const stated = {
  category: "food",
  price: 39.9,
  shippingCost: 12,
  deliveryEtaDays: 2,
} as const;

test("a pre-flight from the form's four fields actually answers", async () => {
  const result = await preflightUpload({ stated, corrections: {} });

  expect(result.ok, "ok" in result && !result.ok ? result.error : "").toBe(true);
  if (!result.ok) return;

  const verdict = result.answer.verdict.map((v) => v.text).join("");
  expect(verdict).toMatch(/Launch|Don't launch/);
  expect(result.answer.band).toBeDefined();
});

test("the assumed margin is disclosed, because break-even is that number inverted", async () => {
  const result = await preflightUpload({ stated, corrections: {} });
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.answer.note).toContain("Mazal assumed, not you");
  // Corrected by the seller, there is nothing to disclose.
  const corrected = await preflightUpload({ stated, corrections: { grossMargin: 0.55 } });
  expect(corrected.ok).toBe(true);
  if (!corrected.ok) return;
  expect(corrected.answer.note).not.toContain("Mazal assumed, not you");
});

test("the limiting factor is said once, not twice", async () => {
  const result = await preflightUpload({ stated, corrections: {} });
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const said = result.answer.said ?? "";
  const phrase = "no campaign history yet";
  const first = said.toLowerCase().indexOf(phrase);
  if (first !== -1) {
    expect(said.toLowerCase().indexOf(phrase, first + 1), said).toBe(-1);
  }
});

test("a missing payload returns the error shape rather than throwing", async () => {
  // @ts-expect-error — deliberately malformed, the shape a bad caller sends.
  const result = await preflightUpload(undefined);
  expect(result.ok).toBe(false);
});
