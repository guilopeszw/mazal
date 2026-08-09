export class PayloadTooLarge extends Error {
  constructor() {
    super("Request body too large");
    this.name = "PayloadTooLarge";
  }
}

const LIVE_REQUEST_LIMIT = 10;
const LIVE_WINDOW_MS = 60_000;
const MAX_TRACKED_LIVE_SESSIONS = 1_000;
const liveRequestsBySession = new Map<string, number[]>();

/**
 * Process-local, best-effort live-provider abuse control. The browser cannot choose this key:
 * callers pass only a verified server session id.
 */
export function allowLiveRequest(sessionId: string, now: number): boolean {
  const windowStart = now - LIVE_WINDOW_MS;
  const previous = (liveRequestsBySession.get(sessionId) ?? []).filter((at) => at > windowStart);
  if (previous.length >= LIVE_REQUEST_LIMIT) return false;

  if (!liveRequestsBySession.has(sessionId) && liveRequestsBySession.size >= MAX_TRACKED_LIVE_SESSIONS) {
    const oldestSessionId = liveRequestsBySession.keys().next().value;
    if (oldestSessionId !== undefined) liveRequestsBySession.delete(oldestSessionId);
  }
  previous.push(now);
  liveRequestsBySession.set(sessionId, previous);
  return true;
}

function declaredLengthExceeds(request: Request, maximumBytes: number): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  return Number(contentLength) > maximumBytes;
}

/** Reads a UTF-8 JSON body while enforcing the byte limit even without Content-Length. */
export async function readLimitedJson(request: Request, maximumBytes: number): Promise<unknown> {
  if (declaredLengthExceeds(request, maximumBytes)) throw new PayloadTooLarge();

  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Request body is required");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(bytes));
}
