# ARQUIMEDES — Especificação LBMS / Planejamento por localizações (proposta v1)

Estado: **para aprovação**. Auditoria de 27/10/2026. Referência: AURORA TESTE, projeto 7, versão de trabalho v7/id 33. **Não é autorização para alterar schema, recalcular CPM, mexer na baseline, fazer merge ou publicar.**

## 1. Objetivo e princípios de engenharia

A Linha de Balanço deve ser resultado de um **Location-Based Management System (LBMS)**. A EAP responde **o que entregar**; a LBS responde **onde executar**; a atividade CPM representa a unidade de execução e a rede contratual; o plano de produção descreve **quanto, por quem, com qual capacidade, em que ordem e quando**. Uma mesma atividade pode envolver vários locais; um mesmo local pode receber vários serviços e equipes.

**Decisão visual expressa do usuário: manter a ESCADINHA clássica como visualização principal. Não redesenhar a LOB em linhas diagonais/flowlines.** A escadinha tem patamares horizontais de início a término de cada serviço em cada local; transições verticais e deslocamentos só quando houver sequência física/operacional comprovada. A interface não deve ser um filtro de nomes repetidos nem transformar atividades administrativas em pavimentos fictícios. Para serviços sem localização de execução física, mostrar restrições, marcos e vínculos contextuais, sem inventar patamares ou produtividade.

Fontes técnicas:
- Kenley e Seppänen, Location-Based Management for Construction (2010), Routledge: https://www.routledge.com/Location-Based-Management-for-Construction-Planning-scheduling-and-control/Kenley-Seppanen/p/book/9780415370509
- IGLC, Production Control Using Location-Based Management System: https://iglcstorage.blob.core.windows.net/papers/attachment-3f663a4d-af84-4fef-ba57-19e1e761da29.pdf
- SciELO, Planejamento tradicional, LBMS e Last Planner: https://new.scielo.br/j/ac/a/hgNBcP7YfBXVYpzV3QsCkrJ/?ilang=pt_BR&lang=pt
- IGLC, Performance Measurement Using Location-Based Status Data: https://www.iglc.net/papers/details/372

## 2. Resultados verificáveis da auditoria

Fontes inspecionadas: drizzle/schema.ts, server/routers.ts, shared/cpm.ts, shared/work-calendar.ts, shared/cronograma-colunas.ts, client/src/components/linha-balanco-modelo.ts, client/src/components/AuroraLinhaBalanco.tsx, client/src/components/lob-analise-fluxo.ts, client/src/components/VisualizacaoPlanejamento.tsx e docs/PLANO-EXPANSAO-PLANEJAMENTO.md.

No Supabase já existem as tabelas:
- production_units, production_fronts, production_teams, production_entries;
- schedule_activities, schedule_dependencies, schedule_baselines, schedule_baseline_items;
- planning_resources, activity_resource_allocations, planning_constraints;
- work_calendars, calendar_exceptions, budget_items, wbs_nodes.

Não duplicar entidades existentes.

AURORA v7: 71 atividades; 18 de demonstração com pavimentos P01–P06 e 53 com campos de “pavimento” preenchidos como nomes de disciplinas/etapas, NÃO localizações físicas validadas. Há 4 production_units (Térreo, 1º Pavimento, 2º Pavimento e Cobertura), 12 frentes, 10 equipes, 14 recursos, 10 lançamentos confirmados de produção e 0 restrições de planejamento. As 10 medições possuem equipe, mas nenhuma possui unitId. Recursos da versão corrente não possuem as alocações consultadas em uma versão histórica (154 alocações na versão id 13); não inferir produtividade atual.

As 18 linhas QA foram posicionadas explicitamente pelo roteiro scripts/qa-aurora-lob-v7.sql a partir do índice 353 de dias úteis; daí o gráfico abrir em 2028. O início da obra é 01/10/2026. Não converter esse QA em execução real.

As principais limitações atuais são:
- production_units é um cadastro plano, com sortOrder e sem árvore de localizações.
- schedule_activities.pavimento é texto livre e mistura local físico e disciplina.
- a LOB só aceita série com nome/disciplina repetidos em locais diferentes.
- sobreposições/intervalos no cliente não provam conflito, ociosidade ou produtividade.
- as medições sem unitId não permitem determinar avanço por local.
- criar apenas uma coluna locationId em schedule_activities não atende a uma atividade distribuída por vários locais.
- a grade oficial já usa calendário de trabalho e índices CPM: não recriar contas de data no browser.

A nota existente docs/PLANO-EXPANSAO-PLANEJAMENTO.md/Onda 2 é ponto de partida, mas seu esquema deve ser refinado para relação atividade × localização e versionamento.

## 3. Modelo de dados proposto (não migrado)

### 3.1 Cadastro físico LBS

Reutilizar production_units como cadastro canônico, preservar IDs e medições históricas. Proposta: adicionar parentId autorreferente (nullable) e regras de árvore, depois de verificar duplicidades e referências. unitType e sortOrder já existem: ordenar pelo percurso físico validado, não por ordem alfabética. Exemplo de LBS configurável: Obra > Bloco > Pavimento > Setor > Ambiente; para linear: Obra > Trecho > Subtrecho/Estaca. Não exigir sempre cinco níveis.

Requisitos: códigos físicos únicos por obra quando saneados, prevenção de ciclos, cada pai no mesmo projeto, ordem manual, unidades inativáveis sem exclusão de registros históricos. A versão da LBS deve ser preservável para uma baseline histórica mesmo se a hierarquia futura mudar.

### 3.2 Relação atividade × localização

Nova tabela proposta: activity_location_plans com id, projectId, versionId, activityId, unitId, plannedQuantity, measurementUnit, quantitySource, durationPolicy, manualDurationDays, mappingStatus, sequenceOrder, createdAt/updatedAt e trilha de confirmação. Unicidade para (versionId, activityId, unitId), referência íntegra ao mesmo projeto e versão; quantidades não negativas e unidades compatíveis.

Não multiplicar orçamento/quantidade ao fragmentar atividades. Validar soma das quantidades por atividade, registrar quantidade não alocada, divergências e origens.

**Regra de implantação:** se cada atividade CPM já é atômica por local, mapear 1:1. Se uma atividade cobre múltiplos locais, criar alocações em estado de MAPEAMENTO, sem atribuir datas independentes enquanto não houver decomposição CPM aprovada. O passo posterior de decompor/sincronizar atividades exige preview do impacto, nova versão de trabalho, validação de dependências, recálculo CPM, auditoria e aprovação. Nunca escrever sobre a v5 aprovada.

### 3.3 Equipes e capacidades

Reutilizar production_teams e planning_resources; não assumir que são o mesmo cadastro. Tabela de atribuição por atividade-local poderá registrar teamId, quantidade de equipes equivalentes, produtividade por equipe/dia útil, calendário e vigência. Só criar mapeamento equipe-recurso com correspondência confirmada.

Duração calculada somente se unidade, quantidade, equipe e capacidade efetiva forem conhecidas: duração útil planejada = arredondamento para cima de quantidade / capacidade efetiva diária, observando turnos, perdas, disponibilidade e limiar mínimo. Sempre distinguir cálculo planejado de medição real e de previsão.

### 3.4 Sequência de produção e dependências

Camadas:
1. Serviço A precede B no mesmo local.
2. Liberação entre blocos, setores e outros níveis físicos.
3. Mesma equipe desloca-se de local para local em ordem configurada.
4. Buffers e restrições de acesso/cura/liberação.
5. Dependências FS/SS/FF/SF + lag já existentes em schedule_dependencies.

Os vínculos por local podem ser uma nova entidade location_flow_links referenciando alocações localizadas, tipo e buffer; o CPM oficial não pode ser duplicado em rede contraditória. Cenário LBMS é previsão, não baseline/CPM aprovado. Aplicação requer transação e revisão.

### 3.5 Produção e controle

Manter production_entries, incluindo os 10 lançamentos históricos sem localização. Nunca atribuir unitId automaticamente por aproximação de nome ou frente. Serviços controlados por local exigirão unidade nos NOVOS lançamentos desse fluxo, preservando lançamento geral legado.

Projeções só com dados auditáveis: quantidade, local, equipe, intervalo e unidade compatíveis. Separar realizado, planejado, cenário e forecast. Evitar “sem medição = 0% executado” como conclusão factual quando não há rastreio suficiente.

Baseline física futura: snapshot próprio dos locais, atividades, sequência, quantidades e datas em location_baseline_items, associado à baseline oficial. Baselines existentes não recebem dados físicos retroativamente sem evidência. Planejamento por local nunca edita schedule_baseline_items por conta própria.

## 4. Contrato da API e algoritmo

Endpoint de leitura sugerido: planning.lob.getLocationPlan(projectId, versionId). Verificar autorização da obra, versão e todas as associações.

Retorno: locations (árvore LBS + ordem), tasks (atividade/EAP/local/datas/quantidade/recurso/origem), flows (sequência/equipes/cadência/buffer), nonLocationTasks (motivo de não mapear), warnings (dados insuficientes, CPM inválido, interferências potenciais, equipe dupla, unidade incompatível), provenance (versão, calendário, fonte da data e do quantitativo).

Passos do motor:
1. Ler versão aprovada/rascunho selecionada, EAP, recursos e calendários com o escopo de projeto.
2. Identificar somente associações físicas explícitas. Não inferir local por palavras como “Vedação” ou “Serviços Gerais”.
3. Para atividades 1:1, usar início/fim do CPM/grade oficial, preservando dias úteis versus datas civis.
4. Para multi-local não decomposta, bloquear calendário por segmento e apresentar diagnóstico de mapeamento.
5. Para cenários completos, calcular duração por local, sequência, disponibilidade de equipes, buffers e precedências, detectar ciclos.
6. Mostrar interferência potencial somente com evidência de local e período; não confundir simples simultaneidade com colisão.
7. Usar medições verificadas por atividade-local-equipe para progresso e forecast; exibir explicitamente hipóteses e lacunas.
8. Aplicar mudanças no CPM somente mediante aprovação humana, nova versão e testes de consistência; nenhuma atualização silenciosa em baseline.

O modo manual deve funcionar sem IA e sem MCP. Agentes podem sugerir correspondências, jamais aprová-las.

## 5. Esboço funcional para aprovação

**Uma tela: Planejamento por Localização com ESCADINHA como gráfico principal.** Manter o Gantt clássico como módulo distinto e reaproveitar o componente atual da LOB e sua geometria de degraus; não criar outra LOB paralela nem converter os patamares em linhas diagonais.

Cabeçalho: Obra | Versão | Calendário | CPM válido? | Cobertura de localizações | Modo leitura/rascunho.

Controles: Escadinha / Matriz de Produção / Restrições / Controle; filtros de bloco, setor, equipe, período, serviço e camadas (planejado, realizado, previsão, baseline). Camadas não disponíveis devem informar motivo.

**Painel principal — escadinha profissional (obrigatória)**
- X: datas civis derivadas do calendário oficial (com semana/mês/ano); Y: localizações LBS na ordem física **configurada**.
- Cada atividade-local é um **degrau/patamar horizontal**, com largura da data inicial à data final real do plano. Degraus sucessivos aparecem em pavimentos/locais distintos, formando a escadinha. **Não desenhar reta inclinada ligando centros das barras.**
- Desenhar conexão entre patamares sucessivos **somente se existir vínculo real de deslocamento/precedência**. Em caso de intervalo de mobilização/buffer, deixar o vazio evidente e usar ligação ortogonal e/ou legenda técnica; jamais inventar continuidade ou equipe.
- Durações e cadências desiguais produzem degraus de comprimentos e posições desiguais; serviço sem equipe ou produtividade pode ter patamar de calendário oficial com indicação de informação incompleta, nunca inclinação interpretada como produtividade.
- Barras/patamares de serviços distintos têm cores e etiquetas. Progresso medido, baseline e previsão (quando fundamentados) aparecem como camadas discretas, sem substituir a escadinha.
- Ao clicar no degrau: código EAP, unidade física, quantidade, equipe, duração útil, início/fim civis, vínculo CPM, restrição, realizado e origem de cada valor.
- Quando não há local validado, manter serviço na lista de diagnóstico e em seus vínculos contextuais; não criar um degrau em local fictício.

**Painel contextual separado**
- Liberação de projetos, mobilização, aprovações, restrições e marcos que afetem locais. Só conectar a um local quando houver vínculo real, e não criar barras de pavimento fictícias.
- Atividades que não têm uma alocação de localização, mas são tecnicamente localizáveis: lista de mapeamento pendente e ação de revisão manual.

**Matriz de produção**
- Linhas por serviço, colunas por unidades físicas; células com quantidade, unidade, equipe, duração, disponibilidade, predecessora, status. Edição manual somente em rascunho com validação.

**Análise operacional**
- Indicadores: ritmo planejado por equipe, variação de duração entre locais, buffers consumidos, equipe sem frente, equipe simultânea, local bloqueado, medições sem localização, diferenças do cenário com CPM/baseline.

Wireframe estrutural — **escadinhas**, não linhas diagonais (dados inteiramente ilustrativos):

    [OBRA / VERSÃO / CALENDÁRIO / COBERTURA DE LOCAIS / STATUS CPM]
    [Escadinha] [Matriz] [Restrições] [Controle] [Previsto | Real | Baseline]
    ┌───────────────────────────────────────────────────────────────┐
    │ LOCAIS       2026 → 2027 → 2028         TEMPO (DIAS / SEMANAS) │
    │ P04                                       ┌───────┐           │
    │ P03                              ┌────────┘       │           │
    │ P02                    ┌─────────┘                │           │
    │ P01           ┌────────┘                          │           │
    └───────────────────────────────────────────────────────────────┘
    [PATAMAR = JANELA DE PRODUÇÃO POR LOCAL; SUBIDA = TRANSIÇÃO VALIDADA]
    [RESTRIÇÕES / MARCOS / LIBERAÇÕES]
    [PENDÊNCIAS DE MAPEAMENTO / MEDIÇÕES SEM LOCAL]

Os conectores do wireframe são apenas ilustrativos. **Na implementação, cada patamar tem início/fim próprios e toda transição deve possuir vínculo declarado; quando não há relação real, as barras permanecem separadas.** O renderizador deve suportar durações diferentes, gaps, buffers, marcos, progresso por patamar, informação ausente, zoom e exportação sem falsear datas.

**Critério de aceite visual obrigatório:** mesmo quando o motor LBMS for evoluído, a Linha de Balanço continuará reconhecível como a escadinha já aprovada. Nenhum gráfico diagonal substituirá os patamares, e o Gantt seguirá módulo próprio.

## 6. Plano de implementação e gates

**Gate A – aprovação deste desenho e do contrato de dados:** sem DDL, deploy ou mudança de obra.

**Etapa 1 – LBS e associações:** reusar production_units; planejar migração segura com índices/estrangeiras, backfill somente validado, mapeamento 1:1 onde comprovado, diagnóstico dos 53 registros genéricos, sem escrever na AURORA de referência antes da aprovação. Testes de autorização e retrocompatibilidade.

**Etapa 2 – motor read-only:** planning.lob com dados reais e proveniência; escadinha por atividade-local com patamares horizontais e transições verificadas, painel de vínculos e lacunas; validar contra Gantt/CPM e calendário.

**Etapa 3 – motor de simulação:** equipes, quantidade/produtividade, buffers e restrições; prévia/aplicação explícita da nova versão com recálculo de CPM, sem alterar baseline anterior.

**Etapa 4 – controle:** medições por local, status, previsão, comparador com baseline congelada por localização, alertas fundamentados.

Critérios de regressão: 71 atividades da Aurora v7 preservadas; 18 QA identificadas; 53 históricas sem local validado não ganham local artificial; 10 medições históricas sem local não são modificadas; v5 aprovada, baseline, orçamento e dependências intactos. Testar fins de semana, feriados, equipe única em dois locais, ciclos, cobertura de quantidades, multi-local sem decomposição, versões, segurança cross-project e queda do MCP.

**Nenhum DDL, merge, deploy ou aplicação automática de cenário sem aprovação.**
