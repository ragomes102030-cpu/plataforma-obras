// Teste funcional do seletor de obra e da exclusao, nas duas larguras.
//
// Verifica o que o redesenho prometeu:
//   * o botao do topo abre a lista, marca a obra ativa e mostra todas as obras;
//   * a busca filtra por nome/codigo/local;
//   * o menu de cada obra tem "Enviar para a lixeira" com rotulo escrito;
//   * a confirmacao de exclusao ja nasce HABILITADA (antes so habilitava com o
//     nome digitado identico, travessao incluido, e nada explicava o porque);
//   * no celular o painel e uma folha dentro da tela (nao sai pela direita) e
//     todos os itens tem alvo de 44px;
//   * nao sobrou nada do topo antigo: nem o icone de lixeira de 11px dentro do
//     chip, nem o botao "Gantt demo" no meio das obras, nem a barra de lixeira
//     solta de 1420px.
//
// Uso: node scripts/testar-seletor-obra.mjs <url>
import { chromium, devices } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

let falhas = 0;
const ok = (nome, condicao, detalhe = "") => {
  console.log(`${condicao ? "  OK   " : "  FALHA"}  ${nome}${detalhe ? `  -- ${detalhe}` : ""}`);
  if (!condicao) falhas += 1;
};

const navegador = await chromium.launch({ channel: "chrome", headless: true });

async function abrir(largura, altura) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    hasTouch: largura < 700,
    isMobile: largura < 700,
    deviceScaleFactor: 1,
  });
  await contexto.addCookies([
    { name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true },
    { name: "app_session_id", value: SESSAO, domain: "plataforma-obras.onrender.com", path: "/", httpOnly: true, secure: true },
    { name: "app_session_id", value: SESSAO, domain: "plataforma-obras.dockhosting.app", path: "/", httpOnly: true, secure: true },
  ]);
  const pagina = await contexto.newPage();
  await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".xl-app", { timeout: 60000 });
  await pagina.waitForTimeout(2000);
  return { contexto, pagina };
}

// ---------------------------------------------------------------- computador
console.log("\n== computador 1440x900 ==");
{
  const { contexto, pagina } = await abrir(1440, 900);

  const botao = await pagina.locator(".xl-seletor-botao");
  ok("o botao do seletor existe", (await botao.count()) === 1);
  const textoBotao = (await botao.innerText()).replace(/\s+/g, " ").trim();
  ok("o botao diz que e obra e mostra o nome", /obra/i.test(textoBotao) && textoBotao.length > 12, textoBotao);

  ok("nada de lixeira de 11px dentro do chip", (await pagina.locator(".xl-obra-chip-lixeira").count()) === 0);
  ok("nada de botao 'Gantt demo' no meio das obras", (await pagina.locator(".xl-demo-obra").count()) === 0);
  ok("nada de barra de lixeira solta abaixo do cabecalho", (await pagina.locator(".xl-lixeira-btn").count()) === 0);
  ok("a lixeira esta dentro do cabecalho", (await pagina.locator("header .xl-tb-lixeira").count()) === 1);

  await botao.click();
  await pagina.waitForSelector(".xl-seletor-painel", { timeout: 5000 });
  // A lista so aparece quando a consulta de obras responde. Contra producao com
  // a instancia fria isso passa de um segundo; contar antes disso media zero
  // linhas e reprovava o teste por um motivo que nao era do produto.
  await pagina.waitForSelector(".xl-seletor-item", { timeout: 20000 });
  const itens = await pagina.locator(".xl-seletor-item").count();
  ok("o painel abre com a lista de obras", itens > 1, `${itens} obras`);

  const ativos = await pagina.locator(".xl-seletor-ativo").count();
  ok("a obra ativa esta marcada com o visto", ativos === 1);

  const itensFechados = await pagina.locator(".xl-seletor-linha.ativa").count();
  ok("a linha da obra ativa esta destacada", itensFechados === 1);

  // busca
  const primeiroNome = (await pagina.locator(".xl-seletor-item-texto strong").first().innerText()).trim();
  await pagina.locator(".xl-seletor-busca input").fill(primeiroNome.slice(0, 8));
  await pagina.waitForTimeout(300);
  const filtrados = await pagina.locator(".xl-seletor-item").count();
  ok("a busca filtra a lista", filtrados >= 1 && filtrados < itens, `${itens} -> ${filtrados} buscando "${primeiroNome.slice(0, 8)}"`);
  await pagina.locator(".xl-seletor-busca input").fill("zzzz-nao-existe");
  await pagina.waitForTimeout(300);
  ok("a busca sem resultado avisa", (await pagina.locator(".xl-seletor-vazio").count()) === 1);
  await pagina.locator(".xl-seletor-busca input").fill("");
  await pagina.waitForTimeout(300);

  // menu de acoes da obra
  await pagina.locator(".xl-seletor-menu-botao").first().click();
  await pagina.waitForSelector(".xl-seletor-menu", { timeout: 5000 });
  const menu = (await pagina.locator(".xl-seletor-menu").innerText()).replace(/\s+/g, " ").trim();
  ok("o menu tem acao de lixeira com rotulo escrito", /lixeira/i.test(menu), menu);
  ok("o menu tem fechar/reabrir aba", /aba/i.test(menu));

  await pagina.locator(".xl-seletor-menu-perigo").click();
  await pagina.waitForSelector(".xl-confirm-exclusao", { timeout: 5000 });
  const confirmar = pagina.locator(".xl-confirm-exclusao .xl-btn-perigo");
  ok("a confirmacao de exclusao ABRE", (await confirmar.count()) === 1);
  ok("o botao de excluir ja nasce habilitado", await confirmar.isEnabled());
  const dialogo = (await pagina.locator(".xl-confirm-exclusao").innerText()).replace(/\s+/g, " ").trim();
  ok("a confirmacao avisa que e reversivel", /lixeira/i.test(dialogo) && /restaur/i.test(dialogo), dialogo.slice(0, 90));
  ok("nao pede mais digitar o nome", (await pagina.locator(".xl-confirm-exclusao input[type='text']").count()) === 0);

  await pagina.locator(".xl-confirm-exclusao .xl-btn-neutro").click();
  await pagina.waitForTimeout(300);
  ok("cancelar fecha a confirmacao", (await pagina.locator(".xl-confirm-exclusao").count()) === 0);

  await pagina.screenshot({ path: "C:\\Users\\Correta Engenharia\\seletor-desktop.png" });
  await contexto.close();
}

// ------------------------------------------------------------------- celular
console.log("\n== celular 390x844 (iPhone 13) ==");
{
  const contexto = await navegador.newContext({ ...devices["iPhone 13"] });
  await contexto.addCookies([
    { name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true },
    { name: "app_session_id", value: SESSAO, domain: "plataforma-obras.api.onrender.com", path: "/", httpOnly: true, secure: true },
    { name: "app_session_id", value: SESSAO, domain: "plataforma-obras.dockhosting.app", path: "/", httpOnly: true, secure: true },
  ]);
  const pagina = await contexto.newPage();
  await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".xl-app", { timeout: 60000 });
  await pagina.waitForTimeout(2000);

  const cabecalho = await pagina.locator("header.xl-titlebar").boundingBox();
  ok("a faixa de chips saiu do celular", !(await pagina.locator(".xl-titlebar-obras").isVisible()));
  ok("o cabecalho cabe em ate 3 linhas", cabecalho.height <= 150, `${Math.round(cabecalho.height)}px`);

  // nada pode ficar fora da tela no cabecalho
  const fora = await pagina.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll("header.xl-titlebar button, header.xl-titlebar span"))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.x < -1);
      })
      .map(el => `${el.className || el.tagName} x=${Math.round(el.getBoundingClientRect().x)} w=${Math.round(el.getBoundingClientRect().width)}`);
  });
  ok("nenhum botao do cabecalho fica fora da tela", fora.length === 0, fora.join(" | "));

  await pagina.locator(".xl-seletor-botao").click();
  await pagina.waitForSelector(".xl-seletor-painel", { timeout: 5000 });
  await pagina.waitForSelector(".xl-seletor-item", { timeout: 20000 });
  await pagina.waitForTimeout(400);

  const painel = await pagina.locator(".xl-seletor-painel").boundingBox();
  const vp = pagina.viewportSize();
  ok(
    "o painel cabe inteiro na tela (folha inferior)",
    painel.x >= -1 && painel.y >= -1 && painel.x + painel.width <= vp.width + 1 && painel.y + painel.height <= vp.height + 1,
    `painel ${Math.round(painel.x)},${Math.round(painel.y)} ${Math.round(painel.width)}x${Math.round(painel.height)}`
  );

  const alvos = await pagina.evaluate(() =>
    Array.from(document.querySelectorAll(".xl-seletor-painel button, .xl-seletor-painel input"))
      .filter(el => el.getBoundingClientRect().height > 0)
      .map(el => ({ c: String(el.className), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
  );
  const curtos = alvos.filter(a => a.h < 44);
  ok("todo alvo do painel tem 44px ou mais", curtos.length === 0, curtos.map(c => `${c.c} ${c.w}x${c.h}`).join(" | "));

  const fontes = await pagina.evaluate(() =>
    Array.from(document.querySelectorAll(".xl-seletor-painel *"))
      .filter(el => el.childNodes.length && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(el => parseFloat(getComputedStyle(el).fontSize))
  );
  const menores = fontes.filter(f => f < 12.5);
  ok("nenhum texto do painel abaixo de 12,5px", menores.length === 0, menores.join(", "));

  await pagina.screenshot({ path: "C:\\Users\\Correta Engenharia\\seletor-celular.png" });
  await contexto.close();
}

await navegador.close();
console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
