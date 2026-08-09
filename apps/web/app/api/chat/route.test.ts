import { demoCases } from "../../../lib/fixtures.ts";
import { afterEach, beforeEach, expect, test } from "vitest";
import { POST } from "./route.ts";

const MAX_BODY_BYTES = 1_000_000;
const originalEnvironment = {
  allowedHosts: process.env["MAZAL_CHAT_ALLOWED_HOSTS"],
  narrationMode: process.env["NARRATION_MODE"],
  decoKey: process.env["DECO_STUDIO_API_KEY"],
  nodeEnv: process.env["NODE_ENV"],
};

function restoreEnvironment(name: keyof typeof originalEnvironment): void {
  const value = originalEnvironment[name];
  const envName = {
    allowedHosts: "MAZAL_CHAT_ALLOWED_HOSTS",
    narrationMode: "NARRATION_MODE",
    decoKey: "DECO_STUDIO_API_KEY",
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

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  process.env["MAZAL_CHAT_ALLOWED_HOSTS"] = "mazal.test";
  process.env["NARRATION_MODE"] = "fixture";
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
    conversationId: expect.stringMatching(/^[A-Za-z0-9_-]{40,}$/),
    source: "fixture",
    scenarioKey: "case2",
  });
});

test("issues a new opaque conversation handle instead of forwarding a supplied id", async () => {
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

  expect(response.status).toBe(200);
  const body = await responseBody(response);
  expect(body.conversationId).not.toBe(suppliedConversationId);
  expect(body.conversationId).toMatch(/^[A-Za-z0-9_-]{40,}$/);
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
