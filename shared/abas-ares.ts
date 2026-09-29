/**
 * As abas da obra, na ordem da planilha de referência.
 *
 * POR QUE A ORDEM MORA AQUI E NÃO NO COMPONENTE
 *
 * A ordem das abas é o contrato do arquivo: quem abre a obra e quem lê a
 * planilha precisam ver as coisas na mesma sequência, senão "aba 3" significa
 * duas coisas. O componente consome este registro; ele não o redefine.
 *
 * A ordem anterior tinha dezoito abas e foi um contrato congelado em
 * `CONTINUAR_ARES.md` §4. A planilha que passou a valer tem seis. Trocar o
 * contrato é decisão do dono do modelo, e o texto antigo foi atualizado junto
 * para não deixar dois contratos vivos ao mesmo tempo.
 */

export type StatusDaAba = "pronta" | "parcial" | "pendente";

export type AbaDoAres = {
  id: string;
  /** Texto da aba, como na planilha. */
  rotulo: string;
  status: StatusDaAba;
  /**
   * Quando a aba está vazia, o que falta. Aba pendente não desenha tela falsa
   * nem "em breve" genérico: ela nomeia o bloqueio, para ninguém concluir que
   * a tela quebrou.
   */
  falta?: string;
  /** Módulo reaproveitado que preenche a aba. */
  componenteExistente?: string;
};

/**
 * A ordem é da planilha `Relatorio_Progresso_Obra_PROFISSIONAL.xlsx`:
 * DASHBOARD, RESUMO, CRONOGRAMA, GANTT, MEDICOES, PRODUCAO.
 */
export const ABAS_DO_ARES: readonly AbaDoAres[] = [
  {
    id: "dashboard",
    rotulo: "DASHBOARD",
    status: "parcial",
    falta: "O painel lê o avanço do cronograma, que agora existe. Falta a curva S por obra e a leitura de custo.",
    componenteExistente: "Painel de progresso do portfólio",
  },
  {
    id: "resumo",
    rotulo: "RESUMO",
    status: "pendente",
    falta: "A identificação da obra (tipo, enterprise, endereço, torres, pavimentos) e o valor do contrato não têm onde ser gravados. Hoje o contrato é uma linha só em `projects`.",
    componenteExistente: "Formulário de nova obra",
  },
  {
    id: "cronograma",
    rotulo: "CRONOGRAMA",
    status: "pronta",
    componenteExistente: "Grade de atividades",
  },
  {
    id: "gantt",
    rotulo: "GANTT",
    status: "pendente",
    falta: "A grade de meses e as barras por status são do motor de colunas. Falta a tela: a barra pintada à mão da planilha é para ser calculada, não desenhada.",
    componenteExistente: "GanttView",
  },
  {
    id: "medicoes",
    rotulo: "MEDICOES",
    status: "pendente",
    falta: "% acumulado, valor da parcela e saldo a medir dependem do valor do contrato, que a aba RESUMO ainda não tem.",
  },
  {
    id: "producao",
    rotulo: "PRODUCAO",
    status: "parcial",
    falta: "O lançamento diário existe como lista filtrada por atividade. Falta a grade por data, que é a forma da planilha.",
    componenteExistente: "Lançamento de produção",
  },
] as const satisfies readonly AbaDoAres[];

export type IdDaAba = string;

/**
 * As duas visões que abrem a lateral. Não são abas: são a mesma obra mostrada
 * em escala de mês (Gantt) e de semana (Linha de Balanço), com os controles de
 * ritmo ao lado.
 *
 * A Linea de Balanco nao esta na planilha de seis abas — ela e a visao semanal
 * do mesmo CRONOGRAMA, e por isso mora na lateral do GANTT em vez de virar uma
 * aba a parte. Uma aba so para ela repetiria a mesma tabela em outra escala.
 */
export const VISOES_LATERAIS = [
  {
    id: "gantt",
    rotulo: "Gantt",
    descricao: "Barras por mês, com a cor do status calculada.",
  },
  {
    id: "lob",
    rotulo: "Linha de Balanço",
    descricao: "Produção por semana e a curva de avanço acumulado.",
  },
] as const;

export type IdDaVisaoLateral = (typeof VISOES_LATERAIS)[number]["id"];

/** Rótulo da aba para o atalho Ctrl+N, como na planilha. */
export function indiceParaAtalho(indice: number): string {
  if (indice < 0 || indice >= ABAS_DO_ARES.length) return "–";
  if (indice === 9) return "0";
  return String(indice + 1);
}

export function abaPorId(id: string): AbaDoAres {
  return ABAS_DO_ARES.find(a => a.id === id) ?? ABAS_DO_ARES[0];
}
