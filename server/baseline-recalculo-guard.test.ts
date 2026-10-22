import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GUARDA DO RECÁLCULO NA BASELINE (Fase 3 — 22/10/2026)
 *
 * O gate de captura da baseline avisava "CPM desatualizado" e mandava o
 * engenheiro "voltar à etapa CPM e recalcular". Quem está na tela da baseline
 * não sabe onde fica essa etapa, então a tarefa morria ali — baseline e curva S
 * ficavam bloqueadas sem que ninguém soubesse o caminho de saída.
 *
 * A regra que este teste protege: o aviso de CPM velho resolve o problema no
 * próprio lugar. Se alguém trocar o botão por um texto instrucional, o teste
 * quebra antes do engenheiro descobrir em produção.
 */

const FONTE = readFileSync("client/src/components/AbaBaseline.tsx", "utf-8");
// O próprio comentário que explica a decisão cita a frase antiga; a guarda vale
// para o que o engenheiro lê, então comentários saem antes da checagem.
const VISIVEL = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("baseline: gate de CPM resolve na própria tela", () => {
  it("chama planning.calculateCpm dentro da tela da baseline", () => {
    expect(FONTE).toContain("planning.calculateCpm.useMutation");
    expect(FONTE).toContain("recalcular.mutate({ projectId: projetoId })");
  });

  it("não devolve a tarefa para outra etapa", () => {
    expect(VISIVEL).not.toMatch(/volte\s+[àa]\s+etapa\s+CPM/i);
  });

  it("trava o botão enquanto recalcula", () => {
    expect(FONTE).toContain("disabled={recalcular.isPending}");
  });

  it("mostra o motivo do erro, não o objeto do motivo", () => {
    // `issues` são objetos ({ code, severity, message }); interpolar o objeto
    // direto na mensagem imprimiu "[object Object]" em produção em 22/10/2026,
    // escondendo justamente o motivo do CPM não ter fechado.
    expect(FONTE).toContain("const primeiro = problemas[0]?.message");
    expect(FONTE).not.toMatch(/\$\{result\.issues/);
  });

  it("trata o CPM que não fecha sem dizer que deu certo", () => {
    const trecho = FONTE.slice(FONTE.indexOf("const recalcular"));
    expect(trecho).toContain("result.valid === false");
    // A mensagem de sucesso só pode existir DEPOIS do retorno antecipado.
    expect(trecho.indexOf("result.valid === false")).toBeLessThan(
      trecho.indexOf("CPM recalculado")
    );
  });

  it("não deixa capturar baseline de versão em rascunho", () => {
    // O servidor recusa ("Só uma versão aprovada pode virar baseline"), então a
    // tela tem de dizer isso ANTES do clique, com o botão travado.
    expect(FONTE).toContain("plano.data?.eapApproved");
    expect(FONTE).toContain("const podeCapturar = resumo.cpmOk && versaoAprovada");
    expect(FONTE).toContain("Aprovação da EAP pendente");
  });

  it("invalida o planejamento inteiro para baseline e curva S verem o CPM novo", () => {
    const trecho = FONTE.slice(FONTE.indexOf("const recalcular"));
    expect(trecho).toContain("utils.planning.invalidate()");
  });
});
