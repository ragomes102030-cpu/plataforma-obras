# Continuidade da auditoria do Arquimedes

Atualizado em 2026-10-28. Este arquivo acompanha a execução progressiva do plano mestre enviado nesta data. O texto colado é o escopo de trabalho; alterações no sistema ao vivo continuam fora desta etapa.

## Base e escopo

- `main` e `develop` remotos foram consultados e estavam no mesmo commit: `e4ce608` (`feat(lob): distribuir atividades por múltiplos pavimentos com saldo e CPM (#243)`).
- A correção atual parte desse commit na branch `fix/lob-local-row-density`.
- Escopos de código concluídos nesta etapa: reduzir altura vazia na escadinha e preservar a execução real no fluxo multilocal.
- Não foram alterados dados ao vivo, schema, migrações, baselines, CPM ou deploy.

## Diagnóstico e correção da LOB

A altura era definida pelo número de serviços selecionados globalmente. Cada local reservava uma faixa para cada serviço, mesmo quando suas atividades não coincidiam ou não apareciam no período filtrado. O empilhamento agora reutiliza faixas por local com base nos intervalos visíveis. Datas coincidentes continuam em faixas separadas.

## Verificações da etapa

- Regressão antes da correção: falhou porque oito serviços sequenciais reservaram faixas separadas.
- `linha-balanco-render.test.ts`: 17 testes passaram, incluindo serviços sequenciais e três serviços simultâneos.
- Playwright local: um teste passou em desktop e celular; verificou linha de 64 px, faixa compartilhada e ausência de overflow horizontal da página.
- Capturas locais: `test-results/lob-profissional/desktop-faixas-compactas.png` e `test-results/lob-profissional/mobile-faixas-compactas.png`.
- `pnpm check`: passou. `pnpm build`: passou com avisos sobre as variáveis de analytics ausentes e o bundle JS acima de 500 kB.
- `pnpm test`: 141 arquivos passaram; 1.274 testes passaram e 8 foram ignorados por falta da planilha de referência local.
- Runtime disponível: Node.js 24.21.0; o projeto declara Node 22.x, portanto comandos reportam aviso de engine.
- `git diff --check`: passou. PR #244 está aberta contra `develop`; CI não havia reportado verificações na última consulta. Código não incorporado nem publicado.

## Auditoria multilocal — verificação de código

- Backend e interface mantêm a distribuição limitada à versão corrente, obra autorizada e unidade da mesma obra. A gravação bloqueia versões aprovadas/históricas, quantidade acima do total, atividade de QA e datas fora da janela oficial do CPM; não altera o CPM nem baseline.
- O fork da versão clona atividades e remapeia as parcelas para os novos IDs, preservando a versão histórica. Os valores distribuídos seguem apenas os registros persistidos; não há rateio presumido.
- Falha encontrada: ao integrar uma distribuição, cada barra recebia `executado: 0`, mesmo quando havia medição real na atividade. A LOB agora recebe a produção acumulada por código EAP e unidade. A parcela só recebe execução quando a medição possui `unitId`; a execução sem unidade aparece como item geral “execução sem local”, sem atribuição a pavimento.
- Testes locais para o saldo, a medição por unidade e a execução sem unidade passaram. Suíte completa atualizada: 141 arquivos, 1.272 testes passaram, 8 foram pulados; `pnpm check`, `pnpm e2e:lob-qa` (desktop/celular) e `pnpm build` passaram.
- Limite de evidência: a tentativa de consultar o Supabase pela integração MCP falhou porque a ferramenta não está disponível nesta sessão; o CLI `supabase` também não está instalado. Portanto, existência/aplicação da migração, contagens atuais da Aurora, dados multilocais reais e permissões vigentes são **NÃO TESTÁVEL** ao vivo. A afirmação no script SQL sobre provisionamento prévio não substitui leitura atual do banco.
- Hardening identificado: a migração define FKs individuais, enquanto consistência composta obra/versão/atividade/unidade é garantida no backend. O papel da aplicação tem política RLS ampla para escrita. Considerar FKs/constraints compostas em migração própria após conferir o estado real; não alterar o banco sem backup verificável e janela autorizada.
- Alterações multilocais foram adicionadas à mesma PR #244 para revisão; permanecem sem merge e sem deploy.

## Revisão da EAP — verificação de código

- A estrutura verifica raiz única, órfãos, ciclos, níveis/códigos, duplicidades, folhas terminais e filhos abaixo de entregas. Campos do dicionário e evidência de escopo são validados separadamente da estrutura; discrepâncias de quantitativos comparáveis geram alerta, sem somar unidades diferentes.
- A consulta de validação respondia `valid: true` quando não havia banco configurado, podendo anunciar sucesso sem dado. Agora retorna erro explícito de validação indisponível e não libera o gate.
- A consulta do padrão do dicionário convertia `partially_approved` em `approved`. Agora preserva a decisão parcial; a interface só considera aprovado o estado explicitamente `approved`.
- Testes das decisões do dicionário passaram. Após estas correções, a suíte completa passou (1.274 testes, 8 pulados), `pnpm check` e `pnpm build` passaram. O Playwright desktop/celular já havia passado após as alterações de renderização multilocal.
- Nenhum estado da EAP da Aurora foi lido ao vivo: continua **NÃO TESTÁVEL** até haver conexão Supabase de leitura.

## CPM, Gantt e baseline — auditoria de código

- CPM é calculado sobre a rede da versão corrente. Testes existentes cobrem FS/SS/FF/SF, lags, dias úteis, restrições de início/término, folga total/livre, ciclos e caminhos paralelos. Dependências inválidas impedem cálculo e baseline.
- Gantt e LOB recebem as atividades da consulta `planning.grade`; dependências/versão são lidas da mesma versão de planejamento. A LOB consome as datas calculadas dessa grade.
- Baseline exige versão aprovada, CPM atual e viável, durações válidas e rede de dependências íntegra. Captura de cabeçalho/itens é transacional; índice parcial e migração limitam a uma baseline ativa, arquivando a anterior sem apagar fotografias históricas.
- Validação da matriz de obra, calendário/exceções, dados de dependência e baseline vigentes da Aurora continua **NÃO TESTÁVEL** ao vivo. Migrações e consistência na base publicada ainda precisam de leitura autorizada.

## Próximos passos

1. Aguardar a revisão e o CI da PR #244; não incorporar sem aprovação e verificações aprovadas.
2. Obter uma sessão autorizada de leitura no Supabase e conferir migration/journal, atividade real e unidade, medições por unidade, versões e permissões da Aurora; não preencher locais ou quantidades por hipótese.
3. Auditar CPM, dependências, Gantt e baseline com dados e evidências atuais, sem criar ou aprovar baseline.
4. Avançar para orçamento, produção, dashboard, segurança e UX com mudanças pequenas e rastreáveis.
5. Só afirmar estado de publicação depois de verificar o commit ativo no serviço e executar teste funcional publicado.

## Governança

Uma PR pode ser aberta para revisão após as verificações desta etapa. Não incorporar alterações à `main`/`develop` sem aprovação e CI aprovados; não executar migrações ou mutações na obra ao vivo sem autorização específica.
