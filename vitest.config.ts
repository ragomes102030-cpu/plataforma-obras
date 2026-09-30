import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // `drizzle/**` entra pelo contrato do schema: o teste mora ao lado do
    // arquivo que ele trava, e sem esta linha ele simplesmente nao roda — o que
    // e pior do que nao existir, porque parece coberto.
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "shared/**/*.test.ts",
      "shared/**/*.spec.ts",
      "drizzle/**/*.test.ts",
      // `client/**` entrou porque a tela de "Carregando as obras…" que não
      // terminava morava no front e nenhuma suite o alcançava. Um include sem
      // o cliente é um teste escrito e nunca rodado: verde no CI, defeito no
      // ar. O filtro abaixo limita ao que roda sem DOM.
      "client/**/*.test.ts",
    ],
    // Os testes do cliente sao estaticos por decisao (leem o fonte, nao
    // montam). Montar exigiria jsdom, servidor de tRPC e cookies para provar
    // uma linha de verdade. Os que precisarem de DOM vao para o proprio
    // arquivo, e nao para o include.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
