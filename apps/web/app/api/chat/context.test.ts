import { expect, test } from "vitest";
import { benchmarks } from "@mazal/data";
import { demoCases } from "../../../lib/fixtures.ts";
import { parseChatRequest } from "./schema.ts";
import { resolveContext } from "./context.ts";

test("injects benchmarks server-side for a public benchmark reference", () => {
  const result = resolveContext(
    parseChatRequest({ scenarioKey: "case2", userMessage: "Onde vazou?" }),
  );

  expect(result.input.reference.kind).toBe("self");
  expect(result.diagnosis).toBeDefined();
  expect(result.plan.actions).toBeDefined();
});

test("passes the internal benchmark table only after parsing a raw public context", () => {
  const { fault: _fault, ...campaign } = demoCases.case1;
  const request = parseChatRequest({
    userMessage: "Diagnostique",
    context: { ...campaign, reference: { kind: "benchmark" } },
  });

  expect(request.context?.reference).toEqual({ kind: "benchmark" });
  expect(request.context?.reference).not.toHaveProperty("table");

  const result = resolveContext(request);
  expect(result.input.reference).toEqual({ kind: "benchmark", table: benchmarks });
});

