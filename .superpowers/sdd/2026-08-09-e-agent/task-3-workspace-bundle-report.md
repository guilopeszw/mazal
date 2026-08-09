# Task 3 — Vercel workspace bundle fix

## Root cause

The Vercel Node builder transpiled the three Mazal workspace packages into the
Function trace, but copied their package manifests unchanged. Those manifests
still export TypeScript paths such as `./src/index.ts`, while the trace contains
the corresponding `.js` files. At runtime, Node followed the manifest export
and failed with `ERR_MODULE_NOT_FOUND` before the MCP handler could start.

## Fix

- Keep the importable Vercel handler in `src/vercel-entrypoint.ts`.
- Build `api/mcp.mjs` with esbuild as one ESM bundle targeting Node 24. The
  Mazal workspaces and runtime dependencies are inlined; only Node built-ins
  remain external.
- Select Vercel's `Other` preset, run the versioned build command from the
  configured `apps/mcp` Root Directory, and keep an empty static output folder
  required by that preset.
- Preserve the sole public rewrite `/mcp` → `/api/mcp`; there is one Function
  in the clean Build Output and no synthesized Hono route.

No `packages/*`, contracts, tool behavior, authentication, secrets, or public
route changed. No external deployment was performed.

## TDD record

RED on Node v24.19.0: the artifact test failed because
`scripts/build-vercel.mjs` did not exist. GREEN: the test builds the bundle,
checks it contains no `@mazal/` or `src/index.ts` markers, copies only that file
outside the monorepo, imports it there, and completes an authenticated MCP
handshake. The separate source-entrypoint integration test also remains green.

## Verification — Node v24.19.0

- MCP strict and Vercel-compatibility TypeScript checks passed.
- MCP suite: 8 files / 35 tests passed.
- Clean `npx vercel build --prod --yes` from the repository root passed.
- Build Output: exactly one `api/mcp.func`, runtime `nodejs24.x`, one bundled
  `.mjs`, and no unresolved Mazal or `src/index.ts` marker.
- Packaged Function smoke: authenticated initialize returned 200 and named
  `Mazal MCP`.
- Global typecheck and 21 files / 120 tests passed.
- `git diff --check` passed.
