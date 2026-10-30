import { describe, expect, it } from "vitest";
import { applyEapProposalToDraft } from "./eap-proposal-apply";

describe("applyEapProposalToDraft", () => {
  it("returns the exact missing field when a structured EAP update is rejected", async () => {
    await expect(applyEapProposalToDraft({
      projectId: 25,
      userId: 42,
      proposal: {
        action: "propose_eap",
        basis: ["Escopo declarado"],
        assumptions: [],
        missingInformation: [],
        nodes: [{
          operation: "update",
          code: "1.6.1",
          parentCode: "1.6",
          name: "Acabamentos das unidades habitacionais — padrão a definir",
          nodeType: "pacote",
          rationale: undefined,
        }],
      } as never,
    })).rejects.toThrow(/nodes\.0\.rationale/);
  });
});
