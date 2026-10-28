import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Grade e LOB — datas de projeto e atividades de demonstração",()=>{
  const routers=readFileSync(resolve("server/routers.ts"),"utf8");
  const home=readFileSync(resolve("client/src/pages/Home.tsx"),"utf8");
  const visual=readFileSync(resolve("client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
  const painel=readFileSync(resolve("client/src/components/PainelDoCronograma.tsx"),"utf8");
  it("marca no endpoint apenas as atividades realmente identificadas como exemplo no banco",()=>{
    expect(routers).toContain('activities.filter(a=>a.exemplo===1)');
    expect(routers).toContain('Object.fromEntries([...codigosExemplo].map(codigo=>[codigo,true]))');
    expect(routers).toContain("exemploPorCodigo };");
    expect(routers).toContain('const linhasOperacionais=linhasDerivadas.filter(l=>!codigosExemplo.has(l.codigo))');
    expect(routers).toContain('agregado:agregadoDoCronograma(linhasOperacionais)');
  });
  it("propaga referência da obra e QA da grade sem alterar o plano",()=>{
    expect(home).toContain("codigosExemplo={exemploPorCodigo}");
    expect(home).toContain("inicioObra={grade.data?.inicioObra ?? null}");
    expect(visual).toContain("inicioObra={inicioObra}");
    expect(visual).toContain("codigosExemplo={codigosExemplo}");
    expect(visual).not.toContain("linhaBalanco.create");
  });
  it("não usa atividades de demonstração nos indicadores executivos",()=>{
    expect(home).toContain("filter(l => !exemploPorCodigo.has(l.codigo))");
    expect(painel).toContain("filter(a => a.exemplo !== 1)");
  });
});
