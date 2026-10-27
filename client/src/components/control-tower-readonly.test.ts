import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const painel = readFileSync("client/src/components/PainelDoCronograma.tsx", "utf8");
const control = readFileSync("client/src/components/ControlTowerDashboard.tsx", "utf8");
const curva = readFileSync("client/src/components/CurvaSControlTower.tsx", "utf8");
const styles = readFileSync("client/src/control-tower.css", "utf8");
const home = readFileSync("client/src/pages/Home.tsx", "utf8");

describe("Control Tower — integração V1 somente leitura", () => {
  it("reaproveita cálculo do painel e dados da data de referência do cronograma", () => {
    expect(painel).toContain("montarResumo({");
    expect(painel).toContain("calcularPesosDaCurva(atividades, orcamento.data?.items ?? [])");
    expect(painel).toContain("executado += valorDaAtividade * avanco");
    expect(painel).toContain("planejadoPorValor += valorDaAtividade");
    expect(painel).toContain("<ControlTowerDashboard");
    expect(home).toContain("hojeReferencia={hoje}");
    expect(painel).toContain('valorSemDestino={valorSemDestino}');
  });
  it("mantém todos os destinos reais pelo evento do Home, sem escrita de dados", () => {
    expect(control).toContain('onClick={() => abrirAba(a.aba!)}');
    expect(control).toContain('abrirAba(aba)');
    expect(home).toContain('window.addEventListener("abrir-aba", openAba)');
    for (const destino of ['"curva-s"', '"gantt"', '"financeiro"', '"atividades"', '"producao"', '"cpm"']) {
      expect(control).toContain(destino);
    }
    for (const arquivo of [painel, control, curva]) {
      expect(arquivo).not.toMatch(/\.useMutation\s*\(/);
      expect(arquivo).not.toMatch(/\.mutate\s*\(/);
      expect(arquivo).not.toMatch(/fetch\s*\(.+[,\{]\s*method\s*:\s*["'](?:POST|PATCH|PUT|DELETE)/);
    }
  });
  it("nunca fabrica pontos da Curva S nem exibe realizado antes da produção confirmada", () => {
    expect(curva).toContain("buildSCurve(insumos)");
    expect(curva).toContain("acumularRealizado(confirmados, pesosPorCodigo");
    expect(curva).toContain('e.status === "confirmada"');
    expect(curva).toContain("realizado: acumuladoConfirmado && dia <= hojeNum");
    expect(curva).toContain('approvedForCurve.useQuery');
    expect(curva).toContain('getCalendarForCurve.useQuery');
    expect(curva).toContain("temBaseline && comparacao.isPending");
    expect(curva).toContain("Os percentuais desta curva");
    expect(curva).not.toContain("dadosDemonstrativos");
  });
  it("trata estados vazios, dados parciais, teclado, celular e movimento reduzido", () => {
    expect(control).toContain("carregandoComplementos");
    expect(control).toContain("erroComplementos");
    expect(control).toContain('role="dialog"');
    expect(control).toContain('e.key === "Escape"');
    expect(control).toContain('e.key !== "Tab"');
    expect(curva).toContain('role="alert"');
    expect(curva).toContain("Curva S ainda não disponível");
    expect(styles).toContain("@media(max-width:450px)");
    expect(styles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(styles).toContain(":focus-visible");
  });
  it("só importa estilos locais à Control Tower e preserva a navegação mobile existente", () => {
    expect(control).toContain('import "@/control-tower.css"');
    expect(styles).toContain(".ct-hero");
    expect(styles).toContain(".ct-inspector");
    expect(home).toContain("xl-barra-campo");
  });
});
