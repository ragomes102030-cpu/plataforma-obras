import { proposeEapWithArquimedes } from "../agent/core/arquimedes";
import type { ArquimedesLlmProvider } from "../agent/core/types";

class MockSelfHealingProvider implements ArquimedesLlmProvider {
  calls = 0;

  async complete(request: any): Promise<string> {
    this.calls += 1;
    if (request.user.includes("autocorrigir_eap_gerada")) {
      return JSON.stringify({
        basis: ["escopo da obra QA"],
        assumptions: [],
        missingInformation: [],
        nodes: [
          {
            operation: "create",
            parentCode: null,
            code: "1",
            name: "Edificação QA",
            nodeType: "grupo",
            description: "Conjunto completo da edificação.",
            inclusions: "Estrutura, vedação e instalações da edificação.",
            exclusions: "Alterações fora do escopo informado.",
            decompositionBasis: "project",
            rationale: "Raiz única da EAP.",
          },
          {
            operation: "create",
            parentCode: "1",
            code: "1.1",
            name: "Estrutura",
            nodeType: "pacote",
            description: "Estrutura da edificação.",
            inclusions: "Elementos estruturais previstos no escopo.",
            exclusions: "Serviços não estruturais.",
            responsible: "Engenheiro responsável",
            acceptanceCriteria: "Estrutura executada e inspecionada.",
            decompositionBasis: "deliverable",
            rationale: "Pacote terminal controlável.",
          },
          {
            operation: "create",
            parentCode: "1",
            code: "1.2",
            name: "Instalações",
            nodeType: "pacote",
            description: "Instalações prediais da edificação.",
            inclusions: "Instalações elétricas e hidrossanitárias previstas.",
            exclusions: "Sistemas não previstos no escopo.",
            responsible: "Engenheiro responsável",
            acceptanceCriteria: "Instalações executadas e testadas.",
            decompositionBasis: "deliverable",
            rationale: "Pacote terminal controlável.",
          },
        ],
      });
    }

    if (request.user.includes("mapear_eap_macro")) {
      return JSON.stringify({
        basis: ["escopo da obra QA"],
        assumptions: [],
        missingInformation: [],
        nodes: [
          { code: "1", name: "Estrutura", nodeType: "grupo", rationale: "Macroestrutura." },
          { code: "2", name: "Vedação", nodeType: "grupo", rationale: "Macroestrutura." },
          { code: "3", name: "Instalações", nodeType: "grupo", rationale: "Macroestrutura." },
        ],
      });
    }

    const root = request.user.match(/"root":\s*\{\s*"code":\s*"([123])"/)?.[1] ?? "1";
    return JSON.stringify({
      basis: ["escopo da obra QA"],
      assumptions: [],
      missingInformation: [],
      nodes: [
        {
          code: root + ".1",
          parentCode: root,
          name: root === "1" ? "Estrutura QA" : root === "2" ? "Vedação QA" : "Instalações QA",
          nodeType: "pacote",
          rationale: "Pacote inicial de teste.",
        },
      ],
    });
  }
}

export async function runEapSelfHealingQaSuite() {
  const provider = new MockSelfHealingProvider();
  const result = await proposeEapWithArquimedes(
    {
      projectId: 99001,
      name: "Obra QA — Autocorreção EAP",
      description: "Edificação de teste para validar geração e autocorreção da EAP.",
      tipoDeObra: "edificio",
      stage: "EAP_PROPOSTA",
      wbs: [],
    },
    provider,
  );

  const proposal = JSON.parse(result.raw);
  const healing = result.healing;
  const checks = [
    { id: "generation-returned-proposal", passed: proposal.action === "propose_eap" && proposal.nodes.length === 3 },
    { id: "self-healing-triggered", passed: healing?.healed === true },
    { id: "final-baseline-valid", passed: healing?.finalValidation.valid === true && healing.finalValidation.readyForBaseline === true },
    { id: "single-root-after-repair", passed: proposal.nodes.filter((node: any) => node.parentCode === null).length === 1 },
    { id: "dictionary-complete-after-repair", passed: proposal.nodes.filter((node: any) => node.parentCode !== null).every((node: any) => node.description && node.inclusions && node.exclusions && node.responsible && node.acceptanceCriteria && node.decompositionBasis) },
    { id: "repair-recorded-in-history", passed: (healing?.history.length ?? 0) >= 1 && healing?.history.some(item => item.corrected) === true },
    { id: "provider-used-repair-round", passed: provider.calls >= 5 },
  ];

  return {
    suite: "EAP_SELF_HEALING_REGRESSION",
    status: checks.every(check => check.passed) ? "passed" : "failed",
    checks,
    total: checks.length,
    passedCount: checks.filter(check => check.passed).length,
    providerCalls: provider.calls,
    finalIssueCodes: healing?.finalValidation.issues.map(issue => issue.code) ?? [],
  };
}
