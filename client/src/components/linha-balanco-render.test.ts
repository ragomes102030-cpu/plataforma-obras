import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { LinhaBalancoVertical } from "./AuroraLinhaBalanco";
import { prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

function a(codigo:string, atividade:string, pavimento:string|null, frente:string): EntradaDaLinha {
  return { codigo, atividade, pavimento, frente, inicio:"2026-11-03", duracao:10,
    quantidade:100, unidade:"m²", executado:10, marco:false };
}
function renderizar(linhas: EntradaDaLinha[]) {
  return renderToStaticMarkup(createElement(LinhaBalancoVertical, {
    linhas, finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,"2026-11-12"])),
    hoje:"2026-11-08", onAbrirAtividades:()=>{},
  }));
}

describe("LOB — renderização real do componente (SSR, sem banco)", () => {
  it("Aurora com disciplinas, mas sem serviço repetido: diagnóstico no lugar do gráfico", () => {
    const html = renderizar([
      a("1.1","Armadura de pilares","Estrutura","Estrutura"),
      a("1.2","Revestimento de paredes","Revestimentos","Acabamentos"),
      a("1.3","Passagem de eletrodutos","Instalações","Instalações"),
    ]);
    expect(html).toContain("LINHA DE RITMO AINDA NÃO DISPONÍVEL");
    expect(html).toContain("Estrutura");
    expect(html).toContain("Revestimentos");
    expect(html).toContain("Ver cronograma no Gantt");
    expect(html).toContain("Revisar atividades e locais");
    expect(html).toContain("Mapa auxiliar de atividades");
    expect(html).toContain("ocupação não representa produtividade");
    expect(html).not.toContain('class="lob-pro-scroll"');
    expect(html).not.toContain("<polyline");
  });

  it("série repetitiva com dois pavimentos físicos exibe efetivamente o gráfico de ritmo", () => {
    const html = renderizar([
      a("2.1","Alvenaria de vedação","P01","Vedação"),
      a("2.2","Alvenaria de vedação","P02","Vedação"),
    ]);
    expect(html).toContain("Linha de Balanço");
    expect(html).toContain("Serviços repetidos");
    expect(html).toContain("P01");
    expect(html).toContain("P02");
    expect(html).toContain("lob-pro-scroll");
    expect(html).not.toContain("DADOS INSUFICIENTES PARA LINHA DE BALANÇO");
  });

  it("não usa disciplinas como local nem agrega nomes iguais de frentes distintas", () => {
    const linhas = [
      a("3.1","Montagem","P01","Estrutura"),
      a("3.2","Montagem","P02","Instalações"),
      a("3.3","Pintura",null,"Acabamentos"),
      a("3.4","Pintura",null,"Fachada"),
    ];
    const r = prepararLinhaBalancoVertical(linhas,
      Object.fromEntries(linhas.map(l=>[l.codigo,"2026-11-12"])));
    expect(r.locais).toEqual(["P01","P02"]);
    expect(r.semLocal).toBe(2);
    expect(r.series).toHaveLength(2);
    expect(r.series.every(s=>!s.repetitiva)).toBe(true);
  });
  it("duas frentes repetitivas em pavimentos distintos são exibidas juntas na LOB", () => {
    const linhas = [
      a("QA.101","Alvenaria de vedação","P01","Vedação"),
      a("QA.102","Alvenaria de vedação","P02","Vedação"),
      a("QA.201","Chapisco interno","P01","Revestimentos"),
      a("QA.202","Chapisco interno","P02","Revestimentos"),
    ];
    const html = renderizar(linhas);
    const resultado = prepararLinhaBalancoVertical(
      linhas, Object.fromEntries(linhas.map(l=>[l.codigo,"2026-11-12"]))
    );
    expect(resultado.series.filter(s=>s.repetitiva)).toHaveLength(2);
    expect(html).toContain("2 sequência(s) visível(is)");
    expect(html).toContain("Mostrar todas as frentes");
    expect(html).toContain("Alvenaria de vedação");
    expect(html).toContain("Chapisco interno");
    expect((html.match(/<polyline /g)??[])).toHaveLength(4);
    expect(html).toContain("P01");
    expect(html).toContain("P02");
  });

  it("eixo de ritmo inclui só os locais das séries repetitivas visíveis", () => {
    const html = renderizar([
      a("QA.101","Alvenaria de vedação","P01","Execução"),
      a("QA.102","Alvenaria de vedação","P02","Execução"),
      a("1.1","Administração","Serviços Gerais","Execução"),
      a("1.2","Licenças","Infraestrutura","Execução"),
    ]);
    const grafico = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);
    expect(grafico).toContain(">P01<");
    expect(grafico).toContain(">P02<");
    expect(grafico).not.toContain(">Serviços Gerais<");
    expect(grafico).not.toContain(">Infraestrutura<");
  });

});
