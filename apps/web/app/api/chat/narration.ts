import type { ResolvedContext } from "./context.ts";
import { z } from "zod";

const ASCII_DIGIT = /[0-9]/;
const CONTROL_CHARACTER = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const PLACEHOLDER = /{{([^{}|]+)\|([^{}|]+)}}/g;

const narrationSectionSchema = z.string().trim().min(1).max(1_500);

export const structuredNarrationSchema = z
  .object({
    verdict: narrationSectionSchema,
    evidence: narrationSectionSchema,
    plan: narrationSectionSchema,
  })
  .strict()
  .superRefine((narration, context) => {
    if (narration.verdict.length + narration.evidence.length + narration.plan.length > 4_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Narration source is too long" });
    }
  });

export type StructuredNarration = z.infer<typeof structuredNarrationSchema>;

type Formatter = "percent" | "brl" | "integer" | "decimal" | "text";
type ValueSpec = { value: string | number; formatter: Formatter };
type Path = string;

const formatters: Record<Exclude<Formatter, "text">, (value: number) => string> = {
  percent: (value) => new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value),
  brl: (value) => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value),
  integer: (value) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value),
  decimal: (value) => new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value),
};

function assertSourceText(value: string): void {
  if (ASCII_DIGIT.test(value)) {
    throw new Error("Provider narration must not contain literal numeric claims");
  }
}

function addText(values: Record<Path, ValueSpec>, path: Path, value: string | undefined): void {
  if (value === undefined) return;
  if (ASCII_DIGIT.test(value)) {
    throw new Error(`Text value for ${path} contains an ASCII digit`);
  }
  values[path] = { value, formatter: "text" };
}

function buildValues(context: ResolvedContext): Record<Path, ValueSpec> {
  const values: Record<Path, ValueSpec> = Object.create(null) as Record<Path, ValueSpec>;
  const { diagnosis, plan } = context;
  const primary = diagnosis.primary;

  addText(values, "diagnosis.suspectedCause", diagnosis.suspectedCause);

  if (primary) {
    values["diagnosis.primary.stage"] = { value: primary.stage, formatter: "integer" };
    values["diagnosis.primary.observed"] = { value: primary.observed, formatter: "percent" };
    values["diagnosis.primary.reference"] = { value: primary.reference, formatter: "percent" };
    values["diagnosis.primary.sampleSize"] = { value: primary.sampleSize, formatter: "integer" };
    addText(values, "diagnosis.primary.evidence.detail", primary.evidence?.detail);
  }

  if (plan.actions[0]) {
    addText(values, "plan.firstAction.title", plan.actions[0].title);
    addText(values, "plan.firstAction.change", plan.actions[0].change);
  }

  values["plan.projected.p10"] = { value: plan.projected.p10, formatter: "decimal" };
  values["plan.projected.p50"] = { value: plan.projected.p50, formatter: "decimal" };
  values["plan.projected.p90"] = { value: plan.projected.p90, formatter: "decimal" };
  return values;
}

function renderSection(source: string, values: Record<Path, ValueSpec>): string {
  assertSourceText(source);
  let cursor = 0;
  let output = "";

  for (const match of source.matchAll(PLACEHOLDER)) {
    const [token, path, formatter] = match;
    const index = match.index!;
    output += source.slice(cursor, index);
    const spec = values[path];

    if (!spec || spec.formatter !== formatter) {
      throw new Error(`Invalid narration placeholder: ${token}`);
    }

    if (formatter === "text") {
      if (typeof spec.value !== "string" || ASCII_DIGIT.test(spec.value)) {
        throw new Error(`Invalid text value for ${path}`);
      }
      output += spec.value;
    } else {
      if (typeof spec.value !== "number") {
        throw new Error(`Invalid numeric value for ${path}`);
      }
      output += formatters[formatter](spec.value);
    }
    cursor = index + token.length;
  }

  output += source.slice(cursor);
  return output;
}

function assertRenderedText(value: string): void {
  if (value.length > 5_000) throw new Error("Rendered narration is too long");
  if (value.includes("{") || value.includes("}")) throw new Error("Rendered narration has unresolved braces");
  if (CONTROL_CHARACTER.test(value)) throw new Error("Rendered narration has a control character");
}

export function parseStructuredNarration(value: unknown): StructuredNarration {
  const narration = structuredNarrationSchema.parse(value);
  assertSourceText(narration.verdict);
  assertSourceText(narration.evidence);
  assertSourceText(narration.plan);
  return narration;
}

export function renderNarration(value: unknown, context: ResolvedContext): string {
  const narration = parseStructuredNarration(value);
  const values = buildValues(context);
  const rendered = [
    renderSection(narration.verdict, values),
    renderSection(narration.evidence, values),
    renderSection(narration.plan, values),
  ].join("\n\n");
  assertRenderedText(rendered);
  return rendered;
}
