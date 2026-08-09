# PRD — Deploy Vercel e Custom Connection Deco

## Objetivo

Implantar o MCP seguro e registrar sua URL na Deco Studio como a Custom Connection “Mazal MCP”.

## Contexto mínimo necessário

- O servidor final está em `apps/mcp` e usa Streamable HTTP stateless.
- Runtime obrigatório: Node 24.
- A conexão upstream exige `Authorization: Bearer <MAZAL_MCP_BEARER_TOKEN>`.
- A Deco deve descobrir somente os quatro tools públicos.
- Segredos pertencem à Vercel e à Deco; nenhum valor entra no Git ou em screenshots compartilhados.

## Critérios de aceite

- [ ] `apps/mcp/vercel.json` ou a configuração equivalente aponta para o handler HTTP correto e usa Node 24.
- [ ] O deploy de produção responde 401 sem token.
- [ ] Um cliente MCP autorizado completa handshake, `tools/list` e uma chamada real.
- [ ] A Custom Connection “Mazal MCP” aponta para a URL HTTPS de produção.
- [ ] A credencial bearer está armazenada como secret da conexão, não em instruções do Agent.
- [ ] A Deco descobre exatamente `diagnose_campaign`, `predict_campaign`, `build_recovery_plan` e `execute_plan`.
- [ ] Uma chamada aparece em Settings → Monitor com status, duração e nome do tool.
- [ ] A URL de produção, o nome da conexão e o procedimento de rotação do token são documentados sem registrar o segredo.

## Fora do escopo (não fazer)

Não criar ainda o Agent Mazal, não configurar Meta Ads, não tornar o endpoint público sem token e não migrar para Workers runtime.

## Dependências

PRDs 02 e 03 concluídos; conta Vercel, organização Deco e permissão para configurar secrets.

## Formato esperado da entrega

Configuração versionada necessária ao deploy, verificação manual da conexão e resumo de até cinco linhas com URL, runtime, quatro tools descobertos e evidência do Monitor. Nunca responder com o token.
