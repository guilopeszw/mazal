# PRD — Núcleo de narração segura e fixtures

## Objetivo

Implementar a camada que aceita uma narração estruturada do Agent, valida referências de campos e insere todos os números por TypeScript determinístico.

## Contexto mínimo necessário

- Trabalhar somente dentro de `apps/web/app/api/chat/` depois que D entregar o scaffold de `apps/web`.
- A narração é pt-BR e contém três partes: veredito, evidência e plano.
- O modelo retorna texto com referências como `{{diagnosis.primary.observed|percent}}`; não retorna números literais.
- Valores permitidos vêm apenas de tool outputs (`Diagnosis`, `Verdict`, `RecoveryPlan`).
- Modos: `live`, `capture`, `fixture`. Cache: hash de cenário, mensagem, contexto e versão do prompt.

## Critérios de aceite

- [ ] `narration.ts` define o schema estruturado e interpola somente caminhos allowlisted.
- [ ] `validation.ts` rejeita referências inexistentes, formatters desconhecidos e números literais no texto do modelo.
- [ ] Formatação de percentual, BRL, inteiro e decimal é feita por funções TypeScript, sem arredondamento do LLM.
- [ ] `cache.ts` produz chave estável a partir de `scenarioKey`, mensagem, contexto canônico e versão do prompt.
- [ ] Fixture conhecida pode ser carregada sem rede e passa pela mesma validação da resposta live.
- [ ] Falha live usa fixture no cenário conhecido e template TypeScript no cenário desconhecido.
- [ ] A narração inválida nunca é parcialmente devolvida.
- [ ] Testes cobrem interpolação, rejeição de dígitos, path injection, cache invalidation e os dois fallbacks.
- [ ] Nenhum arquivo fora de `apps/web/app/api/chat/` é alterado.

## Fora do escopo (não fazer)

Não criar componentes React, não alterar a sidebar, não chamar diretamente OpenAI/Anthropic, não persistir cache em banco e não implementar streaming ao navegador.

## Dependências

Scaffold de D disponível; PRDs 01 e 05 concluídos. As respostas capturadas finais serão adicionadas no PRD 08.

## Formato esperado da entrega

Código e testes co-localizados na rota, commit `feat(web): add deterministic narration guard`, e resumo de até cinco linhas com schemas, modos e testes executados.
