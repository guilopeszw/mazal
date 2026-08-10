import type { DiagnoseInput, ReferenceMode } from "@mazal/contracts";
import { benchmarks } from "@mazal/data";
import { diagnose } from "@mazal/engine";

import { badRequest, readJson } from "../guard";

/**
 * Parse the body, call the engine, return JSON. The engine owns every number.
 *
 * **The benchmark table is injected here and never accepted from the caller.**
 * It was previously passed straight through, which had two failure modes, both
 * found by driving the running app:
 *
 * A caller sending `reference: { kind: 'benchmark' }` with no table — the
 * natural reading, and what the MCP's own public schema looks like — got
 * `primary: null` and `suspectedCause: 'none'`. Not an error: a confident
 * *"your campaign is healthy"* for a campaign with a broken stage in it. That
 * exact failure is in `docs/HANDOFF.md` from when `ReferenceMode: 'self'` was
 * unimplemented, and it came back through a different door.
 *
 * And a caller sending their *own* table chose the reference every number is
 * measured against. `apps/mcp` refuses that outright and has a test named for
 * it; this route did not, so the same product answered differently depending on
 * which surface you asked.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  /**
   * Typed as what arrived, not as the contract. A request body is the one place
   * in this app where `DiagnoseInput` is a hope rather than a fact, and typing
   * it as the contract is what let the missing table through in the first
   * place: the compiler believed `reference.table` existed.
   */
  const input = body.value as {
    days?: DiagnoseInput["days"];
    card?: DiagnoseInput["card"];
    events?: DiagnoseInput["events"];
    reference?: { kind?: unknown; table?: unknown; baselineDays?: unknown };
  };
  const reference = input.reference;

  if (!reference || (reference.kind !== "benchmark" && reference.kind !== "self")) {
    return badRequest("`reference` must be { kind: 'benchmark' } or { kind: 'self', baselineDays }.");
  }
  if (reference.table !== undefined) {
    return badRequest(
      "The benchmark table is not yours to send — it is the reference every number here is measured against. Send { kind: 'benchmark' } and the server supplies it.",
    );
  }
  if (reference.kind === "self" && typeof reference.baselineDays !== "number") {
    return badRequest("`reference.baselineDays` must be a number when kind is 'self'.");
  }
  if (!Array.isArray(input.days) || input.days.length === 0) {
    return badRequest("`days` must be a non-empty array of CampaignDay.");
  }
  if (!input.card) return badRequest("`card` is required.");

  const resolved: ReferenceMode =
    reference.kind === "benchmark"
      ? { kind: "benchmark", table: benchmarks }
      : { kind: "self", baselineDays: reference.baselineDays as number };

  return Response.json(
    diagnose({
      days: input.days,
      card: input.card,
      events: input.events ?? [],
      reference: resolved,
    }),
  );
}
