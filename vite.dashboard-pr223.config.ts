import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root = import.meta.dirname;
export default defineConfig({
  root:path.join(root,"client"),
  publicDir:false,
  plugins:[react()],
  resolve:{
    alias:[
      {find:"@/lib/trpc",replacement:path.join(root,"client/src/dashboard-pr223-mock-trpc.ts")},
      {find:"@/lib/curva-s-pesos",replacement:path.join(root,"client/src/dashboard-pr223-mock-pesos.ts")},
      {find:"@shared",replacement:path.join(root,"shared")},
      {find:"@",replacement:path.join(root,"client/src")}
    ]
  },
  build:{
    outDir:path.join(root,"dist/dashboard-pr223"),
    emptyOutDir:true,
    rollupOptions:{input:path.join(root,"client/dashboard-pr223.html")}
  }
});
