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
const eapView = readFileSync(join("client", "src", "components", "EapView.tsx"), "utf-8");
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

describe("a UI torna a ausência de base visível e acionável", () => {
  it("o aviso após criar a obra aponta o caminho para o Catálogo", () => {
    expect(home).toMatch(/setActiveNav\("Catálogo"\)/);
    expect(home).toMatch(/createNeedsCatalog/);
  });

  it("o aviso só oferece o botão quando a EAP não foi gerada", () => {
    // Se a EAP veio pronta, o botão de "ir importar" seria ruído.
    expect(home).toMatch(/setCreateNeedsCatalog\(s\.nosCriados === 0\)/);
  });

  it("a EAP vazia oferece gerar do catálogo, com seletor de tipo", () => {
    expect(eapView).toMatch(/generateEapFromCatalog/);
    expect(eapView).toMatch(/TIPOS_DE_OBRA/);
  });

  it("a estrutura modelo continua disponível, mas como alternativa explícita", () => {
    // Não removi: serve para quem só quer desenhar a estrutura. Mas não pode
    // ser a única porta de entrada nem se passar por EAP pronta.
    expect(eapView).toMatch(/Usar estrutura modelo/);
    expect(eapView).toMatch(/sem ligação com o catálogo de preços/);
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
