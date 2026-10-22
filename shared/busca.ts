/**
 * Busca textual das listas grandes (catálogo de preços, composições).
 *
 * A base SEINFRA-CE tem 12.077 itens e 4.436 composições. Filtrar isso no
 * navegador significava baixar 5,29 MB por abertura; desde 22/10/2026 o filtro
 * roda no servidor (ILIKE) e a lista volta paginada.
 *
 * O texto digitado é tratado como texto: `%` e `_` são curingas do SQL, então um
 * usuário que procure "50%" ou "TUBO_100" precisa achá-los literalmente.
 */
export function escaparCuringaLike(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Normaliza o termo de busca: sem espaços nas pontas, vazio vira `undefined`. */
export function termoDeBusca(texto: string | null | undefined): string | undefined {
  const limpo = (texto ?? "").trim();
  return limpo ? limpo : undefined;
}
