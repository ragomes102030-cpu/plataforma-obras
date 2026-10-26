import type { IdDaAba } from "./abas";

/**
 * As 8 ferramentas existentes do planejamento compartilham o mesmo workspace.
 * Somente navegação local; qualquer operação permanece nos módulos manuais.
 */
export const VISTAS_DO_WORKSPACE: ReadonlyArray<{ titulo: string; aba: IdDaAba }> = [
  { titulo: "Escopo", aba: "escopo" },
  { titulo: "EAP", aba: "eap" },
  { titulo: "Atividades", aba: "atividades" },
  { titulo: "Dependências", aba: "dependencias" },
  { titulo: "CPM", aba: "cpm" },
  { titulo: "Baseline", aba: "baseline" },
  { titulo: "Gantt", aba: "gantt" },
  { titulo: "Linha de Balanço", aba: "linha-balanco" },
];

export function pertenceAoWorkspace(aba: IdDaAba): boolean {
  return VISTAS_DO_WORKSPACE.some(item => item.aba === aba);
}
