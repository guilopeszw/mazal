import { z } from "zod";
import type { Action } from "@mazal/contracts";
import { execute, executeConfigured, type ExecutionResult } from "@/lib/meta";

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

/**
 * Runtime validation, because the TypeScript types here are gone by the time a
 * request arrives. `body.actions` was cast straight to `Action[]` and its
 * `execution` handed to the Meta client — so a hand-written POST chose the
 * operation, and `op` was whatever the caller said it was.
 */
const executableOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("pause_campaign") }),
  // Bounded here as well as in the client. A ceiling that exists in one layer
  // is a ceiling that moves the first time someone calls the other one.
  z.object({ op: z.literal("set_daily_budget"), multiplier: z.number().min(0.5).max(1.5) }),
  z.object({ op: z.literal("set_frequency_cap"), perWeek: z.number().int().min(1).max(14) }),
]);

const actionSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().max(300).optional(),
  change: z.string().max(600).optional(),
  actor: z.enum(["mazal", "seller"]),
  execution: executableOp.optional(),
});

/** A plan is a handful of actions. A thousand of them is not a plan. */
const bodySchema = z.object({ actions: z.array(actionSchema).max(20).default([]) });

/**
 * Live execution requires a shared secret; the simulated path does not.
 *
 * Once credentials are present this endpoint can pause a real campaign, and it
 * had no authentication at all — anyone who could reach the deployment could
 * stop a seller's advertising. Simulated mode touches nothing, so it stays open
 * and the demo works with no configuration.
 */
function authorised(request: Request): boolean {
  const secret = process.env["MAZAL_EXECUTE_SECRET"];
  if (!executeConfigured()) return true;
  if (!secret) return false;

  const presented = request.headers.get("x-mazal-execute");
  if (!presented || presented.length !== secret.length) return false;

  // Constant-time-ish: compare every character regardless of the first mismatch.
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Malformed plan — nothing was run." }, { status: 400 });
  }

  if (!authorised(request)) {
    return Response.json(
      {
        error:
          "This build can change a real ad account, so execution needs its shared secret. Nothing was run.",
      },
      { status: 401 },
    );
  }

  const requested = parsed.data.actions;

  /**
   * `actor` is filtered here and not only in the panel that calls this. The
   * client already sends `actor: 'mazal'` alone, but a guarantee that holds in
   * the caller is not a guarantee — anything can POST here. `AGENTS.md`: "Mazal
   * never offers to execute what only the seller can do", and a receipt for an
   * action it cannot perform is a lie with a reference number on it.
   */
  const actions = requested.filter((a) => a.actor === "mazal");
  const refused = requested
    .filter((a) => a.actor !== "mazal")
    .map((a) => ({ id: a.id, reason: "actor is the seller — Mazal cannot perform this" }));

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
  log.push({ at, receipt, actions: actions as Action[], mode: live ? "live" : "simulated" });

  return Response.json({
    receipt,
    logged: actions,
    refused,
    results,
    mode: live ? "live" : "simulated",
    /** Kept for callers written against the earlier shape. */
    simulated: !live,
    configured: executeConfigured(),
  });
}
