# PRD — Adapter Meta Ads read-only

## Objetivo

Adicionar uma fonte opcional read-only que recebe insights brutos do MCP oficial Meta Ads, normaliza-os deterministicamente para `CampaignDay` e usa o tool Mazal existente.

## Contexto mínimo necessário

- Este PRD só inicia depois de MCP, Deco, chat, captura e demo estarem verdes.
- O Agent terá duas conexões: “Meta Ads” read-only e “Mazal MCP”.
- Não criar quinto tool. `diagnose_campaign` aceita `days` ou payload bruto Meta, mutuamente exclusivos.
- A normalização ocorre em `apps/mcp/src/meta/adapter.ts`; o Agent/LLM nunca mapeia campos ou calcula valores.
- `CampaignDay` exige date, campaignId, spend, impressions, reach, clicks, addToCarts, checkoutsInitiated, purchases e revenue.
- Ausência não é zero: se qualquer campo obrigatório não puder ser obtido, retornar erro com a lista e orientar CSV/fixture.

## Critérios de aceite

- [ ] A conexão oficial Meta Ads está anexada ao Agent com todos os tools de escrita desabilitados.
- [ ] Um único tool de insights é escolhido e seu response schema real é salvo como fixture redigida, sem token ou identificadores sensíveis.
- [ ] `meta/schema.ts` valida exatamente o payload observado desse tool.
- [ ] `adapter.ts` produz somente counts e valores monetários; nenhuma rate é armazenada.
- [ ] Strings numéricas, moeda, timezone e agrupamento por dia são convertidos por TypeScript determinístico.
- [ ] Campo obrigatório ausente gera erro `META_INSIGHTS_INCOMPLETE` e lista de campos; nenhum valor é preenchido com zero.
- [ ] `META_ADS_ENABLED` é `false` por padrão e, desligado, preserva integralmente CSV e fixtures.
- [ ] O JSON bruto pode ser encaminhado pelo `diagnose_campaign` sem adicionar tool público.
- [ ] Testes cobrem payload válido, campo ausente, feature flag off e equivalência com um `CampaignDay` esperado.
- [ ] Nenhum arquivo de `packages/*` ou contrato congelado é alterado.

## Fora do escopo (não fazer)

Não habilitar escrita, não implementar OAuth próprio se a Deco já gerencia a conexão, não anexar dezenas de tools desnecessários, não inferir eventos ausentes e não atrasar demo/deck/vídeo.

## Dependências

PRDs 03, 05 e 08 concluídos; conta Meta elegível; OAuth read-only funcional; response schema real do tool selecionado anexado à conversa de execução.

## Formato esperado da entrega

Adapter, schema, fixture redigida e testes em `apps/mcp/src/meta`, commit `feat(mcp): add read-only Meta insights adapter`, e resumo de até cinco linhas com tool escolhido, campos mapeados e comportamento de fallback.
