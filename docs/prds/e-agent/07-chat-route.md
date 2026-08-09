# PRD — Integração de POST /api/chat

## Objetivo

Implementar o único endpoint web que toca um LLM, usando o Agent da Deco, continuidade por `conversationId` e resposta JSON completa somente após validação.

## Contexto mínimo necessário

- E pode alterar apenas `apps/web/app/api/chat/`.
- Request: `scenarioKey` ou `context` bruto, `userMessage` e `conversationId` opcional. Exigir exatamente um entre `scenarioKey` e `context`.
- O servidor carrega a fixture ou valida `CampaignDay[]`, `ProductCard`, `StoreEvent[]` e reference público; o navegador nunca envia `Diagnosis`, `Verdict` ou `RecoveryPlan` prontos.
- O Agent Deco chama os tools Mazal. O handler coleta os tool outputs, valida a narração e devolve JSON sem streaming.
- Response: `message`, `conversationId`, `source: 'live' | 'fixture' | 'template'`, `scenarioKey?` e `warning?`.

## Critérios de aceite

- [ ] `schema.ts` implementa os contracts de request/response e rejeita combinações ambíguas.
- [ ] `deco-provider.ts` cria thread quando não há `conversationId` e reutiliza a thread recebida nas mensagens seguintes.
- [ ] A API key da Deco é usada apenas no servidor por `DECO_STUDIO_API_KEY`.
- [ ] Cada interação enfileira no máximo uma execução do Agent; retries usam cache ou fallback.
- [ ] O handler consome a resposta completa da Deco antes de retornar ao navegador.
- [ ] Falha de provider retorna resposta segura e warning genérico `PROVIDER_UNAVAILABLE`.
- [ ] Narração inválida retorna resposta segura e warning genérico `INVALID_NARRATION`.
- [ ] O aviso visível é “Narração ao vivo indisponível. Exibindo uma resposta segura verificada.”; detalhes ficam nos logs.
- [ ] Teste de integração cobre nova thread, continuidade, fixture offline, template fallback e ausência de vazamento de secrets.
- [ ] `pnpm test`, `pnpm typecheck` e `git diff --check` passam.

## Fora do escopo (não fazer)

Não modificar componentes de D, não aceitar outputs derivados do browser, não adicionar banco, filas ou `analysisId` persistido e não transmitir chunks não validados.

## Dependências

PRDs 05 e 06 concluídos e `apps/web` integrado por D. Em produção futura, `scenarioKey/context` será substituído por `analysisId` sobre snapshots persistidos.

## Formato esperado da entrega

Código e testes somente em `apps/web/app/api/chat/`, commit `feat(web): bridge chat through Deco agent`, e resumo de até cinco linhas com contrato, fallback e evidência de conversa em duas mensagens.
