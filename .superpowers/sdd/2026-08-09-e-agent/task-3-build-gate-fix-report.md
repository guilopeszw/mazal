# Task 3 — Vercel build gate fix

## Change

`apps/mcp` now runs the strict application typecheck before the Vercel-compatibility typecheck and its test suite:

```sh
tsc -p tsconfig.json --pretty false
tsc -p tsconfig.vercel-compat.json --pretty false
vitest run --passWithNoTests
```

The strict check preserves the static proof that the `diagnosisSchema` bridge has `z.output` compatible with `Diagnosis`; the compat check continues to model Vercel's non-strict Function builder.

## Verification

Run with Node `v24.19.0`:

- `pnpm --filter @mazal/mcp test` — 7 files, 33 tests passed.
- `pnpm exec tsc -p apps/mcp/tsconfig.json --pretty false` — passed.
- `pnpm exec tsc -p apps/mcp/tsconfig.vercel-compat.json --pretty false` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — 20 files, 118 tests passed.
- `git diff --check` — passed.

No runtime schemas, contract packages, tools, or Vercel runtime configuration changed.
