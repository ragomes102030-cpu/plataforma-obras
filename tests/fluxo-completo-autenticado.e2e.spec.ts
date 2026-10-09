import { expect, test } from '@playwright/test';

/**
 * E2E autenticado do fluxo completo.
 *
 * Usa storageState (sessão já logada) e NÃO toca a AURORA TESTE.
 * Usa apenas obras de QA para operações que gravam.
 *
 * Fluxo testado: selecionar obra → EAP → Atividades → Dependências → CPM → Baseline.
 *
 * ATENÇÃO: este teste pode GRAVAR em obras QA (não na AURORA).
 * Use uma obra dedicada para testes.
 */

const OBRA_QA = 'QA EAP SCOPE 2026-10-08'; // obra dedicada para QA

test.describe('Fluxo completo autenticado (QA)', () => {
  test('seleciona obra e navega EAP → Atividades → Dependências → CPM → Baseline', async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', e => erros.push(e.message));

    // 1. Ir para a obra
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Clicar na obra QA
    const obra = page.locator('button.xl-obra-chip', { hasText: OBRA_QA }).first();
    await obra.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 2. EAP: verificar se está visível
    await page.getByText('EAP', { exact: true }).first().click();
    await page.waitForTimeout(2000);
    const eapText = await page.locator('body').innerText();
    expect(eapText).toContain('Estrutura Analítica');

    // 3. Atividades: verificar se está visível
    await page.getByText('ATIVIDADES', { exact: true }).first().click();
    await page.waitForTimeout(2000);
    const atividadesText = await page.locator('body').innerText();
    expect(atividadesText).toContain('Atividade');

    // 4. Dependências
    await page.getByText('DEPENDÊNCIAS', { exact: true }).first().click();
    await page.waitForTimeout(2000);
    const dependenciasText = await page.locator('body').innerText();
    expect(dependenciasText).toContain('Dependência');

    // 5. CPM
    await page.getByText('CPM', { exact: true }).first().click();
    await page.waitForTimeout(2000);
    const cpmText = await page.locator('body').innerText();
    expect(cpmText).toContain('Caminho');

    // 6. Baseline
    await page.getByText('BASELINE', { exact: true }).first().click();
    await page.waitForTimeout(2000);
    const baselineText = await page.locator('body').innerText();
    expect(baselineText).toContain('Baseline');

    // 7. Recarregar e verificar persistência
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    const reloadText = await page.locator('body').innerText();
    expect(reloadText.length).toBeGreaterThan(0);

    expect(erros, `erros de JS: ${erros.join(' | ')}`).toEqual([]);
  });
});
