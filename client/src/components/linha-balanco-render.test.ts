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
  it("traz atividades não repetitivas desde o início da obra sem fabricar escadinha",()=>{
    const html=renderizar([
      atividade("1","Armadura","Estrutura","2026-11-03"),
      atividade("2","Chapisco","Revestimentos","2026-11-04"),
      atividade("3","Pintura","Acabamentos","2026-11-05"),
    ]);
    expect(html).not.toContain('data-testid="lob-step-bar"');
    expect(html).not.toContain('data-testid="lob-context-bar"');
    expect(html).not.toContain('data-testid="lob-general-row"');
    expect(html).toContain('data-testid="lob-previous-activities"');
    expect(html).toContain("Demais atividades do cronograma");
    expect(html).toContain("03/11/2026");
    expect(html).toContain("Armadura");
    expect(html).toContain("Chapisco");
    expect(html).toContain("Pintura");
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
    expect(html).not.toContain('data-testid="lob-context-bar"');
    expect(html).toContain('data-testid="lob-previous-activities"');
    expect(html).toContain('role="rowheader">P01');
    expect(html).toContain('role="rowheader">P02');
    expect(html).not.toContain('role="rowheader">Serviços Gerais');
    expect(html).not.toContain('role="rowheader">Infraestrutura');
    expect(html).toContain('value="2026-11-03"');
    expect(html).toContain("atividades do cronograma fora das escadinhas");
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

  it("layout aprovado mostra coluna de status e três painéis técnicos sem medir o que falta",()=>{
    const linhas=[
      atividade("QA.1","Alvenaria","P01","2026-11-03"),
      atividade("QA.2","Alvenaria","P02","2026-11-07"),
      atividade("QA.3","Chapisco","P01","2026-11-08"),
      atividade("QA.4","Chapisco","P02","2026-11-12"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas,
      finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])),
      hoje:"2026-10-27",
      estadoVinculos:"pronto",
      dependencias:[{de:"QA.1",para:"QA.3",tipo:"FS",lag:0}],
      onAbrirAtividades:()=>{},
    }));
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(4);
    expect(html).toContain('role="columnheader">Status');
    expect(html).toContain("Planejado");
    expect(html).toContain('aria-label="Resumo do planejamento"');
    expect(html).toContain('aria-label="Análise de fluxo resumida"');
    expect(html).toContain('aria-label="Detalhes da atividade selecionada"');
    expect(html).toContain("Mostrar vínculos (1)");
    expect(html).toContain("Selecione uma barra");
    expect(html).toContain("Período das atividades visíveis");
    expect(html).toContain("Atividades na escadinha");
    expect(html).not.toContain('aria-label="Vínculos cadastrados entre atividades visíveis"');
  });

  it("não inventa dependências quando o estado do cronograma está indisponível",()=>{
    const linhas=[
      atividade("QA.1","Alvenaria","P01","2026-11-03"),
      atividade("QA.2","Alvenaria","P02","2026-11-07"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas, finsCalculados:{"QA.1":"2026-11-06","QA.2":"2026-11-10"},
      hoje:"2026-10-27",estadoVinculos:"erro",
      dependencias:[{de:"QA.1",para:"QA.2",tipo:"FS",lag:0}],
      onAbrirAtividades:()=>{},
    }));
    expect(html).not.toContain("Mostrar vínculos (1)");
    expect(html).toContain("Resumo do planejamento");
  });

  it("distingue início da obra em 2026 das atividades repetitivas QA programadas para 2028",()=>{
    const linhas=[
      atividade("1.5.101","Alvenaria de vedação","P01","2028-02-08"),
      atividade("1.5.102","Alvenaria de vedação","P02","2028-02-14"),
      atividade("1.8.101","Chapisco interno","P01","2028-02-15"),
      atividade("1.8.102","Chapisco interno","P02","2028-02-18"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas, finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])),
      hoje:"2026-10-27",
      inicioObra:"2026-10-01",
      codigosExemplo:new Set(linhas.map(l=>l.codigo)),
      onAbrirAtividades:()=>{},
    }));
    expect(html).toContain('data-testid="lob-calendar-context"');
    expect(html).toContain("Início cadastrado da obra:");
    expect(html).toContain("01/10/2026");
    expect(html).toContain("Primeira atividade repetitiva:");
    expect(html).toContain("08/02/2028");
    expect(html).toContain("QA: 4 atividade(s) de demonstração");
    expect(html).toContain("não representam execução real");
    expect(html).toContain('data-testid="lob-toggle-obra-start"');
    expect(html).toContain("Mostrar desde início da obra");
    expect(html).toContain('value="2028-02-08"');
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(4);
  });

  it("não inventa uma data inicial de obra nem aviso QA sem dados correspondentes",()=>{
    const linhas=[
      atividade("1.1","Alvenaria","P01","2026-11-02"),
      atividade("1.2","Alvenaria","P02","2026-11-06"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas, finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])),
      hoje:"2026-10-27", onAbrirAtividades:()=>{},
    }));
    expect(html).not.toContain('data-testid="lob-calendar-context"');
    expect(html).not.toContain("atividade(s) de demonstração");
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(2);
  });

  it("Aurora: 53 atividades anteriores acessíveis sem competir com as 18 escadinhas de 2028",()=>{
    const gerais=Array.from({length:53},(_,i)=>
      atividade("EAP."+(i+1),"Serviço geral "+(i+1),"Serviços Gerais",
        add("2026-10-01",i%22),"Etapa "+(i%5+1))
    );
    const repetidas=["Alvenaria","Chapisco","Pintura"].flatMap((nome,k)=>
      Array.from({length:6},(_,i)=>
        atividade("QA."+(k+1)+"."+(i+1),nome,"P0"+(i+1),
          add("2028-02-08",i*5+k*7),"Execução")
      )
    );
    const linhas=[...gerais,...repetidas];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas,finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])),
      hoje:"2026-10-28",inicioObra:"2026-10-01",
      codigosExemplo:new Set(repetidas.map(l=>l.codigo)),
      onAbrirAtividades:()=>{},
    }));
    // Os 18 registros QA ficam fora do desenho por padrão: nenhum
    // pavimento fictício toma o lugar das 53 atividades reais.
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(0);
    expect(html).toContain('data-testid="lob-toggle-qa"');
    expect(html).toContain('data-testid="lob-real-status"');
    expect(html).toContain("53</b> atividades do plano real");
    expect((html.match(/data-testid="lob-previous-activities"/g)??[])).toHaveLength(1);
    expect((html.match(/data-testid="lob-context-bar"/g)??[])).toHaveLength(0);
    expect((html.match(/data-testid="lob-general-row"/g)??[])).toHaveLength(0);
    expect(html).toContain("53 atividades com datas cadastradas");
    expect(html).toContain("01/10/2026");
    expect(html).not.toContain('role="rowheader">P06');
    expect(html).toContain('value="2026-10-01"'); // foco inicial no cronograma real
    expect(html).toContain("QA: 18 atividade(s) de demonstração — ocultas");
    expect(html).toContain("Serviço geral 1");
    expect(html).toContain("Serviço geral 53");
  });

  it("com local EAP confirmado: mostra 2026 no MESMO gráfico e preserva a escadinha QA",()=>{
    const linhas=[
      atividade("1.1.1","Mobilização e canteiro","Serviços Gerais","2026-10-01"),
      atividade("1.13.2","Drenagem externa","Infraestrutura Externa","2026-10-03"),
      atividade("QA.1","Alvenaria","P01","2028-02-08"),
      atividade("QA.2","Alvenaria","P02","2028-02-14"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas, finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])),
      hoje:"2026-10-28",inicioObra:"2026-10-01",
      nodosEap:[
        {id:10,code:"1.1.1",location:"Canteiro de obras"},
        {id:11,code:"1.13.2",location:null}
      ],unidades:[{id:1,code:"CANTEIRO",name:"Canteiro de obras",unitType:"setor"}],
      editavel:true,onDefinirLocal:()=>{},onCriarUnidade:()=>{},
      onAbrirAtividades:()=>{},
    }));
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(3);
    expect(html).toContain('role="rowheader">Canteiro de obras');
    expect(html).toContain('role="rowheader">P01');
    expect(html).toContain('role="rowheader">P02');
    expect(html).toContain('value="2026-10-01"');
    expect(html).toContain("Mobilização e canteiro");
    expect(html).toContain("01/10/2026 a 04/10/2026");
    expect(html).toContain('data-testid="lob-location-mapping"');
    expect(html).toContain("Drenagem externa");
    expect(html).not.toContain('data-testid="lob-context-bar"');
  });

  it("Aurora com local validado: exclui QA de 2028, mantém períodos oficiais de 2026",()=>{
    const linhas=[
      atividade("1.1.1","Mobilização e canteiro","Serviços Gerais","2026-10-01"),
      atividade("1.13.2","Drenagem externa","Infraestrutura Externa","2026-10-03"),
      atividade("QA.1","Alvenaria","P01","2028-02-08"),
      atividade("QA.2","Alvenaria","P02","2028-02-14"),
    ];
    const html=renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
      linhas,finsCalculados:Object.fromEntries(linhas.map(l=>[l.codigo,add(l.inicio,3)])),
      hoje:"2026-10-28",inicioObra:"2026-10-01",
      codigosExemplo:new Set(["QA.1","QA.2"]),
      nodosEap:[{id:10,code:"1.1.1",location:"Canteiro de obras"},{id:11,code:"1.13.2",location:"Área externa"}],
      unidades:[{id:1,code:"CANTEIRO",name:"Canteiro de obras",unitType:"setor"},{id:2,code:"AREA_EXT",name:"Área externa",unitType:"area"}],
      onAbrirAtividades:()=>{},
    }));
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(2);
    expect(html).toContain('role="rowheader">Canteiro de obras');
    expect(html).toContain('role="rowheader">Área externa');
    expect(html).not.toContain('role="rowheader">P01');
    expect(html).not.toContain('role="rowheader">P02');
    expect(html).toContain('value="2026-10-01"');
    expect(html).toContain('data-testid="lob-toggle-qa"');
    expect(html).toContain('data-testid="lob-real-status"');
    expect(html).toContain("2</b> atividades do plano real");
    expect(html).toContain("QA: 2 atividade(s) de demonstração — ocultas");
  });

  it("sem mapeamento validado: não inventa degraus de 2026",()=>{
    const html=renderizar([
      atividade("1.1.1","Mobilização e canteiro","Serviços Gerais","2026-10-01"),
      atividade("QA.1","Alvenaria","P01","2028-02-08"),
      atividade("QA.2","Alvenaria","P02","2028-02-14"),
    ]);
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(2);
    expect(html).not.toContain('role="rowheader">Serviços Gerais');
    expect(html).toContain('data-testid="lob-location-mapping"');
  });

});
