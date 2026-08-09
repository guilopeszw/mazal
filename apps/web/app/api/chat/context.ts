import type { DiagnoseInput, Diagnosis, RecoveryPlan } from "@mazal/contracts";
import { benchmarks } from "@mazal/data";
import { buildPlan, diagnose } from "@mazal/engine";
import { demoCases } from "../../../lib/fixtures.ts";
import type { ChatRequest } from "./schema.ts";

export type ResolvedContext = {
  scenarioKey?: "case1" | "case2";
  input: DiagnoseInput;
  diagnosis: Diagnosis;
  plan: RecoveryPlan;
};

function inputForDemoCase(scenarioKey: "case1" | "case2"): DiagnoseInput {
  const campaign = demoCases[scenarioKey];
  return {
    days: campaign.days,
    card: campaign.card,
    events: campaign.events,
    reference: { kind: "self", baselineDays: 14 },
  };
}

function injectBenchmarkTable(input: DiagnoseInput): DiagnoseInput {
  const reference = input.reference.kind === "benchmark"
    ? { kind: "benchmark", table: benchmarks } as const
    : input.reference;
  return { ...input, reference };
}

export function resolveContext(request: ChatRequest): ResolvedContext {
  const publicInput = request.scenarioKey
    ? inputForDemoCase(request.scenarioKey)
    : request.context! as DiagnoseInput;
  const input = injectBenchmarkTable(publicInput);
  const diagnosis = diagnose(input);
  return {
    scenarioKey: request.scenarioKey,
    input,
    diagnosis,
    plan: buildPlan(diagnosis, input.card),
  };
}
