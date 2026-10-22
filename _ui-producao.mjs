import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = 'https://plataforma-obras-3.onrender.com';
const st = JSON.parse(readFileSync('C:\\Users\\Correta Engenharia\\tmp\\auth-mint.json', 'utf-8'));
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ storageState: st })).newPage();
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR: ' + e.message.slice(0, 200)));
page.on('response', (r) => { if (r.status() >= 500) erros.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

async function waitLoaded() {
  await page.waitForFunction(() => !/Carregando/i.test(document.querySelector('main.xl-area')?.innerText ?? ''), { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

await page.goto(`${BASE}/obra/7`);
await waitLoaded();
await page.waitForTimeout(3000);
await page.getByRole('button', { name: 'CONTROLE', exact: true }).first().click();
await waitLoaded();
await page.waitForTimeout(3000);

const texto = await page.locator('main.xl-area').innerText();
console.log('tem "medição(ões)"?', /medição\(ões\)/.test(texto));
const i = texto.search(/medição\(ões\)|Recalcular avanço real/i);
console.log('\n--- trecho da LISTA ---');
console.log(i >= 0 ? texto.slice(Math.max(0, i - 300), i + 1800) : '(nao encontrado)');

console.log('\ntabelas na tela:', await page.locator('table').count());
for (let t = 0; t < await page.locator('table').count(); t++) {
  console.log(` tabela ${t}: ${await page.locator('table').nth(t).locator('tbody tr').count()} linhas, cabecalho: ${(await page.locator('table').nth(t).locator('thead').innerText().catch(() => '')).replace(/\n/g, ' | ')}`);
}

const tags = await page.locator('.producao-tag').allInnerTexts();
const contagem = tags.reduce((acc, t) => { const k = t.trim(); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
console.log('tags:', contagem);

await page.screenshot({ path: 'C:\\Users\\Correta Engenharia\\tmp\\ev-producao-antes.png', fullPage: true });
console.log('\nERROS:', erros.length ? erros.join('\n') : 'nenhum');
await browser.close();