import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root=import.meta.dirname;
export default defineConfig({
  root:path.join(root,"client"),
  publicDir:false,
  plugins:[react()],
  resolve:{alias:[
    {find:"@/lib/trpc",replacement:path.join(root,"client/src/control-tower-qa.trpc.ts")},
    {find:"@shared",replacement:path.join(root,"shared")},
    {find:"@",replacement:path.join(root,"client/src")},
  ]},
  build:{outDir:path.join(root,"dist/control-tower-qa"),emptyOutDir:true,
    rollupOptions:{input:path.join(root,"client/control-tower-qa.html")}
  }
});