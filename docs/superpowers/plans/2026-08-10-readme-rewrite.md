# README Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** substituir o README provisório por uma apresentação em pt-BR, precisa e verificável da tese, da solução entregue no hackathon, das evidências disponíveis e dos próximos passos de Mazal.

**Architecture:** o README será uma porta de entrada narrativa, não uma cópia dos PRDs. Ele começa pelo problema e pela tese, explica o fluxo produto → engine → interface, resume o que foi construído e termina com reprodução, limites e roadmap. Detalhes operacionais, dados, benchmark, backtest e MCP continuam em documentos especializados ligados pelo README.

**Tech Stack:** Markdown, monorepo pnpm, TypeScript, Vitest, Next.js, Zod, Model Context Protocol, Vercel e Deco Studio.

## Global Constraints

- Todo número exibido deve ser atribuído a uma função determinística de TypeScript e, quando for um finding, a uma `Finding.rule`.
- Os contratos armazenam contagens; taxas, ROAS e demais métricas derivadas devem ser descritas como funções de `@mazal/contracts/metrics`.
- O README não pode afirmar que houve entrevistas com sellers, clientes, pricing validado, case studies ou export real de uma conta Meta; essas evidências não existem no repositório.
- Os benchmarks devem distinguir as sete métricas medidas no Olist das cinco priors de mídia com `source: 'prior'` e `n: 0`.
- O backtest deve ser apresentado como número de wiring/sanity, não como acurácia independente: o firewall entre engine e simulator não se manteve.
- `execute_plan` e a execução da web são simulados neste build; o README não pode sugerir que houve gasto ou escrita real na Meta.
- A tese central deve aparecer literalmente: estágios 0–2 são problema de mídia; estágios 3–6 são problema de produto, oferta ou experiência.
- A linguagem principal será pt-BR; nomes de pacotes, funções, tools, `FaultKind`, rule ids e identificadores técnicos permanecem em inglês.

---

## Diagnóstico editorial do README atual

O README atual tem somente três ideias principais: um título provisório, a origem dos datasets e uma descrição do Allocator. Ele não apresenta Mazal como produto, não explica a tese do funil, não mostra o fluxo pré-lançamento/in-flight, não conecta o Allocator ao restante do sistema, não registra o trabalho do hackathon e não orienta o leitor sobre como reproduzir a demo.

Problemas que a reescrita precisa corrigir:

- substituir `sell shit make money` por uma frase de posicionamento defensável;
- colocar a tese antes da implementação;
- explicar que o produto localiza a primeira etapa quebrada, em vez de apenas reportar ROAS baixo;
- separar claramente `pre-flight` por benchmark de `in-flight` pela própria história da campanha;
- descrever a cadeia real de pacotes e a integração MCP/web;
- mostrar evidência com denominador e caveat, sem vender o backtest como validação independente;
- listar o que não foi construído e o que entra no próximo ciclo;
- apontar para os documentos existentes, evitando transformar o README em um segundo PRD.

## Estrutura proposta para `README.md`

### 1. Hero e status

Abrir com:

```md
# Mazal

### Campanhas não deveriam depender de sorte.

Mazal é um campaign underwriter para sellers brasileiros de e-commerce. Antes de
lançar, estima o risco da campanha. Depois que ela roda, localiza o primeiro
vazamento do funil, explica a causa e propõe um plano que o seller aprova.

> Hackathon build · Meta Ads · TypeScript determinístico · pt-BR
```

Adicionar links curtos para demo, arquitetura, backtest, benchmarks e MCP somente se os destinos estiverem presentes e atualizados. Não apresentar o projeto como produto de produção.

### 2. A tese

Usar três parágrafos, nesta ordem:

1. O gasto em mídia é uma decisão de risco que normalmente não é precificada antes de o dinheiro sair.
2. A performance tem quatro camadas: creative, audience, product/offer e experience.
3. Ads Manager enxerga principalmente as duas primeiras; Mazal cruza a mídia com dados do produto e da loja para responder se o problema está no anúncio ou no destino.

Fechar a seção com a divisão que organiza todo o produto:

```md
Estágios 0–2 são um problema de mídia. Estágios 3–6 são um problema de
produto, oferta ou experiência. Essa fronteira é o wedge de Mazal.
```

### 3. O problema que Mazal resolve

Mostrar o erro de diagnóstico que o produto evita:

```md
Quando o CTR está saudável, mas o add-to-cart desaba, criar outro anúncio é
tratar o sintoma. O vazamento pode estar no preço, no estoque, no frete, no ETA,
na página do produto ou no checkout.
```

Explicar que “a campanha está underperforming” não é um diagnóstico. A pergunta correta é: qual foi a primeira etapa que desviou da referência?

### 4. Como a solução funciona

Descrever o fluxo em quatro passos:

1. **Entrada:** export CSV do Meta Ads Manager, log opcional de eventos da loja e Product Card com os campos do produto.
2. **Referência:** benchmark por categoria no pré-lançamento ou baseline da própria campanha no modo in-flight.
3. **Diagnóstico:** engine determinístico percorre os estágios do funil em ordem, encontra a primeira quebra, cruza a quebra com eventos e devolve evidência auditável.
4. **Ação:** `buildPlan` cria ações com efeito esperado, confiança, reversibilidade e `actor: 'mazal' | 'seller'`; o seller decide antes de qualquer execução.

Incluir uma tabela curta dos estágios 0–6, sem tentar repetir todos os tipos do contrato:

| Estágio | O que observa | Camada provável |
|---|---|---|
| 0–2 | entrega, atenção e landing | mídia |
| 3 | interesse no produto / add-to-cart | produto |
| 4 | intenção / checkout | experiência ou oferta |
| 5 | compra | experiência |
| 6 | economia / AOV e ROAS | oferta e margem |

Destacar o princípio causal: o primeiro estágio quebrado é a causa; os estágios seguintes são sintomas.

### 5. Dois momentos, um mesmo motor

Explicar a união dos dois casos:

- **Pre-flight:** `predict` usa benchmarks de categoria e a margem do seller para devolver decisão (`launch`, `launch_small` ou `dont_launch`), banda p10–p90, break-even e fator limitante.
- **In-flight:** `diagnose` usa a série diária, detecta change point, compara benchmark ou histórico próprio e usa o event log para transformar “checkout caiu” em uma causa verificável, como uma mudança de ETA.

Ressaltar que o headline é “don’t launch”; a recuperação da campanha em andamento é o segundo ato do mesmo problema: localizar o leak.

### 6. Princípios de confiança

Usar uma seção curta e concreta:

- **O LLM narra; não calcula.** Números, datas e métricas vêm do engine/contrato.
- **Toda finding é auditável.** Traz observado, referência, spread, amostra, regra e camada.
- **A incerteza aparece.** Pouco histórico mantém a banda larga e nomeia o dado que precisa ser instrumentado.
- **Cada ação tem dono.** O seller recebe orientação; Mazal só recebe operações explicitamente permitidas.
- **Mazal não aumenta o gasto.** As operações executáveis são pausa, redução de orçamento e limite de frequência.
- **Execução é simulada.** O sistema registra log e receipt, sem cliente real da Meta neste build.

### 7. O que construímos no hackathon

Organizar por entregável, não por pessoa:

1. **Contracts e métricas:** tipos congelados para contagens, Product Card, eventos, findings, veredictos, planos e atores; funções de métrica centralizadas.
2. **Engine:** `diagnose`, `predict`, `buildPlan`, perfil de seller, mensurabilidade, response curves, alocação de orçamento sem aumento de spend.
3. **Dados:** agregados de Olist em `benchmarks.json`, seller benchmarks e categorias; raw CSVs ficam fora do Git; proveniência documentada.
4. **Simulator e fixtures:** campanhas sintéticas com fault injetado antes dos efeitos, dois casos demo reprodutíveis e backtest determinístico.
5. **Ingest:** parser para CSV do Meta com quirks pt-BR, event log e validação dos campos do Product Card.
6. **Web app:** experiência one-screen em pt-BR com chat, funnel, change point, banda de previsão, plano, upload de CSV e fluxo de aprovação.
7. **MCP e operação:** quatro tools (`diagnose_campaign`, `predict_campaign`, `build_recovery_plan`, `execute_plan`), autenticação, bundle Vercel e conexão Deco documentada.
8. **Qualidade:** testes, typecheck, build web, fixtures e comandos de backtest/reprodução versionados.

Cada item deve apontar para sua documentação, especialmente `docs/contracts.md`, `docs/benchmark-provenance.md`, `docs/backtest-results.md`, `docs/demo-contract.md` e `docs/mazal-mcp-vercel-deco.md`.

### 8. Evidências atuais

Apresentar somente os números existentes e com os qualificadores que os acompanham:

- 62 das 71 categorias do Olist, cobrindo 99,84% dos pedidos;
- sete dos doze benchmarks medidos no Olist; cinco são priors de mídia com `n: 0`;
- backtest held-out: 59,0% top-1, 59,0% top-2 em nível de estágio e 12,0% de falsos alarmes em 25 campanhas saudáveis;
- baseline always-healthy: 25,0% top-1 com 0% de falsos alarmes;
- ressalva explícita: simulator e engine acabaram escritos pela mesma pessoa, então o resultado é sanity/wiring, não uma validação independente.

Linkar para `docs/backtest-results.md` para a matriz de confusão, recall por classe e limitações (`thin_pdp`, `price_too_high`, `checkout_friction`).

### 9. Dados e reprodução

Incluir um bloco de execução mínimo e útil:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm sim:fixtures
pnpm sim:backtest
pnpm derive
```

Explicar em uma frase o que cada comando valida. Informar que `pnpm derive` depende dos arquivos raw locais em `data/raw/`, que não são commitados. Atribuir o Olist com licença CC BY-NC-SA 4.0 e apontar para `docs/benchmark-provenance.md`.

### 10. Estado atual e limites

Criar uma tabela para impedir que o README pareça mais maduro que o build:

| Entregue | Ainda não entregue |
|---|---|
| diagnóstico determinístico e plano auditável | escrita real na Meta |
| demo web com fixtures e upload de CSV | integração OAuth / Meta App Review |
| MCP deployado e conectado ao Deco | multi-conta, billing e permissões |
| benchmarks agregados e simulator reproduzível | validação independente com dados reais de sellers |
| allocator que redistribui o orçamento existente | bandits, Bayesian optimization e expansão de spend |

Acrescentar que não há clientes, pricing, seller research validado ou case studies. Essa transparência é parte da tese de confiança, não uma nota de rodapé.

### 11. Próximos passos

Ordenar por risco de produto e valor de aprendizado:

1. **Reforçar a validação:** repetir o backtest com owners separados, conjunto maior e dados de sellers reais; corrigir a cobertura das classes hoje não detectadas sem tunar no held-out.
2. **Validar com sellers:** observar onboarding por CSV + Product Card, verificar se a distinção mídia/produto muda a decisão e medir se o plano é executável.
3. **Melhorar a evidência:** substituir priors de mídia por dados brasileiros identificados, explicando janela, denominador e unidade de cada benchmark.
4. **Modelar projeção de plano:** retirar o `projected` zerado do contrato de apresentação ou implementar uma projeção validada; não esconder a limitação com copy.
5. **Endurecer a ingestão e operação:** warnings do event log, tratamento de erros da web, observabilidade, rotação de secrets e validação completa do endpoint MCP.
6. **Só depois avaliar Meta write access:** manter o princípio de consentimento, operações decrease-only e feature flag; nunca fazer integração de escrita ser pré-requisito para o diagnóstico.

### 12. Estrutura do monorepo e documentação complementar

Adicionar uma árvore curta dos diretórios públicos:

```text
apps/web        experiência one-screen e upload
apps/mcp        tools MCP e endpoint Vercel
packages/engine diagnóstico, previsão, planos e alocação
packages/ingest parsers e validação de entrada
packages/data   benchmarks derivados e proveniência
packages/sim    campanhas sintéticas, fixtures e backtest
packages/contracts tipos congelados e métricas
```

Fechar com links para `docs/acceptance.md`, `docs/demo-contract.md`, `docs/backtest-results.md`, `docs/allocator.md`, `docs/peer-comparison.md` e `docs/HANDOFF.md`.

## Plano de execução

### Task 1: congelar a matriz de fatos

**Files:**
- Read: `README.md`
- Read: `apps/web/PRODUCT.md`
- Read: `docs/backtest-results.md`
- Read: `docs/demo-contract.md`
- Read: `docs/benchmark-provenance.md`
- Read: `docs/mazal-mcp-vercel-deco.md`
- Read: `docs/HANDOFF.md`

- [x] Confirmar cada número, status e claim do novo README contra os arquivos acima.
- [x] Remover qualquer claim de pesquisa com sellers, export Meta real ou validação de produção que não tenha evidência.
- [x] Confirmar se o endpoint MCP e o estado de produção continuam válidos antes de manter essa informação no README.

### Task 2: escrever a narrativa de produto

**Files:**
- Modify: `README.md`

- [x] Substituir o título provisório pelo hero de Mazal e pela tagline em pt-BR.
- [x] Adicionar as seções “A tese”, “O problema que Mazal resolve” e “Como a solução funciona” na ordem descrita.
- [x] Inserir a tabela de estágios sem introduzir métricas que não estejam no contrato.
- [x] Explicar pre-flight e in-flight como dois reference frames do mesmo motor.

### Task 3: registrar o trabalho efetivamente entregue

**Files:**
- Modify: `README.md`
- Link: `docs/contracts.md`
- Link: `docs/benchmark-provenance.md`
- Link: `docs/backtest-results.md`
- Link: `docs/demo-contract.md`
- Link: `docs/mazal-mcp-vercel-deco.md`

- [x] Adicionar a seção “O que construímos no hackathon” cobrindo contracts, engine, data, sim, ingest, web, MCP e qualidade.
- [x] Incluir comandos de reprodução e explicar o que cada um valida.
- [x] Descrever a arquitetura do monorepo sem transformar o README em documentação de implementação.

### Task 4: apresentar evidência e limites

**Files:**
- Modify: `README.md`
- Reference: `docs/backtest-results.md`
- Reference: `docs/benchmark-provenance.md`

- [x] Registrar os números de cobertura, benchmarks e backtest com denominadores e ressalvas.
- [x] Diferenciar claramente Olist measured data de media priors.
- [x] Incluir o caveat de autoria compartilhada entre engine e simulator.
- [x] Adicionar a tabela “Entregue / Ainda não entregue”.

### Task 5: fechar com roadmap e links de manutenção

**Files:**
- Modify: `README.md`
- Append: `docs/HANDOFF.md` somente após a implementação e verificação do README

- [x] Adicionar próximos passos em ordem de risco e aprendizado, começando por validação independente e sellers reais.
- [x] Linkar os documentos vivos e o handoff.
- [x] Não prometer prazo, cliente, receita ou integração que não estejam aprovados e implementados.

### Task 6: validar o artefato documental

**Files:**
- Verify: `README.md`

- [x] Executar `git diff --check`.
- [x] Procurar números no README e confirmar que cada um aparece em fonte local correspondente.
- [x] Procurar termos proibidos ou potencialmente enganosos: `real seller research`, `customer`, `production`, `live Meta export`, `accuracy` sem caveat, `Monte Carlo`, `real write`.
- [x] Conferir todos os links Markdown apontam para caminhos existentes.
- [x] Verificar que a primeira tela do README responde em menos de um minuto: o que é, para quem é e por que existe.

## Critério de conclusão

O README estará pronto quando alguém que não participou do hackathon conseguir responder, sem abrir o código: qual é a tese de Mazal, qual é o fluxo da solução, o que foi realmente construído, quais números têm evidência, quais limites permanecem e qual é o próximo experimento que reduz o maior risco.
