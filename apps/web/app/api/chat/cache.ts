export type ChatSource = "live" | "capture" | "fixture" | "template";

export type ChatResponse = {
  message: string;
  conversationId: string;
  source: ChatSource;
  warning?: string;
  scenarioKey?: "case1" | "case2";
};

export type CachedContent = Pick<ChatResponse, "message" | "source" | "warning" | "scenarioKey">;

type CacheInput = {
  promptVersion: string;
  scenarioKey?: "case1" | "case2";
  userMessage: string;
  resolvedInput: unknown;
};

const MAX_CACHE_ENTRIES = 100;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cache input must be JSON serializable");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Cache input must be JSON serializable");
}

/** Stable across equivalent object property order, so requests share only rendered deterministic text. */
export function cacheKeyFor(input: CacheInput): string {
  return canonicalJson(input);
}

function isCacheable(content: CachedContent): boolean {
  return content.source === "fixture" || content.source === "template";
}

/** Process-local best-effort cache. Values intentionally cannot hold conversation identifiers. */
export class RenderedContentCache {
  readonly #entries = new Map<string, CachedContent>();

  get(key: string): CachedContent | undefined {
    const content = this.#entries.get(key);
    return content ? { ...content } : undefined;
  }

  set(key: string, content: CachedContent): void {
    if (!isCacheable(content)) return;
    if (!this.#entries.has(key) && this.#entries.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey !== undefined) this.#entries.delete(oldestKey);
    }
    this.#entries.set(key, { ...content });
  }
}
