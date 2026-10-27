import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

const atividade = (codigo: string, nome: string, categoria: string): EntradaDaLinha => ({
  codigo, atividade: nome, pavimento: categoria, frente: "", inicio: "2026-11-05",
  duracao: 10, quantidade: 50, unidade: "m²", executado: 0, marco: false,
});

describe("prontidão visual de Linha de Balanço", () => {
  it("não habilita o desenho de LOB quando os valores de pavimento são disciplinas e cada serviço é único", () => {
    const linhas = [
      atividade("1", "Armaduras", "Estrutura"),
      atividade("2", "Chapisco", "Revestimentos"),
      atividade("3", "Lançamento de concreto", "Estrutura"),
      atividade("4", "Assentamento", "Acabamentos"),
    ];
    const r = prepararLinhaBalancoVertical(linhas, Object.fromEntries(linhas.map(l => [l.codigo, "2026-11-18"])));
    expect(r.locais).toEqual(["Acabamentos", "Estrutura", "Revestimentos"]);
    expect(r.series.every(s => !s.repetitiva)).toBe(true);
  });
  it("o cadastro de frente e local físico está disponível para operação manual", () => {
    const atividades = readFileSync(resolve("client/src/components/PainelPlanejamento.tsx"), "utf8");
    expect(atividades).toContain('className="frente-col">Frente / disciplina');
    expect(atividades).toContain('className="pavimento-col">Local físico');
    expect(atividades).toContain('onBlur={() => salvarEdicao(activity.id, "frente")}');
    expect(atividades).toContain('onBlur={() => salvarEdicao(activity.id, "pavimento")}');
    expect(atividades).toContain('<td colSpan={13} className="pl-atividades-empty">');
    const router = readFileSync(resolve("server/routers.ts"), "utf8");
    expect(router).toContain('if (input.campo === "frente") patch.phase');
    expect(router).toContain('if (input.campo === "pavimento") patch.pavimento');
  });
  it("mantém escadinha única, com datas horizontais e diagnóstico honesto", () => {
    const componente = readFileSync(resolve("client/src/components/AuroraLinhaBalanco.tsx"), "utf8");
    expect(componente).toContain("LINHA DE RITMO AINDA NÃO DISPONÍVEL");
    expect(componente).toContain("repetitivas.length === 0");
    expect(componente).toContain('className="lob-stairs-board"');
    expect(componente).toContain("data-testid=\"lob-step-bar\"");
    expect(componente).toContain("semanas.map");
    expect(componente).toContain("meses.map");
    expect(componente).toContain("Revisar atividades e locais");
    expect(componente).toContain('aba: "gantt"');
    expect(componente).not.toContain("LinhaBalancoVertical");
  });
});
