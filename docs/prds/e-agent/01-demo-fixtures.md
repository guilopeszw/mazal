# PRD — Contrato e validação das fixtures de demo

## Objetivo

Substituir as duas fixtures atuais por campanhas determinísticas que realmente produzam os diagnósticos, vereditos e planos usados na demo, sem ajustar thresholds para favorecer o roteiro.

## Contexto mínimo necessário

- Fixtures atuais: `packages/sim/fixtures/demo-case1.json` e `demo-case2.json`.
- Gerador: `packages/sim/write-fixtures.ts`; os JSONs são gerados e nunca editados à mão.
- APIs públicas: `diagnose`, `predict` e `buildPlan` de `@mazal/engine`.
- Case #1 usa referência `benchmark`; Case #2 usa referência `self`.
- Hoje, as duas fixtures retornam `Diagnosis.primary: null`, `suspectedCause: 'none'` e plano vazio.
- A não lê `packages/sim`; B não altera ou lê a implementação do engine. Eles compartilham somente inputs, outputs e critérios públicos.

## Critérios de aceite

- [ ] A documenta as chamadas canônicas e os outputs mínimos usando apenas os tipos públicos.
- [ ] Case #1 produz `Diagnosis.primary` em estágio 3–6, `causeLayer !== 'media'`, plano não vazio e um `Verdict` coerente com a história pre-flight.
- [ ] Se `thin_pdp` não satisfizer as regras existentes, B troca o fault por outra condição detectável e informa E; ninguém reduz o threshold de `-1.0σ` para salvar a narrativa.
- [ ] Case #2 produz `suspectedCause === 'eta_shock'`, `primary.stage === 4`, `primary.evidence.type === 'eta_change'` e `changePoint.date` dentro de ±1 dia da injeção.
- [ ] O plano de Case #2 é não vazio e não contém ação de mídia.
- [ ] `pnpm sim:fixtures` regenera os arquivos byte a byte e deixa `git status --short` limpo depois de os arquivos atualizados estarem commitados.
- [ ] `pnpm test`, `pnpm typecheck` e `pnpm sim:backtest` passam sem alterar os números reportados apenas para favorecer a demo.
- [ ] `packages/sim/README.md` descreve os faults, seeds e reference modes realmente entregues.

## Fora do escopo (não fazer)

Não alterar `packages/contracts`, não afrouxar mínimos de amostra, não editar JSON manualmente, não inventar um `Diagnosis` mock e não reescrever o roteiro antes de os outputs estarem aprovados.

## Dependências

`packages/engine`, `packages/sim`, `packages/data` e seus testes atuais precisam continuar verdes. A e B devem concordar apenas sobre o contrato observável, preservando a separação entre as implementações.

## Formato esperado da entrega

Código/fixtures e testes nas branches dos respectivos owners, mais um resumo de até cinco linhas com seeds, faults, chamadas canônicas, arquivos alterados e comandos verdes.
