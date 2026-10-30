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
    expect(home).toContain("dadosMinimosEscopo");
    expect(home).toContain("versaoAprovada");
    expect(home).not.toMatch(/unidades\.toLocaleString/);
  });
  it("separa dados de entrada do escopo da rastreabilidade posterior do cronograma",()=>{
    expect(home).toContain("Conferência do objeto para estruturar a EAP");
    expect(home).toContain("Conexão do escopo ao custo e ao cronograma");
    expect(home).toContain("não são pré-requisitos para declarar o escopo inicial");
    expect(home).not.toContain("Critérios para aprovação do escopo");
    expect(home).not.toContain("Escopo formal declarado");
    expect(home).not.toContain("Objeto contratado");
    expect(home).not.toContain("descrição contratual orienta");
  });
  it("não condiciona quantitativos e orçamento à criação prévia de atividades",()=>{
    expect(home).not.toContain("Sem atividade não há quantidade");
    expect(home).not.toContain("sem quantidade a cadeia escopo → EAP → orçamento não fecha");
    expect(home).toContain("Quantidades podem ser levantadas por pacote da EAP antes das atividades do cronograma");
  });
  it("apresenta custos e cronograma como ramos integrados antes da baseline",()=>{
    expect(home).toContain("Planejamento integrado");
    expect(home).toContain("Quantitativos e orçamento + atividades e dependências");
    expect(home).toContain("Revisão e baseline");
    expect(home).not.toContain("EAP</span><span>Quantitativos</span><span>→</span><span>Orçamento</span><span>→</span><span>Atividades");
  });
  it("não rotula dados derivados do cronograma como dimensões completas do escopo",()=>{
    expect(home).toContain("Dados do escopo e do planejamento");
    expect(home).toContain("ITENS COM DADOS");
    expect(home).toContain("não representa completude do escopo");
    expect(home).not.toContain("dimensões do escopo");
    expect(home).not.toContain("? \"COMPLETA\"");
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
    expect(eap).toContain('gerarPropostaEap.mutate({ projectId: projetoId, mode: "resolver_bloqueios" })');
    expect(eap).toContain("Aplicar proposta como rascunho");
  });
  it("revalida a estrutura depois de aplicar a proposta inicial como rascunho",()=>{
    const estadoVazio = eap.slice(eap.indexOf("function EapVazia"));
    const aplicarRascunho = estadoVazio.match(/const aplicarProposta = ([\s\S]*?);\n  const criarRaiz/);
    expect(aplicarRascunho?.[1]).toContain("utils.projects.wbs.invalidate({ projectId: projetoId })");
    expect(aplicarRascunho?.[1]).toContain("utils.eap.validateWbsStructure.invalidate({ projectId: projetoId })");
    expect(aplicarRascunho?.[1]).toContain("utils.eap.eapArquimedesReview.invalidate({ projectId: projetoId })");
  });
  it("não confunde aprovação da EAP com baseline de cronograma",()=>{
    expect(eap).toContain("Aprovar a versão da EAP; depois, estruturar atividades. A baseline do cronograma vem após o CPM, na aba Baseline.");
    expect(eap).not.toContain("aprovar e criar baseline");
  });
  it("não cria inclusões e exclusões contratuais genéricas na raiz manual",()=>{
    expect(eap).toContain("Nó-raiz da EAP. Defina objetivo e fronteiras do escopo antes de detalhar os entregáveis.");
    expect(eap).not.toContain("Todo o trabalho necessário para entregar a obra conforme o escopo contratado.");
    expect(eap).not.toContain("Trabalhos explicitamente fora do escopo contratado.");
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
