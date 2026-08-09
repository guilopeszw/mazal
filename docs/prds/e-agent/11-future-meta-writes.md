# PRD — Executor futuro de writes Meta com guardrails

## Objetivo

Evoluir a execução simulada para mudanças Meta reais por um executor controlado, sem entregar tools amplos de escrita diretamente ao Agent.

## Contexto mínimo necessário

- No hackathon, `execute_plan` apenas registra ações e retorna recibo.
- A conexão Meta atual é read-only.
- O executor futuro deve ficar atrás do fluxo “propor → editar → aprovar → executar”.
- Ações `seller` continuam não executáveis pela Mazal.
- Este PRD não pertence ao build do hackathon.

## Critérios de aceite

- [ ] Existe uma allowlist explícita de operações Meta que cada `Action.id` pode disparar.
- [ ] Toda execução começa em dry-run e mostra o diff da mudança antes da confirmação.
- [ ] Aprovação explícita referencia plano, ações selecionadas, usuário e snapshot analisado.
- [ ] Cada operação usa idempotency key para impedir duplicação em retry.
- [ ] Limites de orçamento, conta, campanha e magnitude são verificados antes da chamada externa.
- [ ] O audit log registra request redigido, approval, resultado, erro e identidade sem armazenar tokens.
- [ ] Operações reversíveis possuem procedimento de rollback testado; irreversíveis são bloqueadas ou exigem confirmação reforçada.
- [ ] O Agent acessa um único executor de alto nível, não tools Meta genéricos de create/update/delete.
- [ ] Testes usam sandbox/mock oficial e provam que ausência de aprovação, actor `seller`, limite excedido e retry não executam writes indevidos.
- [ ] Security review e revisão do contrato acontecem antes de qualquer ambiente com dinheiro real.

## Fora do escopo (não fazer)

Não implementar no hackathon, não reutilizar o log em memória como auditoria, não expor tokens ao Agent e não permitir alteração livre de orçamento, status ou targeting.

## Dependências

Produto pós-hackathon, PRD 10 estabilizado, conta Meta de sandbox, política de autorização, armazenamento durável, owner de segurança e aprovação explícita para possíveis mudanças no contrato.

## Formato esperado da entrega

Documento de arquitetura, threat model, código e testes do executor em uma iniciativa futura separada; resposta final de até cinco linhas com operações permitidas, guardrails, evidência do sandbox e itens bloqueados.
