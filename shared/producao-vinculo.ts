/**
 * De qual atividade ATUAL um lançamento de produção é.
 *
 * O lançamento guarda `activityId`, mas esse id pode ser de uma versão antiga da
 * EAP: quando a EAP é reimportada, as atividades ganham ids novos e o id antigo
 * deixa de existir no plano vigente. Na AURORA são 10 lançamentos nessa situação
 * — o painel somava o avanço pelo **código** da EAP (e mostrava 15,1%), enquanto
 * o EVM somava pelo **id** e via 0% / EV R$ 0,00.
 *
 * Regra única, igual à da grade:
 * 1. id de atividade do escopo atual manda;
 * 2. id de versão antiga é reencontrado pelo **código** da EAP;
 * 3. sem correspondência, o id original é mantido (o motor ignora o que está
 *    fora do escopo, mas o lançamento não desaparece do mapa);
 * 4. sem id e sem código não há como saber — fica de fora.
 *
 * Código duplicado não é adivinhado: melhor não somar do que somar na errada.
 */
export function resolverAtividadeDaProducao(
  activityId: number | null,
  codigoEap: string | null | undefined,
  idsAtuais: ReadonlySet<number>,
  idPorCodigo: ReadonlyMap<string, number>
): number | null {
  if (activityId != null && idsAtuais.has(activityId)) return activityId;
  const codigo = (codigoEap ?? "").trim();
  if (codigo) {
    const porCodigo = idPorCodigo.get(codigo);
    if (porCodigo != null) return porCodigo;
  }
  return activityId;
}

/**
 * Índice `código → id` das atividades atuais. Código repetido é descartado:
 * melhor não somar do que somar duas vezes na atividade errada.
 */
export function indexarAtividadesPorCodigo(
  atividades: ReadonlyArray<{ id: number; wbsCode: string | null | undefined }>
): Map<string, number> {
  const indice = new Map<string, number>();
  const duplicados = new Set<string>();
  for (const atividade of atividades) {
    const codigo = (atividade.wbsCode ?? "").trim();
    if (!codigo) continue;
    if (indice.has(codigo)) {
      duplicados.add(codigo);
      continue;
    }
    indice.set(codigo, atividade.id);
  }
  for (const codigo of duplicados) indice.delete(codigo);
  return indice;
}
