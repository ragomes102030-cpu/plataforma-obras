import type { IdDaAba } from "./abas";

/**
 * Grupos da navegação da obra. A ordem acompanha primeiro o plano e o
 * cronograma; depois separa domínios transversais de execução e governança.
 * Custos/finanças não são reduzidos a uma única fase, pois a aba reúne
 * orçamento planejado, custos reais, EVM, medições e desembolso.
 */
export const GRUPOS_DA_SIDEBAR: ReadonlyArray<{
  titulo: string;
  ids: readonly IdDaAba[];
}> = [
  { titulo: "VISÃO GERAL", ids: ["dashboard"] },
  {
    titulo: "PLANEJAMENTO",
    ids: ["escopo", "eap", "atividades", "dependencias", "cpm", "baseline"],
  },
  { titulo: "CRONOGRAMA", ids: ["gantt", "linha-balanco"] },
  { titulo: "CUSTOS E FINANÇAS", ids: ["financeiro"] },
  { titulo: "EXECUÇÃO E CONTROLE", ids: ["producao", "suprimentos", "curva-s"] },
  { titulo: "GOVERNANÇA", ids: ["documentos", "riscos"] },
  { titulo: "SISTEMA", ids: ["catalogo", "comando"] },
];
