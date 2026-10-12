// Le o estado do seletor de obra: o que o botao mostra, qual linha esta ativa e
// quantas obras a lista devolve. Serve para saber se "Nenhuma obra" no botao e
// estado real ou leitura apressada do teste.
//
// Uso: node scripts/verificar-seletor-estado.mjs [url]
import { chromium } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();
const dominio = new URL(URL_BASE).hostname;

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
await contexto.addCookies([
  { name: "app_session_id", value: SESSAO, domain: dominio, path: "/", httpOnly: true, secure: true },
]);
const pagina = await contexto.newPage();
pagina.on("pageerror", e => console.log("pageerror:", String(e).slice(0, 200)));
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector(".xl-app", { timeout: 60000 });

const ler = async quando => {
  const estado = await pagina.evaluate(() => {
    const botao = document.querySelector(".xl-seletor-botao");
    return {
      botao: botao ? botao.innerText.replace(/\s+/g, " ").trim() : "(sem botao)",
      prefixo: document.querySelector(".xl-seletor-prefixo")?.textContent,
      nome: document.querySelector(".xl-seletor-nome")?.textContent,
      codigo: document.querySelector(".xl-seletor-codigo")?.textContent ?? null,
      ativas: [...document.querySelectorAll(".xl-seletor-linha")].filter(l => l.dataset.ativa === "sim" || l.className.includes("ativa")).length,
      linhas: document.querySelectorAll(".xl-seletor-linha").length,
    };
  });
  console.log(`[${quando}] botao="${estado.botao}" | prefixo=${estado.prefixo} | nome=${estado.nome} | codigo=${estado.codigo} | linhas=${estado.linhas} | ativas=${estado.ativas}`);
  return estado;
};

await pagina.waitForTimeout(1000);
await ler("1s");
await pagina.waitForTimeout(4000);
await ler("5s");
await pagina.locator(".xl-seletor-botao").click();
await pagina.waitForSelector(".xl-seletor-item", { timeout: 30000 });
await pagina.waitForTimeout(800);
const aberto = await ler("painel aberto");
const linhas = await pagina.evaluate(() => [...document.querySelectorAll(".xl-seletor-linha")].map(l => ({
  texto: l.innerText.replace(/\s+/g, " ").trim().slice(0, 60),
  classes: l.className,
  ativa: !!l.querySelector(".xl-seletor-visto, .xl-seletor-ativo, svg.xl-seletor-visto"),
})));
console.log(JSON.stringify(linhas, null, 1));
await pagina.screenshot({ path: "tests/telas/estado-seletor.png" });
await navegador.close();
