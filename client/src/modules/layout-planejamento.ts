/**
 * Gantt e Linha de Balanço profissionais são o padrão para todos os projetos.
 * Um parâmetro reversível permite comparar com a visualização clássica.
 * Não depende de obra, usuário, agente ou banco.
 */
export function usarLayoutProfissional(search = ""): boolean {
  return new URLSearchParams(search).get("layout") !== "classico";
}
