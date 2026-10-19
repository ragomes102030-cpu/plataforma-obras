// Confere a proposta realmente gravada para uma obra (fonte da verdade no banco).
// Uso:
//   $env:SUPABASE_ACCESS_TOKEN="sbp_..."   # token de acesso (nunca commitar)
//   node scripts/conferir-proposta-24.mjs [projectId]
import { existsSync, readFileSync } from "node:fs";

const ref = process.env.SUPABASE_PROJECT_REF ?? "tromrvfijbtihuilvnuk";
const projectId = Number(process.argv[2] ?? process.env.E2E_PROJECT_ID ?? 24);

function lerToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  // Uso local: .env.local com SUPABASE_ACCESS_TOKEN=... (arquivo ignorado pelo git).
  if (existsSync(".env.local")) {
    const linha = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find(l => l.startsWith("SUPABASE_ACCESS_TOKEN="));
    if (linha) return linha.slice("SUPABASE_ACCESS_TOKEN=".length).trim();
  }
  return "";
}

const token = lerToken();
if (!token) {
  console.error(
    "Defina SUPABASE_ACCESS_TOKEN (Supabase > Account > Access Tokens). O token nunca deve ser versionado."
  );
  process.exit(1);
}

const q = `select id, status, "sourceRef", "valueJson" from "agent_memories"
  where "projectId" = ${projectId} and category = 'eap_proposal'
  order by "updatedAt" desc limit 1`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
});
if (!res.ok) {
  console.error("HTTP", res.status, await res.text());
  process.exit(1);
}
const linhas = await res.json();
if (!linhas.length) {
  console.error(`Obra ${projectId} sem proposta de EAP gravada.`);
  process.exit(2);
}
const [row] = linhas;
const p = JSON.parse(row.valueJson);
const nodes = p.nodes ?? [];
const filhos = new Map();
for (const n of nodes) {
  const k = n.parentCode ?? "(raiz)";
  filhos.set(k, [...(filhos.get(k) ?? []), n]);
}

console.log(`memoria #${row.id} status=${row.status} source=${row.sourceRef}`);
console.log(`NOS: ${nodes.length} | RAIZES: ${(filhos.get("(raiz)") ?? []).length}`);
console.log("\nARVORE:");
const imprimir = (codigo, nivel) => {
  for (const n of filhos.get(codigo) ?? []) {
    console.log(`${"  ".repeat(nivel)}${n.code} ${n.name}`);
    imprimir(n.code, nivel + 1);
  }
};
imprimir("(raiz)", 1);

const texto = JSON.stringify(p);
const proibidos = ["Fundações", "Estrutura de concreto", "Áreas externas", "Cobertura"];
const presentes = proibidos.filter(x => texto.includes(x));
console.log(`\nPACOTES PROIBIDOS PRESENTES: ${presentes.length ? presentes.join(", ") : "nenhum"}`);
console.log(`CITA EXCLUSOES: ${/fachada/i.test(texto) && /estrutura/i.test(texto)}`);
console.log(`BASIS: ${String(p.basis ?? p.rationale ?? "").slice(0, 600)}`);
console.log(`ISSUES: ${JSON.stringify(p.validation?.issues ?? p.issues ?? [])}`);
