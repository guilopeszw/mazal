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
/**
 * `as const` so the compiler, not this list, owns completeness: the
 * `Exclude` below fails to typecheck the moment `FaultKind` grows a member
 * nobody added here. A hand-typed `FaultKind[]` catches a removal and misses
 * an addition, which is the direction that matters — a new fault reaching a
 * seller in English is exactly what this file exists to prevent.
 */
const FAULTS = [
  "stockout",
  "eta_shock",
  "creative_fatigue",
  "price_too_high",
  "checkout_friction",
  "pixel_break",
  "budget_cap",
  "thin_pdp",
] as const;

// `none` is deliberately absent: `PLAYBOOK.none` is empty, so there is nothing
// to translate and both `buildPlan` and `fixtureFor` already handle no actions.
type Unlisted = Exclude<FaultKind, (typeof FAULTS)[number] | "none">;
const _everyFaultIsListed: [Unlisted] extends [never] ? true : false = true;

test("every action the engine can emit has a Portuguese title", () => {
  const missing: string[] = [];

  /*
   * Both layers. `buildPlan` routes a media fault through the empty playbook
   * when the finding's `causeLayer` is not media, so pinning `product` for
   * every fault silently skipped `creative_fatigue` and `budget_cap` — two of
   * the eight emitted no actions at all and the loop below never ran on them.
   * 13 ids with product, 16 with both.
   */
  for (const causeLayer of ["product", "media"] as const) {
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
          causeLayer,
        },
        secondary: [],
        suspectedCause: cause,
      };

      for (const action of buildPlan(diagnosis, apparelCard).actions) {
        if (!planTitlePt(action.id)) missing.push(`${action.id} — "${action.title}"`);
      }
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
