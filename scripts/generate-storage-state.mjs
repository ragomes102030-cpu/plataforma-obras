import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_STATE_PATH = path.join(__dirname, '..', 'playwright-storage-state.json');

async function main() {
  console.log('=== Playwright Storage State Generator ===\n');
  console.log('1. Uma janela do Chrome vai abrir.');
  console.log('2. Faça login com GitHub na plataforma.');
  console.log('3. Após o login, o script detecta automaticamente e salva o estado.');
  console.log('4. O arquivo será salvo em: playwright-storage-state.json\n');
  console.log('Aguardando login...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://plataforma-obras-api.onrender.com/');

  // Aguardar o login ser bem-sucedido
  // Detectamos quando a página muda de "Entre para ver as obras" para algo com obras
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !text.includes('Entre para ver as obras') && !text.includes('Entrar com GitHub');
    },
    { timeout: 300000 } // 5 minutos para fazer login
  );

  // Aguardar o cookie de sessão ser definido (app_session_id)
  // O GitHub OAuth pode redirecionar e definir o cookie alguns segundos após a mudança de tela
  await page.waitForFunction(
    () => document.cookie.includes('app_session_id'),
    { timeout: 30000 }
  ).catch(() => {
    console.log('⚠️  Cookie app_session_id não encontrado após 30s. Salvando mesmo assim.');
  });

  // Aguardar mais um pouco para garantir que tudo carregou
  await page.waitForTimeout(3000);

  // Salvar o estado
  await context.storageState({ path: STORAGE_STATE_PATH });

  // Verificar se o cookie foi salvo
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf-8'));
  const cookieCount = state.cookies?.length ?? 0;
  console.log(`✅ Estado salvo em: ${STORAGE_STATE_PATH}`);
  console.log(`   Cookies capturados: ${cookieCount}`);
  if (cookieCount === 0) {
    console.log('⚠️  Nenhum cookie capturado. O login pode não ter completado.');
    console.log('   Tente novamente e aguarde a tela de obras carregar completamente.');
  }
  console.log('\nAgora você pode rodar testes autenticados com:');
  console.log('  npx playwright test --config=playwright.config.ts\n');

  await browser.close();
}

main().catch(console.error);
