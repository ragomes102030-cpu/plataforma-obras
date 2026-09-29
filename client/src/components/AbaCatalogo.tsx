import { CatalogView } from "./CatalogView";

/**
 * A aba Catálogo.
 *
 * O importador da SEINFRA já funciona e é o único caminho de entrada do
 * sistema: sem a planilha da base oficial não há EAP, e sem EAP não há
 * cronograma. Reescrever os 333 linhas do `CatalogView` seria deitar fora a
 * parte do cliente que tem valor de verdade — ela é o que sabe distinguir os
 * três arquivos da SEINFRA e dizer qual chegou.
 *
 * Este arquivo existe só para dar nome de aba ao que o importador faz, e para
 * que a navegação da obra não dependa do nome do componente.
 */
export function AbaCatalogo() {
  return (
    <div className="xl-area">
      <CatalogView />
    </div>
  );
}
