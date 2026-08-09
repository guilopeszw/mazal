import { issueConversationId } from "./conversation.ts";
import { resolveContext } from "./context.ts";
import { fixtureFor } from "./fixtures.ts";
import { PayloadTooLarge, readLimitedJson } from "./limits.ts";
import { narrationMode } from "./mode.ts";
import { parseChatRequest } from "./schema.ts";
import { templateFor } from "./template.ts";

const MAX_BODY_BYTES = 1_000_000;
const NO_STORE = { "Cache-Control": "no-store" };

type ChatSource = "fixture" | "template";

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function allowedHosts(): Set<string> {
  const configured = (process.env["MAZAL_CHAT_ALLOWED_HOSTS"] ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  if (process.env["NODE_ENV"] === "development") configured.push("localhost:3000");
  return new Set(configured);
}

function requestIsAllowed(request: Request): boolean {
  const host = request.headers.get("host");
  const hosts = allowedHosts();
  if (!host || !hosts.has(host)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const permittedOrigin = host === "localhost:3000" && process.env["NODE_ENV"] === "development"
    ? "http://localhost:3000"
    : `https://${host}`;
  return origin === permittedOrigin;
}

function renderResponse(source: ChatSource, message: string, scenarioKey?: "case1" | "case2"): Response {
  return json({
    message,
    conversationId: issueConversationId(),
    source,
    ...(scenarioKey ? { scenarioKey } : {}),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!requestIsAllowed(request)) return json({ error: "Forbidden" }, 403);

  let payload: unknown;
  try {
    payload = await readLimitedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLarge) return json({ error: "Request body too large" }, 413);
    return json({ error: "Invalid request body" }, 400);
  }

  try {
    const chatRequest = parseChatRequest(payload);
    // Task 4 will verify and resume signed handles. Until then, input identifiers are ignored.
    const context = resolveContext(chatRequest);
    const source: ChatSource = narrationMode() === "fixture" && context.scenarioKey
      ? "fixture"
      : "template";
    const message = source === "fixture"
      ? fixtureFor(context.scenarioKey!, context)
      : templateFor(context);

    return renderResponse(source, message, context.scenarioKey);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
}
