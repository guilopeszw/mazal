# PRD — Quatro tools e execução simulada

## Objetivo

Expor exatamente os quatro tools públicos da Mazal, conectados às APIs determinísticas, incluindo `execute_plan` com log simulado e recibo determinístico.

## Contexto mínimo necessário

- Consumir `diagnose`, `predict` e `buildPlan` de `@mazal/engine`.
- Consumir tipos de `@mazal/contracts` e `benchmarks` de `@mazal/data`.
- Tools obrigatórios: `diagnose_campaign`, `predict_campaign`, `build_recovery_plan`, `execute_plan`.
- O input público de referência é `{ kind: 'benchmark' } | { kind: 'self'; baselineDays: number }`; no primeiro caso o servidor injeta `benchmarks`.
- `predict_campaign` também injeta `benchmarks`; o cliente nunca envia a tabela.
- Writes são simulados. Ações `seller` não podem ser registradas como executadas.

## Critérios de aceite

- [ ] `tools/list` retorna exatamente os quatro nomes, sem `explain_metric` ou tool auxiliar público.
- [ ] Todos os inputs possuem schemas Zod e erros estruturados para payload inválido.
- [ ] `diagnose_campaign` converte o reference público para o `ReferenceMode` do engine e retorna o `Diagnosis` sem recalcular números.
- [ ] `predict_campaign` retorna o `Verdict` direto do engine e aceita `history` opcional.
- [ ] `build_recovery_plan` chama `buildPlan(diagnosis, card)` e retorna o resultado sem enriquecimento numérico.
- [ ] `execute_plan` rejeita qualquer ação `actor: 'seller'`, aceita ações `mazal`, acrescenta ao `InMemoryActionLog` e retorna `{ receipt, logged }`.
- [ ] O recibo é um hash determinístico das ações canônicas; o mesmo input produz o mesmo recibo.
- [ ] Não existe cliente Meta, chamada externa ou armazenamento durável neste PRD.
- [ ] Testes de handler e uma chamada MCP end-to-end cobrem sucesso e erro dos quatro tools.
- [ ] `pnpm test`, `pnpm typecheck` e `git diff --check` passam.

## Fora do escopo (não fazer)

Não persistir o log, não executar campanhas, não alterar contratos, não adicionar quinto tool, não narrar respostas e não implementar Meta read/write.

## Dependências

PRD 02 concluído. As APIs atuais de engine/data/contracts são tratadas como congeladas.

## Formato esperado da entrega

Código e testes em `apps/mcp/src/tools`, `schemas.ts`, `action-log.ts` e `receipt.ts`; commit `feat(mcp): expose deterministic campaign tools`; resumo de até cinco linhas com a lista exata de tools e comandos verdes.
