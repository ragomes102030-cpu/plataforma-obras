// Prova, ponta a ponta, que o botao de excluir obra FUNCIONA.
//
// O defeito relatado ("botao excluir obra nao funciona") tinha causa clara: o
// botao so habilitava quando o texto digitado era identico ao nome da obra --
// travessao incluido, em teclado de celular -- e, desabilitado, nao dizia nada.
// Aqui o teste cria uma obra descartavel, exclui pelo caminho novo (seletor de
// obra > menu da obra > Enviar para a lixeira > confirmar) e confere que a obra
// SAIR da lista e aparecer na Lixeira, que e o que "funcionar" significa.
//
// A obra de teste fica na lixeira, com nome que diz o que e. Nada e apagado em
// definitivo -- a lixeira preserva a obra para restauracao.
//
// Uso: node scripts/testar-exclusao-obra.mjs <url>
import { chromium } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();
const SUFIXO = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const NOME = `TESTE EXCLUSAO ${SUFIXO}`;

let falhas = 0;
const ok = (nome, condicao, detalhe = "") => {
  console.log(`${condicao ? "  OK   " : "  FALHA"}  ${nome}${detalhe ? `  -- ${detalhe}` : ""}`);
  if (!condicao) falhas += 1;
};

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
  isMobile: false,
});
await contexto.addCookies([
  { name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true },
  { name: "app_session_id", value: SESSAO, domain: "plataforma-obras.dockhosting.dev", path: "/", httpOnly: true, secure: true },
]);
const pagina = await contexto.newPage();
const errosDeConsole = [];
pagina.on("console", m => {
  if (m.type() === "error") {
    // Sem este controle o teste passou com um `ReferenceError` escondido no
    // onSuccess da mutacao: a obra ia para a lixeira e a lista atualizava, mas o
    // erro ficava no console de quem usa. Erro de console agora reprova o teste.
    errosDeConsole.push(m.text().slice(0, 200));
    console.log(`  [console] ${m.text().slice(0, 160)}`);
  }
});
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector(".xl-app", { timeout: 60000 });
await pagina.waitForTimeout(2000);

console.log(`\n== criando a obra de teste "${NOME}" ==`);
await pagina.locator(".xl-seletor-botao").click();
await pagina.waitForSelector(".xl-seletor-painel", { timeout: 5000 });
await pagina.locator(".xl-seletor-acao", { hasText: "Nova obra" }).click();
await pagina.waitForSelector(".nova-obra-section", { timeout: 8000 });

await pagina.locator('.nova-obra-grid input[placeholder^="Ex.: Reservatório"]').fill(NOME);
await pagina.locator('.nova-obra-grid input[placeholder^="Cidade, endereço"]').fill("Cidade do teste, SP");
await pagina.locator(".nova-obra-escopo textarea").fill(
  "Obra criada automaticamente pelo teste do fluxo de exclusao. Serve apenas para provar que o botao de enviar para a lixeira funciona de ponta a ponta.",
);
const criar = pagina.locator(".nova-obra-criar");
ok("o formulario habilita o botao de criar", await criar.isEnabled());
await criar.click();
await pagina.waitForTimeout(6000);

const apareceu = await pagina.evaluate(nome =>
  Array.from(document.querySelectorAll(".xl-obra-chip")).some(el => (el.textContent || "").includes(nome)), NOME);
ok("a obra de teste foi criada e virou aba", apareceu);

console.log(`\n== excluindo "${NOME}" pelo caminho novo ==`);
await pagina.locator(".xl-seletor-botao").click();
await pagina.waitForSelector(".xl-seletor-painel", { timeout: 5000 });
await pagina.locator(".xl-seletor-busca input").fill(NOME);
await pagina.waitForTimeout(400);

const linhas = pagina.locator(".xl-seletor-linha");
const quantas = await linhas.count();
ok("a busca acha a obra de teste", quantas === 1, `${quantas} linha(s)`);

if (quantas === 1) {
  await pagina.locator(".xl-seletor-menu-botao").first().click();
  await pagina.waitForSelector(".xl-seletor-menu", { timeout: 5000 });
  await pagina.locator(".xl-seletor-menu-perigo").click();
  await pagina.waitForSelector(".xl-confirm-exclusao", { timeout: 5000 });

  const confirmar = pagina.locator(".xl-confirm-exclusao .xl-btn-perigo");
  ok("o botao de confirmar esta habilitado (o defeito antigo era ele ficar cinza)", await confirmar.isEnabled());
  await confirmar.click();
  await pagina.waitForTimeout(6000);

  const erro = await pagina.locator(".xl-exclusao-erro").count();
  ok("a exclusao nao devolveu erro", erro === 0, erro ? await pagina.locator(".xl-exclusao-erro").innerText() : "");

  const dialogoFechou = (await pagina.locator(".xl-confirm-exclusao").count()) === 0;
  ok("a confirmacao fechou sozinha depois de excluir (o servidor aceitou)", dialogoFechou);

  const sumiu = await pagina.evaluate(nome => {
    const naLista = Array.from(document.querySelectorAll(".xl-obra-chip")).some(el => (el.textContent || "").includes(nome));
    return !naLista;
  }, NOME);
  ok("a obra saiu da lista de abas", sumiu);

  // Some do seletor tambem
  await pagina.locator(".xl-seletor-botao").click();
  await pagina.waitForSelector(".xl-seletor-painel", { timeout: 5000 });
  await pagina.locator(".xl-seletor-busca input").fill(NOME);
  await pagina.waitForTimeout(500);
  const aindaNoSeletor = await pagina.evaluate(nome =>
    Array.from(document.querySelectorAll(".xl-seletor-item-texto strong")).some(el => (el.textContent || "").includes(nome)), NOME);
  ok("a obra nao aparece mais no seletor", !aindaNoSeletor);
  await pagina.keyboard.press("Escape");

  // E esta na lixeira
  await pagina.locator(".xl-tb-lixeira").click();
  await pagina.waitForTimeout(1500);
  const naLixeira = await pagina.evaluate(nome =>
    (document.querySelector(".xl-modal")?.textContent || "").includes(nome), NOME);
  ok("a obra aparece na Lixeira, pronta para restauracao", naLixeira);
  await pagina.screenshot({ path: "C:\\Users\\Correta Engenharia\\exclusao-lixeira.png" });
}

await contexto.close();
await navegador.close();
ok("nenhum erro no console durante o fluxo", errosDeConsole.length === 0, errosDeConsole.slice(0, 2).join(" | "));
console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
