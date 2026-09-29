/**
 * A data de hoje, em ISO local ("YYYY-MM-DD").
 *
 * POR QUE ESTE HELPER EXISTE E POR QUE NÃO USA `toISOString()`
 *
 * `toISOString()` converte para UTC. Numa máquina em São Paulo (UTC−3), meia-noite
 * local vira 03:00 do dia seguinte em UTC, e a string sai com o dia errado. A
 * regra do projeto proíbe `toISOString()` para converter data, e este é o único
 * lugar do cliente que precisa do dia de hoje.
 *
 * `getFullYear`/`getMonth`/`getDate` devolvem o dia no fuso LOCAL, que é o que
 * serve: a data-base da obra é um dia do calendário, não um instante no tempo.
 *
 * POR QUE NÃO VEM DO BACKEND
 *
 * O payload de `planning.grade` já traz `hoje`, e é ele que a grade usa. Este
 * helper existe só para o instante antes da primeira resposta, em que a grade
 * ainda não tem o que mostrar.
 */
export function localIsoDe(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
