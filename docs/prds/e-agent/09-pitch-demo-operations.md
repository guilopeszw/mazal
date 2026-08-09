# PRD — Conteúdo do deck, vídeo e ensaios

## Objetivo

Fechar o conteúdo dos sete slides e executar a preparação operacional da apresentação sem depender da ferramenta final de autoria do deck.

## Contexto mínimo necessário

- A ferramenta de slides foi deliberadamente adiada; o conteúdo-fonte vive em `docs/deck-content.md`.
- Slide 6 usa exclusivamente `docs/slide-6.md`, validado por `pnpm sim:backtest`.
- Slide 2 depende de uma citação literal real, documentada com origem em `docs/pitch-evidence.md`.
- Os valores R$1.840 e R$6.200 foram cortados até existir cálculo determinístico no engine.
- A demo tem cinco minutos, uma loja, um produto e dois momentos.

## Critérios de aceite

- [ ] `docs/pitch-evidence.md` registra a citação literal, função/contexto da pessoa e autorização de uso sem publicar dado pessoal desnecessário.
- [ ] `docs/deck-content.md` contém exatamente sete slides na ordem definida em `docs/plan/E-agent.md`.
- [ ] Slide 6 mantém 59% top-1, 59% stage-level, 12% em 25 saudáveis e floor de 25%, ou os valores que `pnpm sim:backtest` validar no momento final.
- [ ] O conteúdo declara que engine e simulator foram escritos pela mesma pessoa e apresenta o número como wiring/sanity, não precisão independente.
- [ ] Nenhum valor de economia cortado reaparece.
- [ ] A demo é ensaiada três vezes em voz alta e cronometrada; cada execução fica em até cinco minutos.
- [ ] O vídeo de backup é gravado antes dos ensaios finais e reproduzido em outro dispositivo.
- [ ] Duas pessoas ensaiam as perguntas de `docs/acceptance.md`.

## Fora do escopo (não fazer)

Não escolher ou construir a ferramenta visual antes de o conteúdo estar fechado, não inventar citação, não criar nova métrica e não editar `docs/slide-6.md` manualmente para melhorar resultados.

## Dependências

PRD 08 concluído, citação real disponível e pessoa responsável pelo laptop presente.

## Formato esperado da entrega

Dois documentos Markdown, artefato de apresentação na ferramenta escolhida posteriormente, vídeo de backup e resumo de até cinco linhas com duração dos três ensaios e local seguro do vídeo.
