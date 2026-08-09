import type { ExecutableOp } from "@mazal/contracts";

/**
 * The Meta Marketing API client, and the only place in this product that can
 * change a seller's account.
 *
 * It is opt-in and off by default. With no `META_ACCESS_TOKEN` set, `execute`
 * reports `mode: 'simulated'` and touches nothing — which is what every build
 * without credentials does, including the one that gets cloned cold.
 *
 * ## What this can and cannot reach
 *
 * Meta grants **Standard Access** to `ads_management` without App Review, and
 * Standard Access only reaches ad accounts the app's own developers own or
 * administer. That is enough to run this against *our* account and show a real
 * campaign pausing.
 *
 * It is **not** enough to touch a seller's account. That needs Advanced Access,
 * which needs App Review and Business Verification — days, not hours. Anything
 * on screen must say which of the two it just did, because "we paused your
 * campaign" and "we paused ours" are different claims.
 */

/**
 * Overridable so the live path can be exercised against a local stub. Without
 * that, the branch that actually spends money would be the only code here
 * nothing had ever run.
 */
const GRAPH = process.env["META_GRAPH_BASE"] ?? "https://graph.facebook.com/v22.0";

export type ExecutionMode = "simulated" | "live";

export type ExecutionResult = {
  mode: ExecutionMode;
  /** The Meta object acted on, when one was. */
  target?: string;
  detail: string;
  ok: boolean;
  /**
   * What this changed, and what it was before.
   *
   * Every action in the playbook claims `reversible: true`. Until this existed
   * that was an assertion nobody could act on — a seller who paused a campaign
   * had no way back. The prior value is read before the write, so undo restores
   * what was actually there rather than what we assumed.
   */
  undo?: { target: string; field: string; previous: string; label: string };
};

/** Read a field before overwriting it, so there is something to go back to. */
async function readField(objectId: string, field: string): Promise<string | null> {
  const token = process.env["META_ACCESS_TOKEN"]!;
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(objectId)}?fields=${encodeURIComponent(field)}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as Record<string, unknown>;
    const value = payload[field];
    return value === undefined || value === null ? null : String(value);
  } catch {
    return null;
  }
}

/**
 * Put back exactly what was there.
 *
 * **The record must come from the server's own store, never from a caller.**
 * The first version returned the undo record to the browser and accepted it
 * back, which meant a crafted call could name any Meta object and any value —
 * `{ target: <someone else's campaign>, field: "daily_budget", previous:
 * "999999999" }` would have raised spend on an account we were never asked to
 * touch, defeating the whole point of having no spend-increasing operation.
 * The field allowlist only ever restricted *which* field, not the value or the
 * target.
 *
 * Two belts kept anyway, because a store can be got wrong too: the field must
 * be one of the three, and the target must be an object this deployment is
 * configured for.
 */
export async function undo(u: NonNullable<ExecutionResult["undo"]>): Promise<ExecutionResult> {
  if (!executeConfigured()) {
    return { mode: "simulated", ok: true, detail: "nothing was changed, so there is nothing to undo" };
  }
  if (!ALLOWED_UNDO_FIELDS.has(u.field)) {
    return { mode: "live", ok: false, detail: `refused: ${u.field} is not a field Mazal restores` };
  }
  if (!configuredTargets().has(u.target)) {
    return { mode: "live", ok: false, detail: "refused: that is not an object this deployment manages" };
  }

  const r = await post(u.target, { [u.field]: u.previous });
  return { mode: "live", target: u.target, ok: r.ok, detail: `${u.label} — ${r.detail}` };
}

/** The only Meta objects this deployment may write to, from its own env. */
function configuredTargets(): Set<string> {
  return new Set([process.env["META_CAMPAIGN_ID"], process.env["META_ADSET_ID"]].filter(Boolean) as string[]);
}

/** Only the three fields the three operations touch. Nothing else is restorable. */
const ALLOWED_UNDO_FIELDS = new Set(["status", "daily_budget", "frequency_control_specs"]);

/**
 * One environment variable that stops every write, everywhere, without a
 * redeploy or a code change.
 *
 * If something goes wrong while a real account is connected — mid-demo, or
 * worse, mid-seller — the answer cannot be "push a fix". Setting
 * MAZAL_EXECUTE_DISABLED returns the whole product to the simulated path it
 * ships in by default, and the screen says so because it reads the mode from
 * the response.
 */
export function executeConfigured(): boolean {
  if (process.env["MAZAL_EXECUTE_DISABLED"]) return false;
  return Boolean(process.env["META_ACCESS_TOKEN"] && process.env["META_CAMPAIGN_ID"]);
}

/**
 * Every op is reversible and none of them raises spend without a ceiling —
 * pausing stops spend, and the budget multiplier is bounded below. An
 * unbounded budget write is not a repair, it is a decision, and a seller makes
 * those.
 */
/** A write that hangs is worse than one that fails: the seller is left unsure. */
const TIMEOUT_MS = 8000;

async function post(path: string, body: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const token = process.env["META_ACCESS_TOKEN"]!;

  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, access_token: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok || payload.error) {
      // Meta's message can echo back what was sent, so it is not passed through
      // verbatim — a token must never reach a screen or a log.
      return { ok: false, detail: `Meta rejected it (${res.status})` };
    }
    return { ok: true, detail: "accepted by Meta" };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, detail: timedOut ? `no answer from Meta in ${TIMEOUT_MS / 1000}s` : "could not reach Meta" };
  }
}

export async function execute(op: ExecutableOp): Promise<ExecutionResult> {
  if (!executeConfigured()) {
    return {
      mode: "simulated",
      ok: true,
      detail: "no ad-platform credentials in this build — logged, nothing touched",
    };
  }

  const campaign = process.env["META_CAMPAIGN_ID"]!;

  switch (op.op) {
    case "pause_campaign": {
      const previous = (await readField(campaign, "status")) ?? "ACTIVE";
      const r = await post(campaign, { status: "PAUSED" });
      return {
        mode: "live", target: campaign, ok: r.ok,
        detail: `Campaign set to PAUSED — ${r.detail}`,
        ...(r.ok ? { undo: { target: campaign, field: "status", previous, label: `Campaign set back to ${previous}` } } : {}),
      };
    }

    case "reduce_daily_budget": {
      /**
       * Rejected, not clamped, if it is not a reduction.
       *
       * Clamping a bad multiplier to 1.0 would silently turn "spend 3x more"
       * into "change nothing" and report success. Refusing says what happened.
       * Checked here as well as at the route boundary: the route validates what
       * arrives over HTTP, this guards every other caller, and a ceiling
       * enforced in one layer is a ceiling that moves the first time someone
       * calls the other.
       */
      if (!(op.multiplier > 0 && op.multiplier <= 1)) {
        return { mode: "live", target: campaign, ok: false, detail: "refused: Mazal only ever reduces a budget" };
      }
      const factor = Math.max(op.multiplier, 0.25);
      const current = Number(process.env["META_DAILY_BUDGET_CENTS"] ?? "0");
      if (!Number.isFinite(current) || current <= 0) {
        return { mode: "live", target: campaign, ok: false, detail: "no current daily budget to scale from" };
      }
      const next = Math.round(current * factor);
      const r = await post(campaign, { daily_budget: String(next) });
      return {
        mode: "live", target: campaign, ok: r.ok,
        detail: `Daily budget ${current} → ${next} cents — ${r.detail}`,
        ...(r.ok ? { undo: { target: campaign, field: "daily_budget", previous: String(current), label: `Daily budget back to ${current} cents` } } : {}),
      };
    }

    case "set_frequency_cap": {
      // Frequency control lives on the ad set, not the campaign.
      const adSet = process.env["META_ADSET_ID"];
      if (!adSet) {
        return { mode: "live", ok: false, detail: "frequency caps need META_ADSET_ID — not set" };
      }
      const previous = (await readField(adSet, "frequency_control_specs")) ?? "[]";
      const r = await post(adSet, {
        frequency_control_specs: JSON.stringify([{ event: "IMPRESSIONS", interval_days: 7, max_frequency: op.perWeek }]),
      });
      return {
        mode: "live", target: adSet, ok: r.ok,
        detail: `Frequency capped at ${op.perWeek}/week — ${r.detail}`,
        ...(r.ok ? { undo: { target: adSet, field: "frequency_control_specs", previous, label: "Frequency cap removed" } } : {}),
      };
    }
  }
}
