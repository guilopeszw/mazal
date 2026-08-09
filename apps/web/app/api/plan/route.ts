import type { Diagnosis, ProductCard } from "@mazal/contracts";
import { buildPlan } from "@mazal/engine";

/**
 * Parse the body, call the engine, return JSON.
 *
 * `buildPlan` returns a real `projected` band as of `e9a1b2f` — it is no longer zeroed. It is
 * still not rendered, for a worse reason than being empty: it comes back as
 * `{p10: 0.67, p50: 4.39, p90: 28.13}` *identically for both demo fixtures*, which makes it an
 * artifact of the model rather than a forecast of this campaign. A p90 of 28× on a sheet whose
 * whole argument is that every number is auditable would be the most damaging figure on it, and
 * it would hand the seller an upside on the one screen whose promise is "don't launch".
 *
 * The route passes the shape through untouched. Do not wire the projection to the screen on the
 * grounds that it "has values now" — check first whether the two cases still return the same band.
 */
export async function POST(request: Request) {
  const { diagnosis, card } = (await request.json()) as {
    diagnosis: Diagnosis;
    card: ProductCard;
  };
  return Response.json(buildPlan(diagnosis, card));
}
