# Task 1 report — Public schema and deterministic resolution

## Status

Implemented on `feat/web-chat-api` in `/Users/juca/Projects/mazal/.worktrees/web-chat-api`.

## Files changed

- `apps/web/app/api/chat/schema.ts`
- `apps/web/app/api/chat/schema.test.ts`
- `apps/web/app/api/chat/context.ts`
- `apps/web/app/api/chat/context.test.ts`

## Decisions

- Defined local strict Zod schemas for campaign days, the single product card, store events, public references, and the chat request.
- Enforced the brief limits: `userMessage` 1–2,000 characters, 1–400 days, 0–100 events, event details 1–500 characters, and `baselineDays` 1–365 integer.
- Kept `conversationId` as a non-UUID string with length 40–2,000; signature verification remains separate.
- Enforced exactly one public source: `scenarioKey` or raw `context`.
- Demo scenarios resolve to their campaign data with the published 14-day self baseline.
- Public benchmark references contain only `{ kind: "benchmark" }`; `resolveContext` injects the internal `benchmarks` table before calling `diagnose` and `buildPlan`.
- No contract or out-of-task application files were changed.

## Verification

- `pnpm exec vitest run apps/web/app/api/chat/schema.test.ts apps/web/app/api/chat/context.test.ts`
  - 5 tests passed across 2 files.
- `pnpm --filter web exec next typegen`
  - Types generated successfully.
- `pnpm --filter web typecheck`
  - TypeScript completed with exit code 0.
- `git diff --check`
  - No whitespace errors.

