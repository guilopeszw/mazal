import { expect, test } from "vitest";
import { buildPlan } from "@mazal/engine";
import type { Diagnosis, FaultKind, FunnelStage } from "@mazal/contracts";

import { PLAN_TITLE_PT, planTitlePt } from "./plan-pt.ts";
import { apparelCard } from "./test-card.ts";

/**
 * The engine owns these titles and this map translates them. A new fault or a
 * new action in `packages/engine/src/plan.ts` would otherwise reach a Brazilian
 * seller in English, and nothing would say so — the chat route would simply
 * drop the sentence and read as if there were no action to take.
 */
const FAULTS: FaultKind[] = [
  "stockout",
  "eta_shock",
  "creative_fatigue",
  "price_too_high",
  "checkout_friction",
  "pixel_break",
  "budget_cap",
  "thin_pdp",
];

test("every action the engine can emit has a Portuguese title", () => {
  const missing: string[] = [];

  for (const cause of FAULTS) {
    const diagnosis: Diagnosis = {
      primary: {
        stage: 3 as FunnelStage,
        severity: "primary",
        metric: "atcRate",
        observed: 0.01,
        reference: 0.08,
        spread: 0.02,
        deviation: -3.5,
        sampleSize: 1000,
        rule: "test",
        causeLayer: "product",
      },
      secondary: [],
      suspectedCause: cause,
    };

    for (const action of buildPlan(diagnosis, apparelCard).actions) {
      if (!planTitlePt(action.id)) missing.push(`${action.id} — "${action.title}"`);
    }
  }

  expect(missing, `untranslated actions:\n${missing.join("\n")}`).toEqual([]);
});

test("an unknown id yields nothing rather than English", () => {
  expect(planTitlePt("some_new_fault.0")).toBeUndefined();
  expect(planTitlePt(undefined)).toBeUndefined();
});

test("no translation is accidentally left in English", () => {
  // Cheap smell test: the engine's titles all start with an English verb.
  for (const [id, pt] of Object.entries(PLAN_TITLE_PT)) {
    expect(pt, id).not.toMatch(/^(Pause|Show|Offer|Refresh|Cap|Test|Add|Verify|Raise|Expand|Hide|Bundle)\b/);
  }
});
