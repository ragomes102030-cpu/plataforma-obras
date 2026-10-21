// Fotografa o DOM do cabecalho em duas larguras (computador e celular) e lista,
// em ordem de tela, cada elemento visivel com posicao, tamanho e texto. Serve
// para decidir o redesenho do topo com numero na mao em vez de suposicao --
// inclusive quais acoes ainda cabem no celular.
//
// Uso: node scripts/inspecionar-cabecalho.mjs <url>
import { chromium, devices } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

const ALVOS = [1440, 390];

const navegador = await chromium.launch({ channel: "chrome", headless: true });
for (const largura of ALVOS) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: largura < 700 ? 844 : 900 },
    hasTouch: largura < 700,
    isMobile: largura < 700,
    deviceScaleFactor: 1,
  });
  await contexto.addCookies([
    { name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true },
    { name: "app_session_id", value: SESSAO, domain: "plataforma-obras-3.onrender.com", path: "/", httpOnly: true, secure: true },
  ]);
  const pagina = await contexto.newPage();
  await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".xl-app", { timeout: 60000 });
  await pagina.waitForTimeout(2500);

  const dados = await pagina.evaluate(() => {
    const rotulo = (el) => {
      const s = getComputedStyle(el);
      return {
        seletor:
          el.tagName.toLowerCase() +
          (el.id ? "#" + el.id : "") +
          (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
            : ""),
        texto: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 44),
        x: Math.round(el.getBoundingClientRect().x),
        y: Math.round(el.getBoundingClientRect().y),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
        fonte: s.fontSize,
        display: s.display,
        visivel: s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05,
        overflow: s.overflowX,
      };
    };
    const bloco = (raiz) => {
      const el = document.querySelector(raiz);
      if (!el) return { erro: `${raiz} nao encontrado` };
      const cont = rotulo(el);
      // filhos diretos e, dentro do que rolou, os itens de primeiro nivel
      const filhos = Array.from(el.children).map(rotulo);
      const netos = [];
      for (const f of Array.from(el.children)) {
        for (const n of Array.from(f.children)) {
          const r = rotulo(n);
          if (r.visivel) netos.push({ ...r, pai: cont.seletor });
        }
      }
      return { ...cont, filhos, netos };
    };
    const cabecalho = bloco(".xl-titlebar");
    const faixa = bloco(".xl-titlebar-obras");
    const lixeira = bloco(".xl-lixeira-btn");
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      larguraDaPagina: document.documentElement.scrollWidth,
      cabecalho,
      faixa,
      lixeira,
    };
  });

  console.log(`\n================ viewport ${largura}px ================`);
  console.log(JSON.stringify(dados, null, 1));
  await pagina.screenshot({ path: `C:\\Users\\Correta Engenharia\\cabecalho-${largura}.png` });
  await contexto.close();
}
await navegador.close();
