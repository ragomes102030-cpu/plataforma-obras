import {describe,expect,it} from "vitest";
import fs from "node:fs";
import path from "node:path";
const ler=(arquivo:string)=>fs.readFileSync(path.join(process.cwd(),arquivo),"utf8");
describe("acessibilidade do cronograma operacional",()=>{
  const cronograma=ler("client/src/components/CronogramaOperacional.tsx");
  const inspetor=ler("client/src/components/InspetorAtividade.tsx");
  const css=ler("client/src/planilha.css");
  it("expõe nomes, estado, diálogo modal e mensagens vivas",()=>{
    expect(cronograma).toContain('aria-label="Modo do cronograma"');
    expect(cronograma).toContain('aria-live="polite"');
    expect(cronograma).toContain("aria-pressed");
    expect(inspetor).toContain('role="dialog"');
    expect(inspetor).toContain('aria-modal="true"');
  });
  it("permite teclado, restaura foco e não comunica criticidade só por cor",()=>{
    expect(inspetor).toContain('evento.key === "Escape"');
    expect(inspetor).toContain('evento.key !== "Tab"');
    expect(inspetor).toContain("focoAnterior.current?.focus()");
    expect(cronograma).toContain("Crítica");
    expect(css).toContain(":focus-visible");
  });
});
