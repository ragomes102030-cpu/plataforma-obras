import { describe,expect,it } from "vitest";
import { gerarSetasVisiveisGantt,type PosicaoAtividadeGantt } from "./gantt-dependencias-visuais";

const pos=new Map<string,PosicaoAtividadeGantt>([
  ["A",{x0:22,x1:96,y:15}],
  ["B",{x0:125,x1:201,y:45}],
  ["C",{x0:44,x1:110,y:75}],
  ["D",{x0:5,x1:48,y:105}],
]);
describe("Traçado contínuo do Gantt entre barras visíveis",()=>{
  it("FS desenha cotovelo completo da conclusão para o início",()=>{
    const v=gerarSetasVisiveisGantt([{de:"A",para:"B",tipo:"FS"}],pos,new Set(["A","B"]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({tipo:"FS",critica:true});
    expect(v[0]!.d).toMatch(/^M 99 15 H 111 V 45 H 122$/);
  });
  it("FS com sobreposição temporal volta por corredor para chegar da esquerda",()=>{
    const v=gerarSetasVisiveisGantt([{de:"A",para:"C",tipo:"FS"}],pos,new Set());
    expect(v).toHaveLength(1);
    expect(v[0]!.d).toMatch(/V 45 H 29 V 75 H 41$/);
  });
  it("SS, FF e SF aproximam-se pelo lado físico certo da barra",()=>{
    const deps=[
      {de:"A",para:"B",tipo:"SS"},
      {de:"A",para:"B",tipo:"FF"},
      {de:"A",para:"B",tipo:"SF"},
    ];
    const r=gerarSetasVisiveisGantt(deps,pos,new Set());
    expect(r).toHaveLength(3);
    expect(r.map(x=>x.tipo)).toEqual(["SS","FF","SF"]);
    expect(r[0]!.d).toMatch(/H 122$/);
    expect(r[1]!.d).toMatch(/H 204$/);
    expect(r[2]!.d).toMatch(/H 204$/);
    expect(r.every(x=>x.d.startsWith("M "))).toBe(true);
  });
  it("não desenha vínculos órfãos ou entre atividades ocultas/recolhidas",()=>{
    const visiveis=new Map([["A",pos.get("A")!],["B",pos.get("B")!]]);
    const r=gerarSetasVisiveisGantt([
      {de:"A",para:"C",tipo:"FS"},
      {de:"B",para:"A",tipo:"FS"},
      {de:"A",para:"A",tipo:"FS"},
      {de:"A",para:"B",tipo:"XX"},
      {de:"A",para:"B",tipo:"FS"},
      {de:"A",para:"B",tipo:"FS"},
    ],visiveis,new Set());
    expect(r.map(x=>x.chave)).toEqual(["B>A:FS","A>B:FS"]);
  });
});
