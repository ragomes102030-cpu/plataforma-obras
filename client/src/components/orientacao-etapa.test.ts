import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrientacaoDeEtapa } from "./OrientacaoDeEtapa";
import type { OrientacaoDeBloqueio } from "@shared/planning-guidance";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rede: OrientacaoDeBloqueio = {
  id: "rede-invalida",
  severidade: "bloqueio",
  titulo: "Corrigir a rede de dependências",
  oQueAconteceu: "A validação encontrou uma inconsistência na rede.",
  porQueBloqueia: "Uma rede inválida produz datas e folgas incorretas.",
  passos: ["Abra Dependências.", "Corrija o vínculo.", "Valide novamente."],
  abaDestino: "dependencias",
  rotuloAcao: "Resolver dependências",
  evidenciaDeResolucao: "A validação da rede passa sem inconsistências.",
  dadosPreservados: "Atividades válidas permanecem preservadas.",
  detalhesTecnicos: "Ciclo 10 → 12 → 10",
};

describe("OrientacaoDeEtapa", () => {
  it("explica problema, consequência, resolução e evidência sem botão genérico", () => {
    const html = renderToStaticMarkup(createElement(OrientacaoDeEtapa, { orientacao: rede }));
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Corrigir a rede de dependências");
    expect(html).toContain("O que aconteceu");
    expect(html).toContain("Por que impede continuar");
    expect(html).toContain("Como resolver");
    expect(html).toContain("Como confirmar");
    expect(html).toContain("Resolver dependências");
    expect(html).toContain("Atividades válidas permanecem preservadas");
    expect(html).toContain("Detalhes técnicos");
    expect(html).not.toContain("Próxima etapa");
  });

  it("navega por evento para a aba indicada", () => {
    const fonte = readFileSync(resolve("client/src/components/OrientacaoDeEtapa.tsx"), "utf8");
    expect(fonte).toContain('new CustomEvent("abrir-aba"');
    expect(fonte).toContain("aba: orientacao.abaDestino");
  });
});
