/**
 * Mapeamento completo do sistema Plataforma Obras via Playwright.
 * 
 * Objetivo: verificar o estado real de cada aba e componente,
 * identificar o que está faltando, quebrado ou precisa de ajuste.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://plataforma-obras-3.onrender.com';
const API_URL = BASE_URL;

type AbaInfo = {
  id: string;
  rotulo: string;
  grupo: string;
  status: 'pronta' | 'pendente' | 'funcionando' | 'quebrada' | 'vazia';
  observacoes: string;
};

const ABAS_ESPERADAS: AbaInfo[] = [
  { id: 'dashboard', rotulo: 'DASHBOARD', grupo: 'VISÃO GERAL', status: 'vazia', observacoes: '' },
  { id: 'escopo', rotulo: 'ESCOPO', grupo: 'PLANEJAMENTO', status: 'vazia', observacoes: '' },
  { id: 'eap', rotulo: 'EAP', grupo: 'PLANEJAMENTO', status: 'vazia', observacoes: '' },
  { id: 'atividades', rotulo: 'ATIVIDADES', grupo: 'PLANEJAMENTO', status: 'vazia', observacoes: '' },
  { id: 'dependencias', rotulo: 'DEPENDÊNCIAS', grupo: 'PLANEJAMENTO', status: 'vazia', observacoes: '' },
  { id: 'cpm', rotulo: 'CPM / CAMINHO CRÍTICO', grupo: 'PLANEJAMENTO', status: 'vazia', observacoes: '' },
  { id: 'baseline', rotulo: 'BASELINE', grupo: 'PLANEJAMENTO', status: 'vazia', observacoes: '' },
  { id: 'gantt', rotulo: 'GANTT', grupo: 'CRONOGRAMA', status: 'vazia', observacoes: '' },
  { id: 'linha-balanco', rotulo: 'LINHA DE BALANÇO', grupo: 'CRONOGRAMA', status: 'vazia', observacoes: '' },
  { id: 'producao', rotulo: 'CONTROLE', grupo: 'CONTROLE', status: 'vazia', observacoes: '' },
  { id: 'suprimentos', rotulo: 'SUPRIMENTOS', grupo: 'CONTROLE', status: 'vazia', observacoes: '' },
  { id: 'financeiro', rotulo: 'ORÇAMENTO E CUSTOS', grupo: 'CONTROLE', status: 'vazia', observacoes: '' },
  { id: 'riscos', rotulo: 'RISCOS', grupo: 'CONTROLE', status: 'vazia', observacoes: '' },
  { id: 'curva-s', rotulo: 'CURVA S', grupo: 'CONTROLE', status: 'vazia', observacoes: '' },
];

async function navegarParaAba(page: Page, abaId: string): Promise<boolean> {
  try {
    // Clica na aba no sidebar
    const abaButton = page.locator(`button[title="${abaId}"]`).first();
    if (await abaButton.isVisible()) {
      await abaButton.click();
      await page.waitForTimeout(2000);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function verificarConteudoAba(page: Page): Promise<{ temConteudo: boolean; temErro: boolean; textoVisivel: string }> {
  try {
    const conteudo = page.locator('.arquimedes-content');
    const texto = await conteudo.textContent({ timeout: 5000 }) || '';
    const temErro = /\berro\b|\berror\b|\bfalha\b/i.test(texto);
    const temConteudo = texto.length > 50 && !temErro;
    return { temConteudo, temErro, textoVisivel: texto.slice(0, 200) };
  } catch {
    return { temConteudo: false, temErro: false, textoVisivel: '' };
  }
}

test.describe('Mapeamento do Sistema Plataforma Obras', () => {
  test('mapear todas as abas e componentes', async ({ page }) => {
    const resultados: AbaInfo[] = [];
    
    // 1. Acessar a página inicial
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    
    // 2. Esperar a sessão carregar
    await page.waitForSelector('text=Lendo a sessão', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    // 3. Clicar em "Obra" para selecionar AURORA TESTE
    const obraButton = page.locator('button:has-text("Obra")').first();
    if (await obraButton.isVisible().catch(() => false)) {
      await obraButton.click();
      await page.waitForTimeout(2000);
    }
    
    // 4. Selecionar AURORA TESTE se houver seletor
    const obraSelector = page.locator('select').first();
    if (await obraSelector.isVisible().catch(() => false)) {
      await obraSelector.selectOption({ label: 'AURORA TESTE' }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    
    // 5. Esperar o sidebar aparecer
    await page.waitForSelector('.xl-sidebar', { state: 'visible', timeout: 10000 }).catch(() => {});
    
    // 4. Para cada aba, navegar e verificar
    for (const aba of ABAS_ESPERADAS) {
      console.log(`\n=== Verificando aba: ${aba.rotulo} (${aba.id}) ===`);
      
      const navegado = await navegarParaAba(page, aba.id);
      if (!navegado) {
        console.log(`❌ Aba não encontrada no sidebar`);
        resultados.push({ ...aba, status: 'quebrada', observacoes: 'Aba não encontrada no sidebar' });
        continue;
      }
      
      const { temConteudo, temErro, textoVisivel } = await verificarConteudoAba(page);
      
      if (temErro) {
        console.log(`❌ Erro na aba: ${textoVisivel}`);
        resultados.push({ ...aba, status: 'quebrada', observacoes: textoVisivel });
      } else if (temConteudo) {
        console.log(`✅ Funcionando: ${textoVisivel.slice(0, 100)}`);
        resultados.push({ ...aba, status: 'funcionando', observacoes: textoVisivel.slice(0, 100) });
      } else {
        console.log(`⚠️ Vazia ou sem conteúdo visível`);
        resultados.push({ ...aba, status: 'vazia', observacoes: 'Sem conteúdo visível' });
      }
    }
    
    // 5. Gerar relatório
    console.log('\n\n========== RELATÓRIO DE MAPEAMENTO ==========\n');
    console.log(`Total de abas: ${resultados.length}`);
    console.log(`Funcionando: ${resultados.filter(r => r.status === 'funcionando').length}`);
    console.log(`Vazias: ${resultados.filter(r => r.status === 'vazia').length}`);
    console.log(`Quebradas: ${resultados.filter(r => r.status === 'quebrada').length}`);
    console.log(`Pendentes: ${resultados.filter(r => r.status === 'pendente').length}`);
    console.log('\nDetalhes:');
    resultados.forEach(r => {
      console.log(`  ${r.status.toUpperCase().padEnd(12)} | ${r.grupo.padEnd(20)} | ${r.rotulo.padEnd(30)} | ${r.observacoes}`);
    });
    
    // Não permitir CI verde quando uma aba esperada está quebrada.
    expect(resultados.filter(r => r.status === 'quebrada'),
      'Todas as abas esperadas devem estar acessíveis e sem erro visível').toEqual([]);

    // 6. Verificar componentes específicos
    console.log('\n\n========== VERIFICAÇÃO DE COMPONENTES ==========\n');
    
    // Voltar para dashboard
    await navegarParaAba(page, 'dashboard');
    
    // Verificar painel de cronograma
    const painel = page.locator('.xl-painel');
    console.log(`Painel de cronograma: ${await painel.count() > 0 ? '✅ Encontrado' : '❌ Não encontrado'}`);
    
    // Verificar cards
    const cartoes = page.locator('.xl-cartao');
    console.log(`Cards do dashboard: ${await cartoes.count()}`);
    
    // Verificar fluxo
    const fluxo = page.locator('.xl-dashboard-fluxo');
    console.log(`Fluxo do planejamento: ${await fluxo.count() > 0 ? '✅ Encontrado' : '❌ Não encontrado'}`);
    
    // Verificar tabela
    const tabelas = page.locator('.xl-tabela');
    console.log(`Tabelas visíveis: ${await tabelas.count()}`);
    
    // Verificar gráficos
    const svgs = page.locator('svg');
    console.log(`Gráficos SVG: ${await svgs.count()}`);
    
    // 7. Testar API diretamente
    console.log('\n\n========== TESTE DA API ==========\n');
    
    const apiHealth = await page.request.get(`${API_URL}/healthz`);
    console.log(`API Health: ${apiHealth.ok() ? '✅ OK' : '❌ Falhou'} (${apiHealth.status()})`);
    
    // 8. Salvar screenshot para documentação
    await page.screenshot({ path: 'tests/screenshots/mapeamento-sistema.png', fullPage: true });
    console.log('\n📸 Screenshot salvo em tests/screenshots/mapeamento-sistema.png');
  });
  
  test('verificar especificamente as abas de controle', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    
    // Login
    const loginButton = page.locator('button:has-text("Entrar")').first();
    if (await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
      await page.waitForTimeout(3000);
    }
    
    // Selecionar AURORA TESTE
    const obraSelector = page.locator('select').first();
    if (await obraSelector.isVisible().catch(() => false)) {
      await obraSelector.selectOption({ label: 'AURORA TESTE' }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    
    const abasControle = ['producao', 'suprimentos', 'financeiro', 'riscos', 'curva-s'];
    
    for (const abaId of abasControle) {
      console.log(`\n=== Aba: ${abaId} ===`);
      
      const navegado = await navegarParaAba(page, abaId);
      if (!navegado) {
        console.log(`❌ Aba não encontrada`);
        continue;
      }
      
      // Verificar elementos específicos
      const botoes = page.locator('button');
      console.log(`  Botões: ${await botoes.count()}`);
      
      const inputs = page.locator('input, select, textarea');
      console.log(`  Inputs: ${await inputs.count()}`);
      
      const tabelas = page.locator('table, .xl-tabela');
      console.log(`  Tabelas: ${await tabelas.count()}`);
      
      const graficos = page.locator('svg, canvas');
      console.log(`  Gráficos: ${await graficos.count()}`);
      
      const cards = page.locator('.xl-cartao');
      console.log(`  Cards: ${await cards.count()}`);
      
      const badges = page.locator('.xl-badge');
      console.log(`  Badges: ${await badges.count()}`);
      
      // Screenshot da aba
      await page.screenshot({ path: `tests/screenshots/aba-${abaId}.png`, fullPage: true });
    }
  });
  
  test('verificar gantt e linha de balanço', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    
    // Login
    const loginButton = page.locator('button:has-text("Entrar")').first();
    if (await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
      await page.waitForTimeout(3000);
    }
    
    // Selecionar AURORA TESTE
    const obraSelector = page.locator('select').first();
    if (await obraSelector.isVisible().catch(() => false)) {
      await obraSelector.selectOption({ label: 'AURORA TESTE' }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    
    // Gantt
    console.log('\n=== GANTT ===');
    await navegarParaAba(page, 'gantt');
    const ganttSvg = page.locator('svg');
    console.log(`  SVG do Gantt: ${await ganttSvg.count()}`);
    await page.screenshot({ path: 'tests/screenshots/gantt.png', fullPage: true });
    
    // Linha de Balanço
    console.log('\n=== LINHA DE BALANÇO ===');
    await navegarParaAba(page, 'linha-balanco');
    const lobSvg = page.locator('svg');
    console.log(`  SVG do LOB: ${await lobSvg.count()}`);
    await page.screenshot({ path: 'tests/screenshots/linha-balanco.png', fullPage: true });
  });
});

/**
 * Resultado esperado:
 * - Todas as 14 abas mapeadas
 * - Status real de cada uma
 * - Identificação do que precisa ser corrigido
 * - Screenshots para documentação
 */
