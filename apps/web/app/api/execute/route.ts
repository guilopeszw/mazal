import type { Action } from "@mazal/contracts";
import { execute, metaConfigured, type ExecutionResult } from "@/lib/meta";

/**
 * The one route that writes.
 *
 * Two modes, and the response always says which one it was in. Without
 * `META_ACCESS_TOKEN` this appends to a log and touches nothing — the default,
 * and what a cold clone does. With credentials it calls the Meta Marketing API
 * for real.
 *
 * The mode is never inferred by the screen and never assumed by the caller: it
 * comes back on every action, because "we paused your campaign" and "we wrote
 * this down" are different claims and only one of them is worth trusting.
 *
 * The log stays in memory. A hackathon build on Vercel has no durable disk, and
 * a fake persistence layer would be a claim the product cannot back.
 */
const log: { at: string; receipt: string; actions: Action[]; mode: string }[] = [];

export async function POST(request: Request) {
  const body = (await request.json()) as { actions?: Action[] };
  const requested = Array.isArray(body.actions) ? body.actions : [];

  /**
   * `actor` is filtered here and not only in the panel that calls this. The
   * client already sends `actor: 'mazal'` alone, but a guarantee that holds in
   * the caller is not a guarantee — anything can POST here. `AGENTS.md`: "Mazal
   * never offers to execute what only the seller can do", and a receipt for an
   * action it cannot perform is a lie with a reference number on it.
   */
  const actions = requested.filter((a) => a?.actor === "mazal");
  const refused = requested
    .filter((a) => a?.actor !== "mazal")
    .map((a) => ({ id: a?.id ?? "unknown", reason: "actor is the seller — Mazal cannot perform this" }));

  const results: (ExecutionResult & { id: string })[] = [];
  for (const a of actions) {
    if (!a.execution) {
      results.push({
        id: a.id,
        mode: "simulated",
        ok: true,
        detail: "no executable operation on this action — logged only",
      });
      continue;
    }
    results.push({ id: a.id, ...(await execute(a.execution)) });
  }

  const live = results.some((r) => r.mode === "live");
  const at = new Date().toISOString();
  const receipt = `MZL-${at.slice(0, 10).replace(/-/g, "")}-${String(log.length + 1).padStart(4, "0")}`;
  log.push({ at, receipt, actions, mode: live ? "live" : "simulated" });

  return Response.json({
    receipt,
    logged: actions,
    refused,
    results,
    mode: live ? "live" : "simulated",
    /** Kept for callers written against the earlier shape. */
    simulated: !live,
    configured: metaConfigured(),
  });
}
