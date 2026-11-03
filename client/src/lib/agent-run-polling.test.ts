import { describe, expect, it } from "vitest";
import { acompanharRun } from "./agent-run-polling";

describe("acompanhamento de uma execução do Arquimedes", () => {
  it("recebe o estado terminal gravado logo após o timeout padrão do servidor", async () => {
    let tempo = 0;
    const run = await acompanharRun(
      async () => ({ status: tempo >= 121_500 ? "timeout" : "executando" }),
      status => status === "timeout",
      { now: () => tempo, sleep: async ms => { tempo += ms; } },
    );
    expect(run.status).toBe("timeout");
    expect(tempo).toBe(121_500);
  });

  it("tolera uma falha transitória na consulta e ainda entrega a resposta", async () => {
    let chamadas = 0;
    const run = await acompanharRun(
      async () => {
        chamadas += 1;
        if (chamadas === 1) throw new Error("rede");
        return { status: "respondido" };
      },
      status => status === "respondido",
      { sleep: async () => {} },
    );
    expect(run.status).toBe("respondido");
    expect(chamadas).toBe(2);
  });

  it("encerra o acompanhamento quando a consulta falha repetidamente", async () => {
    await expect(acompanharRun(
      async () => { throw new Error("rede"); },
      () => false,
      { sleep: async () => {} },
    )).rejects.toThrow("Falha repetida");
  });
});
