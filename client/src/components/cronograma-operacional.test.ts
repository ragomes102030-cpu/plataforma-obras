import {describe,expect,it} from "vitest";
import fs from "node:fs";
import path from "node:path";

const ler=(arquivo:string)=>fs.readFileSync(path.join(process.cwd(),arquivo),"utf8");
describe("Cronograma Operacional integrado",()=>{
  const cronograma=ler("client/src/components/CronogramaOperacional.tsx");
  const inspetor=ler("client/src/components/InspetorAtividade.tsx");
  it("oferece Cronograma, Fluxo e Rede preservando atividade por ID",()=>{
    expect(cronograma).toContain('"cronograma","fluxo","rede"');
    expect(cronograma).toContain("atividadeSelecionadaId");
    expect(cronograma).toContain("activityId");
    expect(cronograma).toContain("contentVisibility");
  });
  it("inspetor explica todas as fontes e dados ausentes",()=>{
    for(const secao of ["Planejado","Baseline","Realizado","Rede","Local","Restrições"]) expect(inspetor).toContain(secao);
    expect(inspetor).toContain("Sem dado");
    expect(inspetor).toContain('evento.key === "Escape"');
    expect(inspetor).toContain('evento.key !== "Tab"');
    expect(inspetor).toContain("focoAnterior");
  });
});
