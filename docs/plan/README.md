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

### Dependencies

One hard blocker exists in the entire weekend: **`packages/contracts`**. Everything else has a stub path already written into the briefs.

| Owner | Hard blocker | Soft dependency | Escape hatch while waiting |
|---|---|---|---|
| C | — | — | — |
| B | contracts | — | — |
| A | contracts | B's `benchmarks.json` | stub a two-category table in own fixtures |
| D | contracts | — | mock a `Diagnosis`; never wait on the engine |
| E | contracts | A's `diagnose` | return a hardcoded `Diagnosis` that satisfies the contract |

Whoever is at a keyboard first writes `packages/contracts`, regardless of whose name is on it. Twenty minutes, and four people can start cold when they arrive.

One two-way dependency: B's backtest needs A's `diagnose`, and A's tuning needs B's number. Sequence — A ships `diagnose` by the end of SAT-B, B runs the backtest SUN-A morning, A tunes the rules, B re-runs once. **Two cycles, then stop.** A third cycle on Sunday afternoon is tuning against the held-out set, which is the thing this plan pre-committed not to do.

### Staggered arrivals

The team does not start at the same hour. Two load transfers exist for when that bites — both conditional, decided out loud, not on a clock:

- **Olist derivation moves from B to E** if B is still on it at 20:00 Saturday. B's longest pole is the simulator, and E's SAT-A is light. Derivation is a self-contained script and it touches no firewall — only fault labels are firewalled, benchmarks are shared by design.
- **C joins D as soon as ingest is done**, whether that is Saturday night or Sunday morning. `apps/web` is the heaviest single workload and the funnel visual is the product's identity. C decides on Saturday night which components to take, so the handoff costs five minutes rather than an hour.

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
