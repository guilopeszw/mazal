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
  const actions = body.actions ?? [];

  const at = new Date().toISOString();
  const receipt = `MZL-${at.slice(0, 10).replace(/-/g, "")}-${String(log.length + 1).padStart(4, "0")}`;
  log.push({ at, receipt, actions });

  return Response.json({ receipt, logged: actions });
}
