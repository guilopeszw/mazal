# Task 3 — Vercel bundle route

- `/mcp` now rewrites to the emitted Function artifact, `/api/mcp.mjs`.
- The Hono entrypoint listens on that same internal path.
- The rewrite-destination test sends no bearer and receives `401 Unauthorized`, never a route `404`.
- Authenticated MCP handshake coverage remains on the same path with Host, Origin, and bearer headers.
- Node 24: MCP 36/36 (strict and Vercel-compat) and root 121/121 passed.
- A clean Vercel CLI 58.9.0 build passed; its manifest has the `.mjs` rewrite and the Node 24 Function artifact.
- The clean manifest resolves that artifact via `check: true` rather than emitting the older explicit `.mjs` route rule.
