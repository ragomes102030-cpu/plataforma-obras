import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GUARDA DO ESTADO DE CARREGAMENTO (Fase 1 — 22/10/2026)
 *
 * Os painéis pesados mostravam o estado VAZIO enquanto a consulta estava em voo.
 * Numa obra com 53 atividades, o dashboard dizia "Planejamento ainda não entrou
 * no cronograma" com 0 em todos os cartões; o catálogo dizia "0 itens" com
 * 12.077 no banco; o controle dizia "0 dias lançados" com 9 lançados. No plano
 * gratuito a espera é de 10–30 s, então o engenheiro desiste antes de ver o
 * dado — e conclui que perdeu o planejamento.
 *
 * Este teste é estático de propósito: ele não prova que a tela está bonita,
 * prova que ninguém arrancou a distinção entre "carregando" e "vazio" sem
 * perceber. A regra é: se o componente renderiza um estado vazio, ele precisa
 * olhar `isPending`.
 */

const PAINEIS = [
  ["client/src/components/PainelDoCronograma.tsx", "dashboard"],
  ["client/src/components/AbaProducao.tsx", "controle"],
  ["client/src/components/CatalogView.tsx", "catálogo"],
  ["client/src/components/AbaCurvaS.tsx", "curva S"],
] as const;

describe("carregando nunca é igual a vazio", () => {
  for (const [arquivo, nome] of PAINEIS) {
    it(`${nome}: usa EstadoCarregando e consulta isPending`, () => {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte, `${arquivo} não importa EstadoCarregando`).toContain("EstadoCarregando");
      expect(fonte, `${arquivo} não verifica isPending`).toContain("isPending");
    });
  }

  it("o componente de carregamento fala com o leitor de tela", () => {
    const fonte = readFileSync("client/src/components/EstadoCarregando.tsx", "utf-8");
    // Sem `role="status"`, quem usa leitor de tela não recebe nada enquanto a
    // consulta roda — e o silêncio é lido como "a tela não mudou".
    expect(fonte).toContain('role="status"');
    expect(fonte).toContain("aria-busy");
  });

  it("o painel do cronograma não declara obra sem planejamento enquanto carrega", () => {
    const fonte = readFileSync("client/src/components/PainelDoCronograma.tsx", "utf-8");
    const posicaoDoCarregando = fonte.indexOf("if (aindaCarregando)");
    const posicaoDoVazio = fonte.indexOf('if (estadoAtividades === "sem-atividades")');
    expect(posicaoDoCarregando).toBeGreaterThan(-1);
    expect(posicaoDoVazio).toBeGreaterThan(-1);
    // A checagem de carregamento tem de vir ANTES da de vazio, senão o vazio
    // ganha a corrida e o esqueleto nunca aparece.
    expect(posicaoDoCarregando).toBeLessThan(posicaoDoVazio);
  });
});
