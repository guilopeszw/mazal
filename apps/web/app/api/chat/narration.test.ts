import { resolveContext, type ResolvedContext } from "./context.ts";
import { fixtureFor } from "./fixtures.ts";
import { parseStructuredNarration, renderNarration } from "./narration.ts";
import { parseChatRequest } from "./schema.ts";
import { templateFor } from "./template.ts";
import { expect, test } from "vitest";

const context: ResolvedContext = {
  input: {
    days: [],
    card: {
      category: "health_beauty",
      price: 100,
      grossMargin: 0.5,
      shippingCost: 0,
      deliveryEtaDays: 3,
      stockOnHand: 10,
      reviewCount: 20,
      reviewAvg: 4.5,
      pdpImages: 4,
      pdpDescriptionLength: 200,
      returnPolicyDays: 7,
      paymentMethods: ["pix"],
      offer: "none",
    },
    events: [],
    reference: { kind: "self", baselineDays: 14 },
  },
  diagnosis: {
    primary: {
      stage: 3,
      severity: "primary",
      metric: "atcRate",
      observed: 0.045,
      reference: 0.1,
      spread: 0.01,
      deviation: -5.5,
      sampleSize: 120,
      rule: "stage3.atc_below_benchmark",
      causeLayer: "product",
    },
    secondary: [],
    suspectedCause: "thin_pdp",
  },
  plan: {
    actions: [
      {
        id: "improve-pdp",
        title: "Melhore a página do produto",
        change: "Adicione imagens úteis",
        expectedEffect: { metric: "atcRate", from: 0.045, to: 0.1 },
        confidence: "high",
        reversible: true,
        actor: "seller",
      },
    ],
    projected: { p10: 1.2, p50: 1.5, p90: 1.8 },
  },
};

test("renders a valid known fixture through the deterministic renderer", () => {
  const narration = fixtureFor("case1", context);

  expect(narration).toContain("4,5%");
  expect(narration).toContain("Melhore a página do produto");
  expect(narration).not.toMatch(/{{|}}/);
});

test.each(["case1", "case2"] as const)("renders the %s fixture from engine-resolved context", (scenarioKey) => {
  const resolved = resolveContext(parseChatRequest({ scenarioKey, userMessage: "Diagnostique" }));

  expect(fixtureFor(scenarioKey, resolved)).toBe(templateFor(resolved));
});

test("falls back to the template for a healthy fixture context", () => {
  const healthyContext: ResolvedContext = {
    ...context,
    diagnosis: { ...context.diagnosis, primary: null, suspectedCause: "none" },
    plan: { ...context.plan, actions: [] },
  };

  expect(fixtureFor("case1", healthyContext)).toBe(templateFor(healthyContext));
});

test("falls back to the template for a fixture context without an action", () => {
  const actionlessContext: ResolvedContext = {
    ...context,
    plan: { ...context.plan, actions: [] },
  };

  expect(fixtureFor("case2", actionlessContext)).toBe(templateFor(actionlessContext));
});

test("rejects prototype paths from a provider", () => {
  expect(() =>
    renderNarration(
      { verdict: "{{__proto__|text}}", evidence: "Evidência", plan: "Plano" },
      context,
    ),
  ).toThrow();
});

test("rejects an incompatible formatter for a deterministic value", () => {
  expect(() =>
    renderNarration(
      {
        verdict: "{{diagnosis.primary.observed|brl}}",
        evidence: "Evidência",
        plan: "Plano",
      },
      context,
    ),
  ).toThrow();
});

test("rejects an unknown formatter", () => {
  expect(() =>
    renderNarration(
      {
        verdict: "{{diagnosis.primary.observed|rounded}}",
        evidence: "Evidência",
        plan: "Plano",
      },
      context,
    ),
  ).toThrow();
});

test("rejects a literal numeric claim from a provider", () => {
  expect(() => renderNarration({ verdict: "Caiu 12%", evidence: "x", plan: "y" }, context)).toThrow();
});

test("rejects a placeholder whose deterministic value is absent", () => {
  expect(() =>
    renderNarration(
      {
        verdict: "Veredito",
        evidence: "{{diagnosis.primary.evidence.detail|text}}",
        plan: "Plano",
      },
      context,
    ),
  ).toThrow();
});

test("rejects unresolved braces after interpolation", () => {
  expect(() =>
    renderNarration({ verdict: "Veredito {{", evidence: "Evidência", plan: "Plano" }, context),
  ).toThrow();
});

test("rejects digits introduced by an untyped text value", () => {
  const numericTextContext: ResolvedContext = {
    ...context,
    plan: {
      ...context.plan,
      actions: [{ ...context.plan.actions[0], title: "Adicione 3 imagens" }],
    },
  };

  expect(() =>
    renderNarration(
      { verdict: "Veredito", evidence: "Evidência", plan: "{{plan.firstAction.title|text}}" },
      numericTextContext,
    ),
  ).toThrow();
});

test("parses only a strict, trimmed structured narration", () => {
  expect(
    parseStructuredNarration({ verdict: " Veredito ", evidence: " Evidência ", plan: " Plano " }),
  ).toEqual({ verdict: "Veredito", evidence: "Evidência", plan: "Plano" });
  expect(() =>
    parseStructuredNarration({ verdict: "Veredito", evidence: "Evidência", plan: "Plano", extra: true }),
  ).toThrow();
});

test("renders the fallback template with the same guard", () => {
  expect(templateFor(context)).toContain("4,5%");
});

test("chat does not tell an off-pixel seller their funnel is fine", () => {
  // The second door. The sheet was fixed and this route still said, verbatim:
  // "Não há um vazamento confirmado nesta leitura." — the same false all-clear
  // in Portuguese, reachable by any caller that supplies its own context.
  const days = Array.from({ length: 30 }, (_, i) => ({
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

  const context = resolveContext({
    userMessage: "minha campanha caiu",
    context: {
      days,
      card: {
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
      },
      events: [],
      reference: { kind: "benchmark" },
    },
  } as never);

  const said = templateFor(context);

  expect(said).not.toContain("Não há um vazamento confirmado");
  expect(said).toContain("não conseguimos ver");
  expect(said).toMatch(/iFood|WhatsApp|marketplace/);
});
