# Operação — Mazal MCP na Vercel e conexão Deco

## Estado

**Corrigido em 2026-08-09.** A versão anterior deste arquivo dizia que a operação estava ativa em produção, que a Custom Connection `Mazal MCP` guardava o bearer secret, que o agente `Mazal` usava somente essa conexão, e que um diagnóstico real tinha sido executado pelo Studio e registrado no Monitoramento.

Lido contra a organização `guilherme-works-btg1` no mesmo dia, nada disso existia: oito agentes, todos padrão do Studio Pack, e quatro conexões — Deco Store, MCP Registry, Deco CMS self, GitHub. Sem agente `Mazal`, sem conexão `Mazal MCP`. Um diagnóstico não pode ter passado por uma conexão que não existe.

Agora existem, e estão versionados em [`docs/deco-agent.md`](deco-agent.md) — configuração do Studio não tem histórico nem revisão, então o repositório guarda a cópia que tem.

O que falta é um campo: o header `Authorization: Bearer <token>` na conexão. Sem ele `CONNECTION_TEST` retorna `healthy: false`, que é o estado correto para um arquivo em git.

Não registrar neste arquivo, no Git, em tickets ou em screenshots nenhum valor de token.

## Configuração Vercel

1. Criar ou selecionar um projeto Vercel para este monorepo.
2. Definir **Root Directory** como `apps/mcp` e manter habilitada a inclusão de arquivos externos ao diretório raiz. O pacote depende de `packages/contracts`, `packages/data` e `packages/engine` pelo workspace pnpm.
3. Confirmar **Node.js 24.x** nas configurações do projeto. `apps/mcp/package.json` também fixa `24.x`.
4. Manter `apps/mcp/src/vercel-entrypoint.ts` como o entrypoint fonte. `pnpm run build:vercel` grava a árvore da Build Output API em `apps/mcp/.vercel/output`: a Function fica em `functions/mcp.func/` e é servida em `/mcp` sem nenhuma rota declarada.

   **Não voltar a gerar `api/mcp.mjs`.** Aquela versão dependia da detecção zero-config da Vercel, que varre a ÁRVORE DE FONTES atrás de `api/*.mjs` — e o arquivo é gerado durante o build e está no gitignore, então na hora da varredura ele não existe. Nenhuma Function era criada, a rota apontava para o nada, e toda URL respondia 404 enquanto o build reportava sucesso. `apps/mcp/src/vercel.test.ts` trava isso.
5. Configurar as variáveis abaixo no secret manager da Vercel para Production. Configurar Preview somente se houver um host de preview explicitamente autorizado.
6. Implantar e anotar a URL estável como `https://<VERCEL_PRODUCTION_HOST>/mcp` nesta seção. Não usar uma URL de preview na conexão de produção.

**URL HTTPS de produção:** `https://mcp-cyan-gamma.vercel.app/mcp`

### Variáveis de ambiente, sem valores

| Nome | Conteúdo esperado |
|---|---|
| `MAZAL_MCP_BEARER_TOKEN` | Segredo aleatório de alta entropia, exclusivo desta conexão. |
| `MAZAL_MCP_ALLOWED_HOSTS` | Lista separada por vírgulas de hostnames exatos atendidos pela Vercel, sem esquema nem caminho. |
| `MAZAL_MCP_ALLOWED_ORIGINS` | Lista separada por vírgulas de hostnames exatos permitidos no header `Origin`, sem esquema nem caminho. |

Não usar curingas. O cliente MCP servidor-a-servidor normalmente não envia `Origin`; se enviar, acrescentar somente o hostname observado e aprovado. A ausência de `Origin` não desativa a validação de `Host` nem o bearer token.

## Criação e rotação do bearer token

### Configuração inicial

1. Gerar o token em um gerador criptograficamente seguro ou gerenciador de senhas aprovado.
2. Salvar o mesmo segredo somente em dois secret managers: Vercel, como `MAZAL_MCP_BEARER_TOKEN`, e a credencial da Custom Connection Deco, como header `Authorization: Bearer …`.
3. Nunca colocar o segredo nas instruções de um Agent, na URL, em variáveis públicas, em comandos registrados ou em documentação.
4. Fazer um novo deploy após configurar ou alterar a variável Vercel; mudanças de ambiente não alteram um deploy já criado.

### Rotação

O servidor aceita um token por vez, portanto a rotação deve ocorrer em uma janela curta de manutenção:

1. Gerar um novo token sem sobrescrever o registro seguro do token atual antes da validação.
2. Substituir `MAZAL_MCP_BEARER_TOKEN` na Vercel e criar um novo deploy de produção.
3. Atualizar imediatamente o segredo do header `Authorization` da Custom Connection “Mazal MCP”.
4. Executar handshake, `tools/list` e uma chamada real; confirmar a chamada no Monitor.
5. Remover o token anterior do gerenciador seguro após a validação. Se a validação falhar, restaurar o valor anterior apenas pelos dois secret managers e repetir o deploy; nunca copiar o token para o Git.

## O health check do Studio

`CONNECTION_TEST` não faz handshake MCP: envia um POST JSON-RPC `ping` cru com os headers da conexão (`decocms/studio`, `apps/api/src/storage/connection.ts`) e considera saudável `2xx` ou `404`. O fetch do Node manda `Accept: */*`, e o transport Streamable HTTP exigia os dois content-types literais — respondia `406` e o Studio reportava `healthy: false` mesmo com auth e host corretos. O servidor agora trata o wildcard como o que ele significa em HTTP e responde o ping com `200 {"result":{}}`. Um `Accept` explícito sem wildcard continua recebendo `406`.

## Custom Connection Deco

1. Abrir **Settings → Connections → Add connection → Custom Connection**.
2. Usar exatamente o nome **Mazal MCP**.
3. Preencher a URL com `https://<VERCEL_PRODUCTION_HOST>/mcp` depois do deploy.
4. Armazenar o header bearer como credencial secreta da conexão, não como instrução de Agent.
5. Descobrir e habilitar somente estes quatro tools:

   - `diagnose_campaign`
   - `predict_campaign`
   - `build_recovery_plan`
   - `execute_plan`

Criar o Agent “Mazal”, conectar Meta Ads ou habilitar qualquer quinto tool pertence a PRDs posteriores e não faz parte desta operação.

## Checklist de validação

### Endpoint e protocolo

- [x] `POST https://mcp-cyan-gamma.vercel.app/mcp` sem `Authorization` retorna `401`.
- [x] O mesmo endpoint com a credencial da conexão conclui o handshake `initialize` em Streamable HTTP.
- [x] A resposta do handshake identifica o servidor como `Mazal MCP`.
- [x] `tools/list` retorna os quatro nomes listados acima e mais um: `ON_MCP_CONFIGURATION`, o callback de ciclo de vida que o Deco Studio invoca a cada create/update de conexão cuja configuração mudou (`decocms/studio`, `apps/api/src/tools/connection/{create,update}.ts`). Sem ele o Studio exibe "Tool ON_MCP_CONFIGURATION not found" ao salvar a conexão. Aqui é um no-op autenticado — este servidor não tem estado de configuração para reagir — e não deve ser habilitado como tool do agente.
- [x] Uma chamada real de `diagnose_campaign` com payload válido retorna sucesso MCP.
- [ ] Uma chamada inválida continua sendo recusada pelo schema; autenticação, Host e Origin permanecem ativos.

### Deco e Monitor

- [x] A Custom Connection se chama exatamente **Mazal MCP** e usa a URL HTTPS de produção.
- [x] A credencial bearer está no campo secreto da conexão e não em instruções.
- [x] Em **Settings → Monitor**, a chamada real mostra status de sucesso, duração e o nome `diagnose_campaign`.
- [x] Registrar a URL de produção neste documento e a evidência sem token no handoff após a validação.

## Pendências que exigem conta externa

- [x] Criar/configurar o projeto Vercel, os secrets necessários e o deploy de produção.
- [x] Preencher a URL HTTPS real neste documento.
- [x] Criar a Custom Connection Deco “Mazal MCP” e seu secret bearer.
- [x] Executar handshake, `tools/list`, tool call e validação no Monitor.

Referências oficiais: [Node.js na Vercel](https://vercel.com/docs/functions/runtimes/node-js), [versões Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [monorepos](https://vercel.com/docs/monorepos) e [rewrites](https://vercel.com/docs/routing/rewrites).
