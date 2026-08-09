import { expect, test } from "vitest";
import { buildPlan, diagnose } from "./index.ts";
import { apparelCard, benchmarkRef, healthyDays } from "../test/fixtures.ts";
import { benchmarks } from "@mazal/data";
import { FAULT_STAGES } from "@mazal/sim";
import type { FaultKind } from "@mazal/contracts";

/**
 * The invariant the whole execution path rests on: **nothing Mazal can run is
 * able to increase a seller's spend.**
 *
 * Structural, not procedural. Pausing stops spend, a frequency cap slows
 * delivery, and a budget change is decrease-only. Raising a budget is a
 * decision to spend more money, so it stays advice with `actor: 'seller'`.
 *
 * This walks every fault the engine can name rather than the two demo
 * fixtures — a playbook entry added later is exactly how this would be lost.
 */
const CAUSES = Object.keys(FAULT_STAGES) as FaultKind[];

/**
 * Plans are built at both cause layers, because `buildPlan` suppresses the media
 * playbook when the leak is a product problem — that suppression is the point of
 * the rule, and testing only one layer would miss half the playbook entirely.
 */
const plansFor = (cause: FaultKind) => {
  const product = diagnose({
    days: healthyDays().map((d) => ({ ...d, addToCarts: 2, checkoutsInitiated: 0, purchases: 0 })),
    card: apparelCard, events: [], reference: benchmarkRef,
  });
  const media = diagnose({
    days: healthyDays().map((d) => ({ ...d, spend: d.spend * 3 })),
    card: apparelCard, events: [], reference: benchmarkRef,
  });

  return [product, media]
    .filter((d) => d.primary !== null)
    .map((d) => buildPlan({ ...d, suspectedCause: cause }, apparelCard));
};

const actionsFor = (cause: FaultKind) => plansFor(cause).flatMap((p) => p.actions);

test("no action Mazal can run is able to increase spend", () => {
  for (const cause of CAUSES) {
    for (const action of actionsFor(cause)) {
      if (action.actor !== "mazal") continue;
      const op = action.execution;
      if (!op) continue;

      if (op.op === "reduce_daily_budget") {
        expect(op.multiplier, `${cause} / ${action.id}`).toBeGreaterThan(0);
        expect(op.multiplier, `${cause} / ${action.id}`).toBeLessThanOrEqual(1);
      }
      // Any other op must be one of the two that cannot raise spend at all.
      expect(["pause_campaign", "reduce_daily_budget", "set_frequency_cap"]).toContain(op.op);
    }
  }
});

test("an action with something to execute is never the seller's", () => {
  for (const cause of CAUSES) {
    for (const action of actionsFor(cause)) {
      if (action.execution) expect(action.actor, `${cause} / ${action.id}`).toBe("mazal");
    }
  }
});

test("raising a budget stays the seller's decision", () => {
  const raises = CAUSES.flatMap(actionsFor).filter((a) => /raise|increase/i.test(a.title));

  expect(raises.length).toBeGreaterThan(0);
  for (const a of raises) {
    expect(a.actor, a.title).toBe("seller");
    expect(a.execution, a.title).toBeUndefined();
  }
});

void benchmarks;
