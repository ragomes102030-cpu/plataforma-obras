# Continuidade da auditoria do Arquimedes

Atualizado em 2026-10-28. Este arquivo acompanha a execução progressiva do plano mestre enviado nesta data. O texto colado é o escopo de trabalho; alterações no sistema ao vivo continuam fora desta etapa.

## Base e escopo

- `main` e `develop` remotos foram consultados e estavam no mesmo commit: `e4ce608` (`feat(lob): distribuir atividades por múltiplos pavimentos com saldo e CPM (#243)`).
- A correção atual parte desse commit na branch `fix/lob-local-row-density`.
- Escopo concluído nesta etapa: reduzir altura vazia na escadinha da Linha de Balanço, mantendo a altura necessária para atividades simultâneas.
- Não foram alterados dados, schema, migrações, baselines, CPM ou deploy.

## Diagnóstico e correção da LOB

A altura era definida pelo número de serviços selecionados globalmente. Cada local reservava uma faixa para cada serviço, mesmo quando suas atividades não coincidiam ou não apareciam no período filtrado. O empilhamento agora reutiliza faixas por local com base nos intervalos visíveis. Datas coincidentes continuam em faixas separadas.

## Verificações da etapa

- Regressão antes da correção: falhou porque oito serviços sequenciais reservaram faixas separadas.
- `linha-balanco-render.test.ts`: 17 testes passaram, incluindo serviços sequenciais e três serviços simultâneos.
- Playwright local: um teste passou em desktop e celular; verificou linha de 64 px, faixa compartilhada e ausência de overflow horizontal da página.
- Capturas locais: `test-results/lob-profissional/desktop-faixas-compactas.png` e `test-results/lob-profissional/mobile-faixas-compactas.png`.
- `pnpm check`: passou. `pnpm build`: passou com avisos sobre as variáveis de analytics ausentes e o bundle JS acima de 500 kB.
- `pnpm test`: 141 arquivos passaram; 1.271 testes passaram e 8 foram ignorados por falta da planilha de referência local.
- Runtime disponível: Node.js 24.21.0; o projeto declara Node 22.x, portanto comandos reportam aviso de engine.
- `git diff --check`: passou. PR ainda não aberta; código não incorporado nem publicado.

## Próximos passos

1. Abrir PR para revisão desta correção; não incorporar sem aprovação e CI aprovados.
2. Revisar o fluxo multilocal de ponta a ponta (persistência, limites quantitativos, saldo não distribuído, CPM, versões e isolamento por obra), sem preencher locais ou quantidades por hipótese.
3. Auditar CPM, dependências, Gantt e baseline com dados e evidências atuais, sem criar ou aprovar baseline.
4. Avançar para orçamento, produção, dashboard, segurança e UX com mudanças pequenas e rastreáveis.
5. Só afirmar estado de publicação depois de verificar o commit ativo no serviço e executar teste funcional publicado.

## Governança

Uma PR pode ser aberta para revisão após as verificações desta etapa. Não incorporar alterações à `main`/`develop` sem aprovação e CI aprovados; não executar migrações ou mutações na obra ao vivo sem autorização específica.
