# PRD — Scaffold e transporte seguro do MCP

## Objetivo

Criar `apps/mcp` como servidor MCP stateless em Streamable HTTP, usando Hono, runtime Node 24 e autenticação por bearer token.

## Contexto mínimo necessário

- Workspace: `pnpm-workspace.yaml` já inclui `apps/*`.
- Usar `@modelcontextprotocol/server`, `@modelcontextprotocol/hono`, `hono`, `zod` e `vitest`; não usar o pacote monolítico antigo `@modelcontextprotocol/sdk`.
- O endpoint remoto é HTTP stateless e será implantado na Vercel.
- O token vem de `MAZAL_MCP_BEARER_TOKEN`; nunca é commitado.
- Este PRD prepara o servidor e o ponto de registro; os quatro handlers reais são o PRD seguinte.

## Critérios de aceite

- [ ] Existem `apps/mcp/package.json`, `tsconfig.json`, `src/server.ts`, `src/auth.ts` e testes co-localizados.
- [ ] `createMazalMcpServer()` cria uma instância nova por request ou usa o padrão stateless recomendado pelo adapter, sem sessão em memória.
- [ ] `createMcpHandler()` expõe o endpoint HTTP em Hono e responde ao handshake MCP.
- [ ] Requests sem `Authorization: Bearer <token>` recebem 401; token incorreto também recebe 401.
- [ ] A comparação do token não registra seu valor e não o devolve em erros.
- [ ] A infraestrutura aceita injeção de uma função `registerTools(server)` para o PRD seguinte.
- [ ] Teste de integração confirma handshake autorizado e rejeição não autorizada.
- [ ] `pnpm --filter @mazal/mcp test` e `pnpm typecheck` passam.

## Fora do escopo (não fazer)

Não implementar os quatro comportamentos de negócio, não implantar na Vercel, não criar Agent Deco, não adicionar endpoint SSE legado e não tocar em `packages/*`.

## Dependências

Node 24 para validação final. A implementação pode ser escrita na branch atual, mas não deve ser declarada pronta apenas com Node 22.

## Formato esperado da entrega

Código e testes em `apps/mcp`, commit convencional `feat(mcp): scaffold secure MCP server`, e resposta final de até cinco linhas com comandos executados e resultado do handshake.
