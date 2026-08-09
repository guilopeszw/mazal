import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CHAT_SESSION_COOKIE = "mazal_chat_session";

const HANDLE_TTL_MS = 24 * 60 * 60 * 1_000;

type ConversationEnvelope = {
  v: 1;
  sidHash: string;
  providerThreadId?: string;
  exp: number;
};

export type ChatSession = {
  id: string;
  setCookie: string;
};

export type VerifiedConversation = {
  providerThreadId?: string;
};

export type ConversationOptions = {
  now?: number;
  expiresAt?: number;
  providerThreadId?: string;
};

function sessionSecret(): string {
  const secret = process.env["MAZAL_CHAT_SESSION_SECRET"];
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("MAZAL_CHAT_SESSION_SECRET must be set to a high-entropy server-only secret");
  }
  return secret;
}

function signature(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safelyEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function signedValue(scope: string, value: string): string {
  return `${value}.${signature(`${scope}:${value}`)}`;
}

function verifiedValue(scope: string, value: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0 || separator === value.length - 1) return null;

  const payload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = signature(`${scope}:${payload}`);
  return safelyEquals(suppliedSignature, expectedSignature) ? payload : null;
}

function sessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("base64url");
}

function cookieValue(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const fragment of cookieHeader.split(";")) {
    const [name, ...parts] = fragment.trim().split("=");
    if (name === CHAT_SESSION_COOKIE) return parts.join("=") || null;
  }
  return null;
}

function isSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,}$/.test(value);
}

function parseEnvelope(value: string): ConversationEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const envelope = parsed as Record<string, unknown>;
    if (envelope["v"] !== 1 || typeof envelope["sidHash"] !== "string") return null;
    if (typeof envelope["exp"] !== "number" || !Number.isSafeInteger(envelope["exp"])) return null;
    if (envelope["providerThreadId"] !== undefined && typeof envelope["providerThreadId"] !== "string") {
      return null;
    }
    return envelope as ConversationEnvelope;
  } catch {
    return null;
  }
}

/** Creates a new opaque browser session, signed before it ever reaches the client. */
export function createChatSession(): ChatSession {
  const id = randomBytes(32).toString("base64url");
  return {
    id,
    setCookie: `${CHAT_SESSION_COOKIE}=${signedValue("session", id)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  };
}

/** Returns the authenticated session id from a request Cookie header, never a raw cookie value. */
export function sessionIdFromCookieHeader(cookieHeader: string | null): string | null {
  const signedSession = cookieValue(cookieHeader);
  if (!signedSession) return null;
  const sessionId = verifiedValue("session", signedSession);
  return sessionId && isSessionId(sessionId) ? sessionId : null;
}

/**
 * Makes a browser-safe continuation handle. Provider thread ids may only enter here from a
 * server-side provider response, never from a request payload.
 */
export function issueConversationId(sessionId: string, options: ConversationOptions = {}): string {
  const now = options.now ?? Date.now();
  const envelope: ConversationEnvelope = {
    v: 1,
    sidHash: sessionHash(sessionId),
    ...(options.providerThreadId === undefined ? {} : { providerThreadId: options.providerThreadId }),
    exp: options.expiresAt ?? now + HANDLE_TTL_MS,
  };
  const encodedEnvelope = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  return signedValue("conversation", encodedEnvelope);
}

/** Verifies signature, expiry, and session binding before exposing any provider thread id. */
export function verifyConversationId(
  conversationId: string,
  sessionId: string,
  now = Date.now(),
): VerifiedConversation | null {
  const encodedEnvelope = verifiedValue("conversation", conversationId);
  if (!encodedEnvelope) return null;

  const envelope = parseEnvelope(encodedEnvelope);
  if (!envelope || envelope.exp <= now || !safelyEquals(envelope.sidHash, sessionHash(sessionId))) {
    return null;
  }
  return envelope.providerThreadId === undefined ? {} : { providerThreadId: envelope.providerThreadId };
}
