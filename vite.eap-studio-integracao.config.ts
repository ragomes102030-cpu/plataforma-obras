import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root=import.meta.dirname;
export default defineConfig({
  root:path.join(root,"client"),publicDir:false,plugins:[react()],
  resolve:{alias:[
    {find:"@/lib/trpc",replacement:path.join(root,"client/src/eap-studio-integracao.trpc.ts")},
    {find:"@shared",replacement:path.join(root,"shared")},
    {find:"@",replacement:path.join(root,"client/src")},
  ]},
  build:{outDir:path.join(root,"dist/eap-studio-integracao"),emptyOutDir:true,rollupOptions:{input:path.join(root,"client/eap-studio-integracao.html")}},
});