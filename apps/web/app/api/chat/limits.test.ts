import { expect, test } from "vitest";
import { PayloadTooLarge, readLimitedJson } from "./limits.ts";

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
