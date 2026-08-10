import { expect, test } from "vitest";
import { RenderedContentCache, cacheKeyFor, type CachedContent } from "./cache.ts";

const content: CachedContent = {
  message: "A página do produto é o primeiro vazamento.",
  source: "fixture",
  scenarioKey: "case1",
};

test("keys rendered content from the canonical prompt, message, scenario, and resolved input", () => {
  const first = cacheKeyFor({
    promptVersion: "2026-08-09",
    scenarioKey: "case1",
    userMessage: "Diagnostique",
    resolvedInput: { card: { price: 90, category: "beleza_saude" }, days: [{ clicks: 4 }] },
  });
  const reordered = cacheKeyFor({
    promptVersion: "2026-08-09",
    scenarioKey: "case1",
    userMessage: "Diagnostique",
    resolvedInput: { days: [{ clicks: 4 }], card: { category: "beleza_saude", price: 90 } },
  });
  const cache = new RenderedContentCache();

  cache.set(first, content);

  expect(reordered).toBe(first);
  expect(cache.get(reordered)).toEqual(content);
  expect(cache.get(reordered)).not.toHaveProperty("conversationId");
});

test("never stores live content", () => {
  const cache = new RenderedContentCache();
  const key = cacheKeyFor({ promptVersion: "v1", userMessage: "Diagnostique", resolvedInput: {} });

  cache.set(key, { message: "A resposta do provedor", source: "live" } as unknown as CachedContent);

  expect(cache.get(key)).toBeUndefined();
});

test("evicts the oldest insertion after one hundred entries", () => {
  const cache = new RenderedContentCache();

  for (let index = 0; index <= 100; index += 1) {
    cache.set(`key-${index}`, { ...content, message: `Resposta ${index}` });
  }

  expect(cache.get("key-0")).toBeUndefined();
  expect(cache.get("key-1")).toEqual({ ...content, message: "Resposta 1" });
  expect(cache.get("key-100")).toEqual({ ...content, message: "Resposta 100" });
});
