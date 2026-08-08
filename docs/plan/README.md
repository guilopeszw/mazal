# The weekend

Submission closes **Sunday 2026-08-09, 23:59**. Hard code freeze **Sunday 19:00**.

The last five hours are rehearsal, backup video, and the submission form. Teams that plan to code until the deadline submit a broken build.

---

## Blocks

| Block | Window | Ends when |
|---|---|---|
| **SAT-A** | now → 20:00 Sat | `packages/contracts` committed and imported by every package. Repo scaffolded, `pnpm test` green on empty suites. B has `benchmarks.json` derived from Olist and committed. Everyone's first commit is in. |
| **SAT-B** | 20:00 → 02:00 Sat | Engine produces a real `Finding` from a real simulated campaign. Web renders the funnel from mocked contract data. MCP server answers one tool call end to end. |
| **sleep** | 02:00 → 08:00 | — Agents may continue under the unattended policy in `AGENTS.md`. |
| **SUN-A** | 08:00 → 13:00 Sun | First backtest number in hand — the real one, whatever it is. Both cases demoable, however ugly. C moves to frontend. |
| **SUN-B** | 13:00 → 19:00 Sun | Funnel visual finished. Deck done. Demo fixtures seeded and byte-reproducible. Full demo run once, LLM responses captured as fixtures. |
| **SUN-C** | 19:00 → 23:59 Sun | **Frozen.** Rehearse three times, record the backup video, submit. |

## Checkpoints

Two, thirty minutes each, all hands, and each ends with an explicit cut decision.

**End of SAT-B — does the engine produce a `Finding` from simulator output?**
If no, cut immediately: drop the Monte Carlo prediction and ship Case #2 only. Do not spend the night hoping.

**End of SUN-A — are both cases demoable?**
Anything not *started* by this checkpoint is cut. Write the cut list down and keep it. "Here is what we deliberately did not build" is a slide, and it reads as focus.

## The cut ladder

Read this before you slip, not during. When the team runs late, things die in this order, no debate:

1. PDP URL autofill
2. Monte Carlo → deterministic 3-point sensitivity (low / base / high), same visual, ~15 minutes
3. Calibration plot
4. Expert-agreement calls
5. Case #1's live "toggle a fix, watch the band move" interaction → two static states

Anything below #5 is the demo itself and is not on the ladder.

## Ownership

| Owner | Package | Brief |
|---|---|---|
| **A** | `packages/engine` | [A-engine.md](A-engine.md) |
| **B** | `packages/data`, `packages/sim` | [B-data.md](B-data.md) |
| **C** | `packages/ingest`, `packages/contracts` | [C-ingest.md](C-ingest.md) |
| **D** | `apps/web` | [D-frontend.md](D-frontend.md) |
| **E** | `apps/mcp`, deck, demo | [E-agent.md](E-agent.md) |

Roles are ownership, not walls — but nobody edits another package without saying so first. Direct push to `main`. `packages/contracts` is frozen after SAT-A and changes there need all-hands agreement, because everyone is coding against it.

## Risks

| Risk | Mitigation |
|---|---|
| **Demo dies live** — wifi, rate limits, a bad LLM response | Deco AI Gateway credits cover the token budget. Every LLM response on the demo path is captured as a fixture at SUN-B and replayed. Seeded data. Recorded backup video. Freeze at 19:00. |
| **The simulator grades its own homework** | A and B never read each other's code, and the shared vocabulary is `FaultKind` in `packages/contracts`, so neither package imports the other. Held-out set. The method goes on the slide openly. |
| **The frontend eats the weekend** | D mocks against the frozen contract from minute one and never waits on the engine. C joins D at SUN-A. If it still slips, the MCP connection in deco Studio is a complete demo path on its own. |
| **Scope creep to other channels** | Meta only. "Out of scope" is a slide, not an apology. |
| **Judges see an LLM wrapper** | Lead with the deterministic engine and the backtest, not the chat. The model narrates; it never computes. |
| **Both cases half-built** | Case #2 is the emotional peak. If only one can be finished, finish Case #2. |
| **A bad backtest number** | Report it as measured. No tuning against the held-out set after looking at it. A disclosed weak class with a stated fix reads as rigour; a suspicious 99% gets interrogated. |

## Reference

- [`docs/contracts.md`](../contracts.md) — the frozen types and every package's public API
- [`docs/testing.md`](../testing.md) — TDD scope and the loop
- [`docs/acceptance.md`](../acceptance.md) — the ten claims, their demo beats, and their tests
- [`prd.md`](../../prd.md), [`demo-script.md`](../../demo-script.md) — background. `AGENTS.md` wins where they conflict.
