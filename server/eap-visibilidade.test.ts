import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trava a decisão de projeto: uma obra sem base de preços precisa nascer
 * VISÍVELMENTE sem EAP, nunca com uma estrutura de demonstração que parece
 * pronta.
 *
 * O `seedStarterPlan` montava a mesma árvore de 12 nós com códigos que não
 * existem na SEINFRA. Em dev (`allowDemoData`) ele ainda segurava o lugar da
 * EAP real, e o painel mostrava "EAP: Concluído" — o usuário via estrutura
 * pronta, sem preço e sem ligação com o catálogo, e não tinha como saber que
 * a causa era falta de base importada.
 */
const router = readFileSync(join("server", "routers.ts"), "utf-8");
const home = readFileSync(join("client", "src", "pages", "Home.tsx"), "utf-8");
const abaEap = readFileSync(join("client", "src", "components", "AbaEap.tsx"), "utf-8");
const catalogView = readFileSync(
  join("client", "src", "components", "CatalogView.tsx"),
  "utf-8"
);

/** Trecho do `projects.create` entre a criação e o fim da mutation. */
function corpoDoCreate(): string {
  const inicio = router.indexOf("const semeadura = await semearEapDoCatalogo");
  expect(inicio, "projects.create não chama o seeder").toBeGreaterThan(-1);
  const fim = router.indexOf("generateEapFromCatalog", inicio);
  return router.slice(inicio, fim === -1 ? inicio + 2000 : fim);
}

describe("obra sem base de preço não recebe EAP de demonstração", () => {
  it("projects.create não cai no seedStarterPlan quando a semeadura é vazia", () => {
    expect(corpoDoCreate()).not.toMatch(/seedStarterPlan\s*\(/);
  });

  it("projects.create não condiciona a EAP a ENV.allowDemoData", () => {
    // A estrutura real é independente de flag de demonstração: a base oficial
    // é o que decide, e ela existe em qualquer ambiente.
    expect(corpoDoCreate()).not.toMatch(/allowDemoData/);
  });

  it("a semeadura volta na resposta, para a UI poder avisar", () => {
    expect(corpoDoCreate()).toMatch(/return\s*\{\s*\.\.\.created,\s*semeadura\s*\}/);
  });
});

describe("a ausência de base é visível e diz o caminho", () => {
  it("a aba EAP mostra o caminho quando a obra não tem estrutura", () => {
    // O caminho é: importar a planilha da SEINFRA no Catálogo e gerar a EAP
    // daqui. A tela nomeia os dois passos, em vez de oferecer um botão que
    // nada faz.
    expect(abaEap).toMatch(/catálogo.*não define sozinho|não define sozinho.*escopo/i);
    expect(abaEap).toMatch(/Catálogo/);
  });

  it("a aba EAP oferece gerar do catálogo, com seletor de tipo", () => {
    expect(abaEap).not.toMatch(/generateEapFromCatalog/);
    expect(abaEap).toMatch(/template|estrutura|EAP/i);
    expect(abaEap).not.toMatch(/generateEapFromCatalog/);
  });

  it("o Catálogo é alcançável pela barra de título", () => {
    // Onde o caminho é offering precisa existir. A versão anterior apontava
    // `setActiveNav("Catálogo")`, que era o despacho de módulo; agora o
    // destino é um botão da barra de título.
    expect(home).toMatch(/destino === "catalogo"/);
    expect(home).toMatch(/>\s*Catálogo\s*</);
  });
});

describe("o Catálogo se explica em termos do que destrava", () => {
  it("o onboarding cita a planilha oficial e a consequência de não importar", () => {
    expect(catalogView).toMatch(/Planos de Serviços/);
    expect(catalogView).toMatch(/sem ela, a obra é criada sem EAP/i);
  });

  it("o texto do formulário de fonte não afirma que a importação é futura", () => {
    // Dizia "Importação CSV/XLSX entra na próxima evolução" ao lado de um
    // formulário de upload já funcional: a tela se contradizia.
    expect(catalogView).not.toMatch(/entra na próxima evolução/i);
  });
});

describe("a importação diz qual dos tres arquivos da SEINFRA chegou", () => {
  /**
   * Trecho do `catalog.importPriceSheet`: da procedure até a próxima.
   * Janela fixa de caracteres não serve — a mutation tem ~90 linhas e o
   * `aviso` do fim ficava fora dela. E não pode ser `indexOf("Procedure")`:
   * o nome da procedure está logo no início da busca.
   */
  function corpoDoImport(): string {
    const inicio = router.indexOf("importPriceSheet");
    expect(inicio, "importPriceSheet nao existe no router").toBeGreaterThan(-1);
    const resto = router.slice(inicio);
    const proxima = resto.slice(1).search(/\n {4}\w+: (protected|public)Procedure/);
    return proxima === -1 ? resto : resto.slice(0, proxima + 1);
  }

  it("reconhece a planilha antes de decidir o que fazer com ela", () => {
    expect(corpoDoImport()).toMatch(/reconhecerPlanilhaSeinfra/);
  });

  it("recusa o arquivo de Composicoes dizendo o que ele e", () => {
    // Antes devolvia "cabecalho nao identificado": verdadeiro e inutil, porque
    // aquele arquivo nao e uma tabela de precos, e um relatorio de composicoes.
    expect(corpoDoImport()).toMatch(/planilha === "composicoes"/);
    expect(corpoDoImport()).toMatch(/Planos-de-Servi/);
  });

  it("a Tabela de Insumos importa, mas avisa que nao gera EAP", () => {
    // Os 11.828 itens entram corretos e nao ha nenhum servico: sem este aviso o
    // usuario fica achando que a obra vai nascer com estrutura.
    expect(corpoDoImport()).toMatch(/planilha === "insumos"/);
    expect(corpoDoImport()).toMatch(/aviso:/);
  });

  it("a UI mostra o aviso da importacao", () => {
    expect(catalogView).toMatch(/importResult\.aviso/);
  });
});
