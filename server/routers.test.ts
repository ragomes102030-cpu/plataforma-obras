import { beforeAll, describe, it, expect } from "vitest";

// Teto do setup de carga do router. Nao e o timeout do teste: e o `beforeAll`
// abaixo, que roda uma unica vez fora do orcamento do `it`. ~6x o maior init
// medido (4774 ms, em 3 execucoes isoladas) — folga para maquina lenta ou
// antivirus, sem mascarar um travamento real (o import e init de modulo, sem
// I/O de rede).
const TIMEOUT_DE_CARGA_DO_ROUTER_MS = 30_000;

async function procedimentos(): Promise<Record<string, unknown>> {
  const { appRouter } = await import("./routers");
  return appRouter._def.procedures as Record<string, unknown>;
}

describe("calculateCpmLocal router", () => {
  // `./routers` puxa a cadeia pesada (drizzle/schema, agent/*, construction/*,
  // price-sources) e o init SINCRONO custa ~3,7-4,8 s nesta maquina (medido em
  // 3 execucoes isoladas: 4774/3919/3719 ms). Dentro do corpo de um `it`, esse
  // custo caia no teto de 5000 ms e estourava de forma intermitente: o 1o teste
  // carregava o modulo, os demais ja o achavam em cache (1-3 ms).
  // Aqui a carga sai do teste e vai para o setup unico, com teto proprio.
  beforeAll(async () => {
    await procedimentos();
  }, TIMEOUT_DE_CARGA_DO_ROUTER_MS);

  it("should calculate CPM locally without MCP", async () => {
    const procedures = await procedimentos();
    expect(procedures).toHaveProperty("planning.calculateCpmLocal");
  });

  it("should return validation result with schedule data", async () => {
    const procedures = await procedimentos();
    const result = procedures["planning.calculateCpmLocal"];
    expect(result).toBeDefined();
    expect(typeof result).toBe("function");
  });
});