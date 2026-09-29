import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "client/src";

function listar(dir: string, exts: string[]): string[] {
  const fora: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) fora.push(...listar(p, exts));
    else if (exts.some(e => nome.endsWith(e))) fora.push(p);
  }
  return fora;
}

const todos = listar(RAIZ, [".tsx", ".ts"]);

// ---------------------------------------------------------------- ui/ órfãs
const uiDir = join(RAIZ, "components", "ui");
const ui = readdirSync(uiDir).filter(f => f.endsWith(".tsx")).map(f => f.replace(/\.tsx$/, ""));

const orfaos: string[] = [];
const vivas: string[] = [];

for (const nome of ui) {
  const padrao = new RegExp(`ui/${nome}"`);
  const usa = todos.some(p => {
    if (p === join(uiDir, nome + ".tsx")) return false;
    if (!padrao.test(readFileSync(p, "utf-8"))) return false;
    // O próprio showcase contar como uso não conta: ele é o que se vai apagar.
    return !p.endsWith("ComponentShowcase.tsx");
  });
  (usa ? vivas : orfaos).push(nome);
}

console.log(`ui/ com import real: ${vivas.length}`);
console.log(`ui/ órfãs:           ${orfaos.length}`);
console.log("  " + orfaos.join(", "));

// ------------------------------------------- componentes de página órfãos
const componentes = readdirSync(join(RAIZ, "components"))
  .filter(f => f.endsWith(".tsx") && f !== "ErrorBoundary.tsx")
  .map(f => f.replace(/\.tsx$/, ""));

console.log("\n=== componentes de página ===");
const manter: string[] = [];
for (const nome of componentes) {
  const padrao = new RegExp(`@/components/${nome}"|\\./${nome}"|from "\\./${nome}"`);
  const usa = todos.some(p => {
    if (p.endsWith(join("components", nome + ".tsx"))) return false;
    if (p.endsWith(join("pages", nome + ".tsx"))) return false;
    return padrao.test(readFileSync(p, "utf-8"));
  });
  const linha = `  ${nome.padEnd(26)} ${usa ? "em uso" : "ÓRFÃO"}`;
  console.log(linha);
  if (usa) manter.push(nome);
}

console.log("\n=== totais ===");
console.log("  arquivos .tsx/.ts no cliente: " + todos.length);
console.log("  a apagar: " + (orfaos.length + componentes.length - manter.length + 1) + " (ui órfãs + componentes órfãos + showcase)");
console.log("  a manter (componentes): " + manter.join(", "));
