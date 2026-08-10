# Mazal

### Campanhas não deveriam depender de sorte.

Mazal é um *campaign underwriter* para sellers brasileiros de e-commerce. Antes de lançar, estima o risco da campanha. Depois que ela roda, localiza o primeiro vazamento do funil, explica a causa e propõe um plano que o seller aprova.

> Hackathon build · Meta Ads · TypeScript determinístico · interface em pt-BR

## A tese

Ad spend é uma decisão de risco: o seller coloca dinheiro na campanha antes de saber se o produto, a oferta e a experiência de compra conseguem transformar aquele tráfego em margem.

A performance de uma campanha tem quatro camadas: **creative**, **audience**, **product/offer** e **experience**. As ferramentas tradicionais otimizam principalmente as duas primeiras, porque é isso que vive no Ads Manager. O restante dos sinais está na loja: preço, estoque, frete, ETA, página de produto, checkout, pagamento e margem.

Quando a campanha falha, o seller costuma criar outro anúncio porque é a alavanca que a ferramenta oferece. Mazal cruza a mídia com os dados do produto para responder a pergunta mais importante: o problema está no anúncio ou no destino?

**Estágios 0–2 são um problema de mídia. Estágios 3–6 são um problema de produto, oferta ou experiência. Essa fronteira é o wedge de Mazal.**

## O problema que Mazal resolve

“A campanha está underperforming” não é um diagnóstico. Se o CTR está saudável, mas o add-to-cart desaba, criar outro anúncio trata o sintoma. O vazamento pode estar no preço, no estoque, no frete, no ETA, na página do produto ou no checkout.

Mazal encontra a primeira etapa do funil que desviou da referência. Tudo depois dela é tratado como sintoma, não como uma nova causa. O resultado é uma recomendação causal: **o anúncio funcionou; a página do produto não**.

## Como a solução funciona

1. **Entrada:** o seller envia um CSV exportado do Meta Ads Manager, um log opcional de eventos da loja e um Product Card com os campos do produto.
2. **Referência:** o sistema usa benchmarks da categoria no pré-lançamento ou o histórico da própria campanha no modo in-flight.
3. **Diagnóstico:** o engine determinístico percorre os estágios em ordem, encontra a primeira quebra, detecta o change point e cruza o evento com a evidência da loja.
4. **Ação:** `buildPlan` cria ações com efeito esperado, confiança, reversibilidade e `actor: 'mazal' | 'seller'`. O seller decide antes de qualquer execução.

| Estágio | O que observa | Camada provável |
|---|---|---|
| 0–2 | entrega, atenção e landing | mídia |
| 3 | interesse no produto / add-to-cart | produto |
| 4 | intenção / checkout | experiência ou oferta |
| 5 | compra | experiência |
| 6 | economia / AOV e ROAS | oferta e margem |

O princípio é simples: **a primeira etapa quebrada é a causa; as etapas seguintes são sintomas**.

## Dois momentos, um mesmo motor

### Pre-flight

Antes de lançar, `predict` combina benchmarks de categoria, margem e, quando existir, histórico da campanha. Ele devolve uma decisão (`launch`, `launch_small` ou `dont_launch`), uma banda p10–p90 de ROAS, o break-even do seller e o fator que limita a previsão.

### In-flight

Durante a campanha, `diagnose` compara a série diária com o benchmark ou com um baseline da própria campanha. Ele localiza a quebra, informa a regra que disparou e usa o event log para transformar “checkout caiu” em uma causa verificável, como uma mudança no ETA de entrega.

O headline é **“don’t launch”**: evitar gasto ruim antes que ele aconteça. A recuperação de uma campanha em andamento é o segundo ato do mesmo problema — localizar o leak.

## Princípios de confiança

- **O LLM narra; não calcula.** Números, datas e métricas vêm do engine e dos contratos TypeScript.
- **Toda finding é auditável.** Cada achado carrega observado, referência, spread, amostra, regra e camada.
- **A incerteza aparece.** Pouco histórico mantém a banda larga e informa qual dado precisa ser instrumentado primeiro.
- **Cada ação tem dono.** O seller recebe orientação; Mazal só recebe operações explicitamente permitidas.
- **Mazal não aumenta o gasto.** As operações executáveis são pausar campanha, reduzir orçamento e definir limite de frequência.
- **Execução é simulada.** O sistema registra log e receipt; este build não possui cliente de escrita real da Meta.

## O que construímos no hackathon

### Contracts e métricas

Tipos compartilhados para contagens diárias, Product Card, eventos da loja, findings, veredictos, planos, atores e operações executáveis. As taxas e métricas derivadas ficam centralizadas em `@mazal/contracts/metrics`; os contratos não armazenam CTR, CVR, ROAS, CPA, CPC ou CPM como campos.

### Engine

O pacote [`@mazal/engine`](packages/engine) implementa:

- `diagnose`: localização do leak, change point, evidência de evento e causa provável;
- `predict`: decisão pré-flight, banda de ROAS e break-even;
- `buildPlan`: plano de recuperação com ações para Mazal e para o seller;
- `profileCard` e `measurability`: comparação do produto com sellers da categoria e identificação do dado que falta;
- response curves, allocation e reallocation de orçamento existente, sem propor aumento de spend.

### Dados e benchmarks

[`packages/data`](packages/data) deriva agregados do [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce). O repositório commita somente medianas, quartis e tamanhos de amostra; os CSVs brutos permanecem em `data/raw/`, fora do Git.

Há benchmarks para 62 das 71 categorias do Olist, cobrindo 99,84% dos pedidos. Sete das doze métricas são medidas no Olist. As cinco métricas de mídia — `cpm`, `ctr`, `cvr`, `atcRate` e `icRate` — são priors publicados, carregam `source: 'prior'` e `n: 0`, e não devem ser confundidos com medição própria. A proveniência completa está em [`docs/benchmark-provenance.md`](docs/benchmark-provenance.md).

O Olist é usado sob [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

### Simulator e fixtures

[`packages/sim`](packages/sim) gera campanhas sintéticas de forma determinística: primeiro injeta uma causa conhecida, depois expressa essa causa nos dados. Os dois casos da demo são regeneráveis:

- `demo-case1.json`: pré-flight em `housewares`, com `thin_pdp` como condição do produto;
- `demo-case2.json`: in-flight em `watches_gifts`, com `eta_shock` em 2026-07-13 e change point detectado em 2026-07-12.

O contrato exato desses casos está em [`docs/demo-contract.md`](docs/demo-contract.md).

### Ingestão

[`packages/ingest`](packages/ingest) lê exportações do Meta Ads Manager com nomes de coluna reais, números em formato pt-BR, separadores de milhar, moedas entre parênteses, valores ausentes e linhas de total. Também valida o Product Card e lê eventos da loja.

### Web app

[`apps/web`](apps/web) entrega uma experiência one-screen em pt-BR, com chat, funil, gráficos diários, change point, banda de previsão, comparação com peers, upload de CSV e painel de plano. O seller pode revisar as ações individualmente antes de executar as operações permitidas.

### MCP e operação

[`apps/mcp`](apps/mcp) expõe quatro tools MCP:

- `diagnose_campaign`;
- `predict_campaign`;
- `build_recovery_plan`;
- `execute_plan`.

O endpoint possui autenticação, validação de Host/Origin e bundle para Vercel. A operação publicada e a conexão `Mazal MCP` no Deco estão documentadas em [`docs/mazal-mcp-vercel-deco.md`](docs/mazal-mcp-vercel-deco.md). O agente segue as regras de narração segura em [`docs/deco-agent-instructions.md`](docs/deco-agent-instructions.md).

## Evidências atuais

O backtest é determinístico e usa 100 campanhas held-out:

- **59,0% top-1**;
- **59,0% top-2** em nível de estágio;
- **12,0% de falsos alarmes** em 25 campanhas saudáveis;
- baseline *always-healthy* de **25,0% top-1 com 0% de falsos alarmes**.

Esses números devem ser lidos com o denominador e com uma ressalva importante: o engine e o simulator acabaram escritos pela mesma pessoa, então o firewall A/B não se manteve. O resultado é um número de wiring e sanity, não uma validação independente de acurácia.

O resultado detalhado, a matriz de confusão, o recall por classe e as limitações de `thin_pdp`, `price_too_high` e `checkout_friction` estão em [`docs/backtest-results.md`](docs/backtest-results.md).

## Como reproduzir

Requer Node.js 24 e pnpm 11.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm sim:fixtures
pnpm sim:backtest
```

Para regenerar os benchmarks, mantenha os CSVs aprovados em `data/raw/` e rode:

```bash
pnpm derive
```

`pnpm test` executa a suíte; `pnpm typecheck` valida o grafo TypeScript; `pnpm build` gera o web build; `pnpm sim:fixtures` verifica os dois casos da demo; `pnpm sim:backtest` reproduz o número de sanity; e `pnpm derive` reescreve os agregados de dados, as categorias e os seller benchmarks.

## Estado atual e limites

| Entregue | Ainda não entregue |
|---|---|
| diagnóstico determinístico e plano auditável | escrita real na Meta |
| demo web com fixtures e upload de CSV | OAuth e Meta App Review |
| MCP deployado e conectado ao Deco | multi-conta, billing e permissões |
| benchmarks agregados e simulator reproduzível | validação independente com dados reais de sellers |
| allocator que redistribui o orçamento existente | bandits, Bayesian optimization e expansão de spend |

Este é um build de hackathon. Não há clientes, pricing validado, seller research concluído, case studies ou export real de uma conta Meta no repositório. A fixture de ingestão é construída a partir dos nomes de coluna documentados pelo Meta. Essas ausências são limites conhecidos, não evidências a serem preenchidas por narrativa.

## Próximos passos

1. **Reforçar a validação:** repetir o backtest com owners separados, conjunto maior e dados de sellers reais; corrigir as classes hoje não detectadas sem tunar no held-out.
2. **Validar com sellers:** observar o onboarding por CSV + Product Card, verificar se a distinção entre mídia e produto muda a decisão e medir se o plano é executável.
3. **Melhorar a evidência:** substituir priors de mídia por dados brasileiros identificados, sempre informando janela, denominador e unidade.
4. **Modelar a projeção do plano:** implementar uma projeção validada ou retirar o `projected` zerado da apresentação, sem esconder a limitação com copy.
5. **Endurecer ingestão e operação:** melhorar warnings do event log, erros da web, observabilidade, rotação de secrets e validação completa do endpoint MCP.
6. **Só depois avaliar Meta write access:** preservar consentimento explícito, operações decrease-only e feature flag; escrita real nunca deve ser pré-requisito para o diagnóstico.

## Estrutura do monorepo

```text
apps/web        experiência one-screen e upload
apps/mcp        tools MCP e endpoint Vercel
packages/engine diagnóstico, previsão, planos e alocação
packages/ingest parsers e validação de entrada
packages/data   benchmarks derivados e proveniência
packages/sim    campanhas sintéticas, fixtures e backtest
packages/contracts tipos congelados e métricas
```

Documentação complementar:

- [`docs/contracts.md`](docs/contracts.md) — contratos e APIs públicas;
- [`docs/acceptance.md`](docs/acceptance.md) — claims, demo beats e testes;
- [`docs/demo-contract.md`](docs/demo-contract.md) — entradas e respostas das fixtures;
- [`docs/backtest-results.md`](docs/backtest-results.md) — resultados e limitações do backtest;
- [`docs/allocator.md`](docs/allocator.md) — response curves e alocação;
- [`docs/peer-comparison.md`](docs/peer-comparison.md) — benchmarks de sellers e levers;
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — estado operacional do projeto.
