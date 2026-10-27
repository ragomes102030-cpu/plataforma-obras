import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

describe("Gantt clássico — baseline integrada sem outra interface",()=>{
  const view=readFileSync("client/src/components/VisualizacaoPlanejamento.tsx","utf8");
  const home=readFileSync("client/src/pages/Home.tsx","utf8");
  it("consulta baseline e calendário oficiais apenas para comparação, sem escrever dados",()=>{
    expect(view).toContain("trpc.planning.compararComBaseline.useQuery");
    expect(view).toContain("trpc.planning.getCalendarForCurve.useQuery");
    expect(view).toContain('baselineVigente');
    expect(view).toContain('baselinesVigentes.length === 1');
    expect(view).toContain('prepararBarrasBaselineGantt(');
    expect(view).not.toContain("captureBaseline.useMutation");
    expect(view).not.toContain("compararComBaseline.useMutation");
  });
  it("mantém a grade e expõe comparação sob controle opcional",()=>{
    expect(view).toContain("function Gantt");
    expect(view).toContain("Comparar Gantt com baseline vigente");
    expect(view).toContain('data-testid="gantt-baseline-bar"');
    expect(view).toContain("pg-delta-fim");
    expect(view).toContain("Resumo comparativo da baseline vigente");
    expect(view).toContain("baseline: baselinePronta ?");
    expect(view).toContain("const [compararBaseline, setCompararBaseline] = useState(false)");
    expect(home).toContain('view="gantt"');
    expect(home).toContain("finsCalculados={finsCalculados}");
  });
});
