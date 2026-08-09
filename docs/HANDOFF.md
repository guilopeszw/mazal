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

## 2026-08-09 11:55 BRT · Joaquim · main/MCP integration branch

**Done:** created `joaquim/chore/integrate-main-mcp` from current `main` (`afb9a90`) in an isolated worktree and merged `joaquim/feat/agent-mcp`. `.gitignore` and this handoff merged automatically; `pnpm-lock.yaml` was regenerated from the merged workspace. Root tests pass (**132 tests**), root typecheck passes, and `pnpm --filter @mazal/mcp test` passes (**36 tests**, including Vercel bundle coverage). `pnpm sim:eyeball` and `pnpm sim:backtest` pass without changing `docs/backtest-results.md`.

**Next:** D should make the web `typecheck` script run `next typegen` before `tsc --noEmit` (or commit the generated Next route types in the supported way). After `pnpm --filter web exec next typegen`, the web typecheck passes. Then run a production build in a networked environment or self-host Inter; this machine cannot fetch Google Fonts during `next build`.

**Blocked / watch out:** `apps/web` belongs to D and was not changed. The Vercel project `mazal` has **no production deployment**, no preview deployments, and no Git repository connected; its dashboard says production requires pushing `main`. This integration branch requires Node 24 for its declared engine, while this local verification ran on Node 22 and emitted only engine warnings. The branch must not merge directly to `main`; review/integrate through the project's branch flow.

**Reproducibility follow-up:** the isolated checkout ran `pnpm install --frozen-lockfile` and `pnpm sim:fixtures` without changing the committed fixtures. The required `pnpm derive` second-machine check remains blocked because `data/raw/` is intentionally gitignored and was absent from the clean checkout; repeat it on Node 24 with the approved raw Olist data available locally.

**Network follow-up:** `fonts.googleapis.com` now responds from an unrestricted shell, so the former font error was sandbox DNS isolation. Retrying `pnpm --filter web build` outside that sandbox then reached Turbopack but failed while its CSS worker tried to bind a local port (`Operation not permitted`); this is an execution-environment limitation, not a source error. The Vercel `mazal` dashboard was rechecked: it still has no production or preview deployment and no Git repository connected. Do not connect a repository or publish production from this integration branch without an explicit release decision.

**Node 24 follow-up:** Homebrew installed Node `v24.19.0`. With `PATH=/opt/homebrew/opt/node@24/bin:$PATH`, the MCP gate passes (36 tests, strict and Vercel-compatible typechecks), the root suite passes (132 tests), the root typecheck passes, and `next typegen` plus the web typecheck pass. The web production build reaches the same local Turbopack port restriction, confirming that Node version is not the blocker.

## 2026-08-09 11:34 BRT · E-agent (Joaquim) · produção Vercel e agente Deco
**Done:** MCP publicado em `https://mcp-cyan-gamma.vercel.app/mcp`, com Host allowlist e bearer somente nos secret managers. A Custom Connection `Mazal MCP` foi criada no Deco e vinculada exclusivamente ao agente `Mazal`; as instruções versionadas estão em `docs/deco-agent-instructions.md`. Smoke real no Studio concluiu `Enable Tool → Diagnose Campaign` em 113 ms, retornou `primary: null`, `secondary: []` e `suspectedCause: "none"`, e está registrado em Settings → Monitor → Chats como `Diagnóstico de campanha de anúncios` (Done, 11:34). O runbook foi atualizado sem segredos.
**Next:** iniciar o PRD do chat web somente quando D disponibilizar `apps/web`; antes disso, definir o secret manager e escopo de uma API key do agente para a integração servidor-a-servidor.
**Blocked / watch out:** não criar nem expor uma API key do agente no browser, Git ou documentação sem o destino servidor-a-servidor do `apps/web`; o bearer da conexão atual é separado e não deve ser reutilizado.

---

## 2026-08-09 11:18 BRT · E-agent (Joaquim) · corretivo final da rota pública MCP na Vercel
**Done:** substituído o `rewrites` por `routes` explícitas: `/mcp` encaminha para `/api/mcp.mjs` antes de `handle: filesystem`, sem `check`. O teste RED→GREEN fixa a ordem e percorre o destino público local até a recusa `401` do handler autenticado. Build limpo Vercel CLI 58.9.0 em Node 24.19.0 gera `api/mcp.func` e manifesta primeiro `^/mcp$ → /api/mcp.mjs`, sem `check`. Node 24: 36/36 MCP, 121/121 raiz, typecheck e diff check verdes.
**Next:** com autorização, fazer deploy e repetir o smoke remoto de `/mcp` sem bearer (401) e handshake autenticado.
**Blocked / watch out:** nenhum deploy foi feito. O `task-3-bundle-route-review.md` não rastreado já existia e não faz parte desta correção.

## 2026-08-09 11:08 BRT · E-agent (Joaquim) · corretivo de rota do bundle MCP Vercel
**Done:** `/mcp` agora reescreve para `/api/mcp.mjs`, o arquivo que a Function Vercel emite, e o Hono escuta exatamente esse caminho interno. TDD RED comprovou o antigo `/api/mcp`; GREEN simula o destino do rewrite sem bearer e recebe `401`, preservando o handshake autenticado com Host/Origin/bearer. Node 24: 36/36 MCP (strict + compat), 121/121 raiz, build Vercel 58.9.0 limpo e diff check verdes. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-3-bundle-route-report.md`.
**Next:** com autorização, fazer deploy e repetir o smoke remoto de `/mcp`.
**Blocked / watch out:** o manifest limpo resolve o arquivo por `check: true` e Function gerada, sem repetir a antiga regra explícita `.mjs`; nenhum deploy, segredo, pacote ou API pública foi alterado.

---

## 2026-08-09 10:58 BRT · E-agent (Joaquim) · handler HTTP nomeado da Function Vercel
**Done:** removido o `default` Web handler ambíguo do bundle MCP; a Function exporta `GET`/`POST`/`DELETE` nomeados que delegam ao Hono testável. RED→GREEN no artefato comprova ausência de `default` e `POST` sem bearer = 401. Node 24: MCP 36/36 (strict/compat), raiz 121/121, typecheck, build Vercel limpo e diff check verdes. Relatório `.superpowers/sdd/2026-08-09-e-agent/task-3-named-handler-report.md`.
**Next:** fazer deploy de produção autorizado e repetir o smoke remoto em `/mcp`.
**Blocked / watch out:** nenhum deploy, segredo, rota pública, tool, auth ou `packages/*` foi alterado.

## 2026-08-09 10:43 BRT · E-agent (Joaquim) · bundle autocontido do MCP na Vercel

**Done:** corrigido o `ERR_MODULE_NOT_FOUND` de produção sem tocar em `packages/*`: a Function agora é um bundle ESM esbuild Node 24, criado por build command versionado a partir do handler testável em `src`. O Build Output limpo contém somente `api/mcp.func`, sem imports `@mazal/*` nem exports `src/index.ts`; o pacote isolado completa o handshake. Node 24: 35/35 MCP, checks estrito/compatível, build Vercel real, typecheck global e 120/120 global verdes. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-3-workspace-bundle-report.md`.

**Next:** fazer novo deploy de produção autorizado e repetir 401, handshake, `tools/list` e tool call remotos em `/mcp`.

**Blocked / watch out:** nenhum deploy ou segredo foi alterado nesta sessão. Um build Vercel local deve começar com `.vercel/output` limpo; a CLI 58.9.0 acumulou artefatos antigos quando a pasta já existia, simulando duas Functions até o rebuild limpo.

## 2026-08-09 10:26 BRT · E-agent (Joaquim) · gate estrito do build Vercel

**Done:** o gate de `apps/mcp` agora executa antes dos testes tanto `tsc -p tsconfig.json --pretty false` (a prova estrita de `z.output` compatível com `Diagnosis`) quanto o check `tsconfig.vercel-compat.json` que reproduz o builder Vercel. Nenhum schema runtime nem `packages/*` foi alterado. Node 24: 33/33 MCP, checks estrito/compatível, typecheck global e 118/118 global verdes; diff check verde. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-3-build-gate-fix-report.md`.

**Next:** com acesso autorizado, fazer deploy e executar o checklist remoto existente da Vercel/Deco.

**Blocked / watch out:** `pnpm typecheck` raiz continua sem incluir `apps/mcp`; manter `pnpm --filter @mazal/mcp test` como gate focalizado, que agora contém os dois modos TypeScript.

---

## 2026-08-09 10:20 BRT · E-agent (Joaquim) · corretivo do typecheck Vercel/Zod 4

**Done:** corrigida a falha de build da Function causada pela inferência do Zod 4 sob `strictNullChecks: false`, sem mudar o schema runtime nem `packages/*`. O bridge fica isolado na exportação de `diagnosisSchema`; o build strict normal mantém uma prova estática de compatibilidade com `Diagnosis`. Um typecheck de regressão equivalente ao builder roda antes dos testes MCP. Node 24: build Vercel real verde, 33/33 MCP, typechecks compatível/focalizado/global e 118/118 global verdes. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-3-build-fix-report.md`.

**Next:** com acesso autorizado, fazer deploy e executar o checklist remoto existente da Vercel/Deco.

**Blocked / watch out:** o comando focalizado sem `allowImportingTsExtensions` ainda acusa somente os imports `.ts` preexistentes de `packages/contracts`; o gate versionado herda corretamente essa opção do tsconfig raiz. `apps/mcp/.gitignore` foi gerado pelo Vercel CLI e permanece fora deste commit.

---

## 2026-08-09 02:55 BRT · E-agent (Joaquim) · corretivo do rewrite Vercel do MCP

**Done:** corrigido o HIGH do review do PRD 04: a Function Vercel agora monta o Hono autenticado em `/api/mcp`, destino interno do rewrite público `/mcp`. O teste de integração percorre a Function com Host/Origin/bearer e handshake Streamable MCP nesse caminho; RED foi `404`, GREEN é `200`. Node 24: 33/33 MCP, typechecks focalizado/global, 118/118 global, backtest e diff check verdes. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-3-fix-report.md`.

**Next:** com acesso autorizado, fazer deploy e executar o checklist remoto existente da Vercel/Deco.

**Blocked / watch out:** não há URL de produção nem evidência remota ainda; Host e Origin devem continuar allowlists exatas e o bearer fica apenas nos secret managers.

---

## 2026-08-09 02:50 BRT · E-agent (Joaquim) · entrypoint Vercel e runbook da conexão Deco

**Done:** parte versionável do PRD 04 implementada no commit que contém esta entrada: handler Hono importável em `api/mcp.ts`, rewrite HTTPS `/mcp` para a Vercel Function, Node `24.x` fixado e runbook sem segredos para a Custom Connection “Mazal MCP”. TDD comprovou o limite Vercel local; 33/33 MCP e 118/118 global passaram em Node 24, com typechecks focalizado/global, backtest, JSON e diff checks verdes. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-3-report.md`.

**Next:** com acesso autorizado às contas, configurar secrets/allowlists na Vercel, fazer o deploy e executar o checklist remoto em `docs/mazal-mcp-vercel-deco.md` antes de criar o Agent do PRD 05.

**Blocked / watch out:** URL de produção, `401` remoto, handshake, `tools/list`, tool call, Custom Connection e Monitor continuam pendentes; todos exigem conta Vercel/Deco e nenhum token foi criado, solicitado ou usado nesta sessão. O typecheck raiz ainda não inclui `apps/mcp`, então manter o gate focalizado.

---

## 2026-08-09 02:40 BRT · E-agent (Joaquim) · corretivo HIGH/MEDIUM do MCP

**Done:** removido o singleton de `InMemoryActionLog`: cada `McpServer`/request autenticada recebe log novo, comprovado por teste HTTP cruzando dois `execute_plan`. A réplica Zod 4 agora exige `price > 0` e ao menos um `paymentMethod`; 32/32 MCP e 117/117 global passaram em Node 24, com typechecks focalizado/global e diff check verdes. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-2-fix-report.md`.

**Next:** executar o PRD 04 de deploy/conexão Deco sem alterar a superfície dos quatro tools.

**Blocked / watch out:** o LOW conhecido permanece: `pnpm typecheck` raiz não inclui `apps/mcp`, portanto manter também o typecheck focalizado. O log continua intencionalmente volátil por request e a execução é somente simulada.

---

## 2026-08-09 02:29 BRT · E-agent (Joaquim) · quatro tools MCP determinísticos

**Done:** PRD 03 implementado no commit que contém esta entrada: `diagnose_campaign`, `predict_campaign`, `build_recovery_plan` e `execute_plan` são os únicos tools públicos. Benchmarks são injetados no servidor, respostas numéricas vêm diretamente do engine, e execução aceita somente ações `mazal`, grava em memória e retorna recibo SHA-256 canônico. TDD em Node 24 registrou três REDs e terminou com 29/29 no MCP e 114/114 global; typechecks focalizado/global e `git diff --check` verdes.

**Next:** executar o PRD 04 de deploy/conexão Deco sem alterar a superfície de quatro tools.

**Blocked / watch out:** `apps/mcp` precisa de Zod 4 para o SDK MCP 2.0 publicar JSON Schema em `tools/list`; Zod 3 executa `tools/call`, mas quebra descoberta. O log é intencionalmente volátil por processo e o typecheck raiz ainda não inclui `apps/mcp`, então o gate focalizado continua obrigatório. Relatório: `.superpowers/sdd/2026-08-09-e-agent/task-2-report.md`.

## 2026-08-09 02:15 BRT · E-agent (Joaquim) · validação Node 24 do scaffold MCP

**Done:** Node `v24.19.0` foi instalado localmente e validou o scaffold em `0dae69d`: `pnpm --filter @mazal/mcp test` (11/11), typecheck focalizado do MCP, `pnpm typecheck` e `pnpm test` (14 arquivos, 96/96). O teste de integração já confirma que `mazal.vercel.app`, quando incluído na allowlist exata, atravessa Host/Origin/bearer e completa o handshake MCP com 200.

**Next:** confirmar o corretivo na revisão final e então iniciar o PRD 03, expondo apenas as quatro tools determinísticas.

**Blocked / watch out:** o typecheck raiz não inclui `apps/mcp`; o typecheck focalizado é verde e obrigatório. Ampliar esse gate global é melhoria de configuração separada, não bloqueio funcional do scaffold.

## 2026-08-09 02:11 BRT · E-agent (Joaquim) · correções do review do scaffold MCP

**Done:** achados HIGH/MEDIUM do review corrigidos em `0dae69d` (`fix(mcp): secure deployment transport gates`). O endpoint aceita apenas hosts/origins exatos configurados por `MAZAL_MCP_ALLOWED_HOSTS`/`MAZAL_MCP_ALLOWED_ORIGINS`, autentica antes de parsear JSON e compara bearer tokens por digests SHA-256 fixos. Host/Origin fora da allowlist seguem em 403; JSON malformado sem bearer ou com bearer incorreto recebe 401. Testes focalizados: 11/11; suíte global: 96/96.

**Next:** em Node 24, executar teste MCP, typecheck focalizado/global e smoke de handshake com Host de deploy; só então marcar o PRD 02 concluído.

**Blocked / watch out:** esta máquina só tem Node `v22.22.3`; o PRD permanece pendente. `pnpm typecheck` raiz ainda não inclui `apps/mcp`; o typecheck focalizado passou, e o gate global não foi alterado porque o escopo desta correção exclui a configuração raiz.

## 2026-08-09 01:56 BRT · E-agent (Joaquim) · scaffold MCP seguro

**Done:** `apps/mcp` criado e commitado em `457bbd8` (`feat(mcp): scaffold secure MCP server`). O endpoint Hono `/mcp` é stateless, cria um `McpServer` por request com `@modelcontextprotocol/server@2.0.0`, exige `Authorization: Bearer <MAZAL_MCP_BEARER_TOKEN>` e devolve 401 sem expor token em token ausente/incorreto. A factory aceita `registerTools(server)` para o PRD seguinte. Teste de integração cobre handshake autorizado, duas recusas e instância nova por request; `pnpm --filter @mazal/mcp test`, typecheck focalizado, `pnpm typecheck` e `pnpm test` passaram (89 testes globais).

**Next:** implementar os quatro handlers reais pelo ponto `registerTools` no próximo PRD, sem mover números para LLM.

**Blocked / watch out:** a máquina local é Node 22, enquanto `apps/mcp` declara Node >=24; tudo passou com aviso de engine, mas a validação final deve ocorrer no Node 24. O adapter Hono preserva proteção contra DNS rebinding, então testes HTTP locais devem enviar `Host: localhost`. Relatório detalhado: `.superpowers/sdd/2026-08-09-e-agent/task-1-report.md`.

## 2026-08-09 01:42 BRT · E-agent (Joaquim) · pacote de PRDs

**Done:** plano aprovado e commitado em `3b15884`; onze PRDs autocontidos criados em `docs/prds/e-agent/`, cobrindo fixtures, MCP, Deco, narração, chat, demo, pitch, Meta read-only e writes futuros.

**Next:** executar `docs/prds/e-agent/01-demo-fixtures.md` com A/B e iniciar `02-mcp-scaffold.md` na branch de E sem esperar o frontend.

**Blocked / watch out:** PRD 01 permanece dependência externa; PRD 07 só começa quando D integrar `apps/web`; PRD 10 é stretch e não entra antes do caminho de demo estar congelado.

## 2026-08-09 01:33 BRT · E-agent (Joaquim) · planejamento de MCP, Deco e demo

**Done:** auditoria completa do brief de E, decisões de arquitetura fechadas com o responsável e plano salvo em `docs/superpowers/plans/2026-08-09-e-agent.md`. Branch `joaquim/feat/agent-mcp` criada a partir de `main`; nenhuma implementação iniciada.

**Next:** obter aprovação do plano e então gerar os onze PRDs autocontidos na ordem de execução.

**Blocked / watch out:** as duas fixtures de demo atuais retornam diagnóstico saudável e plano vazio; A/B precisam substituí-las. `apps/web` ainda depende de D. A branch `stage` não existe no clone/remoto e o destino de integração precisa ser decidido pelo time.

## 2026-08-08 14:12 BRT · C-agent (ingest & contracts) · SAT-A handoff

**Done:** `packages/contracts` complete (metrics + frozen types + tests), `packages/ingest` complete (`parseMetaCsv`, `parseEventLog`, `productCardSchema` + tests). Monorepo scaffolded.

**Next:** C moves to frontend to assist D with CSV upload integration. B unblocks data (`benchmarks.json`). A starts `packages/engine`.

**Blocked / watch out:** Commit working tree to `stage` branch before pushing.

---

## Who is who

| Letter | Person | Brief |
|---|---|---|
| A — engine | Miguel | [`plan/A-engine.md`](plan/A-engine.md) |
| B — data & simulator | Guilherme | [`plan/B-data.md`](plan/B-data.md) |
| C — ingest & contracts | Mateus | [`plan/C-ingest.md`](plan/C-ingest.md) |
| D — frontend | Bringel | [`plan/D-frontend.md`](plan/D-frontend.md) |
| E — agent, deco, pitch | Joaquim | [`plan/E-agent.md`](plan/E-agent.md) |

---

## 2026-08-09 01:30 · Guilherme · peer comparison, and a SECOND contract change

**Mateus: this is the second time `packages/contracts` has changed without you.** Both additive, both announced, neither approved. Say if you want them shaped differently or gone.

```ts
export type SellerLever, SellerBenchmark, SellerLeverName,
              LeverReplication, SellerBenchmarkTable, CardFinding   // all NEW
```

Nothing existing changed. `Verdict.limitingFactor` from the earlier entry is the other one.

**Done:** a second capability, arrived at by grilling the direction first rather than building on an assumption. `diagnose` asks what broke in a campaign; **`profileCard(card, sellerBenchmarks)` asks what is different about this store compared to the stores it competes with.** Separate export, not a third `ReferenceMode` arm — a `Finding` needs a funnel stage and none of these belong to one.

`pnpm derive` gains a seller pass writing `packages/data/seller-benchmarks.json`. A seller is scoped to one category, because the same shop sells brooms and headphones and is a different competitor in each. Two gates: percentiles need 20 qualifying sellers (≥10 sales, ≥5 reviews each) and reach **22 of 62** categories; quartile comparison needs 30 so a quartile is more than four shops, and reaches **18**. Below a gate `profileCard` returns nothing rather than something thin.

### The finding, and a correction to it

**One lever replicates. Four do not.** Better-reviewed sellers promise shorter delivery in **16 of 18** categories, median 7% less. `price` agrees in 11 of 18; `freightRatio`, `photos` and `descriptionLength` agree in **9 of 18**, which is a coin flip.

**I got this wrong first.** An early read of three categories said freight ratio was the lever, and it was an artifact of the sample. Anyone quoting that from a conversation should use the table in [`peer-comparison.md`](peer-comparison.md) instead.

Delivery ETA is a product-layer variable, invisible in Ads Manager, and it is what `eta_shock` already diagnoses in-campaign. The pre-flight and the in-flight answer point at the same lever, which is the thesis arriving on its own out of the seller data.

**Nobody can see a competitor's campaign numbers.** Meta exposes creative, never performance. Sellers are ranked on mean review score, which is a proxy and is labelled one everywhere. Order volume was rejected as the outcome because top-reviewed sellers have *fewer* orders in every category measured — ranking on it would have inverted the question.

### Two engine bugs fixed on the way

**`thin_pdp` was the fallback for any unexplained stage-3 break**, so a seller with eight photos and nine hundred characters was told their page was thin. It now requires the card to sit at or below the category's lower quartile. Worth knowing: Olist barely separates good sellers from bad on photos — 1.79 against 1.93 — so the evidence for that fault existing at all is weak in this data.

**Cause attribution answered from the pattern before it read the card.** A pixel break and a thin page look identical in the numbers, so every stage-3 break severe enough to zero out purchases was claimed as a tracking break. Precedence is now explicit event, then card evidence, then pattern — and `pixel_break` measures "near zero" against the reference rather than in sigmas, because `atcRate`'s spread is wide enough that a twentieth of reference is only 1.4 sigma down. **`pixel_break` recall 96% → 100%.** Top-1 unchanged at 59%.

**Next:** slide 7 gets one line — *"we can tell a seller what the sellers beating them do differently, from public data, with no integration"* — and the number is **delivery, not shipping cost**. Slide 6 stays the backtest; an unvalidated capability does not belong on the accuracy slide.

**Blocked / watch out:** `apps/web` and `apps/mcp` still do not exist. `pnpm test` 92 passing across 15 files, `pnpm typecheck` clean, every generator byte-reproducible.
## 2026-08-09 00:20 · Bringel · apps/web is redesigned, reviewed and merging to stage

**Done:** the screen is built and rebuilt. `feat/apps-web` carries eight commits from `ecd1785`
to `e3a6c6f`, branched off `stage`, with `main` merged in at `4049c47`.

Everything `D-frontend.md` lists is on screen and reading from the contract: the seven-stage
funnel with the media │ produto rule between 2 and 3, the finding card printing `Distribution.n`
and the `rule` id, the daily chart with the change point, the plan panel with the `actor` split,
the counter, the chat sidebar shell, and the four route handlers. One route, no navigation.

The look is not a dashboard. It is a Brazilian transactional document — the second via of an
issued opinion, on autocopiativo paper, struck in impact ink, with the verdict stamped across the
header. That decision and its reasoning are recorded in `apps/web/PRODUCT.md` and in an HTML
comment at the top of the rendered page, so it survives the build and the next owner.

**Checks at merge:** `pnpm test` 85 passing across 13 files, root typecheck clean, `apps/web`
`tsc --noEmit` clean, zero horizontal overflow at 390px.

**Next:** deploy to Vercel. It is a SAT-A deliverable and it is the one thing on my brief that is
not done, because it needs an account I do not have. Whoever has the Vercel org should run it;
the app is a stock Next 16 App Router build with no env vars.

**Blocked / watch out:** four things.

- **`buildPlan().projected` is real now, and it is not plausible.** Both demo fixtures return
  `{p10: 0.67, p50: 4.39, p90: 28.13}` — the same band, byte for byte, for `thin_pdp` and for
  `eta_shock`. It is kept off the screen for that reason, not because it used to be zeroed. If
  you wire it up because "it has values now", you put a 28× ROAS on a sheet whose entire argument
  is that every number is auditable. Miguel: this is probably worth ten minutes.
- **`Verdict.limitingFactor` is good and I am not rendering it.** "atcRate is at 34% of the
  category median" is exactly the sentence the deck wants, but the engine emits it in English and
  the sheet is pt-BR, and the same fact is already printed in three audited places. If it becomes
  a locale key or an enum of factor names, I will put it on the header in five minutes.
- **`predict` returns `launch_small` for the pre-flight case while the product's headline promise
  is "don't launch".** The UI no longer disagrees with the engine — `verdictStamp` reads
  `verdict.decision` rather than deriving it — but the disagreement moved rather than closed.
  Miguel and Joaquim: the deck and the engine need to say the same thing before the projector.
- **The demo fixtures.** My 21:42 entry reported both returning `primary: null`. Guilherme's
  `feat/peer-market-profile` (`9c32500`, "demo fixtures that work, and a check that they do") is
  not on `stage` yet. Until it is, `apps/web` renders its own deterministic series — same
  contract types, same metric functions, so the swap is a one-file change in `lib/fixtures.ts`.

---

## 2026-08-08 22:55 · Guilherme · Verdict.limitingFactor merged without C's sign-off

**Mateus: read this one.** `packages/contracts` changed and you did not approve it. That is a deliberate call, not an oversight, and it is written down here so it cannot be discovered later.

```ts
limitingFactor?: string;   // added to Verdict
```

**Why it went in anyway:** it is optional, so nothing that already builds a `Verdict` breaks; `AGENTS.md` calls adding an optional field cheap; it was announced in this log and in [#11](https://github.com/guilopeszw/mazal/pull/11) before it was pushed; and `docs/acceptance.md` claim 8 cannot be met without somewhere to put "the specific factor dragging the band down" — the only existing prose slot is `killTrigger`, which is set for one decision of three, so a `dont_launch` could name no reason at all.

**It is reversible in one line.** Delete the field and `predict` stops setting it. If you want it gone, or want it shaped differently — an enum of factor names rather than a sentence would be the obvious alternative, and better for D — say so and it changes. What must not happen is the deck claiming a named factor that the type cannot carry.

**Everything A and B own is now merged and green on `stage`** (`d78e8e7`): `pnpm test` 85 passing across 13 files, `pnpm typecheck` clean, `pnpm sim:eyeball` green, and `pnpm derive`, `pnpm sim:fixtures` and `pnpm sim:backtest` all byte-reproducible from a cold install.

Held-out, n=100: **top-1 59.0%**, top-2 59.0%, false alarms 12.0% on 25 healthy campaigns, against an always-healthy floor of 25.0%. Change points named on 100% of detected breaks, within a day on **93% of sudden breaks and 0% of gradual ramps** — reported separately because the 70% average lies in both directions.

**Next:** `apps/web` and `apps/mcp`. Neither exists. Everything they import is real, merged and measured.

**Blocked / watch out:** three things, none of them code A or B can write.

- **`stage` → `main`.** `main` is now 15 behind and has no engine, no simulator and no backtest. It is the build that gets cloned cold.
- **SUN-B's second-machine check.** Clone `stage` elsewhere, `pnpm derive && pnpm sim:fixtures`, confirm `git status` is clean. Until someone has, the deck says *"reproducible from fixed seeds"*, not *"on any machine"* — [`slide-6.md`](slide-6.md) is already worded that way.
- **A's own SUN-B item**: sit with E and check every narration line traces to a real `Finding` field. If E's script says something the engine cannot produce, one of them is wrong, and it is better to find that out tonight than at 19:00 tomorrow.

---

## 2026-08-08 22:20 · Guilherme · CONTRACT CHANGE, and the last three engine gaps

**Announcing a change to `packages/contracts` before it is pushed, as `AGENTS.md` requires.** It is an optional field, which the same file calls cheap — nothing that already builds a `Verdict` breaks — but Mateus owns that file and this is the announcement.

```ts
export type Verdict = {
  decision: 'launch' | 'launch_small' | 'dont_launch';
  predictedRoas: { p10: number; p50: number; p90: number };
  breakEvenRoas: number;
  killTrigger?: string;
  limitingFactor?: string;   // NEW
};
```

`docs/acceptance.md` claim 8 asks every verdict to carry *"the specific factor dragging the band down"*, and the only prose slot was `killTrigger`, which is set for one decision of three. **A `dont_launch` could name no reason — the verdict that most needs one.**

**Done:** the three gaps between `packages/engine` and the ten claims, all found by reading `acceptance.md` against the code rather than by a failing test.

**Claim 9 was failing outright.** `PredictInput.history` was never read, so *"`predict` without `history` returns a strictly wider band than the same input with history"* was simply false — and its demo beat, the band visibly narrowing once there is history, would have shown D two identical bands. History now shrinks the category prior toward what the account actually did: the centre moves by the weight of the evidence, the spread contracts by its square root. Under seven days nothing moves at all, because a band that narrows on two days is the false precision claim 9 exists to rule out. Concretely: **width 4.04 with no history, 2.40 with thirty days.**

**Claim 10 had nothing to update.** `RecoveryPlan.projected` was three zeros. ROAS is a product of its factors, so restoring the named stage from `observed` to `reference` scales the band by that ratio — the decomposability `predict` uses to name a factor, run backwards. Capped at 4x, because a stage at zero would otherwise project an infinite recovery. **D can render the plan panel now.**

**A bug in the brief, worth knowing about.** `A-engine.md` writes `ROAS = (ctr x atcRate x icRate x cvr x aov) / cpc`, but the contract defines `cvr` as purchases/clicks — which already contains `atcRate` and `icRate`. Multiplying all three double-counts the funnel and puts the band about three orders of magnitude low. It is `(cvr x aov) / cpc`, with `cpc` carrying the `ctr`. The other two remain as named factors, because a seller can still move them.

`limitingFactor` also declines to name a culprit when there is not one: an account at 99% of the median on its worst factor has nothing dragging it down, and saying otherwise puts a false claim on a seller's screen.

**Next:** nothing in `packages/engine` that the ten claims ask for. Stage 2 stays unimplemented on purpose — it needs analytics most sellers do not have.

**Blocked / watch out:** `pnpm test` 83 passing, `pnpm typecheck` clean, backtest unchanged at 59% top-1 — none of this touches `diagnose`.

**Mateus: the `Verdict` change is yours to accept or reject.** If it is rejected, claim 8 cannot be met as written, and the deck should drop the "named factor" half of that beat rather than fake it.
## 2026-08-08 21:55 · Guilherme · slide 6 written; B is done except a second machine

**Done:** [`docs/slide-6.md`](slide-6.md) — B's input to E's deck. The accuracy slide, the order to say it in, and an answer ready for the four questions a judge actually asks. It leads with the **floor**, not the headline: 59% sounds like a number until you know that answering "nothing is wrong" to everything scores 25% on this cohort, and offering that unprompted is what buys the rest of the slide. It names the failure before the strength — two classes at 0%, then `stockout` at 100%.

`pnpm sim:backtest` now **checks the slide against the numbers it just computed.** A slide cannot import a module, so the figures are quoted by hand and drift silently. Worth recording how that check went wrong first: the initial version asked whether the string appeared anywhere in the file, and it **passed with the top-1 row reading 71%**, because `59%` still appeared three times in the prose. A check that cannot fail is worse than no check, because it gets quoted as if it had passed. It anchors to the labelled table row now, and it was verified by breaking the slide on purpose and watching it fail.

**Next:** nothing for B that does not need another machine or another person.

**Blocked / watch out:** **B is finished.** `packages/data`, `packages/sim`, `packages/engine`, the backtest, the artefact and the slide are all on `stage` and green — 76 tests, typecheck clean, `derive`, `sim:fixtures` and `sim:backtest` all byte-reproducible.

Three things remain and none of them are code B can write:

- **SUN-B's second-machine check.** Clone `stage` elsewhere, `pnpm derive && pnpm sim:fixtures`, confirm `git status` is clean. Until someone has, the deck says *"reproducible from fixed seeds"* and not *"reproducible on any machine"* — [`slide-6.md`](slide-6.md) already words it that way.
- **`stage` → `main`.** `main` is 11 behind and has no engine at all. It is the build that gets cloned cold.
- **`apps/web` and `apps/mcp` do not exist.** Bringel and Joaquim have pushed nothing, and the freeze is Sunday 19:00. This is now the whole risk: there is a working engine, a working simulator and a measured number, and nothing a judge can look at.

**Calibration curves are cut, deliberately.** `B-data.md` ranks them below the confusion matrix and they were the first thing to go.

---

## 2026-08-08 21:42 · Bringel · apps/web exists — and both demo fixtures diagnose as healthy

**Guilherme: the second half of this entry is yours, and it is more urgent than anything in `apps/web`.**

**Done:** D's first commit, `ecd1785` on `feat/apps-web` off `stage`. Next.js 16.3 App Router,
one route, the seven funnel stages rendering from a hand-written `Diagnosis`. `pnpm test` 76
passing, root `pnpm typecheck` clean, `next build` green, and the page prints `62` from a
runtime `OLIST_CATEGORIES.length` — the wiring is proven by a value, not by a type that erases.

### The thing that needs someone else

**`diagnose` returns `primary: null` for both committed demo fixtures, in both reference
modes.** Not "wrong stage" — healthy. On today's build the demo screen has no red stage, no
finding card, no plan and no counter, for either case.

| fixture | injected | atcRate pre → post | `diagnose` |
|---|---|---|---|
| `demo-case1` | `thin_pdp` | 3.30% → 3.51% | `primary: null`, `suspectedCause: 'none'` |
| `demo-case2` | `eta_shock` @ 2026-07-18 | 3.85% → **4.55%** | `primary: null`, `suspectedCause: 'none'` |

Case #1 is the −1.0 threshold miss the entry below already discloses: −0.83 sigma against an
`atcRate` prior whose IQR runs 4.5–12%.

**Case #2 is a different failure and is not written down anywhere.** The `eta_shock` did not
deform the funnel at all. Add-to-cart, conversion and ROAS all *rose* after the injection date;
`icRate` fell on 17 add-to-carts versus 15, which is integer noise on a campaign averaging one
add-to-cart a day. The `StoreEvent` says `supplier ETA 23d → 39d` on the 18th and nothing
downstream of it moves. There is no change point in the series to find, so no threshold change
rescues this one — it is the generator or the seed, not the engine.

`demo-script.md` §5 sells this case as *"add-to-cart went from 6.8% to 0.4% overnight."* The
fixture is 3.9% → 3.9%. And `plan/README.md` says Case #2 is the one to save if only one can be
finished.

Reproduce, from the repo root:

```ts
const { diagnose } = await import('./packages/engine/src/index.ts');
const { benchmarks } = await import('./packages/data/index.ts');
const c = JSON.parse(readFileSync('packages/sim/fixtures/demo-case2.json', 'utf8'));
diagnose({ days: c.days, card: c.card, events: c.events,
  reference: { kind: 'benchmark', table: benchmarks } });   // → primary: null
```

I did not touch `packages/sim` or `packages/engine`, and I am not going to. Two fixes exist and
both are someone else's: reseed the two demo cases from a fault the engine actually catches, or
fix whatever let a labelled `eta_shock` ship with a flat funnel. The second one is worth a look
regardless of the demo — if a labelled campaign can carry no signal, some fraction of the 400-
campaign cohort is unlabelled noise and the 59% is measured against it.

**`buildPlan` returning `projected: {p10: 0, p50: 0, p90: 0}` is noted and the projection stays
off screen**, per the entry below.

**Next (mine):** SAT-B against my own mock — finding card, daily chart with the change point,
plan panel with the toggles and the three controls, chat sidebar shell, then the four route
handlers. `D-frontend.md` says never to wait on another package and I am not waiting on this
one; the mock is written to `demo-script.md`'s numbers, which is how the screen has to look
whoever fixes the generator.

**Blocked / watch out:** three small ones, all in `apps/web`'s corner.

**I edited one root file and it was not optional.** `apps/web` pulls `unrs-resolver` in through
`eslint-config-next`, and pnpm writes the literal string `unrs-resolver: set this to true or
false` into `pnpm-workspace.yaml` and then refuses to install until someone resolves it. Set to
`true`, matching `esbuild`. If you pull and `pnpm install` complains, that is why.

**`create-next-app` emits a nested `pnpm-workspace.yaml` inside `apps/web`.** It makes pnpm read
the app as its own workspace root, at which point `@mazal/contracts` is not in the workspace and
nothing resolves. Deleted in `ecd1785`; it will come back if anyone re-runs the scaffold.

**The root `pnpm typecheck` does not cover `apps/web`** — the root tsconfig includes
`packages/*` only. The app's check is `pnpm --filter web typecheck`. A green root is not a green
frontend, and I left the root tsconfig alone rather than widen a shared config on my own.

---

## 2026-08-08 21:40 · Guilherme · packages/engine exists — and the firewall did not hold

**Read this before anyone puts a number on slide 6.**

A could not work today, so B wrote `packages/engine`. That closes the critical path and it costs the one thing `AGENTS.md` says cannot be repaired retroactively.

### The disclosure, in the form it has to take on the slide

**The engine and the simulator were written by the same person.** `AGENTS.md`: *"Engine and simulator have separate owners who do not read each other's code… This is what makes the accuracy number mean something."* It no longer means what it was designed to mean.

Three things limit the damage, and they are worth stating rather than hiding behind:

- **The correspondence is specified, not invented.** The engine's cause-attribution table is in `docs/plan/A-engine.md` and the simulator's fault table is in `docs/plan/B-data.md`. Both were written before either package existed. An engine faithful to one scoring well against a simulator faithful to the other is the design working, not the author cheating.
- **No threshold was tuned to fit.** The engine uses the brief's `-1.0` sigma and the brief's sample minimums, unchanged. Two fault classes score zero because of that and were left scoring zero — see below.
- **The firewall holds in the code.** `packages/engine` imports nothing from `packages/sim`; `grep` confirms it. Its fixtures are hand-built from the contract. What leaked is in one person's head, not in the import graph.

**The honest sentence for slide 6:** *"A dropped out, so the same person wrote the generator and the diagnoser. This is a wiring and sanity number, not an independent accuracy claim — and here is the floor it is measured against."*

### The numbers

| | held-out, n=100 |
|---|---|
| top-1 | **59.0%** |
| top-2 (stage-level) | **59.0%** |
| false alarm rate | **12.0%** on 25 healthy campaigns |
| always-healthy floor | 25.0% top-1 at 0% false alarms |

The floor belongs beside them every time they are quoted. A diagnoser that answers "nothing is wrong" to everything scores 25% on this cohort.

### Two classes score zero, and that is a real finding

`thin_pdp` and `price_too_high` are never caught. Both halve add-to-cart rate — 8% down to ~3.2% — and that is a deviation of **-0.86 sigma**, inside the brief's `-1.0` flag threshold. The cause is the *benchmark*, not the engine: `atcRate` is one of the five published priors and its IQR runs 4.5% to 12%, so the robust sigma is 5.6 points and a fault has to more than halve a rate to trip one sigma.

**This was left unfixed on purpose.** Moving the threshold to catch faults I wrote myself is exactly the contamination this entry is disclosing. It is A's call on the engine side, or it is an argument for measuring `atcRate` rather than shipping it as a prior.

### Two bugs the backtest found that no unit test would have

**`diagnose` averaged all thirty days.** A campaign that broke on day fifteen read as half healthy: a stockout scored `-0.16` sigma over thirty days and `-1.41` over the last seven. It reads a seven-day trailing window now. That single change moved top-1 from 24% to 50% — *below* the always-healthy floor to twice it.

**The pixel-break rule could never fire.** It required stages 3, 4 and 5 to flag together, but when add-to-carts collapse there are fewer than thirty left to judge stage 4 on, so the stage silences itself. It tests media-healthy plus 3 and 5 broken, and defers to the event log because a stockout looks identical from the numbers alone.

**Three bugs found and fixed before merge**, all by reading the brief against the code rather than by a failing test:

- **`ReferenceMode: 'self'` was never implemented.** `diagnose` read the benchmark table and nothing else, so an in-flight call found no reference, flagged nothing and returned `suspectedCause: 'none'`. Not an error — a confident *"your campaign is healthy"* for every caller using the in-flight arm. Both modes share one code path now.
- **`spread()` is floored at a tenth of the median.** A baseline that barely moved has an IQR near zero, and dividing by it returned a guarded zero that flagged nothing — self mode called a campaign healthy whose add-to-carts had fallen by two thirds.
- **`Finding.evidence` was never set**, which cost the demo its best sentence. An event attaches when it matches the broken stage *and* lands within a day of the change point. Change points scan three days and report the window's **first** day: a trailing window cannot cross until it has filled with broken days, so dating the break at the window's end puts it two days late and the explaining event never lines up again.

Backtest unchanged at 59% — these paths are orthogonal to benchmark scoring and nothing was tuned against the cohort. Evidence attaches on 28 of 180 sampled campaigns; of the five fault kinds that emit an event, that is the demo line firing when the dates agree.

**Next:** `apps/web` and `apps/mcp`. `diagnose`, `predict` and `buildPlan` are all real and importable, and the in-flight arm now works, so Bringel and Joaquim are unblocked on everything.

**Blocked / watch out:** the 12% false-alarm rate is three healthy campaigns in twenty-five, and `B-data.md` is right that it is the first thing a judge who has shipped monitoring will ask about. It is a floor measured on a cohort a quarter healthy, which is nothing like a real account — quote the denominator.

`buildPlan` returns `projected: { p10: 0, p50: 0, p90: 0 }`. The plan's projected recovery is not modelled; the actions and their expected effects are real. Do not put the projection on screen.

---

## 2026-08-08 20:40 · Guilherme · the backtest runs; B has nothing left that the engine does not gate

**Done:** `feat/sim-backtest`, in a PR against `stage`. The backtest was never fully blocked — only the `diagnose` *call* was.

**`runBacktestWith(campaigns, diagnose)` takes the diagnoser as a parameter.** The whole pipeline is built, wired and running today. It also turns the A/B firewall into a property of the types rather than a promise: `backtest.ts` cannot reach into `packages/engine` because it does not know what the engine is. `docs/contracts.md`'s `runBacktest(campaigns)` arrives as a three-line wrapper the moment `diagnose` does; `packages/sim/README.md` has it written out.

**`pnpm sim:backtest` runs the fixed 400-campaign cohort now**, against an always-healthy diagnoser. That is deliberately **not a result** and the script says so in the output. It is the floor: on a cohort one quarter healthy, answering "nothing is wrong" every time scores **25% top-1 at a 0% false-alarm rate**. Any real diagnoser below 25% is worse than silence, and both numbers belong on slide 6 together.

**Running it at four hundred exposed a defect the five hand-made cases could not.** Round-robin over nine fault kinds gave `none` one ninth of the cohort — **eleven** healthy campaigns in the held-out hundred, about fifteen points of standard error on the number `B-data.md` says a judge asks about first. One campaign in four is healthy now: twenty-five held out, every broken class still lands 37–38, and the cohort check fails below twenty so it cannot drift back.

Held-out per-class counts are 9–10, which is noise — and is exactly why only the *aggregate* is reported for the held-out half and the confusion matrix comes from the training half at 28 per class. That was already the rule in `B-data.md`; it now has a reason attached.

**`packages/sim/README.md`** — what D and E can import today, the two fixtures, the three scripts, and the two caveats the deck must carry.

**Next:** nothing, for B, until `diagnose` exists. Then: swap one constant in `run-backtest.ts`, add the dependency, uncomment the wrapper. Minutes.

**Blocked / watch out:** **every remaining B deliverable is downstream of `packages/engine` and nothing else, and A has still pushed nothing.** There is no more work to bring forward — this entry is the end of what B can do alone.

The one exception is **SUN-B's second-machine check**, which is blocked on hardware rather than code: clone `stage` elsewhere, run `pnpm derive && pnpm sim:fixtures`, confirm `git status` is clean. It has never run, and it is the last unverified claim in B's brief.

---

## 2026-08-08 20:10 · Guilherme · main reconciled with stage; D and E named

**Done:** two things, both housekeeping, one of them overdue.

**D is Bringel and E is Joaquim.** The table above is filled in. Neither `apps/web` nor `apps/mcp` exists yet and neither has pushed a branch, so the two of them are starting from the scaffolding steps in [`plan/D-frontend.md`](plan/D-frontend.md) and [`plan/E-agent.md`](plan/E-agent.md).

Two things land on D immediately, both consequences of contract changes already merged:

- **The category field must be a `<select>` over `OLIST_CATEGORIES`, not a text input.** `productCardSchema` is `z.enum(OLIST_CATEGORIES)` now; free text fails validation.
- **Print `n` beside any benchmark shown to a seller.** Five of twelve metrics are priors at `n: 0`, and `photos`/`descriptionLength` bottom out at `n: 9` in six categories. [`benchmark-provenance.md`](benchmark-provenance.md) has the whole picture and the sentence slide 6 should carry.

For E: `diagnose` does not exist yet, so the MCP tools have nothing to wrap. `generateCampaign` and the two committed fixtures in `packages/sim/fixtures/` are real and importable today, which is enough to build and demo the tool surface against fixed data while A's package is still missing.

**`main` reconciled with `stage`.** `main` was 16 commits behind and `stage` was a strict superset of it, so this was a fast-forward-in-substance merge, not a reconciliation of two histories — nothing was dropped and nothing was rewritten. Said out loud before it happened, per `AGENTS.md`, and green when it did: `pnpm typecheck` clean, `pnpm test` 54 passing, `pnpm sim:eyeball` green on all four check groups.

Until now, cloning `main` cold — which is what `AGENTS.md` says `main` is *for* — gave a tree with no simulator, no `packages/data` wiring, `OlistCategory` collapsed to `string`, `z.string()` accepting any category, and the silent date guess. That is fixed.

**Next:** unchanged and still A's. `packages/engine` is the only thing on the critical path.

**Blocked / watch out:** the branch direction inverted once already this weekend, when #1 and #3 both merged into `main` while a PR was open against `stage`. It cost an afternoon of reconciliation. `<type>/<thing>` → `stage` → `main`, and **nothing merges into `main` except `stage`.**

---

## 2026-08-08 19:55 · Guilherme · everything B can do without the engine is done

**Read this entry and the one below it and you have all of B's state.**

**Done:** the last of B's unblocked work, on `feat/sim-scoring`. `pnpm typecheck` clean, `pnpm test` 54 passing, `pnpm sim:eyeball` green on all four check groups.

**`packages/sim/score.ts` — the backtest was only half blocked.** Scoring is a pure function of `(label, Diagnosis)` pairs, and `Diagnosis` is in the contract. It is written and checked against hand-made diagnoses. When `diagnose` exists, the remaining work is the handful of lines that call it and hand the pairs over. Keeping the split also makes the firewall structural: nothing in `score.ts` can reach into how the answer was made.

**`packages/sim/cohort.ts` — the 400 campaigns and the 100 held out are fixed now**, before anyone has seen a score. A split chosen after the first result is not a held-out set, it is a choice about which result to report. Round-robin over the nine kinds, so **the false-alarm rate will rest on 45 healthy campaigns — quote that denominator, not the percentage alone.**

**`docs/benchmark-provenance.md`** — which seven benchmarks are measured and which five are priors, with the sentence slide 6 should say. "Derived from Kaggle" is true of seven twelfths of that table.

**The nine uncovered categories are 0.16% of orders — 159 of 97,256.** `flowers` is the largest at 29 orders. **This closes the question, and it closes it in A's favour: `ReferenceMode` does not need a fallback arm for the demo.** The slide line is "62 of Olist's 71 categories, covering 99.84% of orders."

**`top-2` is redefined, and the deck must say so.** `B-data.md` asks for "the strongest secondary finding's implied cause", but `Diagnosis` carries one `suspectedCause` and a `Finding` carries a `causeLayer`, not a `FaultKind` — no finding has an implied cause to read, and reading it out of `packages/engine` is what the firewall forbids. `scoreOne` asks the computable version of the same question: **did it name the right stage?** A stockout called a thin PDP is a near miss — both break stage 3, and the seller is sent to the right part of the funnel. A stockout called a budget cap is not. The exact metric needs an optional `impliedCause?: FaultKind` on `Finding`; that is C's call and an announcement.

**Next — and it is one command, for whoever picks this up after `diagnose` lands:**

```ts
// packages/sim/backtest.ts — add "@mazal/engine": "workspace:*" to package.json first
import { benchmarks } from '@mazal/data';
import { diagnose } from '@mazal/engine';
import { generateCohort, score, splitCohort, formatConfusion } from './index.ts';

const { train, held } = splitCohort(generateCohort());
const pairs = held.map((c) => ({
  fault: c.fault,
  diagnosis: diagnose({ days: c.days, card: c.card, events: c.events,
    reference: { kind: 'benchmark', table: benchmarks } }),
}));
console.log(score(pairs));          // held-out: the reported number
// Show A the TRAINING confusion matrix only — never a per-class breakdown of `held`.
```

**Blocked / watch out:** **`packages/engine` still does not exist and A has pushed nothing all weekend.** Every remaining B deliverable — the accuracy number, the confusion matrix, the calibration check — is downstream of `diagnose` and of nothing else. There is no more B work to bring forward.

**`main` is 15 commits behind `stage`.** It is the build that gets cloned cold and it has no simulator, no contract fixes, `z.string()` for category and the silent date guess. `stage` is a strict superset and green. Needs announcing, then merging.

**SUN-B's second-machine check has never run.** Clone `stage` elsewhere, `pnpm derive && pnpm sim:fixtures`, confirm `git status` is clean. It cannot be done on this machine by definition.

---

## 2026-08-08 19:30 · Guilherme · the simulator is on stage; SAT-B and most of SUN-A done

**Done:** `packages/sim` is real and merged (`fa7be86`). `generateCampaign(seed, fault)` covers **all nine** fault kinds — SAT-B asked for three — and both demo fixtures are committed. `pnpm test` 54 passing, `pnpm typecheck` clean, `pnpm sim:eyeball` green across 360 campaigns, `pnpm sim:fixtures` byte-reproducible on a rerun. The plan is at [`superpowers/plans/2026-08-08-packages-sim.md`](superpowers/plans/2026-08-08-packages-sim.md).

`packages/sim` is test-exempt per `docs/testing.md`, so the check it carries is a script: `pnpm sim:eyeball` prints a series per fault and then asserts each one deforms the stages `B-data.md`'s table names **and no others**, over 40 seeds per fault. Writing that found three bugs that would each have poisoned the backtest quietly.

**`Math.round` collapsed the funnel for small advertisers.** A seller on R$60/day gets ~20 clicks, so ~1 add-to-cart, and `Math.round(1 × 0.45)` is 0 — thirty days of zero checkouts and zero purchases on a campaign labelled `none`. Every small advertiser in the training set would have been a false alarm, and the false-alarm rate is the number `B-data.md` says a judge asks about first. Stochastic rounding keeps the expectation at small counts.

**A blind squeeze did not survive the generator's own variance.** Campaigns draw their base rates at sigma 0.2–0.3, so scaling ATC by 0.4 left a high-drawing store above a low-drawing healthy one: a fault label on healthy numbers, teaching the engine that the fault sometimes does nothing. Faults now name the *rate they put the stage on*, whatever the base happens to be.

**Shipping was drawn from a second, independent price**, so a R$5 item could carry R$24 of freight. Olist holds those two as a ratio; there is one draw now.

**Next:** `runBacktest` — the file is specced in the plan's Task 6 and blocked on nothing but `diagnose`.

**Blocked / watch out:** **`packages/engine` does not exist and A has pushed nothing all weekend.** SUN-A wants a real accuracy number by 13:00 and it cannot exist until `diagnose` does. That is the escalation, and it is more urgent than anything left in this package.

**`top-2` cannot be computed exactly across the firewall.** `Diagnosis` carries one `suspectedCause` and `Finding` carries a `causeLayer`, not a `FaultKind`, so "the strongest secondary finding's implied cause" has no exact reading without opening `packages/engine`, which B may not do. Task 6 approximates it with the secondary's cause layer and the slide must say so. The clean fix is an optional `impliedCause?: FaultKind` on `Finding` — C's call, and an announcement.

**Frequency is now a simulated stage.** `creative_fatigue` is the only fault that moves it, and it is the only fault with two signals rather than one: a CTR that decays *without* the frequency climb is a creative that was never good, which is a different diagnosis. If the engine only reads CTR it will confuse the two.

---

## 2026-08-08 16:50 · Guilherme · #1 and #3 merged to main; #7 reviewed and fixed

**Read this entry alone and you have the whole picture.**

### Where the code is

**`main` is now six commits ahead of `stage`, which inverts the direction AGENTS.md sets.** #1 went `feat/packages/contracts` → `main` and #3 went `stage` → `main`, both merged while #7 was open, and `8988993` landed on `main` directly after. `stage` has not moved since `31bace6`. Nothing is wrong with the code on `main`; the flow is just running backwards, and the next `stage` → `main` will look like a revert unless `main` is merged down into `stage` first.

**`main` carries the *unfixed* contracts and ingest.** Everything the reviews found is fixed on `feat/integrate-contracts` and nowhere else: the build step, `OlistCategory = … | string`, `source` without `'prior'`, `productCardSchema` accepting any string as a category, and the silent date guess.

| PR | Head → base | State |
|---|---|---|
| [#7](https://github.com/guilopeszw/mazal/pull/7) | `feat/integrate-contracts` → `stage` | open, reviewed, fixed, green |
| [#6](https://github.com/guilopeszw/mazal/pull/6) | `test/benchmarks-shape` → `stage` | open, contained in #7 |
| #1, #3 | → `main` | merged |

#7 now contains `origin/main` in full, so merging it cannot revert anything. `pnpm test` 54 passing, `pnpm typecheck` clean, `pnpm derive` byte-reproducible.

### What the review changed

Two passes over #7 — one for over-engineering, one on the standards and spec axes — plus the fixes, in `aae224c`:

- **`normaliseDate('07/01/2026')` returned 7 January and said nothing.** `plan/C-ingest.md` asks it to reject rather than guess. Both readings are real dates so nothing rejects; it now returns the DD/MM reading *with a warning*, and only when neither number settles it. `packages/ingest/src/csv.test.ts` covers the four cases.
- **`LabelledCampaign` and `BacktestReport` were never written.** `contracts.md` lists them under `// packages/sim`; the engine's block was implemented in contracts and the simulator's was skipped. Added — B cannot type `runBacktest` without them.
- **`STORE_EVENT_TYPES`** joins `OLIST_CATEGORIES` as a runtime array with its union derived from it. `packages/ingest` had its own `z.enum` of the same seven strings.
- Dead code and duplication out of `packages/ingest`: net −45 lines, no behaviour change except that a US-format `1,240` used to become NaN and a warning, and now parses.
- `packages/ingest/README.md` documented `parseEventLog` returning `{ events, warnings }`. It returns `StoreEvent[]` and drops invalid rows silently, which the README now says.

**Left unfixed on purpose, all of them someone else's call:** `meta-csv.test.ts` inlines CSV literals in ten tests where `docs/testing.md` says fixtures live in files — C's suite, and a drift risk rather than a bug. `safeDiv` is exported while `contracts.md` declares it module-private and `testing.md` mandates asserting on it — the two documents disagree. And `packages/data/derive.ts` and `packages/ingest/src/csv.ts` are two hand-rolled CSV parsers, of which only `derive.ts`'s handles a quoted newline or a BOM.

**Next:** merge `main` down into `stage`, then #6, then #7. After that B goes to `packages/sim`, which is what the rest of B's weekend is.

**Blocked / watch out:** **D and E are assigned — the names are not in the table below yet, and whoever knows them should fill them in.** Both packages are still unstarted, the deadline is Sunday 23:59 with freeze at 19:00, and `apps/web` and `apps/mcp` do not exist.

**`apps/web`'s category field must be a select over `OLIST_CATEGORIES`, not a text input** — and nine real Olist categories are outside it, so `ReferenceMode` still needs an arm for a category with no benchmark row. That one is A's.

---

## 2026-08-08 15:55 · Guilherme · contracts and ingest integrated onto stage, on a branch

**This entry announces changes to `packages/contracts`, which AGENTS.md says are announced before they are pushed.** They are on `feat/integrate-contracts` and in a PR, not on `stage`. Mateus reviews before it merges — the type edits are his call and two of them are decisions, not fixes.

**Done:** #1's tree merged into a branch off `stage`, so **#1 itself is untouched** — no rebase, no force-push of someone else's branch. `pnpm test` 50 passing (was 9 + #1's 41), `pnpm typecheck` clean, `pnpm derive` byte-reproducible after all of it.

Resolutions, each one a decision someone can reverse:

- **`stage`'s root wins.** The three conflicts were `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, all config. `stage`'s root is `pnpm@11.5.1`, Node ≥24, root vitest, `pnpm derive`; #1's was six lines. `tsconfig.base.json` never conflicted — different filename — and is deleted along with `packages/{contracts,ingest}/tsconfig.json`, which only existed to configure a build.
- **No build step.** contracts and ingest now export `./src/index.ts` directly, `build` scripts gone, `.js` specifiers rewritten to `.ts`. Node 24 runs TypeScript natively and `packages/data` already relied on it. If `apps/web` turns out to need built packages, the cost there is `transpilePackages: ['@mazal/contracts']`, not a build step for the whole weekend.
- **`OlistCategory` is now the real 62-member union**, generated by `pnpm derive` into `packages/contracts/src/categories.ts` rather than `packages/data/`, so the contract stays the leaf every package imports. It ships a runtime `OLIST_CATEGORIES` array with the type derived from it, because a bare type erases and nothing downstream can validate against it.
- **`source` gained `'prior'`** and the five media priors now carry it. They said `kaggle_meta` and did not come from Kaggle.
- **`docs/PERSON-HANDOFF.md` is kept, not deleted** — it has an architecture overview this file does not. It now opens with a line saying this file is the state channel.

**Next:** Mateus reviews [#7](https://github.com/guilopeszw/mazal/pull/7). Merge order: #6, then #7, then #3 carries the lot to `main` in one review. After that B goes to `packages/sim`, which is now genuinely unblocked.

**Blocked / watch out:** Four things, two of them bugs that were being hidden.

**`docs/HANDOFF.md` on `feat/packages/contracts` has committed conflict markers** — `<<<<<<< HEAD` on line 1, `>>>>>>> b3fa8df` on line 227. An unresolved merge was committed as content. This branch resolves it to `stage`'s version; if #1 is ever merged by another route, that has to be fixed there too.

**`productCardSchema` was not validating category.** It had `z.string().min(1)` and typechecked against `OlistCategory` only because the union carried a `| string` arm that collapsed it to `string`. Any string passed — including a category with no benchmark row, which reaches the engine as a lookup that silently misses. It is `z.enum(OLIST_CATEGORIES)` now, and that is a behaviour change: input that used to validate now fails. **`apps/web`'s category field must be a select over `OLIST_CATEGORIES`, not a text input.**

**And nine real Olist categories are now rejected outright** — `derive.ts` skips anything under 30 orders, so `fashion_sport`, `la_cuisine`, `home_comfort_2`, `cds_dvds_musicals`, `flowers`, `arts_and_craftmanship`, `diapers_and_hygiene`, `fashion_childrens_clothes` and `security_and_services` never reach the union. They used to pass validation and then miss the benchmark lookup silently, so this trades a silent wrong answer for a loud refusal, which is the better failure — but a seller in one of them has no path through the form at all. **The missing piece is A's: `ReferenceMode` has no arm for a category with no benchmark row.** Either the engine falls back to `{ kind: 'self' }` for these nine, or the demo says out loud that Mazal covers 62 of Olist's 71 categories. Do not fix it by lowering `MIN_ORDERS` — quartiles over nine products are noise either way.

**`noUncheckedIndexedAccess` had never been applied to #1's code.** `stage`'s root tsconfig sets it; `tsconfig.base.json` did not. It surfaced ~25 sites in `packages/ingest` and two in `packages/contracts/src/metrics.ts`. Every one was provably safe under a guard already present, so the fixes are `!` and two rewrites to `??` and `.at(-1)`. Nothing about the parsing changed, and all 41 of C's tests still pass — but they are edits in C's package, made by B, and they are what most needs a second pair of eyes in review.

**`packages/data/index.ts` casts rather than `satisfies`.** A JSON import widens every string literal, so `source` arrives as `string` and never assigns to the union — `satisfies BenchmarkTable` cannot compile, on any correct table. The checking moved to `benchmarks.test.ts`, which reads the real file. The one compile-time check that does survive is in that test: assigning the raw JSON to `Record<OlistCategory, unknown>` fails if `derive.ts` ever writes a table missing a category the union declares.

---

## 2026-08-08 15:00 · Guilherme · benchmark table has a test; thin-sample metrics found

**Done:** Two of the gaps from the entry below are closed, both inside `packages/data`, neither touching `packages/contracts`.

`derive.ts` is byte-reproducible on a rerun — `pnpm derive` against the same `data/raw/` leaves `git status` clean. That is same-machine determinism only; SUN-B asks for a second machine and that has still never happened.

`packages/data/benchmarks.test.ts` asserts the committed output: 62 rows, twelve metrics each, `p25 ≤ median ≤ p75`, every distribution finite, `source` in the union, priors at `n: 0` and measurements above it. `pnpm test` 9 passing, `pnpm typecheck` clean (`b02e938`).

**Next:** Unchanged and still a human's — decide #1's base and the build-step question, merge #3 then #1. Everything B has left (`OlistCategory` into the contract, `index.ts` typed against `BenchmarkTable`, then `packages/sim`) imports `@mazal/contracts`.

**Blocked / watch out:** Writing the test found one thing, and it is the kind that reads fine until a seller sees it.

**`MIN_ORDERS` does not gate the two product-level metrics.** The threshold counts orders per category, but `photos` and `descriptionLength` are counted per distinct *product*. A category can clear 30 orders on nine products: `tablets_printing_image` quotes both metrics off `n: 9`, and `furniture_mattress_and_upholstery` off `n: 10`. Twelve metric-category pairs sit under 30, all of them one of those two metrics, and no other metric is affected — `aov`, `price`, `freightRatio`, `deliveryDays` and `reviewAvg` bottom out at 37.

They still ship. Dropping a metric would make it optional in `BenchmarkTable`, and that type is in review in #1; `n` is already in the JSON, so the decision belongs to whoever quotes the number. **Anything that shows a seller a benchmark reads `n` first** — that is A's engine and D's UI, and it is the same rule the `n: 0` priors already need, so it is one check covering both. The test pins the twelve as a known exception; it fails if the set changes.

---

## 2026-08-08 15:20 · Guilherme · session state, four open PRs, two collisions

Read this entry alone and you have the whole picture. **Nothing is merged by an agent; a human reviews and merges.**

### Where the code is

`stage` = `49113f2`: workspace scaffold, `packages/data` with 62 derived categories, branch policy. Green: `pnpm test` 5 passing, `pnpm typecheck` clean. `main` = `b3fa8df`, docs only, no code at all.

| PR | Head → base | State | What it is |
|---|---|---|---|
| [#1](https://github.com/guilopeszw/mazal/pull/1) | `feat/packages/contracts` → **`main`** | open, Mateus | `packages/contracts` and `packages/ingest`, v1 |
| [#3](https://github.com/guilopeszw/mazal/pull/3) | `stage` → `main` | open | The scaffold and the benchmarks, first review they have had |
| [#4](https://github.com/guilopeszw/mazal/pull/4) | `docs/conventional-commits` → `stage` | open | Conventional commits for messages and PR titles |
| #2 | merged | — | Branch-per-change policy |

### Two collisions to resolve before anything else is built

**Both PRs introduce a different root workspace.** #1 branched from `main`, so it never saw the scaffold on `stage`. Its `package.json` is `pnpm@9.15.4` with `scripts: { build: 'pnpm -r build', test: 'pnpm -r test' }`; `stage`'s is `pnpm@11.5.1` with vitest at the root, `engines: node >= 24`, and `pnpm derive`. Both bring their own `pnpm-lock.yaml`, and #1 also adds `tsconfig.base.json` beside `stage`'s `tsconfig.json`. Whichever merges second conflicts on all four files.

**Two module strategies.** `packages/contracts` in #1 builds with `tsc` and points `main` at `./dist/index.js`, so it must be built before anyone can import it. `packages/data` on `stage` has no build step — Node 24 runs the TypeScript directly and `exports` points at `./index.ts`. One of these has to give, and it decides whether the weekend has a build step at all.

Cheapest resolution, and it is a decision, not a fact: rebase #1 onto `stage`, keep `stage`'s root, keep contracts' `dist` build only if `apps/web` turns out to need it.

### What is wrong with what is already merged

- **The media priors have no citation.** `cpm`, `ctr`, `cvr`, `atcRate`, `icRate` in `benchmarks.json` are published medians for Brazilian retail written from memory. `n: 0` marks them as estimates, which is honest about *kind* but not about *provenance*. Before slide 6 claims rigour, either cite a source per number or say on the slide that five of twelve metrics are priors. The measured Kaggle values print on every `pnpm derive` run.
- **`source: 'olist' | 'kaggle_meta'` mislabels them.** Five metrics say `kaggle_meta` and did not come from Kaggle. #1 ships this union unchanged, so the moment to add `'prior'` is while #1 is still open.
- **`OlistCategory` in #1 is `'health_beauty' | ... | string`, which TypeScript collapses to `string`.** It type-checks anything, including a typo. The real 62-member union is generated at `packages/data/categories.ts` and needs wiring into the contract.
- **`packages/data/index.ts` exports `benchmarks` untyped.** Nothing checks the JSON against `BenchmarkTable`, so a missing metric surfaces in the engine at hour 30 rather than here. One `satisfies` fixes it once #1 lands.
- **No test asserts the shape of `benchmarks.json`.** The tests cover the CSV parser and the quantiles, not the output — 62 categories × 12 metrics is asserted by nobody.
- **`derive.ts` byte-reproducibility is unverified.** SUN-B requires identical output on a second machine and it has only ever run on one.
- **Two unvalidated modelling assumptions**, both in `derive.ts`: an order's category is its first item's, and `deliveryDays` is the promised ETA rather than the actual delivery.
- **Process cost.** The branch policy was written, merged, reverted, rewritten and re-merged inside an hour. That hour bought a real rule, and it came out of the build.
- **`docs/PERSON-HANDOFF.md` appears in #1.** Two handoff files means the state channel forks. Pick this one or that one before both are half-true.

**Next:** A human decides #1's base and the build-step question, then merges in the order #4, #3, #1. After that: wire `OlistCategory` and type `index.ts` against `BenchmarkTable`, then `packages/sim`, which is what B is actually here to build.

---

## 2026-08-08 14:55 · Guilherme · branch policy in review, bugs logged

**Done:** The stricter branch policy — every change on a branch, `stage` takes merges rather than commits — was merged straight into `stage` and then reverted back out (`a29550d`, `9e7a64d`). `stage` is byte-identical to `03032fc` again; nothing was rewritten. The policy is now a PR against `stage`, which is the point of the policy, and it waits for a reviewer.

**Next:** Someone other than Guilherme reviews and merges that PR. Then `packages/sim`, still blocked on `@mazal/contracts`.

**Blocked / watch out:** Bugs found so far this session, all fixed unless marked:

| What | Symptom | Fix |
|---|---|---|
| BOM in `product_category_name_translation.csv` | Every category lookup missed and the whole table collapsed to **one** category. The run reported success. | `parseCsv` strips it; test in `packages/data/derive.test.ts`. |
| Olist CSVs nested after unzip | `derive.ts` could not find files that were plainly there. | Indexes `data/raw/` and one directory below. |
| facebook-ad-campaign is not a media benchmark | 78.5M impressions against 13,293 clicks — 0.017% CTR, CPM 0.26 in an unstated currency. | Published BRL priors shipped instead, `n: 0`. Measured values printed every run. **Open decision, reversible in one constant.** |
| `stage/<thing>` branch names are impossible | `fatal: cannot lock ref ... 'refs/heads/stage' exists`. A ref cannot be both a file and a directory. | Branches are `<type>/<thing>` — `feat/`, `fix/`, `docs/`. This is what the PR changes. |
| `pnpm install` stalls silently | esbuild is an unapproved build script; install exits 0 having done nothing. | `allowBuilds: esbuild: true` in `pnpm-workspace.yaml`. |
| `tsconfig.tsbuildinfo` was committed | Build cache in git, conflicts on every pull. | `*.tsbuildinfo` gitignored, file removed from the index. |

The earlier entries in this log say `stage/<letter>-<thing>`. That naming does not work in git; read this row, not those.

---

## 2026-08-08 14:40 · Guilherme · benchmarks landed

**Done:** `packages/data` is real (`761f822`, on `stage`). Kaggle CSVs downloaded to `data/raw/`, `pnpm derive` run, `benchmarks.json` and `categories.ts` committed — **62 categories**, 9 skipped under 30 orders. `index.ts` exports `benchmarks`. `pnpm test` green (5), `pnpm typecheck` clean. **A and D are unblocked on data.**

Two bugs the real files exposed, both fixed: `product_category_name_translation.csv` carries a BOM that hid inside the first header name and collapsed the table to one category, and the CSVs live one directory down after an unzip.

**Next:** `packages/sim` — but it needs `@mazal/contracts`, which still does not exist. Until it does, the honest next action is Mateus's package, not B's.

**Blocked / watch out:** Three things.

**`packages/contracts` is still unpushed.** Everything B does next imports it. This is now the only thing on the critical path.

**The media metrics are priors, not measurements, and this is a decision someone can reverse.** `cpm`, `ctr`, `cvr`, `atcRate` and `icRate` ship as published BRL medians with `n: 0`. The facebook-ad-campaign dataset measures 78.5M impressions against 13,293 clicks — 0.017% CTR at 0.26 CPM in an unstated currency. Shipping that as a Brazilian retail benchmark loses the room to the first judge who buys media. `derive.ts` prints the measured numbers on every run; both belong on the slide.

**Ask C for a third `source` value before contracts freeze.** `source: 'olist' | 'kaggle_meta'` has nowhere honest to put a published prior — five of the twelve metrics are currently labelled `kaggle_meta` and are not from Kaggle. `'prior'` is a one-word addition now and an expensive rename after SAT-A.

Olist numbers to sanity-check against: `health_beauty` median price R$79.90, freight ratio 21%, promised ETA 23 days, review median 5, photos 1, n=9,670. `deliveryDays` is the *promised* ETA, not the actual delivery, and an order's category is its first item's.

---

## 2026-08-08 14:05 · Guilherme · branches, scaffold, derivation

**Done:** Two things.

Branch policy changed — **nobody pushes to `main` any more.** Work lands on `stage`, `main` takes a green `stage` at block boundaries. Rules in [`../AGENTS.md`](../AGENTS.md#branches), and `docs/plan/README.md` and `docs/testing.md` point at them (`b3fa8df`, on both branches). Long or cross-package work gets a `stage/<letter>-<thing>` branch off `stage`. Unattended sessions never merge to `main`.

Repo scaffolded and `packages/data` started (`ac20346`, on `stage`). pnpm workspace over `packages/*` and `apps/*`, vitest at the root, `pnpm test` green and `pnpm typecheck` clean. Node 24 runs TypeScript natively, so there is no build step and no `tsx`: `pnpm derive` is `node packages/data/derive.ts`. `derive.ts` is written end to end — products joined to order items to orders to reviews, median/p25/p75/n per metric per category, the generated `OlistCategory` union, categories under 30 orders skipped. Four tests cover the CSV parser and the quantiles.

**Next:** Download the two Kaggle datasets into `data/raw/` (gitignored) and run `pnpm derive`. That needs a Kaggle account, which is why it has not happened yet — a browser download of both zips into `data/raw/` works exactly as well as the CLI:

```
kaggle datasets download -d olistbr/brazilian-ecommerce --unzip -p data/raw
kaggle datasets download -d madislemsalu/facebook-ad-campaign --unzip -p data/raw
```

Then commit `benchmarks.json` and `categories.ts`, and write `packages/data/index.ts` — it is deliberately absent, because it imports a `benchmarks.json` that does not exist yet and would fail typecheck.

**Blocked / watch out:** `packages/contracts` still does not exist — Mateus has not pushed. Nothing in `packages/data` imports it yet (`derive.ts` is standalone by design), but `index.ts` and the whole simulator do. If contracts is still missing at the SAT-A gate, that is the thing to escalate, not the benchmarks.

Two shapes in `derive.ts` to check when the real numbers land: an order's category is its first item's, and `deliveryDays` is the *promised* ETA (`order_estimated_delivery_date` − `order_purchase_timestamp`), not the delivery that happened — the engine reasons about what the buyer saw on the PDP. `atcRate` and `icRate` are published priors, not measured; they are flagged `source: 'kaggle_meta'` and the UI must print them as estimates.

---

## 2026-08-08 · Guilherme · ownership settled

**Done:** Miguel on A, Mateus on C. Mateus is already writing `packages/contracts`, so it stays his, exactly as [`plan/C-ingest.md`](plan/C-ingest.md) describes — brief unchanged, guardian duty his. An earlier entry moved it to Guilherme; that reassignment is cancelled and was never acted on.

**Next:** Guilherme goes straight to `packages/data` — Olist download, `derive.ts`, per-category distributions — then the simulator. Nobody is waiting on Guilherme now.

**Blocked / watch out:** Review `packages/contracts` against [`../contracts.md`](../contracts.md) once Mateus pushes, before anyone builds on it. The one thing to check hardest: no type carries a rate field, and `metrics.ts` has the assertion that `ctr(aggregate(days))` differs from the mean of daily CTRs. Everything downstream inherits whatever lands there. D and E are still unassigned.

---

## 2026-08-08 · Guilherme · planning

**Done:** All planning docs written and pushed — `AGENTS.md`, `docs/contracts.md`, `docs/testing.md`, `docs/acceptance.md`, `docs/plan/` (`a444a70`, `8a535e9`). No production code exists yet. Repo has no `package.json`, no workspace, no packages.

**Next:** `packages/contracts` — the six types from `docs/contracts.md` plus `metrics.ts` with its three assertions. This is C's package, but it is the only hard blocker for the other four people and B is the only one online, so B ships it and hands guardianship to C on arrival. Twenty minutes. Then `packages/data` (Olist derivation), then the simulator.

**Blocked / watch out:** Nobody else is online yet. A arrives Saturday night and takes `packages/engine`; tell them about the A/B firewall the moment they start, because it is the one rule that cannot be fixed retroactively — once B's fault-injection logic has been read by A, the backtest number is worthless for the rest of the weekend.

---

## 2026-08-09 · D-frontend session · chat-first UI ported into apps/web

**Done:** Replaced the carbonless-paper sheet in `apps/web` with the approved chat-first interface, on `feat/peer-market-profile`, uncommitted. Old presentation deleted (`components/despacho|funnel-block|finding-entry|plan-panel|daily-chart`, `components/document/*`, `lib/series.ts`, `lib/verdict.ts`); new `components/chat.tsx` + `components/answer.tsx`, `lib/answers.ts` runs `diagnose`/`predict`/`profileCard`/`measurability` in the server component so the benchmark JSON never ships to the client (verified: 596K of client chunks, no benchmark strings). `lib/fixtures.ts` now imports `packages/sim/fixtures/demo-case*.json` at build time — regenerating the fixtures re-derives every number on screen at the next build. UI copy and number formatting switched to English (`en` locale, BRL kept) to match the prototype. `pnpm typecheck`, `pnpm --filter web build`, `pnpm test` (96) all green.

**Next:** Commit + merge to `stage` when the regenerated fixtures land; re-run the build afterwards since the fixtures are baked in at build time.

**Blocked / watch out:** With the current `demo-case2.json`, the engine's change point (2026-07-11) lands 2 days before the `eta_change` event (2026-07-13), so `Finding.evidence` is not attached and the evidence card does not render. The UI handles both shapes; if the demo needs the evidence sentence, the regenerated fixture's event has to land within a day of the detected change point.

## 2026-08-09 · E-agent · Vercel connection and PR handoff

**Done:** The Vercel project `mazal` is connected to GitHub repository `JucaGF/mazal`. The integration branch `joaquim/chore/integrate-main-mcp` was published, and draft PR [#1](https://github.com/JucaGF/mazal/pull/1) targets `main` (no `stage` branch is available in the remote).

**Next:** Review the PR, run the hosted Vercel preview when it appears, and merge only after the project checks are green.

**Blocked / watch out:** The local `apps/web` production build still hits a restricted-process/Turbopack limitation in this environment; this is documented and should be rechecked by Vercel CI rather than treated as a source-level failure.
