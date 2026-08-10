/**
 * What every read route does before it touches the engine.
 *
 * Two jobs, both learned from running the app rather than from reading it: a
 * body that is not JSON used to throw out of `request.json()` and surface as a
 * 500 with an empty body, which tells a caller nothing and looks like a crash;
 * and nothing checked the shape at all, so the engine was handed whatever
 * arrived.
 */

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function readJson(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, response: badRequest("Body is not valid JSON.") };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, response: badRequest("Body must be a JSON object.") };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
