import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { LinhaBalancoEscadinha } from "./AuroraLinhaBalanco";
import { prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

function atividade(codigo: string, nome: string, pavimento: string|null, inicio: string, frente = "Execução"): EntradaDaLinha {
  return {codigo, atividade:nome, pavimento, frente, inicio, duracao:4, quantidade:120, unidade:"m²", executado:0, marco:false};
}
const add = (s: string, dias: number) => new Date(Date.parse(s+"T12:00:00Z")+dias*86400000).toISOString().slice(0,10);
function renderizar(linhas: EntradaDaLinha[]) {
  return renderToStaticMarkup(createElement(LinhaBalancoEscadinha, {
    linhas, finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo, add(l.inicio,l.duracao-1)])),
    hoje:"2026-11-08", onAbrirAtividades:()=>{},
  }));
}

describe("LOB escadinha — renderização de calendário horizontal (SSR)",()=>{
  it("não inventa ritmo sem repetição; dá acesso à edição de atividades",()=>{
    const html=renderizar([
      atividade("1","Armadura","Estrutura","2026-11-03"),
      atividade("2","Chapisco","Revestimentos","2026-11-04"),
      atividade("3","Pintura","Acabamentos","2026-11-05"),
    ]);
    expect(html).toContain("LINHA DE RITMO AINDA NÃO DISPONÍVEL");
    expect(html).toContain("Revisar atividades e locais");
    expect(html).not.toContain('data-testid="lob-step-bar"');
    expect(html).not.toContain("lob-stairs-board");
  });

  it("18 barras reais, três cores e seis pavimentos em ordem de cima para baixo",()=>{
    const nomes=["Alvenaria de vedação","Chapisco interno","Pintura interna"];
    const linhas=nomes.flatMap((nome, servico) =>
      Array.from({length:6},(_,i)=>{
        const inicio=add("2026-11-02",i*4+servico*4);
        return atividade("QA."+(servico+1)+"."+(i+1),nome,"P0"+(i+1),inicio);
      })
    );
    const resultado=prepararLinhaBalancoVertical(linhas,Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])));
    expect(resultado.series.filter(s=>s.repetitiva)).toHaveLength(3);
    const html=renderizar(linhas);
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(18);
    expect(html).toContain("3 de 3 selecionados");
    expect(html).toContain("18</strong> atividades");
    expect(html).toContain('aria-label="Zoom do calendário"');
    expect(html).toContain('aria-label="Filtrar pavimento"');
    expect(html).toContain('role="table"');
    expect(html.indexOf('role="rowheader">P06')).toBeLessThan(html.indexOf('role="rowheader">P01'));
    expect(html).toContain("Alvenaria de vedação");
    expect(html).toContain("Chapisco interno");
    expect(html).toContain("Pintura interna");
  });

  it("não coloca disciplinas isoladas no eixo dos pavimentos da escadinha",()=>{
    const html=renderizar([
      atividade("QA.1","Alvenaria","P01","2026-11-03"),
      atividade("QA.2","Alvenaria","P02","2026-11-07"),
      atividade("1.1","Administração","Serviços Gerais","2026-10-01"),
      atividade("1.2","Licenças","Infraestrutura","2026-10-02"),
    ]);
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(2);
    expect(html).toContain('role="rowheader">P01');
    expect(html).toContain('role="rowheader">P02');
    expect(html).not.toContain('role="rowheader">Serviços Gerais');
    expect(html).not.toContain('role="rowheader">Infraestrutura');
    expect(html).toContain('value="2026-11-03"');
    expect(html).not.toContain('value="2026-10-01"');
  });

  it("preserva datas oficiais com feriados e dias úteis, sem recalcular fim por duração",()=>{
    const linhas=[
      atividade("QA.1","Alvenaria","P01","2026-11-03"),
      atividade("QA.2","Alvenaria","P02","2026-11-10"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha, {
      linhas, finsCalculados:{"QA.1":"2026-11-12","QA.2":"2026-11-23"}, hoje:"2026-11-08", onAbrirAtividades:()=>{},
    }));
    expect(html).toContain("03/11/2026 a 12/11/2026");
    expect(html).toContain("10/11/2026 a 23/11/2026");
  });
  it("painel de fluxo aparece na escadinha sem alterar as barras e com indicadores derivados",()=>{
    const linhas=[
      atividade("A1","Alvenaria","P01","2026-11-01"),
      atividade("A2","Alvenaria","P02","2026-11-05"),
      atividade("B1","Revestimento","P01","2026-11-03"),
      atividade("B2","Revestimento","P02","2026-11-07"),
    ];
    const html=renderizar(linhas);
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(4);
    expect(html).toContain('data-testid="lob-flow-analysis"');
    expect(html).toContain("Análise de fluxo");
    expect(html).toContain("janelas simultâneas");
    expect(html).toContain('data-testid="lob-flow-alert"');
    expect(html).toContain("Indicadores de calendário, não medições reais");
    expect(html).toContain("entre inícios consecutivos (média)");
  });

});
