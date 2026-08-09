# PRD — Captura, auditoria e freeze da demo

## Objetivo

Capturar respostas aprovadas para os dois cenários, provar que cada afirmação vem dos outputs determinísticos e congelar um caminho de demo que funciona sem rede.

## Contexto mínimo necessário

- Fixtures de campanha válidas vêm do PRD 01.
- `/api/chat` oferece `live`, `capture` e `fixture`.
- Respostas finais ficam em `apps/web/app/api/chat/fixtures/` e são revisadas como código.
- `demo-script.md` contém números antigos e valores de economia sem suporte; eles devem ser removidos.
- Depois do freeze, E assume o laptop e não altera outros componentes.

## Critérios de aceite

- [ ] Case #1 e Case #2 completam o caminho live uma vez e geram fixtures estruturadas válidas.
- [ ] Cada referência numérica aponta para um campo de `Diagnosis`, `Verdict` ou `RecoveryPlan` retornado naquela execução.
- [ ] A revisão com A confirma que regra, causa, evidência e change point narrados existem no output real.
- [ ] `demo-script.md` não contém `87%`, `96%`, `4%`, `R$1.840`, `R$6.200` ou outra afirmação antiga sem origem.
- [ ] O deploy da apresentação usa `NARRATION_MODE=fixture`.
- [ ] O caminho fixture funciona com acesso à Deco bloqueado.
- [ ] O modo live continua disponível fora do deploy de apresentação e mostra warnings ao cair em fallback.
- [ ] A demo completa é executada uma vez, cronometrada e registrada no handoff.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm sim:backtest` e `git diff --check` passam antes do freeze.

## Fora do escopo (não fazer)

Não corrigir engine/simulator, não editar números do backtest, não manter frases por valor dramático e não iniciar Meta Ads antes do freeze deste caminho.

## Dependências

PRDs 01, 05, 06 e 07 concluídos; A disponível para auditoria curta; frontend de D ou Agent Deco acessível para executar o caminho completo.

## Formato esperado da entrega

Fixtures revisadas, `demo-script.md` reconciliado, testes verdes e resumo de até cinco linhas com cenários capturados, modo do deploy e duração da execução completa.
