import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trava os dois bugs de `projects.calculateCpm` que a auditoria encontrou.
 *
 * 1. RESTRIÇÕES DESCARTADAS. A procedure montava `enrichedActivities` com
 *    `mustStartOnDay` / `finishNoLaterThanDay` e passava a lista ORIGINAL para
 *    o CPM. As colunas existem no schema, a tela oferece a restrição, a
 *    conversão rodava — e o resultado ia para o lixo. Sem erro, sem aviso.
 *    A pior classe de defeito: silencioso e com a interface prometendo algo que
 *    não acontecia.
 *
 * 2. CALENDÁRIO IGNORADO. A procedure montava `defaultCalendar(ano)` e nunca lia
 *    `work_calendars`, que existe no banco, tem migration e não tinha
 *    consumidor. Obra que trabalha sábado recebia cronograma de 5x2.
 *
 * Por que ler o router como texto: o bug É a passagem do argumento errado, e o
 * resto do caminho (drizzle, tRPC) precisa de MySQL de verdade. O comportamento
 * do CPM com restrição é coberto por `shared/cpm.test.ts`; aqui se trava que a
 * restrição CHEGA até ele.
 */
const router = readFileSync(join("server", "routers.ts"), "utf-8");

/**
 * Trecho do `projects.calculateCpm`: da procedure até a próxima.
 *
 * Não é `indexOf("Procedure", inicio + 20)`: o nome da própria procedure está
 * logo no começo da busca (`calculateCpm: protectedProcedure`), e o recorte
 * devolvia duas palavras. Nem janela fixa em caracteres: a mutation tem ~70
 * linhas e o bloco `restricoes` do fim ficaria fora.
 */
function corpoDoCpm(): string {
  const inicio = router.indexOf("calculateCpm:");
  expect(inicio, "calculateCpm não existe no router").toBeGreaterThan(-1);
  const resto = router.slice(inicio);
  const proxima = resto.slice(1).search(/\n {4}\w+: (protected|public)Procedure/);
  return proxima === -1 ? resto : resto.slice(0, proxima + 1);
}

describe("calculateCpm entrega as restrições ao motor", () => {
  it("passa a lista ENRIQUECIDA, e não a original", () => {
    // A linha que mata o bug é esta: `activities` em vez de
    // `enrichedActivities`.
    expect(corpoDoCpm()).toMatch(
      /calculateDeterministicCpm\(\s*enrichedActivities\s*,/
    );
    expect(corpoDoCpm()).not.toMatch(
      /calculateDeterministicCpm\(\s*activities\s*,/
    );
  });

  it("converte as duas restrições para índice de dia útil", () => {
    expect(corpoDoCpm()).toMatch(/mustStartOnDay:/);
    expect(corpoDoCpm()).toMatch(/finishNoLaterThanDay:/);
  });

  it("diz quantas restrições foram declaradas e quantas chegaram ao motor", () => {
    // Sem isso, uma restrição apontando para fora do calendário continua
    // invisível: some e ninguém percebe.
    expect(corpoDoCpm()).toMatch(/declaradas:/);
    expect(corpoDoCpm()).toMatch(/aplicadas:/);
  });
});

describe("calculateCpm usa o calendário da obra", () => {
  it("lê o calendário, e não monta o padrão do ano", () => {
    expect(corpoDoCpm()).toMatch(/carregarCalendarioDaObra\(/);
    // O bug era `const calendar = defaultCalendar(ano)`. Casa a ATRIBUIÇÃO, e
    // não a palavra: o comentário que documenta o bug também a menciona, e um
    // teste que acusa o próprio comentário desativa-se sozinho.
    expect(corpoDoCpm()).not.toMatch(/=\s*defaultCalendar\(/);
  });

  it("devolve a origem do calendário, para a tela poder avisar", () => {
    expect(corpoDoCpm()).toMatch(/calendario: \{ origem:/);
  });
});

describe("o calendário da obra tem um único caminho de leitura", () => {
  it("o router não duplica a consulta a work_calendars", () => {
    // A auditoria apontou `work_calendars` × `defaultCalendar(ano)` como fonte
    // conflitante (D3). Consertar só o calculateCpm deixaria duas cópias do
    // carregamento no mesmo arquivo — o defeito, não a correção.
    expect(router).not.toMatch(/\.from\(workCalendars\)/);
    expect(router).not.toMatch(/\.from\(calendarExceptions\)/);
  });
});
