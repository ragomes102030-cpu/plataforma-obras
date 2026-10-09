import { expect, test } from "@playwright/test";

/**
 * Evidencia de que o app publicado carrega e opera.
 *
 * SOMENTE LEITURA. Nao clica em Aprovar, nao cria atividade, nao altera nada.
 * A AURORA TESTE e referencia de regressao e nao e tocada — nem na interface,
 * nem no banco.
 *
 * Diferenca para aurora-arquimedes.e2e.spec.ts: aquele cria atividade (e por
 * isso e mutavel, guardado por PLAYWRIGHT_E2E_MUTATE). Este so observa.
 */

test.describe("Arquimedes · app publicado · leitura", () => {
  test("carrega sem erro de JavaScript e expoe o commit implantado", async ({ page }) => {
    const errosDeJs: string[] = [];
    page.on("pageerror", erro => errosDeJs.push(erro.message));

    // O Render free plan leva ate ~50s para acordar o servico no primeiro
    // request. O timeout generoso aqui nao e paranoia: e o plano gratuito.
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 60_000 });

    // Usa o fetch da própria página em vez de `page.request`. O
    // `apiRequestContext` do Playwright resolve DNS por um caminho diferente e
    // falhou com ENOTFOUND num host que curl e o proprio browser alcancam —
    // usar a sessão da pagina evita depender desse segundo resolvedor.
    const payload = (await page.evaluate(async () => {
      const resposta = await fetch("/healthz");
      return resposta.ok ? resposta.json() : null;
    })) as { commit?: string; branch?: string } | null;

    expect(payload, "GET /healthz deve responder JSON").not.toBeNull();
    expect(payload!.commit).toBeTruthy();
    expect(payload!.branch).toBeTruthy();

    expect(errosDeJs, `erros de JS na pagina: ${errosDeJs.join(" | ")}`).toEqual([]);
  });

  test("nao expoe obra de cliente para visitante sem sessao", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });
    const texto = (await page.locator("body").innerText()).toUpperCase();

    // Sem sessao a listagem de obras nao pode vazar nome de cliente. Este teste
    // trava a garantia: se alguem deixar a listagem publica, quebra aqui em vez
    // de vazar dado em producao.
    expect(texto).not.toContain("AURORA TESTE");
    expect(texto).not.toContain("EDIFICIO SOLAR");
    expect(texto).not.toContain("ARQUIMEDES — AMBIENTE QA");
  });
});
