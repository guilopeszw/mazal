# Handoff

Current state of the build. **Read this first, before anything else in the repo** — `AGENTS.md` tells you the rules, this file tells you where things actually stand right now.

Append a new entry when you stop working, when you hand off to someone else, or when you hit something the next session needs to know. Newest entry at the top. Do not rewrite old entries — this is a log, and knowing what someone believed at 02:00 is often how you find the bug at 09:00.

Entry format:

```
## <date> <time> · <who> · <what you were doing>
**Done:** what actually landed, with commit hashes where useful.
**Next:** the single next action, concrete enough to start without deciding anything.
**Blocked / watch out:** anything that will bite the next person. "Nothing" is a valid answer.
```

---

## Who is who

| Letter | Person | Brief |
|---|---|---|
| A — engine | Miguel | [`plan/A-engine.md`](plan/A-engine.md) |
| B — data & simulator | Guilherme | [`plan/B-data.md`](plan/B-data.md) |
| C — ingest | Mateus | [`plan/C-ingest.md`](plan/C-ingest.md) — **ingest only**, see below |
| D — frontend | *(unassigned)* | [`plan/D-frontend.md`](plan/D-frontend.md) |
| E — agent, deco, pitch | *(unassigned)* | [`plan/E-agent.md`](plan/E-agent.md) |

Fill a name in as each person starts. If you are opening a session and your letter is not here, ask before assuming one — two people on the same package is worse than one package unstarted.

---

## 2026-08-08 · Guilherme · ownership change

**Done:** Miguel on A, Mateus on C.

**Next:** `packages/contracts` stays with **Guilherme**, not Mateus. Mateus owns `packages/ingest` only — the Meta CSV parser, the Product Card schema, the event log — and starts there directly. Guardian duty for the frozen contract follows ownership and is Guilherme's. [`plan/C-ingest.md`](plan/C-ingest.md) part 1 describes contracts work that is no longer Mateus's; the rest of that brief stands.

**Blocked / watch out:** Mateus is blocked on `packages/contracts` existing before ingest can compile. It is Guilherme's next commit and is twenty minutes away — Mateus can read `docs/contracts.md` and write the CSV parser test fixture meanwhile, since neither needs the package to exist.

---

## 2026-08-08 · Guilherme · planning

**Done:** All planning docs written and pushed — `AGENTS.md`, `docs/contracts.md`, `docs/testing.md`, `docs/acceptance.md`, `docs/plan/` (`a444a70`, `8a535e9`). No production code exists yet. Repo has no `package.json`, no workspace, no packages.

**Next:** `packages/contracts` — the six types from `docs/contracts.md` plus `metrics.ts` with its three assertions. This is C's package, but it is the only hard blocker for the other four people and B is the only one online, so B ships it and hands guardianship to C on arrival. Twenty minutes. Then `packages/data` (Olist derivation), then the simulator.

**Blocked / watch out:** Nobody else is online yet. A arrives Saturday night and takes `packages/engine`; tell them about the A/B firewall the moment they start, because it is the one rule that cannot be fixed retroactively — once B's fault-injection logic has been read by A, the backtest number is worthless for the rest of the weekend.
