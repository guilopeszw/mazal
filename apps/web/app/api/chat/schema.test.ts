import { expect, test } from "vitest";
import { parseChatRequest } from "./schema.ts";

test("accepts benchmark reference without a table", () => {
  expect(
    parseChatRequest({
      scenarioKey: "case2",
      userMessage: "Diagnostique",
      context: undefined,
    }),
  ).toMatchObject({ scenarioKey: "case2" });
});

test("rejects a benchmark table and an ambiguous source", () => {
  expect(() =>
    parseChatRequest({
      userMessage: "x",
      context: { reference: { kind: "benchmark", table: {} } },
    }),
  ).toThrow();

  expect(() =>
    parseChatRequest({ userMessage: "x", scenarioKey: "case1", context: {} }),
  ).toThrow();
});

test("rejects values outside the public request limits", () => {
  expect(() => parseChatRequest({ userMessage: "", scenarioKey: "case1" })).toThrow();
  expect(() =>
    parseChatRequest({ userMessage: "x", scenarioKey: "case1", conversationId: "short" }),
  ).toThrow();
});

