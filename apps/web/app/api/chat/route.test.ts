import { demoCases } from "../../../lib/fixtures.ts";
import { afterEach, beforeEach, expect, test } from "vitest";
import { sessionIdFromCookieHeader, verifyConversationId } from "./conversation.ts";
import { POST } from "./route.ts";

const MAX_BODY_BYTES = 1_000_000;
const originalEnvironment = {
  allowedHosts: process.env["MAZAL_CHAT_ALLOWED_HOSTS"],
  narrationMode: process.env["NARRATION_MODE"],
  decoKey: process.env["DECO_STUDIO_API_KEY"],
  sessionSecret: process.env["MAZAL_CHAT_SESSION_SECRET"],
  nodeEnv: process.env["NODE_ENV"],
};

function restoreEnvironment(name: keyof typeof originalEnvironment): void {
  const value = originalEnvironment[name];
  const envName = {
    allowedHosts: "MAZAL_CHAT_ALLOWED_HOSTS",
    narrationMode: "NARRATION_MODE",
    decoKey: "DECO_STUDIO_API_KEY",
    sessionSecret: "MAZAL_CHAT_SESSION_SECRET",
    nodeEnv: "NODE_ENV",
  }[name];

  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

function setEnvironment(name: string, value: string): void {
  process.env[name] = value;
}

function requestFor(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://mazal.test/api/chat", {
    method: "POST",
    headers: {
      host: "mazal.test",
      origin: "https://mazal.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

function cookieHeader(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  process.env["MAZAL_CHAT_ALLOWED_HOSTS"] = "mazal.test";
  process.env["NARRATION_MODE"] = "fixture";
  process.env["MAZAL_CHAT_SESSION_SECRET"] = "a-server-only-test-secret-with-at-least-thirty-two-bytes";
  delete process.env["DECO_STUDIO_API_KEY"];
  setEnvironment("NODE_ENV", "production");
});

afterEach(() => {
  for (const name of Object.keys(originalEnvironment) as (keyof typeof originalEnvironment)[]) {
    restoreEnvironment(name);
  }
});

test("returns a fixture response without requiring a Deco key", async () => {
  const response = await POST(
    requestFor(JSON.stringify({ scenarioKey: "case2", userMessage: "Onde está o problema?" })),
  );

  expect(response.status).toBe(200);
  await expect(responseBody(response)).resolves.toEqual({
    message: expect.any(String),
    conversationId: expect.stringMatching(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    source: "fixture",
    scenarioKey: "case2",
  });
  expect(response.headers.get("set-cookie")).toMatch(
    /^mazal_chat_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
  );
});

test("returns cached fixture content with the current session's verified handle", async () => {
  const body = JSON.stringify({ scenarioKey: "case2", userMessage: "Use o cache com segurança" });
  const first = await POST(requestFor(body));
  const firstBody = await responseBody(first);
  const firstCookie = cookieHeader(first);
  const second = await POST(requestFor(body));
  const secondBody = await responseBody(second);
  const secondCookie = cookieHeader(second);
  const secondSessionId = sessionIdFromCookieHeader(secondCookie);

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(secondBody.message).toBe(firstBody.message);
  expect(secondBody.conversationId).not.toBe(firstBody.conversationId);
  expect(secondSessionId).toBeTruthy();
  expect(verifyConversationId(secondBody.conversationId as string, secondSessionId!, Date.now())).not.toBeNull();
});

test("continues only a handle verified against the caller's signed session", async () => {
  const body = JSON.stringify({ scenarioKey: "case2", userMessage: "Onde está o problema?" });
  const first = await POST(requestFor(body));
  const firstBody = await responseBody(first);
  const firstCookie = cookieHeader(first);
  const second = await POST(
    requestFor(
      JSON.stringify({
        scenarioKey: "case2",
        userMessage: "E a ação?",
        conversationId: firstBody.conversationId,
      }),
      { cookie: firstCookie },
    ),
  );

  expect(second.status).toBe(200);
  expect(await responseBody(second)).toMatchObject({ source: "fixture" });
  expect(second.headers.get("set-cookie")).toBeNull();
});

test.each([
  ["is removed", undefined],
  ["is too short", "short"],
] as const)("fails closed when the session secret %s while verifying an existing cookie", async (_label, secret) => {
  const body = JSON.stringify({ scenarioKey: "case2", userMessage: "Onde está o problema?" });
  const issued = await POST(requestFor(body));
  const cookie = cookieHeader(issued);

  if (secret === undefined) delete process.env["MAZAL_CHAT_SESSION_SECRET"];
  else process.env["MAZAL_CHAT_SESSION_SECRET"] = secret;
  const response = await POST(requestFor(body, { cookie })).catch(() => null);

  expect(response).not.toBeNull();
  expect(response!.status).toBe(503);
  await expect(responseBody(response!)).resolves.toEqual({ error: "Service unavailable" });
});

test("rejects a handle signed for another session", async () => {
  const body = JSON.stringify({ scenarioKey: "case2", userMessage: "Onde está o problema?" });
  const first = await POST(requestFor(body));
  const firstBody = await responseBody(first);
  const second = await POST(requestFor(body));
  const secondCookie = cookieHeader(second);
  const foreign = await POST(
    requestFor(
      JSON.stringify({
        scenarioKey: "case2",
        userMessage: "E a ação?",
        conversationId: firstBody.conversationId,
      }),
      { cookie: secondCookie },
    ),
  );

  expect(foreign.status).toBe(400);
  await expect(responseBody(foreign)).resolves.toEqual({ error: "Invalid request body" });
});

test("rejects a browser-supplied external provider thread id", async () => {
  const suppliedConversationId = "external-provider-thread-id-must-not-reach-the-browser";
  const response = await POST(
    requestFor(
      JSON.stringify({
        scenarioKey: "case2",
        userMessage: "Onde está o problema?",
        conversationId: suppliedConversationId,
      }),
    ),
  );

  expect(response.status).toBe(400);
  await expect(responseBody(response)).resolves.toEqual({ error: "Invalid request body" });
});

test("falls back to the deterministic template for a raw context", async () => {
  const { fault: _fault, ...context } = demoCases.case1;
  const response = await POST(
    requestFor(
      JSON.stringify({
        context: { ...context, reference: { kind: "benchmark" } },
        userMessage: "Diagnostique",
      }),
    ),
  );

  expect(response.status).toBe(200);
  const body = await responseBody(response);
  expect(body).toMatchObject({ source: "template", message: expect.any(String) });
  expect(body).not.toHaveProperty("scenarioKey");
});

test("uses the template mode for known fixtures when requested", async () => {
  process.env["NARRATION_MODE"] = "template";
  const response = await POST(
    requestFor(JSON.stringify({ scenarioKey: "case1", userMessage: "Diagnostique" })),
  );

  expect(response.status).toBe(200);
  expect(await responseBody(response)).toMatchObject({ source: "template" });
});

test("does not reuse template cache content after fixture mode is enabled", async () => {
  const body = JSON.stringify({ scenarioKey: "case1", userMessage: "Mantenha o cache por modo" });
  process.env["NARRATION_MODE"] = "template";
  const template = await POST(requestFor(body));

  process.env["NARRATION_MODE"] = "fixture";
  const fixture = await POST(requestFor(body));

  expect(template.status).toBe(200);
  expect(await responseBody(template)).toMatchObject({ source: "template" });
  expect(fixture.status).toBe(200);
  expect(await responseBody(fixture)).toMatchObject({ source: "fixture" });
});

test("returns RATE_LIMITED after ten live requests from one signed session", async () => {
  process.env["NARRATION_MODE"] = "live";
  const body = JSON.stringify({ scenarioKey: "case1", userMessage: "Limite live" });
  const first = await POST(requestFor(body));
  const cookie = cookieHeader(first);

  expect(first.status).toBe(503);
  for (let request = 1; request < 10; request += 1) {
    const response = await POST(requestFor(body, { cookie }));
    expect(response.status).toBe(503);
  }

  const limited = await POST(requestFor(body, { cookie }));
  expect(limited.status).toBe(429);
  await expect(responseBody(limited)).resolves.toEqual({ error: "RATE_LIMITED" });
});

test("rejects a declared body larger than one megabyte", async () => {
  const response = await POST(
    requestFor(JSON.stringify({ scenarioKey: "case1", userMessage: "x" }), {
      "content-length": String(MAX_BODY_BYTES + 1),
    }),
  );

  expect(response.status).toBe(413);
  await expect(responseBody(response)).resolves.toEqual({ error: "Request body too large" });
});

test("rejects an unannounced body larger than one megabyte", async () => {
  const body = JSON.stringify({ scenarioKey: "case1", userMessage: "x".repeat(MAX_BODY_BYTES) });
  const request = requestFor(body);
  request.headers.delete("content-length");

  expect(request.headers.get("content-length")).toBeNull();
  const response = await POST(request);

  expect(response.status).toBe(413);
  await expect(responseBody(response)).resolves.toEqual({ error: "Request body too large" });
});

test("rejects malformed JSON without exposing parser details", async () => {
  const response = await POST(requestFor('{"scenarioKey":'));

  expect(response.status).toBe(400);
  await expect(responseBody(response)).resolves.toEqual({ error: "Invalid request body" });
});

test("rejects a host or origin outside the exact allowlist", async () => {
  const response = await POST(
    requestFor(JSON.stringify({ scenarioKey: "case1", userMessage: "Diagnostique" }), {
      host: "attacker.test",
      origin: "https://attacker.test",
    }),
  );

  expect(response.status).toBe(403);
  await expect(responseBody(response)).resolves.toEqual({ error: "Forbidden" });
});

test("permits the local development host and its exact HTTP origin", async () => {
  setEnvironment("NODE_ENV", "development");
  const response = await POST(
    requestFor(JSON.stringify({ scenarioKey: "case1", userMessage: "Diagnostique" }), {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    }),
  );

  expect(response.status).toBe(200);
  expect(await responseBody(response)).toMatchObject({ source: "fixture" });
});

test("does not serialize the benchmark table, provider key, or a provider thread", async () => {
  process.env["DECO_STUDIO_API_KEY"] = "deco-secret-that-must-not-leak";
  const { fault: _fault, ...context } = demoCases.case1;
  const response = await POST(
    requestFor(
      JSON.stringify({
        context: { ...context, reference: { kind: "benchmark" } },
        userMessage: "Diagnostique",
      }),
    ),
  );

  expect(response.status).toBe(200);
  const serialized = JSON.stringify(await responseBody(response));
  expect(serialized).not.toContain("table");
  expect(serialized).not.toContain("deco-secret-that-must-not-leak");
  expect(serialized).not.toContain("thread");
});
