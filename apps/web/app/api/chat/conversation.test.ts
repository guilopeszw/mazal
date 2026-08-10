import { afterEach, beforeEach, expect, test } from "vitest";
import {
  createChatSession,
  issueConversationId,
  sessionIdFromCookieHeader,
  verifyConversationId,
} from "./conversation.ts";

const originalSecret = process.env["MAZAL_CHAT_SESSION_SECRET"];

function cookieHeader(setCookie: string): string {
  return setCookie.split(";", 1)[0]!;
}

beforeEach(() => {
  process.env["MAZAL_CHAT_SESSION_SECRET"] = "a-server-only-test-secret-with-at-least-thirty-two-bytes";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env["MAZAL_CHAT_SESSION_SECRET"];
  else process.env["MAZAL_CHAT_SESSION_SECRET"] = originalSecret;
});

test("issues an HttpOnly signed session cookie", () => {
  const session = createChatSession();

  expect(session.setCookie).toMatch(
    /^mazal_chat_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
  );
  expect(sessionIdFromCookieHeader(cookieHeader(session.setCookie))).toBe(session.id);
});

test("binds a signed handle to the issuing session", () => {
  const issuingSession = createChatSession();
  const otherSession = createChatSession();
  const handle = issueConversationId(issuingSession.id, {
    now: 1_000,
    providerThreadId: "server-thread-17",
  });

  expect(verifyConversationId(handle, issuingSession.id, 1_001)).toEqual({
    providerThreadId: "server-thread-17",
  });
  expect(verifyConversationId(handle, otherSession.id, 1_001)).toBeNull();
});

test.each([
  ["a random string", "not-a-conversation-handle", 1_000],
  ["an altered signature", "altered", 1_000],
  ["an expired handle", "expired", 2_000],
] as const)("rejects %s", (_label, kind, now) => {
  const session = createChatSession();
  const valid = issueConversationId(session.id, { now: 1_000, expiresAt: 2_000 });
  const handle = kind === "altered"
    ? `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`
    : kind === "expired"
      ? valid
      : "not-a-conversation-handle";

  expect(verifyConversationId(handle, session.id, now)).toBeNull();
});
