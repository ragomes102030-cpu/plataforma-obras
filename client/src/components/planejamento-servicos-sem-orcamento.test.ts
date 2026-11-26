import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const landing = readFileSync("client/src/pages/PaginaInicial.tsx", "utf8");
const home = readFileSync("client/src/pages/Home.tsx", "utf8");
const recursosInicio = landing.indexOf("const RECURSOS = [");
const recursosFim = landing.indexOf("function Marca", recursosInicio);
const landingRecursos = landing.slice(recursosInicio, recursosFim);
const landingHeroInicio = landing.indexOf('className="arq-hero-descricao"');
const landingHero = landing.slice(landingHeroInicio, landing.indexOf("</p>", landingHeroInicio));
const novaObraInicio = home.indexOf('className="nova-obra-header"');
const novaObraFluxo = home.indexOf('className="nova-obra-fluxo"', novaObraInicio);
const novaObraIntroducao = home.slice(novaObraInicio, novaObraFluxo);
const fluxoInicio = home.indexOf('<div className="scopo-flow"');
const fluxoFim = home.indexOf("</div>", fluxoInicio);
const fluxoEscopo = home.slice(fluxoInicio, fluxoFim);
const detalheInicio = home.indexOf("<summary>Conexão do escopo ao planejamento por serviços</summary>");
const detalheFim = home.indexOf("</details>", detalheInicio);
const detalheEscopo = home.slice(detalheInicio, detalheFim);

describe("fluxo de planejamento por serviços sem orçamento", () => {
  it("apresenta serviços e prazo como caminho principal na primeira visita", () => {
    expect(landingRecursos).toContain('titulo: "Planejamento por serviços e prazo"');
    expect(landingRecursos).toContain("Orçamento é opcional para programar o prazo.");
    expect(landingRecursos).toContain('titulo: "Custos e Curva S financeira (opcional)"');
    expect(landingHero).toContain("Preços e orçamento são opcionais para programar o prazo.");
  });

  it("explica na criação da obra quais dados montam o cronograma", () => {
    expect(novaObraIntroducao).toContain("Atividades, durações e dependências montam o prazo; orçamento é opcional.");
  });

  it("separa o caminho CPM da ramificação financeira na tela de Escopo", () => {
    expect(fluxoEscopo).toContain("Revisar CPM e registrar baseline de prazo");
    expect(fluxoEscopo).toContain("Atualizar serviços em campo");
    expect(detalheEscopo).toContain("ORÇAMENTO OPCIONAL");
    expect(detalheEscopo).toContain("não são requisito para calcular o prazo");
  });
});
