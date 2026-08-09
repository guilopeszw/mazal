import type { Diagnosis, ProductCard } from "@mazal/contracts";
import { buildPlan } from "@mazal/engine";

/**
 * Parse the body, call the engine, return JSON.
 *
 * `buildPlan` currently returns `projected: {p10: 0, p50: 0, p90: 0}` — the plan's recovery is
 * not modelled yet, only the actions and their individual expected effects are real. The route
 * passes the shape through untouched; it is the screen's job never to render that projection,
 * and it does not.
 */
export async function POST(request: Request) {
  const { diagnosis, card } = (await request.json()) as {
    diagnosis: Diagnosis;
    card: ProductCard;
  };
  return Response.json(buildPlan(diagnosis, card));
}
