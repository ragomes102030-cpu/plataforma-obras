/**
 * Build independente do protótipo.
 * Não processa client/index.html nem escreve em dist/public.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.resolve(import.meta.dirname, "client");
export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/design-v2"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(root, "design-v2.html"),
    },
  },
  server: { host: "127.0.0.1", port: 5182, strictPort: true },
  preview: { host: "127.0.0.1", port: 5182, strictPort: true },
});
