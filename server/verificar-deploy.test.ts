import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O script que confirma se o deploy chegou.
 *
 * POR QUE ISTE TESTE EXISTE
 *
 * O `verificar-deploy.mjs` apontava para `plataforma-obras-staging-production
 * .up.railway.app` — a Railway, que foi eliminada do projeto. O script continuava
 * sintaticamente perfeito e produzia uma saída que parecia a de um deploy lento:
 * `TIMEOUT`, vinte vezes, sem nunca dizer que o host estava morto. Quem esperava
 * por ele aprendia a desconfiar do script em vez do host.
 *
 * Um endereço que não responde e um endereço errado produzem a mesma tela. Por
 * isso a verificação é sobre o LITERAL: o host tem de ser o que está no ar.
 * Rodar o script contra a rede num teste seria teste de rede, e rede é o que
 * muda.
 */

const FONTE = readFileSync("scripts/verificar-deploy.mjs", "utf-8");

/** O host que o sistema realmente usa, declarado no render.yaml. */
const RENDER_YAML = readFileSync("render.yaml", "utf-8");
const HOST_NO_AR = (
  RENDER_YAML.match(/PUBLIC_APP_URL\s*\n?\s*value:\s*(https:\/\/[^\s]+)/) || []
)[1];

describe("verificar-deploy aponta para o host que existe", () => {
  it("o host padrao nao e de um servico que saiu do projeto", () => {
    const padrao = FONTE.match(/"(https:\/\/[^"]+\/healthz)"/);
    expect(padrao, "o script nao tem URL padrao").toBeTruthy();
    expect(
      padrao![1],
      "a URL padrao ainda aponta para a Railway ou para a Vercel, que nao " +
        "respondem mais: o script so mostra TIMEOUT e parece lentidao"
    ).not.toMatch(/railway\.app|vercel\.app/);
  });

  it("o host padrao e o mesmo que o PUBLIC_APP_URL do render.yaml", () => {
    // Duas fontes de verdade para "qual e o endereco do sistema" e nenhuma delas
    // checa a outra. E assim que o endereco divergiu sem ninguem perceber: o
    // render.yaml apontava para o Render e o script para a Railway, e os dois
    // estavam certos por conta propria.
    expect(HOST_NO_AR, "nao achei PUBLIC_APP_URL no render.yaml").toBeTruthy();
    const padrao = FONTE.match(/"(https:\/\/[^"]+\/healthz)"/);
    const hostDoScript = padrao![1].replace(/\/healthz$/, "");
    expect(
      hostDoScript,
      "o script verifica um host diferente do que o Render publica"
    ).toBe(HOST_NO_AR);
  });

  it("o environment ainda tem precedencia sobre o padrao", () => {
    // Quem confere staging, homologacao ou um deploy local precisa poder
    // apontar o script para outro lugar sem editar o arquivo.
    expect(FONTE).toMatch(/process\.env\.PLATAFORMA_HEALTHZ\s*\?\?/);
  });
});
