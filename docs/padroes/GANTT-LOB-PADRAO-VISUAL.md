# Padrão visual obrigatório — Gantt Project / Primavera e Linha de Balanço escadinha

**Status:** padrão adotado pela Plataforma Obras, 2026-11-06. Aplicar a novos projetos e reaberturas de projetos existentes; não criar outro Gantt/LOB concorrente.

## Gantt (padrão MS Project / Primavera P6)

1. Exibir EAP hierárquica recolhível e grade à esquerda: código, serviço, duração, início, fim, avanço; escala mês/semana/dia à direita.
2. O **nome real do serviço** deve aparecer **dentro da barra** quando houver espaço. Em barras curtas, exibir o nome **imediatamente à direita** e manter título completo no tooltip. Nunca usar apenas percentual como rótulo principal.
3. Vínculos existentes do cronograma **visíveis por padrão** e conectados por setas ortogonais, respeitando FS/SS/FF/SF, chaves de **atividade**, filtros e atividades visíveis. Não inventar predecessoras nem ligar nós ocultos.
4. Barra crítica em vermelho; planejada em azul; progresso e baseline distinguíveis; marco como losango. O filtro crítico não pode eliminar a visualização quando o CPM estiver inválido.
5. Exportação SVG deve conter nomes e setas, não só cores e legenda. Não modificar cálculos CPM nem baseline por efeito de renderização.

## LOB (padrão escadinha de fluxo)

1. Pavimentos/locais físicos no eixo vertical, **datas desde o início da obra** no eixo horizontal, séries por serviço e cor consistente.
2. Todas as tarefas **com localização confirmada** recebem degraus com nomes de serviços, início/fim e equipes; as demais ficam em área explícita de pendências, sem local fictício.
3. **Vínculos reais de precedência visíveis por padrão**, com pontas e traçado contínuo entre as tarefas mostradas. Não inventar ligações por proximidade; manter mapa de códigos/identidades e relações aprovadas.
4. Preservar escadinha mesmo ao filtrar o caminho crítico, sem sumir o gráfico; manter camadas, altura e scroll corretos. Não deslocar serviços artificialmente para 2028.
5. Linha de Balanço lê o mesmo cronograma oficial; dados reais e QA permanecem separados. Mudança de aparência **não** altera quantitativos, produtividade, medições, baseline ou datas.

## Homologação

- Testes: `shared/gantt-padrao-visual.test.ts`, `shared/gantt-dependencias-visuais.test.ts`, `client/src/components/gantt-critico-dependencias-regression.test.ts`, `client/src/components/lob-inicio-obra-regression.test.ts`.
- Testar em obra QA: nomes em barras longas/curtas, seta FS/SS/FF/SF, 4+ pavimentos, crítico, baseline, zoom, colapso, SVG e LOB.
- Abrir PR da branch de feature contra `main` para disparar CI. **Nunca gravar diretamente em `develop`: o workflow `sync-develop.yml` sincroniza `develop` automaticamente com `main` após validação e merge.** Não gravar em obra real durante testes.

Este documento registra a regra de interface. A renderização é da Plataforma Obras; os MCPs EAP/Cronograma/Gantt-LOB continuam motores de cálculo stateless nos endpoints públicos.
