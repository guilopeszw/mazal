import type { PredictInput } from "@mazal/contracts";
import { benchmarks } from "@mazal/data";
import { predict } from "@mazal/engine";

import { badRequest, readJson } from "../guard";

/**
 * Parse the body, call the engine, return JSON.
 *
 * **The table is injected, never accepted.** This route used to pass the
 * caller's `table` straight to `predict`, which meant the caller chose the
 * reference the verdict is measured against. Demonstrated against the running
 * app with the pre-flight fixture: the real table returns a p50 of 0.93, and a
 * table with one metric multiplied by ten returns 9.32 — the same product,
 * answering with the caller's own numbers and no way for anyone downstream to
 * tell. `apps/mcp` has refused this since it was written.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const input = body.value as Partial<PredictInput>;

  if ("table" in body.value) {
    return badRequest(
      "The benchmark table is not yours to send — it is what the verdict is measured against. Send `card` and optionally `history`; the server supplies the table.",
    );
  }
  if (!input.card) return badRequest("`card` is required.");
  if (input.history !== undefined && !Array.isArray(input.history)) {
    return badRequest("`history` must be an array of CampaignDay when present.");
  }
  if (!benchmarks[input.card.category]) {
    return badRequest(`Unknown category: ${String(input.card.category)}`);
  }

  return Response.json(
    predict({
      card: input.card,
      table: benchmarks,
      ...(input.history ? { history: input.history } : {}),
    }),
  );
}
