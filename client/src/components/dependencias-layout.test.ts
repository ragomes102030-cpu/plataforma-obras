import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync("client/src/components/AbaDependencias.tsx", "utf8");
const css = readFileSync("client/src/planilha.css", "utf8");

describe("rede de dependências legível e protegida", () => {
  it("separa formulário e rede em regiões verticais de largura total", () => {
    expect(fonte).toContain('aria-label="Adicionar vínculo"');
    expect(fonte).toContain('aria-label="Rede atual"');
    expect(fonte).toContain("pl-dependencias-layout");
    expect(fonte).toContain("{dependencies.length} vínculos");
    expect(fonte.indexOf('aria-label="Rede atual"')).toBeGreaterThan(fonte.indexOf('aria-label="Adicionar vínculo"'));
    expect(css).toContain("height:clamp(320px,55vh,720px)");
    expect(css).not.toMatch(/pl-dependencias-rede-wrap[^}]*max-height:\s*205px/);
  });

  it("oferece pesquisa, filtro de tipo e somente caminho crítico", () => {
    expect(fonte).toContain('placeholder="Pesquisar atividade ou EAP"');
    expect(fonte).toContain('aria-label="Filtrar por tipo de vínculo"');
    expect(fonte).toContain("Somente caminho crítico");
    expect(fonte).toContain("dependenciasFiltradas");
  });

  it("exige confirmação explícita antes de remover um vínculo", () => {
    expect(fonte).toContain("setConfirmarRemocao(dependency)");
    expect(fonte).toContain("confirmarRemocao.predecessorId");
    expect(fonte).toContain("confirmarRemocao.successorId");
    expect(fonte).toContain(">Remover vínculo<");
    expect(fonte).toContain("setConfirmarRemocao(null)");
    expect(fonte).toContain('event.key === "Escape"');
    expect(fonte.match(/remover\.mutate/g)).toHaveLength(1);
    expect(fonte).toContain("dependencyId: confirmarRemocao.id");
  });

  it("não declara que falta congelar uma baseline quando a rede está estruturalmente válida", () => {
    expect(fonte).toContain("A validação confirma apenas ciclos, referências e conectividade.");
    expect(fonte).toContain("Confirme a sequência executiva conforme método construtivo, liberações e restrições antes de usar as datas como plano.");
    expect(fonte).not.toContain("antes de congelar a baseline");
  });
});
