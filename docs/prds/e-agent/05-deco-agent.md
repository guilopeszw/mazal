# PRD — Agent Mazal na Deco Studio

## Objetivo

Criar o Agent “Mazal” na Deco, anexar a Custom Connection do MCP e provar a pergunta “o que aconteceu com minha campanha?” end-to-end.

## Contexto mínimo necessário

- A Custom Connection “Mazal MCP” já expõe os quatro tools.
- O Agent usa tier `smart`, responde em pt-BR e chama tools antes de fazer afirmações sobre campanhas.
- O modelo narra; nunca calcula. Frases: veredito primeiro, evidência depois, plano por último.
- `/api/chat` chamará esse Agent posteriormente por API key.

## Critérios de aceite

- [ ] Existe um arquivo `docs/deco-agent-instructions.md` com as instruções versionadas do Agent.
- [ ] As instruções exigem tool-first, proíbem números literais inventados e limitam a resposta a frases curtas em pt-BR.
- [ ] O Agent “Mazal” usa tier `smart` e tem somente a conexão “Mazal MCP” no caminho principal.
- [ ] Apenas os quatro tools aprovados estão selecionados.
- [ ] Uma pergunta com a fixture válida chama o tool correto e retorna uma narração coerente com o JSON.
- [ ] A chamada e o custo aparecem no Monitor da Deco.
- [ ] É criada uma API key própria para o bridge web, com o menor escopo necessário e expiração definida.
- [ ] São documentados `DECO_STUDIO_BASE_URL`, `DECO_STUDIO_ORG` e `DECO_STUDIO_AGENT_ID`; a key permanece somente em secret manager.

## Fora do escopo (não fazer)

Não implementar `/api/chat`, não anexar Meta Ads, não habilitar automações, não colocar segredos nas instruções e não delegar cálculos ao Agent.

## Dependências

PRD 04 concluído e pelo menos uma fixture válida do PRD 01 disponível para o smoke test.

## Formato esperado da entrega

Documento de instruções, configuração manual concluída e resumo de até cinco linhas com Agent ID não secreto, tools anexados, pergunta testada e evidência do Monitor.
