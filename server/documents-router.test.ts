import { beforeAll, describe, expect, it } from "vitest";

/**
 * Contrato do router de documentos da obra.
 *
 * Sem banco de propósito: aqui só se verifica o que o tRPC resolve **antes** do
 * handler — quais operações existem e o que a validação de entrada recusa. O
 * comportamento com banco (autorização por `assertAccessibleProject`, gravação
 * do bytea) não é simulável neste ambiente e não é afirmado aqui.
 */
type Esquema = { safeParse: (valor: unknown) => { success: boolean } };
type Procedimento = { _def: { inputs: Esquema[] } };

// Teto do setup de carga do router. Nao e o timeout do teste: e o `beforeAll`
// abaixo, que roda uma unica vez fora do orcamento do `it`. ~6x o maior init
// medido (5086 ms) — folga para maquina lenta/antivirus, sem mascarar um
// travamento real (o import e init de modulo, sem I/O de rede).
const TIMEOUT_DE_CARGA_DO_ROUTER_MS = 30_000;

async function procedimentos(): Promise<Record<string, Procedimento>> {
  const { appRouter } = await import("./routers");
  return appRouter._def.procedures as unknown as Record<string, Procedimento>;
}

describe("documents router", () => {
  // `./routers` puxa a cadeia pesada (drizzle/schema, agent/*, construction/*,
  // price-sources) e o init SINCRONO custa ~3,6-5,1 s nesta maquina (medido em
  // 5 execucoes isoladas: 5086/4134/3619/3612/4580 ms). Dentro do corpo de um
  // `it`, esse custo caia no teto de 5000 ms e estourava de forma intermitente:
  // o 1o teste carregava o modulo, os demais ja o achavam em cache (1-3 ms).
  // Aqui a carga sai do teste e vai para o setup unico, com teto proprio.
  beforeAll(async () => {
    await procedimentos();
  }, TIMEOUT_DE_CARGA_DO_ROUTER_MS);

  it("expõe as quatro operações previstas", async () => {
    const procs = await procedimentos();
    for (const nome of [
      "documents.list",
      "documents.upload",
      "documents.download",
      "documents.remove",
    ]) {
      expect(procs).toHaveProperty(nome);
    }
  });

  it("recusa projectId que não seja inteiro positivo, antes de tocar no banco", async () => {
    const procs = await procedimentos();
    const esquema = procs["documents.list"]!._def.inputs[0]!;
    expect(esquema.safeParse({ projectId: 7 }).success).toBe(true);
    expect(esquema.safeParse({ projectId: 0 }).success).toBe(false);
    expect(esquema.safeParse({ projectId: -1 }).success).toBe(false);
    expect(esquema.safeParse({ projectId: 1.5 }).success).toBe(false);
    expect(esquema.safeParse({ projectId: "7" }).success).toBe(false);
    expect(esquema.safeParse({}).success).toBe(false);
  });

  it("recusa base64 acima do teto e aceita exatamente no teto", async () => {
    const procs = await procedimentos();
    const esquema = procs["documents.upload"]!._def.inputs[0]!;
    const base = { projectId: 7, fileName: "laudo.pdf", mimeType: "application/pdf" };
    expect(esquema.safeParse({ ...base, contentBase64: "QUJD" }).success).toBe(true);
    expect(esquema.safeParse({ ...base, contentBase64: "a".repeat(40_000_000) }).success).toBe(true);
    expect(esquema.safeParse({ ...base, contentBase64: "a".repeat(40_000_001) }).success).toBe(false);
  });

  it("exige fileName e mimeType no upload", async () => {
    const procs = await procedimentos();
    const esquema = procs["documents.upload"]!._def.inputs[0]!;
    expect(
      esquema.safeParse({ projectId: 7, mimeType: "application/pdf", contentBase64: "QUJD" }).success
    ).toBe(false);
    expect(
      esquema.safeParse({ projectId: 7, fileName: "laudo.pdf", contentBase64: "QUJD" }).success
    ).toBe(false);
    expect(esquema.safeParse({ projectId: 7, fileName: "", mimeType: "x", contentBase64: "QUJD" }).success).toBe(
      false
    );
  });
});
