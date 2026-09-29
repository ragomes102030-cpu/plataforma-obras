/**
 * As 18 abas do modelo ARES, na ordem canônica.
 *
 * POR QUE ESTE REGISTRO EXISTE E É ÚNICO
 *
 * A ordem das abas é uma DECISÃO CONGELADA do projeto (`CONTINUAR_ARES.md` §4,
 * "ordem das abas canônica — não mudar"). Se ela viver dentro de um componente
 * React, a sidebar, a barra inferior, o atalho de teclado e qualquer leitura de
 * dados que queira saber "em que aba estou" passam a ter copias diferentes — e
 * a primeira coisa que quebra é a ordem, que é justamente o que nao pode mudar.
 *
 * `status` é honesto e não cosmético. Uma aba `pendente` NÃO renderiza tela
 * falsa: a interface diz o que falta e por quê. Preferi 18 abas com 6 honestas
 * a 18 abas que fingem funcionar — foi exatamente essa falsidade que o
 * `seedStarterPlan` produzia, com "EAP: Concluído" e nenhuma estrutura real.
 */

export type StatusDaAba = "pronta" | "parcial" | "pendente";

export type AbaDoAres = {
  /** Chave estável. É o que vai na URL e no estado. */
  id: string;
  /** Rótulo exibido, exatamente como na planilha. */
  rotulo: string;
  status: StatusDaAba;
  /**
   * O que falta quando não está pronta. Aparece na tela. Vazio quando pronta —
   * é isso que impede a interface de inventar um "em breve" genérico que não
   * diz nada.
   */
  falta?: string;
  /**
   * Qual componente existente já serve esta aba. Preenchido quando existe
   * código reaproveitado; `null` quando a aba ainda não tem tela. Aparece na
   * auditoria para não duplicar o que já existe.
   */
  componenteExistente?: string;
};

/**
 * Ordem canônica. Não reordenar, não remover, não adicionar sem decisão
 * registrada — a ordem é o contrato com quem já usa a planilha.
 */
export const ABAS_DO_ARES: AbaDoAres[] = [
  {
    id: "dashboard",
    rotulo: "DASHBOARD",
    status: "pendente",
    falta:
      "Os percentuais de progresso são digitados, e a regra do modelo exige derivá-los de PRODUÇÃO e MEDIÇÃO. Sem SERVIÇO não há o que agregar.",
  },
  {
    id: "cadastro",
    rotulo: "CADASTRO",
    status: "pendente",
    falta:
      "Não existe entidade LOCAL. A planilha tem 224 locais hierárquicos (torre → pavimento → apartamento) e a LOB por pavimento depende deles.",
  },
  {
    id: "frentes",
    rotulo: "FRENTES",
    status: "pronta",
    componenteExistente: "FrentesView",
  },
  {
    id: "eap",
    rotulo: "EAP",
    status: "pronta",
    componenteExistente: "EapView",
  },
  {
    id: "servicos",
    rotulo: "SERVIÇOS",
    status: "pendente",
    falta:
      "Não existe entidade SERVIÇO. A planilha a define como EAP × FRENTE × LOCAL, e é ela que dá sentido à linha de balanço.",
  },
  {
    id: "orcamento",
    rotulo: "ORÇAMENTO",
    status: "parcial",
    falta:
      "Funciona, mas herda de budget_items com código próprio que não vem da SEINFRA. Custo/preço/valor ainda são editáveis à mão.",
    componenteExistente: "BudgetView",
  },
  {
    id: "planejamento",
    rotulo: "PLANEJAMENTO",
    status: "parcial",
    falta:
      "As atividades existem e o CPM roda, mas não há grade: as datas são editadas por input solto, e o cálculo não dispara ao mudar quantidade, produtividade ou predecessora.",
    componenteExistente: "PlanningView + grade nova",
  },
  {
    id: "rede",
    rotulo: "REDE",
    status: "parcial",
    falta:
      "schedule_dependencies já é tabela de relação com FS/SS/FF/SF e defasagem. Falta a coluna de ORIGEM DA REGRA e a regra R6 (mesma equipe não se sobrepõe).",
    componenteExistente: "dependências em PlanningView",
  },
  {
    id: "cpm",
    rotulo: "CAMINHO CRÍTICO",
    status: "parcial",
    falta:
      "O motor calcula ES/EF/LS/LF, folga total e livre e caminho crítico. Não há grade para mostrar, e o cálculo é um botão — não é automático.",
    componenteExistente: "PlanningView (painel de CPM)",
  },
  {
    id: "gantt",
    rotulo: "GANTT",
    status: "parcial",
    falta:
      "Mostra as datas calculadas, mas converte índice de dia útil em data dentro do navegador e usa calendário padrão em vez do da obra.",
    componenteExistente: "GanttView",
  },
  {
    id: "recursos",
    rotulo: "RECURSOS",
    status: "parcial",
    falta:
      "Recurso, equipe e alocação existem. Falta o vínculo equipe ↔ atividade, sem o qual a regra R6 não pode ser detectada.",
    componenteExistente: "resources em PlanningView",
  },
  {
    id: "producao",
    rotulo: "PRODUÇÃO",
    status: "pronta",
    componenteExistente: "ProductionView",
  },
  {
    id: "medicao",
    rotulo: "MEDIÇÃO",
    status: "pendente",
    falta:
      "Não existe tabela de medição. A planilha calcula valor medido, acumulado e saldo contratual a partir dela — hoje a tela soma o que foi lançado no formulário.",
    componenteExistente: "MedicaoView (lançamento manual)",
  },
  {
    id: "controle",
    rotulo: "CONTROLE",
    status: "pendente",
    falta:
      "Planejado × realizado por indicador. Depende de % real derivado da produção, que ainda não é derivado.",
  },
  {
    id: "indicadores",
    rotulo: "INDICADORES",
    status: "pendente",
    falta:
      "Existem como cartão na tela, mas não são dado: não há valor persistido, então não dá para comparar período nem auditar quem calculou.",
  },
  {
    id: "graficos",
    rotulo: "GRÁFICOS",
    status: "parcial",
    falta:
      "Curva-S e gráficos existem e leem o banco. Vêm de séries calculadas no componente, não do motor.",
    componenteExistente: "GraficosView",
  },
  {
    id: "formulas",
    rotulo: "FÓRMULAS",
    status: "pronta",
    componenteExistente: "FormulasView",
  },
  {
    id: "configuracoes",
    rotulo: "CONFIGURAÇÕES",
    status: "pendente",
    falta:
      "Calendário da obra existe no banco mas não tem tela para editar. Sem ela, a obra que trabalha sábado não tem como declarar isso.",
  },
];

/**
 * Visões de tela cheia, na barra lateral.
 *
 * A planilha resolve Gantt e Linha de Balanço como abas. Aqui são de tela cheia
 * porque é onde se trabalha nelas — o dado é o mesmo, o modo de ver não.
 */
export const VISOES_LATERAIS = [
  {
    id: "gantt",
    rotulo: "Gantt",
    descricao: "Barras por atividade, com criticidade e avanço.",
  },
  {
    id: "lob",
    rotulo: "Linha de Balanço",
    descricao: "Serviço × semana. Precisa da aba SERVIÇOS para existir.",
  },
  {
    id: "curva-s",
    rotulo: "Curva-S",
    descricao: "Avanço planejado × realizado ao longo do prazo.",
  },
] as const;

export type IdDaAba = (typeof ABAS_DO_ARES)[number]["id"];
export type IdDaVisaoLateral = (typeof VISOES_LATERAIS)[number]["id"];

export function abaPorId(id: string): AbaDoAres | undefined {
  return ABAS_DO_ARES.find(aba => aba.id === id);
}

/**
 * Rótulo do módulo JÁ EXISTENTE que serve cada aba.
 *
 * Reaproveitar em vez de reescrever é a regra da casa, e aqui ela economiza
 * trabalho de verdade: `EapView`, `BudgetView`, `ProductionView`, `FrentesView`,
 * `MedicaoView`, `GraficosView`, `FormulasView` e `GanttView` já existem e já
 * falam com o backend. A casca escolhe qual mostrar; ela não reimplementa
 * nenhum deles.
 *
 * Ausente = a aba ainda não tem tela. Não inventar componente: a interface
 * declara que a aba está vazia e diz o que falta.
 */
export const ROTULO_DO_MODULO: Record<string, string> = {
  eap: "EAP",
  orcamento: "Orçamento",
  producao: "Produção",
  frentes: "Frentes",
  medicao: "Medição",
  graficos: "Gráficos",
  formulas: "Fórmulas",
  restricoes: "Restrições",
  relatorios: "Relatórios",
  recursos: "Cronogramas",
  cpm: "Cronogramas",
  planejamento: "Cronogramas",
  rede: "Cronogramas",
  gantt: "Cronogramas",
};

/**
 * `activeNav` destes é função do SISTEMA, não aba de pasta de trabalho.
 *
 * Catálogo é fonte de preço, Agente é assistente, Configurações é do sistema, e
 * Portfólio é a lista de obras. Nenhum deles tem aba equivalente na planilha —
 * tratar como se tivessem seria inventar equivalência e esconder onde a
 * planilha realmente não cobre o produto.
 */
const NAVS_DE_SISTEMA = ["Portfólio", "Catálogo", "Agente IA", "Configurações"];

export function ehAbaDeTrabalho(nav: string): boolean {
  return !NAVS_DE_SISTEMA.includes(nav);
}

/** Atalho de teclado no padrão da planilha: `Ctrl+1`..`Ctrl+9`, `Ctrl+0` = 10. */
export function indiceParaAtalho(indice: number): string {
  return indice === 9 ? "0" : String(indice + 1);
}
