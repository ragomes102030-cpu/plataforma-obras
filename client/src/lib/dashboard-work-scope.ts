/** Mantém dados de demonstração fora dos indicadores que descrevem a obra. */
export function excluirAtividadesDeDemonstracao<T extends { codigo: string }>(
  linhas: T[],
  codigosExemplo: ReadonlySet<string>,
): T[] {
  if (codigosExemplo.size === 0) return linhas;
  return linhas.filter(linha => !codigosExemplo.has(linha.codigo));
}

export type EstadoAtividadesDashboard = "carregando" | "erro" | "sem-atividades" | "sem-grade" | "pronto";

export function classificarEstadoAtividadesDashboard(input: {
  carregandoPlano: boolean;
  erroPlano: boolean;
  atividadesOperacionais: number;
  atividadesNaGrade: number;
}): EstadoAtividadesDashboard {
  if (input.erroPlano) return "erro";
  if (input.carregandoPlano) return "carregando";
  if (input.atividadesOperacionais === 0) return "sem-atividades";
  if (input.atividadesNaGrade === 0) return "sem-grade";
  return "pronto";
}
