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
};

export function executeConfigured(): boolean {
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
      const r = await post(campaign, { status: "PAUSED" });
      return { mode: "live", target: campaign, ok: r.ok, detail: `Campaign set to PAUSED — ${r.detail}` };
    }

    case "set_daily_budget": {
      /**
       * Clamped here *as well as* at the route boundary. The route validates
       * what arrives over HTTP; this guards every other caller, including a
       * future one that does not go through it. A ceiling enforced in one layer
       * is a ceiling that moves the first time someone calls the other.
       */
      const factor = Math.min(Math.max(op.multiplier, 0.5), 1.5);
      const current = Number(process.env["META_DAILY_BUDGET_CENTS"] ?? "0");
      if (!Number.isFinite(current) || current <= 0) {
        return { mode: "live", target: campaign, ok: false, detail: "no current daily budget to scale from" };
      }
      const next = Math.round(current * factor);
      const r = await post(campaign, { daily_budget: String(next) });
      return { mode: "live", target: campaign, ok: r.ok, detail: `Daily budget ${current} → ${next} cents — ${r.detail}` };
    }

    case "set_frequency_cap": {
      // Frequency control lives on the ad set, not the campaign.
      const adSet = process.env["META_ADSET_ID"];
      if (!adSet) {
        return { mode: "live", ok: false, detail: "frequency caps need META_ADSET_ID — not set" };
      }
      const r = await post(adSet, {
        frequency_control_specs: JSON.stringify([{ event: "IMPRESSIONS", interval_days: 7, max_frequency: op.perWeek }]),
      });
      return { mode: "live", target: adSet, ok: r.ok, detail: `Frequency capped at ${op.perWeek}/week — ${r.detail}` };
    }
  }
}
