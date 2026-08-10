import { expect, test } from "vitest";
import { PayloadTooLarge, allowLiveRequest, readLimitedJson } from "./limits.ts";

test("cancels an oversized stream and preserves the payload-too-large error when cancellation fails", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
    },
    cancel() {
      cancelled = true;
      return Promise.reject(new Error("stream cleanup failed"));
    },
  });
  const request = new Request("https://mazal.test/api/chat", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await expect(readLimitedJson(request, 1)).rejects.toBeInstanceOf(PayloadTooLarge);
  expect(cancelled).toBe(true);
});

test("allows ten live requests in a rolling minute and admits the next one after it expires", () => {
  const sessionId = "rate-limit-unit-session";

  for (let request = 0; request < 10; request += 1) {
    expect(allowLiveRequest(sessionId, request)).toBe(true);
  }
  expect(allowLiveRequest(sessionId, 59_999)).toBe(false);
  expect(allowLiveRequest(sessionId, 60_000)).toBe(true);
});
