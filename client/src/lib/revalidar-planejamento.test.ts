import { describe, expect, it, vi } from "vitest";
import { revalidarPlanejamentoDaObra } from "./revalidar-planejamento";

describe("revalidação entre abas do planejamento", () => {
  it("atualiza todas as leituras da mesma obra após uma alteração", async () => {
    const consulta = () => ({ invalidate: vi.fn().mockResolvedValue(undefined) });
    const utils = {
      planning: { list: consulta(), grade: consulta() },
      projects: { wbs: consulta() },
      eap: { validateWbsStructure: consulta(), eapArquimedesReview: consulta() },
      agent: { snapshot: consulta(), agentPlanVersions: consulta() },
    };
    await revalidarPlanejamentoDaObra(utils, 25);
    for (const modulo of Object.values(utils)) {
      for (const leitura of Object.values(modulo)) {
        expect(leitura.invalidate).toHaveBeenCalledTimes(1);
        expect(leitura.invalidate).toHaveBeenCalledWith({ projectId: 25 });
      }
    }
  });
});
