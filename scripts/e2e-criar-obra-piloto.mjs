#!/usr/bin/env node
/**
 * Cria uma obra piloto pela interface real e pede a primeira proposta de EAP.
 *
 * Nao aplica a proposta: para no ponto em que o engenheiro precisa decidir.
 * O objetivo e ver o comportamento de ponta a ponta (UI + agente + banco) e
 * registrar o que quebrou, com screenshot e texto da tela.
 *
 * Uso:
 *   node scripts/e2e-criar-obra-piloto.mjs
 *
 * Opcionais:
 *   E2E_BASE_URL   (default https://plataforma-obras.dockhosting.dev)
 *   E2E_HEADLESS=1 (default: janela visivel, para o login manual no GitHub)
 *
 * O login e manual na primeira vez; o cookie fica em .playwright/auth.json.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "https://plataforma-obras.dockhosting.dev";
const HEADLESS = process.env.E2E_HEADLESS === "1";
const DIR = ".playwright";
const AUTH = `${DIR}/auth.json`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

mkdirSync(DIR, { recursive: true });

const obra = {
  nome: "PILOTO — Reforma Apartamento Meireles 92m²",
  local: "Fortaleza/CE",
  tipo: "reforma",
  escopo:
    "Reforma de apartamento de 92 m² em edifício existente, 3 quartos, 2 banheiros, " +
    "sala e cozinha. Inclui demolição de alvenarias internas, revisão das instalações " +
    "hidráulicas e elétricas, troca de revestimentos de piso e parede, forro de gesso, " +
    "pintura, esquadrias de alumínio e mobiliário fixo da cozinha. Não inclui fachada, " +
    "área comum do condomínio nem estrutura. Prazo previsto de 4 meses, entrega única.",
};

const relatorio = {
  iniciadoEm: new Date().toISOString(),
  base: BASE,
  obra,
  passos: [],
  errosDeConsole: [],
  respostas5xx: [],
  obraId: null,
  textoFinal: null,
  kpis: null,
  pendencias: null,
  fundamentacao: null,
};

function passo(nome, detalhe = "") {
  const linha = `${new Date().toISOString()} ${nome}${detalhe ? " — " + detalhe : ""}`;
  relatorio.passos.push(linha);
  console.log(linha);
}

const browser = await chromium.launch({
  headless: HEADLESS,
  slowMo: HEADLESS ? 0 : 120,
  args: ["--start-maximized"],
});

const contexto = await browser.newContext(
  existsSync(AUTH)
    ? { storageState: AUTH, viewport: { width: 1500, height: 950 } }
    : { viewport: { width: 1500, height: 950 } }
);
const page = await contexto.newPage();

page.on("console", msg => {
  if (msg.type() === "error") relatorio.errosDeConsole.push(msg.text());
});
page.on("response", async resposta => {
  if (resposta.status() >= 500) {
    relatorio.respostas5xx.push({
      url: resposta.url(),
      status: resposta.status(),
      quando: new Date().toISOString(),
    });
  }
});

async function screenshot(nome) {
  const caminho = `${DIR}/${stamp}-${nome}.png`;
  await page.screenshot({ path: caminho, fullPage: true }).catch(() => {});
  return caminho;
}

try {
  passo("abrindo /obras");
  await page.goto(`${BASE}/obras`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const novaObra = page.getByRole("button", { name: /Nova obra/i }).first();
  const precisaLogin = !(await novaObra.isVisible().catch(() => false));

  if (precisaLogin) {
    passo("login necessario", "aguardando login manual na janela aberta");
    await page.evaluate(() => {
      const aviso = document.createElement("div");
      aviso.textContent =
        "ARQUIMEDES: faça login com GitHub nesta janela. O resto é automático.";
      Object.assign(aviso.style, {
        position: "fixed",
        zIndex: 999999,
        top: "0",
        left: "0",
        right: "0",
        padding: "14px 20px",
        background: "#0b1f2a",
        color: "#8ce6e2",
        font: "600 16px system-ui",
        textAlign: "center",
      });
      document.body.appendChild(aviso);
    });
    const entrar = page.getByRole("button", { name: /Entrar com GitHub/i }).first();
    if (await entrar.isVisible().catch(() => false)) {
      await entrar.click();
    }
    // Espera o app (nao a URL): o clique leva ao GitHub e volta para /obras.
    await novaObra.waitFor({ timeout: 300000 });
    await contexto.storageState({ path: AUTH });
    passo("login concluido", "cookie salvo em .playwright/auth.json");
  }

  await novaObra.waitFor({ timeout: 30000 });
  await screenshot("00-lista-obras");
  passo("lista de obras carregada");

  // E2E_PROJECT_ID reaproveita uma obra existente (ex.: 24) em vez de criar
  // outra. Serve para repetir a analise depois de corrigir o codigo.
  const projetoExistente = Number(process.env.E2E_PROJECT_ID ?? 0);
  if (projetoExistente > 0) {
    await page.goto(`${BASE}/obra/${projetoExistente}`, { waitUntil: "domcontentloaded" });
    relatorio.obraId = projetoExistente;
    passo("obra existente aberta", `id=${projetoExistente}`);
  } else {
    await page.getByRole("button", { name: /Nova obra/i }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 15000 });
    passo("dialogo aberto");

    await page.getByLabel(/Nome da obra/i).fill(obra.nome);
    await page.getByLabel(/Localização/i).fill(obra.local);
    await page.getByLabel(/Natureza da obra/i).selectOption(obra.tipo);
    await page.getByLabel(/O que será construído/i).fill(obra.escopo);
    await screenshot("01-formulario");
    passo("formulario preenchido");

    await Promise.all([
      page.waitForURL(/\/obra\/\d+/, { timeout: 90000 }),
      page.getByRole("button", { name: /Criar e abrir EAP/i }).click(),
    ]);

    relatorio.obraId = Number(page.url().match(/\/obra\/(\d+)/)?.[1] ?? 0);
    passo("obra criada", `id=${relatorio.obraId}`);
  }
  await screenshot("02-obra-criada");

  const gerar = page.getByRole("button", { name: /(Gerar proposta com Arquimedes|Gerar estrutura-base)/i });
  await gerar.waitFor({ timeout: 60000 });
  passo("aba EAP aberta");

  await gerar.click();
  passo("proposta solicitada", "aguardando o agente (ate 4 min)");

  const inicio = Date.now();
  await Promise.race([
    page.getByText(/Estrutura analítica proposta/i).waitFor({ timeout: 240000 }),
    page.getByText(/Não foi possível gerar a proposta/i).waitFor({ timeout: 240000 }),
  ]).catch(() => passo("timeout", "nem proposta nem erro apareceram em 4 min"));
  relatorio.duracaoPropostaMs = Date.now() - inicio;

  await page.waitForTimeout(1500);
  await screenshot("03-resultado");

  relatorio.textoFinal = await page.locator("body").innerText().catch(() => null);
  relatorio.kpis = await page
    .locator(".eap-proposta-kpis")
    .innerText()
    .catch(() => null);
  relatorio.pendencias = await page
    .locator(".eap-proposta-pendencias")
    .innerText()
    .catch(() => null);
  relatorio.fundamentacao = await page
    .locator(".eap-proposta-copy")
    .allInnerTexts()
    .catch(() => []);

  passo(
    "resultado capturado",
    `duracao=${Math.round(relatorio.duracaoPropostaMs / 1000)}s ` +
      `5xx=${relatorio.respostas5xx.length} console=${relatorio.errosDeConsole.length}`
  );
} catch (erro) {
  relatorio.erroFatal = String(erro?.stack ?? erro);
  passo("FALHOU", String(erro?.message ?? erro));
  await screenshot("99-falha");
} finally {
  relatorio.finalizadoEm = new Date().toISOString();
  const destino = `${DIR}/relatorio-${stamp}.json`;
  writeFileSync(destino, JSON.stringify(relatorio, null, 2), "utf8");
  console.log(`\nRelatorio: ${destino}`);
  if (!HEADLESS) {
    console.log("A janela fica aberta por 20s para voce ver o estado final.");
    await page.waitForTimeout(20000).catch(() => {});
  }
  await browser.close();
}
