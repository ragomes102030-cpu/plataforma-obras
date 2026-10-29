import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/components/AbaCpm.tsx", "utf-8");
const riskPanel = readFileSync("client/src/components/PainelMonteCarlo.tsx", "utf-8");

describe("estado visível do CPM", () => {
  it("não apresenta caminho crítico ou folgas antigas como resultado vigente", () => {
    expect(source).toContain('resumo.hasStoredCpm ? resumo.criticas.length : "—"');
    expect(source).toContain('!resumo.hasStoredCpm ? (');
    expect(source).toContain("As folgas e datas calculadas só são exibidas após um CPM válido e atualizado.");
  });

  it("não chama a rede de OK apenas porque existe um vínculo", () => {
    expect(source).toContain('dependencies.length ? "Revisar" : "Pendente"');
    expect(source).toContain("conectividade ainda não validada");
    expect(source).not.toContain('dependencies.length > 0 || activities.length < 2 ? "OK"');
    expect(source).toContain("o CPM bloqueia redes desconectadas");
  });

  it("não vende o P80 nem equipara a duração determinística ao P50", () => {
    expect(riskPanel).toContain("80% das simulações terminam até aqui; confira as premissas");
    expect(riskPanel).toContain("prazo usando as durações mais prováveis");
    expect(riskPanel).not.toContain("data defensável para prometer ao cliente");
    expect(riskPanel).not.toContain("P50 aproximado");
  });
});
