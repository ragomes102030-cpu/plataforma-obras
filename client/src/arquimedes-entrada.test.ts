import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LANDING = readFileSync("client/src/pages/PaginaInicial.tsx", "utf-8");
const LOGIN = readFileSync("client/src/pages/Entrar.tsx", "utf-8");
const HOME = readFileSync("client/src/pages/Home.tsx", "utf-8");
const APP = readFileSync("client/src/App.tsx", "utf-8");
const ENTRADA_CSS = readFileSync("client/src/entrada.css", "utf-8");
const OBRAS_CSS = readFileSync("client/src/seletor-obra.css", "utf-8");

describe("entrada e central de obras do Arquimedes", () => {
  it("a landing identifica Arquimedes e leva à rota certa conforme a sessão", () => {
    expect(LANDING).toMatch(/ARQUIMEDES/);
    expect(LANDING).toMatch(/setLocation\(autenticado\s*\?\s*"\/obras"\s*:\s*"\/login"\)/);
    expect(LANDING).toMatch(/arq-hero-visual/);
    expect(APP).toMatch(/<Route path="\/" component=\{PaginaInicial\}/);
  });

  it("o login mantém o OAuth GitHub existente, sem criar autenticação paralela", () => {
    expect(LOGIN).toMatch(/onClick=\{startLogin\}/);
    expect(LOGIN).toMatch(/disabled=\{lendo\}/);
    expect(LOGIN).toMatch(/setLocation\("\/obras"\)/);
    expect(APP).toMatch(/<Route path="\/login" component=\{Entrar\}/);
  });

  it("a central apresenta cards navegáveis e busca por nome, código ou local", () => {
    expect(HOME).toMatch(/className="arq-obras-grade"/);
    expect(HOME).toMatch(/arq-obra-card/);
    expect(HOME).toMatch(/onClick=\{\(\) => onEscolher\(obra\.id\)\}/);
    expect(HOME).toMatch(/\[o\.name, o\.code, o\.location\]/);
    expect(HOME).toMatch(/onClick=\{onNovaObra\}/);
  });

  it("não inventa percentual de avanço nem status que a API não entrega", () => {
    const seletor = HOME.slice(HOME.indexOf("function EscolhaDeObra"), HOME.indexOf("/** A obra:"));
    expect(seletor).not.toMatch(/\b\d{1,3}%\s*(conclu[ií]do|executado|avan[cç]o)/i);
    expect(HOME).toMatch(/obra\.location \|\| "Local não informado"/);
  });

  it("a identidade respeita telas menores e preferência por movimento reduzido", () => {
    expect(ENTRADA_CSS).toMatch(/@media \(max-width: 760px\)/);
    expect(ENTRADA_CSS).toMatch(/prefers-reduced-motion: reduce/);
    expect(OBRAS_CSS).toMatch(/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(OBRAS_CSS).toMatch(/@media \(max-width: 620px\)/);
    expect(OBRAS_CSS).toMatch(/prefers-reduced-motion: reduce/);
  });
});
