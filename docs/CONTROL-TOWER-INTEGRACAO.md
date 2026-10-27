# Control Tower — integração V1 (somente leitura)

## Regras de produto

- A Control Tower é a primeira aba da obra: observa, investiga e navega, mas **não escreve no banco**.
- Nunca cria compromissos, recalcula CPM, modifica duração, reaprova baseline, registra medição nem altera orçamento.
- Todos os botões levam ao módulo manual existente usando `abrir-aba` no mesmo contexto da obra ativa; o painel de investigação apenas apresenta contexto, sem side effects.
- A plataforma continua funcional sem IA ou MCP.

## Fontes de dados em uso

| Área | Fonte real | Regra |
|---|---|---|
| Obra/data | `planning.grade` | data de referência do backend, reaproveitada pela tela |
| Avanço físico, prazo, status | `planning.grade` + `planning.list` + `shared/painel-obra.ts` | usa resumo e pesos da versão ativa, sem fórmula nova |
| EV e orçamento ativo | `budgets.list`, `calcularPesosDaCurva`, `montarResumo` | vincula custos à EAP; alerta sobre valor sem destino |
| Curva S planejada | `planning.list`, `budgets.approvedForCurve`, `getCalendarForCurve`, `buildSCurve` | exige CPM calculado e orçamento aprovado |
| Curva S realizada | `production.entries`, `acumularRealizado`, `realizadoNoDia` | apenas lançamentos confirmados válidos, por data |
| Baseline no gráfico | `planning.compararComBaseline` | opcional; não renderiza se inexistente |
| Alertas e decisões | `montarAlertas` + `validateEngineeringCoherence` + validade do CPM | mesmos alertas e destinos que existiam |
| Compromissos | `planning.lookahead` | PPC nulo continua nulo quando não apurado |
| Lançamentos | `production.entries` | últimas medições apresentadas sem mutação |

## Importante: conciliação de réguas

O cabeçalho/EV e a Curva S podem utilizar bases diferentes:
- cartões: orçamento **ativo** e linhas da grade atual;
- Curva S: orçamento **aprovado**, rede CPM, calendário de trabalho e produção confirmada por data.

O painel **não ajusta artificialmente** uma série para coincidir com outra. Divergência maior que 0,2 ponto percentual é exposta em uma nota na Curva S. Antes de consolidar indicador único de desempenho, auditar a coerência da versão orçamentária aprovada, data de corte, status de produção e baseline.

## Estados obrigatórios

- Sem atividades: ação para EAP e Atividades.
- Complementos carregando/erro: aviso; não confundir consulta indisponível com número zero.
- Curva S sem insumos: estado explicativo e link para aba Curva S.
- Sem produção confirmada vinculada: curva realizada omitida.
- Sem baseline: gráfico com planejado e realizado apenas, sem carregamento infinito.
- Sem compromissos avaliados: PPC não apurado, nunca PPC=0.
- Projeto selecionado: todas as consultas usam o `projetoId` da obra ativa.

## Verificação para aprovação

1. Conferir AURORA TESTE em desktop 1440×900 e celular 375×812.
2. Validar versão ativa do orçamento x aprovado; anotar discrepâncias reais.
3. Conferir datapoints da curva contra a aba Curva S (mesma data/caráter de confirmação).
4. Navegar do card de prazo para Gantt, de EV para orçamento, de semana para Controle, de atrasos para CPM, do gráfico para Curva S.
5. Teclado, foco, Escape, contraste, prefers-reduced-motion.
6. Nenhuma mutação, nenhum novo endpoint e nenhuma alteração de schema.
7. CI verde; revisão visual aprovada antes do merge.

**Não fazer merge/deploy automaticamente.**
