import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * What Mazal did to a real account, written down where the seller can read it.
 *
 * The run log used to live in a module-level array, which meant it died with
 * the process. A write you cannot show afterwards is a write you cannot defend:
 * a seller asking "what did you change on Tuesday" deserves an answer that is
 * not "the server restarted".
 *
 * Append-only, one JSON object per line, and nothing here is ever rewritten —
 * an audit trail you can edit is not one.
 *
 * ## What it deliberately does not record
 *
 * No access token, ever, in any field. Meta's own error text is not stored
 * either, because it can echo the request back and the request carries the
 * token. Only the object acted on, the field, the values, and the outcome.
 */
export type AuditEntry = {
  at: string;
  receipt: string;
  mode: "simulated" | "live";
  actionId: string;
  target?: string;
  detail: string;
  ok: boolean;
  /** Present when the entry could still be reversed at the time of writing. */
  undoable: boolean;
};

/**
 * A file, not a database. Vercel's filesystem is ephemeral, so this survives a
 * demo and not a deployment — which is honest about what it is rather than
 * pretending to a durability the build cannot provide. `MAZAL_AUDIT_PATH`
 * points it somewhere real when there is somewhere real to point it.
 */
const PATH = process.env["MAZAL_AUDIT_PATH"] ?? resolve(process.cwd(), ".mazal-audit.jsonl");

export function record(entries: AuditEntry[]): void {
  if (entries.length === 0) return;
  try {
    appendFileSync(PATH, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
    // A failed audit write must not fail the run that was already performed —
    // the account has already changed, and throwing here would tell the seller
    // nothing happened. It is surfaced by the entry simply being absent.
  }
}

export function readAudit(limit = 200): AuditEntry[] {
  if (!existsSync(PATH)) return [];
  try {
    return readFileSync(PATH, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(-limit)
      .map((l) => JSON.parse(l) as AuditEntry);
  } catch {
    return [];
  }
}
