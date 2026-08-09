# Main/MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the E-agent MCP implementation with the current demo build without losing the web, engine, simulator, or deployment work already on `main`.

**Architecture:** A dedicated integration branch begins at the current `main`, then merges `joaquim/feat/agent-mcp`. The only shared files are resolved intentionally: ignore rules are additive, handoff entries are preserved in chronological order, and the dependency lockfile is regenerated from the merged workspace. Validation is split between deterministic TypeScript checks, MCP tests, and the web production build.

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Next.js 16, Hono/MCP, Vercel.

## Global Constraints

- Do not commit directly to `main`; this branch is `joaquim/chore/integrate-main-mcp`.
- Preserve all existing `main` functionality and the E branch's `apps/mcp` implementation.
- `packages/contracts` remains unchanged.
- Use Node 24 for the MCP and web build verification.
- Never commit local secrets or deployment metadata (`.env.local`, `.vercel/`).

---

### Task 1: Merge the E implementation into the current demo build

**Files:**
- Modify: `.gitignore`
- Modify: `docs/HANDOFF.md`
- Modify: `pnpm-lock.yaml`
- Create: tracked `apps/mcp/**` files from `joaquim/feat/agent-mcp`

**Interfaces:**
- Consumes: `joaquim/feat/agent-mcp`, which exports the MCP endpoint at `/mcp`.
- Produces: one workspace containing `apps/web` and `apps/mcp`.

- [ ] Merge `joaquim/feat/agent-mcp` into this integration branch without committing.
- [ ] Resolve `.gitignore` by retaining the existing data and build ignores and appending `.vercel` and `.env*`.
- [ ] Resolve `docs/HANDOFF.md` by keeping both histories, newest entries first.
- [ ] Regenerate `pnpm-lock.yaml` from the merged `package.json` files instead of hand-editing it.
- [ ] Confirm `git diff --check` reports no whitespace errors.

### Task 2: Validate the integrated repository

**Files:**
- Verify: `packages/**`
- Verify: `apps/mcp/**`
- Verify: `apps/web/**`

**Interfaces:**
- Consumes: the merged pnpm workspace.
- Produces: reproducible evidence that the core packages, MCP service, and web app compile and test.

- [ ] Run the root test suite and root typecheck.
- [ ] Run `@mazal/mcp` tests, including the Vercel compatibility check.
- [ ] Run `apps/web` typecheck and production build with its dependencies installed.
- [ ] Run the deterministic simulator and backtest; confirm the committed backtest artefact is unchanged.

### Task 3: Record and publish the integration branch

**Files:**
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: green validation from Task 2.
- Produces: an auditable branch ready to merge into the project's integration flow.

- [ ] Append a handoff entry listing the integration commit, verification commands, and remaining operational work.
- [ ] Commit with a conventional message.
- [ ] Push `joaquim/chore/integrate-main-mcp` to origin.
- [ ] Keep the branch for review; do not merge it into `main` directly.

### Task 4: Close operational checks that cannot be proven by Git alone

**Files:**
- Verify: deployed Vercel frontend
- Verify: a clean second checkout

**Interfaces:**
- Consumes: the pushed integration branch and Vercel project access.
- Produces: deployment confirmation and cross-machine reproducibility evidence.

- [ ] Inspect the Vercel project and confirm that the web app has a successful production deployment from the integration branch or its eventual integration target.
- [ ] In a clean second checkout with Node 24, run `pnpm install --frozen-lockfile`, `pnpm derive`, and `pnpm sim:fixtures`; confirm `git status --short` remains clean.
- [ ] Record either the successful results or the exact external blocker in `docs/HANDOFF.md`.
