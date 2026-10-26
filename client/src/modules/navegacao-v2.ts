/**
 * Organização visual V2 — nenhuma regra de cálculo, banco ou autorização.
 * Os IDs continuam sendo os IDs reais do registro ABAS; não criamos módulos falsos.
 * A Central de Comando permanece uma ferramenta administrativa fora das 6 seções.
 */
import { ABAS, type IdDaAba } from "./abas";

export const GRUPOS_V2 = [
  { id: "visao-geral", rotulo: "Visão geral", icon: "dashboard", abaInicial: "dashboard", abas: ["dashboard"] },
  { id: "planejamento", rotulo: "Planejamento", icon: "planning", abaInicial: "eap", abas: ["escopo", "eap", "atividades", "dependencias", "cpm", "baseline", "gantt", "linha-balanco"] },
  { id: "execucao", rotulo: "Execução", icon: "execution", abaInicial: "producao", abas: ["producao", "curva-s"] },
  { id: "custos", rotulo: "Custos", icon: "costs", abaInicial: "financeiro", abas: ["financeiro"] },
  { id: "suprimentos", rotulo: "Suprimentos", icon: "supplies", abaInicial: "suprimentos", abas: ["suprimentos", "catalogo"] },
  { id: "gestao", rotulo: "Gestão", icon: "management", abaInicial: "documentos", abas: ["documentos", "riscos"] },
] as const;

export type GrupoV2 = (typeof GRUPOS_V2)[number];

export const ROTULOS_V2: Readonly<Record<string, string>> = {
  dashboard: "Painel",
  escopo: "Escopo",
  eap: "EAP",
  atividades: "Atividades",
  dependencias: "Dependências",
  cpm: "CPM",
  baseline: "Baseline",
  gantt: "Gantt",
  "linha-balanco": "Linha de Balanço",
  producao: "Produção",
  "curva-s": "Curva S",
  financeiro: "Orçamento e custos",
  suprimentos: "Suprimentos",
  catalogo: "Catálogo de insumos",
  documentos: "Documentos",
  riscos: "Riscos",
  comando: "Central de Comando",
};

export function grupoDaAbaV2(aba: IdDaAba): GrupoV2 | undefined {
  return GRUPOS_V2.find(grupo => (grupo.abas as readonly string[]).includes(aba));
}

/**
 * Ferramenta de auditoria da navegação: qualquer aba adicionada a ABAS sem
 * entrada na V2 deve aparecer num teste vermelho, nunca desaparecer da tela.
 */
export function auditarCoberturaDeAbasV2(): { ausentes: string[]; duplicadas: string[]; desconhecidas: string[] } {
  const ids = GRUPOS_V2.flatMap(grupo => [...grupo.abas]);
  const registradas = ABAS.map(aba => aba.id);
  const especiais = ["comando"];
  return {
    ausentes: registradas.filter(id => !ids.includes(id as never) && !especiais.includes(id)),
    duplicadas: ids.filter((id, index) => ids.indexOf(id) !== index),
    desconhecidas: ids.filter(id => !registradas.includes(id)),
  };
}
