import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

const home=readFileSync("client/src/pages/Home.tsx","utf8");
const eap=readFileSync("client/src/components/AbaEap.tsx","utf8");
const css=readFileSync("client/src/escopo-eap-studio.css","utf8");
describe("Escopo → EAP Studio, sem mutação automática",()=>{
  it("inicia nova obra pelo Escopo, não pula para a EAP",()=>{
    expect(home).toMatch(/setAba\("escopo"\);\s*setNovaObraAberta\(false\)/);
    expect(home).toContain('etapa: "Escopo", aba: "escopo"');
    expect(home).toContain('etapa: "EAP", aba: "eap"');
  });
  it("mantém edição de escopo e encaminhamento explícito",()=>{
    expect(home).toContain("trpc.projects.updateScope.useMutation");
    expect(home).toContain('const irParaEap = () => window.dispatchEvent(new CustomEvent("abrir-aba", { detail: { aba: "eap" } }))');
    expect(home).toContain('className="ct-escopo-etapa"');
    expect(home).toContain("escopoFormal");
    expect(home).toContain("versaoAprovada");
    expect(home).not.toMatch(/unidades\.toLocaleString/);
  });
  it("EAP separa modo inspeção de edição manual",()=>{
    expect(eap).toContain("const [selecionadoId, setSelecionadoId]");
    expect(eap).toContain('aria-label="Ficha de inspeção do escopo"');
    expect(eap).toContain('aria-pressed={modoRevisao}');
    expect(eap).toContain('if (modoRevisao) aoEditar(no.id)');
    expect(eap).toContain('className="ct-eap-inspecionar"');
    expect(eap).toContain('className="ct-eap-editar"');
  });
  it("aproveita as operações já existentes de edição manual e análise do agente",()=>{
    for(const term of [
      "trpc.projects.createWbsNode.useMutation",
      "trpc.projects.updateWbsNode.useMutation",
      "trpc.eap.analisarEapComArquimedes.useMutation",
      "trpc.eap.aplicarPropostaEap.useMutation",
      "trpc.eap.validateWbsStructure.useQuery",
      "trpc.agent.recordDecision.useMutation"
    ]) expect(eap).toContain(term);
    expect(eap).toContain('CustomEvent("abrir-arquimedes")');
  });
  it("inspetor só consulta e abre abas, sem editar ao clicar",()=>{
    expect(eap).toContain("onClick={() => aoSelecionar(no.id)}");
    expect(eap).toContain('navegar("escopo")');
    expect(eap).toContain('navegar("financeiro")');
    expect(eap).toContain('navegar("atividades")');
    expect(eap).toContain("Nenhum filtro por pacote é aplicado automaticamente");
  });
  it("responsivo, foco e movimento reduzido",()=>{
    expect(css).toContain("@media(max-width:690px)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain(".ct-eap-inspection-layout");
  });
});