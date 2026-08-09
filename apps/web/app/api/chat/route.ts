import {
  createChatSession,
  issueConversationId,
  sessionIdFromCookieHeader,
  verifyConversationId,
} from "./conversation.ts";
import {
  cacheKeyFor,
  RenderedContentCache,
  type CachedContent,
  type ChatResponse,
  type ChatSource,
} from "./cache.ts";
import { resolveContext } from "./context.ts";
import { fixtureFor } from "./fixtures.ts";
import { PayloadTooLarge, allowLiveRequest, readLimitedJson } from "./limits.ts";
import { narrationMode } from "./mode.ts";
import { parseChatRequest } from "./schema.ts";
import { templateFor } from "./template.ts";

const MAX_BODY_BYTES = 1_000_000;
const NO_STORE = { "Cache-Control": "no-store" };
const PROMPT_VERSION = "2026-08-09";
const renderedContentCache = new RenderedContentCache();

function json(body: Record<string, unknown>, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
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

function renderResponse(content: CachedContent, conversationId: string, setCookie?: string): Response {
  const response: ChatResponse = { ...content, conversationId };
  return json(response, 200, setCookie ? { "Set-Cookie": setCookie } : {});
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

  let chatRequest;
  try {
    chatRequest = parseChatRequest(payload);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  let sessionId: string;
  let setCookie: string | undefined;
  let continuation: { providerThreadId?: string } | null;
  try {
    const existingSessionId = sessionIdFromCookieHeader(request.headers.get("cookie"));
    if (existingSessionId) {
      sessionId = existingSessionId;
    } else {
      const session = createChatSession();
      sessionId = session.id;
      setCookie = session.setCookie;
    }

    continuation = chatRequest.conversationId
      ? verifyConversationId(chatRequest.conversationId, sessionId)
      : {};
  } catch {
    return json({ error: "Service unavailable" }, 503);
  }
  if (!continuation) return json({ error: "Invalid request body" }, 400);

  const mode = narrationMode();
  if (mode === "live") {
    if (!allowLiveRequest(sessionId, Date.now())) return json({ error: "RATE_LIMITED" }, 429);
    return json({ error: "Live chat unavailable" }, 503, setCookie ? { "Set-Cookie": setCookie } : {});
  }

  try {
    const context = resolveContext(chatRequest);
    const source: Extract<ChatSource, "fixture" | "template"> = mode === "fixture" && context.scenarioKey
      ? "fixture"
      : "template";
    const key = cacheKeyFor({
      promptVersion: `${PROMPT_VERSION}:${mode}`,
      scenarioKey: context.scenarioKey,
      userMessage: chatRequest.userMessage,
      resolvedInput: context.input,
    });
    let content = renderedContentCache.get(key);
    if (!content) {
      content = {
        message: source === "fixture"
          ? fixtureFor(context.scenarioKey!, context)
          : templateFor(context),
        source,
        ...(context.scenarioKey ? { scenarioKey: context.scenarioKey } : {}),
      };
      renderedContentCache.set(key, content);
    }

    return renderResponse(
      content,
      issueConversationId(sessionId, { providerThreadId: continuation.providerThreadId }),
      setCookie,
    );
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
}
