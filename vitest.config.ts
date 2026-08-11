import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The root suite had no config at all, which worked until a test needed to
 * import a Next.js server action. `apps/web` resolves `@/` through its own
 * tsconfig, so `actions.ts` — and anything reaching it — was unreachable from
 * `pnpm test`.
 *
 * That is not a small gap: server actions are the entire seam between the form
 * and the engine, and it meant the only way to test one was to import the thing
 * underneath it and step around the action. A pre-flight shipped that could
 * never succeed for exactly that reason, with a green suite over it.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
    },
  },
});
