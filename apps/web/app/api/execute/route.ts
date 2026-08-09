import type { Action } from "@mazal/contracts";

/**
 * The one route that "writes". It appends to a log and returns a receipt — there is no Meta
 * API client in this app, and `docs/acceptance.md` claim 10 is explicit that the absence *is*
 * the guarantee. The screen says so where the receipt renders.
 *
 * The log is in memory: a hackathon build on Vercel has no durable disk, and a fake persistence
 * layer would be a claim the product cannot back. It survives the demo, which is its whole job.
 */
const log: { at: string; receipt: string; actions: Action[] }[] = [];

export async function POST(request: Request) {
  const body = (await request.json()) as { actions?: Action[] };
  const requested = Array.isArray(body.actions) ? body.actions : [];

  /**
   * `actor` is filtered here and not only in the panel that calls this.
   *
   * The client already sends `actor: 'mazal'` alone, but a guarantee that holds
   * only in the caller is not a guarantee — anything can POST here. `AGENTS.md`:
   * "Mazal never offers to execute what only the seller can do", and a receipt
   * for an action it cannot perform is a lie with a reference number on it.
   *
   * Refused actions are named back rather than dropped in silence, so a caller
   * learns why instead of wondering where they went.
   */
  const actions = requested.filter((a) => a?.actor === "mazal");
  const refused = requested
    .filter((a) => a?.actor !== "mazal")
    .map((a) => ({ id: a?.id ?? "unknown", reason: "actor is the seller — Mazal cannot perform this" }));

  const at = new Date().toISOString();
  const receipt = `MZL-${at.slice(0, 10).replace(/-/g, "")}-${String(log.length + 1).padStart(4, "0")}`;
  log.push({ at, receipt, actions });

  return Response.json({ receipt, logged: actions, refused, simulated: true });
}
