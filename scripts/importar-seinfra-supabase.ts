/**
 * Importador SEINFRA via Supabase JS client (API REST).
 * Evita o problema de autenticação do driver pg local com o pooler.
 *
 * Uso:
 *   npx tsx scripts/importar-seinfra-supabase.ts \
 *     --insumos <xls> --planos <xls> --composicoes <xls> \
 *     --reference 028.1 --execute \
 *     --supabase-url https://xxx.supabase.co \
 *     --supabase-key <service_role_key>
 *
 * A chave service_role pode ser obtida em: Supabase Dashboard > Settings > API
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  lerPrimeiraAba,
  reconhecerPlanilhaSeinfra,
  seinfraAdapter,
} from "../shared/price-sources/seinfra";

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cli = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const flag = (name: string) => args.includes(name);

const modoExec = flag("--execute");
const insumosPath = cli("--insumos")!;
const planosPath = cli("--planos")!;
const composicoesPath = cli("--composicoes")!;
const reference = cli("--reference") ?? "028.1";
const supabaseUrl = cli("--supabase-url");
const supabaseKey = cli("--supabase-key");

if (!insumosPath || !planosPath || !composicoesPath) {
  console.error("Uso: --insumos <xls> --planos <xls> --composicoes <xls> --reference 028.1 --execute --supabase-url <url> --supabase-key <key>");
  process.exit(1);
}

if (modoExec && (!supabaseUrl || !supabaseKey)) {
  console.error("--execute exige --supabase-url e --supabase-key");
  process.exit(1);
}

// ── Ler e parse ─────────────────────────────────────────────────────────────

console.log("SEINFRA-CE · importador via Supabase API");
console.log(`modo: ${modoExec ? "EXECUTE" : "DRY-RUN"}`);

const lerArquivo = (caminho: string): { bytes: Uint8Array; nome: string } => ({
  bytes: new Uint8Array(readFileSync(caminho)),
  nome: caminho.split(/[\\/]/).pop() ?? caminho,
});

const itens: ItemCatalogo[] = [];
const servicos: ItemCatalogo[] = [];

if (insumosPath) {
  const { bytes, nome } = lerArquivo(resolve(insumosPath));
  const tipo = reconhecerPlanilhaSeinfra(await lerPrimeiraAba(bytes));
  const resultado = await seinfraAdapter.parse(nome, bytes);
  console.log(`insumos: ${resultado.records.length}/${resultado.records.length} registros usados (ignorados: ${resultado.skipped}) · ${nome} [tipo: ${tipo}]`);
  for (const r of resultado.records) {
    itens.push({
      code: r.code.toUpperCase(),
      description: r.description.slice(0, 240),
      unit: (r.unit || "UN").slice(0, 32),
      itemType: r.itemType,
      unitPrice: r.unitPrice,
      notes: r.notes,
    });
  }
}

if (planosPath) {
  const { bytes, nome } = lerArquivo(resolve(planosPath));
  const tipo = reconhecerPlanilhaSeinfra(await lerPrimeiraAba(bytes));
  const resultado = await seinfraAdapter.parse(nome, bytes);
  console.log(`planos: ${resultado.records.length}/${resultado.records.length} registros usados (ignorados: ${resultado.skipped}) · ${nome} [tipo: ${tipo}]`);
  const seen = new Set<string>();
  for (const r of resultado.records) {
    const code = r.code.toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    servicos.push({
      code,
      description: r.description.slice(0, 240),
      unit: (r.unit || "UN").slice(0, 32),
      itemType: "servico",
      unitPrice: r.unitPrice,
      notes: r.notes,
    });
  }
}

// ── Preparar dados ──────────────────────────────────────────────────────────

interface ItemCatalogo {
  code: string;
  description: string;
  unit: string;
  itemType: string;
  unitPrice: number;
  notes?: string | null;
}

interface Composicao {
  code: string;
  description: string;
  unit: string;
  componentes: { code: string; coefficient: number; componentType: string }[];
}

// Parser de Insumos e Serviços usando o parser validado de shared/price-sources/seinfra.ts

// ── Parser de Composições — idêntico ao script original ───────────────────
// Copiado de importar-seinfra-catalogo.mts (parseComposicoesSeinfraRows)

interface ComposicaoBloco {
  code: string;
  description: string;
  unit: string;
  componentes: { code: string; coefficient: number; unitPriceSnapshot: number; componentType: string }[];
  componentesDescartados: number;
}

function parseComposicoesSeinfraRows(rows: string[][]): ComposicaoBloco[] {
  const composicoes: ComposicaoBloco[] = [];
  let atual: ComposicaoBloco | null = null;
  let secao: "material" | "mao_de_obra" | "equipamento" | "servico" | null = null;

  const celula = (row: unknown[], indice: number): string =>
    String(row?.[indice] ?? "").trim();

  const parsePtBrCurrency = (valor: string): number | null => {
    const limpo = valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = Number(limpo);
    return limpo && !Number.isNaN(n) ? n : null;
  };

  for (const rowBruto of rows) {
    const row = rowBruto as unknown[];
    const c0 = celula(row, 0);
    const c1 = celula(row, 1);
    const c3 = celula(row, 3);
    const c4 = celula(row, 4);

    // Linha de seção do bloco
    const secaoNormalizada = c0
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ");
    if (!c1 && !c3) {
      if (secaoNormalizada === "MAO DE OBRA") { secao = "mao_de_obra"; continue; }
      if (secaoNormalizada.startsWith("MATERIA")) { secao = "material"; continue; }
      if (secaoNormalizada.startsWith("EQUIPAMENTO")) { secao = "equipamento"; continue; }
      if (secaoNormalizada.startsWith("SERVICO")) { secao = "servico"; continue; }
    }

    // Cabeçalho de bloco formato 1: "C1802 - DESCRIÇÃO - UN" (tudo na coluna 0)
    if (/^C\s*\d{3,}\s*-\s*\S/i.test(c0) && !c1) {
      const partes = c0.split(/\s+-\s+/);
      const codigo = (partes[0] ?? "").trim().toUpperCase();
      const unidade = partes.length > 1 ? (partes[partes.length - 1] ?? "").trim() : "UN";
      const descricao = partes.slice(1, -1).join(" - ").trim() || codigo;
      atual = {
        code: codigo,
        description: descricao,
        unit: unidade || "UN",
        componentes: [],
        componentesDescartados: 0,
      };
      composicoes.push(atual);
      secao = null;
      continue;
    }

    // Cabeçalho de bloco formato 2: "C0197" na coluna 0, descrição na coluna 1
    if (/^C\s*\d{3,}$/i.test(c0) && c1) {
      const codigo = c0.replace(/\s/g, "").toUpperCase();
      atual = {
        code: codigo,
        description: c1.slice(0, 240),
        unit: "UN",
        componentes: [],
        componentesDescartados: 0,
      };
      composicoes.push(atual);
      secao = null;
      continue;
    }

    // Linha de componente (insumo ou sub-serviço) com coeficiente numérico
    if (/^[IGC]\s*\d{2,}/i.test(c0)) {
      const coeficiente = parsePtBrCurrency(c3);
      const preco = parsePtBrCurrency(c4);
      if (coeficiente !== null && preco !== null) {
        if (/^C/i.test(c0)) {
          if (atual) atual.componentesDescartados += 1;
          continue;
        }
        if (!atual) continue;
        const tipo =
          secao === "mao_de_obra" || secao === "material" || secao === "equipamento"
            ? secao
            : /mao de obra|ajudante|pedreiro|servente|encanador|armador/i.test(c1)
              ? "mao_de_obra"
              : "material";
        atual.componentes.push({
          code: c0.toUpperCase(),
          coefficient: coeficiente,
          unitPriceSnapshot: preco,
          componentType: tipo,
        });
        continue;
      }
      continue;
    }
  }
  return composicoes;
}

let composicoes: ComposicaoBloco[] = [];

if (composicoesPath) {
  const { bytes, nome } = lerArquivo(resolve(composicoesPath));
  const rows = await lerPrimeiraAba(bytes);
  composicoes = parseComposicoesSeinfraRows(rows as string[][]);
  console.log(`composições: ${composicoes.length} blocos parseados · ${nome}`);
  const totalComponentes = composicoes.reduce((s, c) => s + c.componentes.length, 0);
  const totalDescartados = composicoes.reduce((s, c) => s + c.componentesDescartados, 0);
  console.log(`  componentes válidos: ${totalComponentes} (descartados como sub-serviço: ${totalDescartados})`);
}

console.log(`\nPreparados:`);
console.log(`Insumos: ${itens.length}`);
console.log(`Serviços: ${servicos.length}`);
console.log(`Composições: ${composicoes.length}`);

// ── Execução via Supabase API ───────────────────────────────────────────────

if (!modoExec) {
  console.log("\nDRY-RUN: nenhuma escrita foi feita.");
  process.exit(0);
}

if (!supabaseUrl || !supabaseKey) {
  console.error("--execute exige --supabase-url e --supabase-key");
  process.exit(1);
}

console.log(`\nConectando em: ${supabaseUrl}`);

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(supabaseUrl, supabaseKey);

// 1) Catálogo
console.log("1/4 price_catalogs...");
const { data: catalogo, error: catErr } = await supabase
  .from("price_catalogs")
  .upsert({
    name: `SEINFRA-CE ${reference}`,
    sourceType: "SEINFRA",
    state: "CE",
    referencePeriod: reference,
    status: "ativo",
    createdBy: 1,
  })
  .select("id")
  .single();

if (catErr) { console.error("Erro catálogo:", catErr.message); process.exit(1); }
const catalogoId = catalogo.id;
console.log(`  catálogo id: ${catalogoId}`);

// 2) price_items (insumos)
console.log("2/4 price_items...");
let gravadosItens = 0;
const batchSize = 500;
for (let i = 0; i < itens.length; i += batchSize) {
  const lote = itens.slice(i, i + batchSize).map(item => ({
    catalogId: catalogoId,
    code: item.code,
    description: item.description,
    unit: item.unit,
    itemType: item.itemType,
    unitPrice: item.unitPrice,
    notes: item.notes ?? null,
  }));
  const { error } = await supabase
    .from("price_items")
    .upsert(lote, { onConflict: "catalogId,code" });
  if (error) { console.error("Erro price_items:", error.message); process.exit(1); }
  gravadosItens += lote.length;
  console.log(`  ${gravadosItens}/${itens.length}`);
}
console.log(`  price_items: ${gravadosItens}`);

// 3) service_compositions
console.log("3/4 service_compositions...");
let gravadosServicos = 0;
for (let i = 0; i < servicos.length; i += batchSize) {
  const lote = servicos.slice(i, i + batchSize).map(s => ({
    code: s.code,
    description: s.description,
    unit: s.unit,
    sourceCatalogId: catalogoId,
    referencePeriod: reference,
    status: "validada",
    createdBy: 1,
  }));
  const { error } = await supabase
    .from("service_compositions")
    .upsert(lote, { onConflict: "code" });
  if (error) { console.error("Erro service_compositions:", error.message); process.exit(1); }
  gravadosServicos += lote.length;
  console.log(`  ${gravadosServicos}/${servicos.length}`);
}
console.log(`  service_compositions: ${gravadosServicos}`);

// 4) composition_components
console.log("4/4 composition_components...");

// Buscar IDs dos itens — paginado (Supabase retorna no máx 1000 por SELECT)
let mapaItens = new Map<string, number>();
{
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error: itensErr } = await supabase
      .from("price_items")
      .select("id, code")
      .eq("catalogId", catalogoId)
      .range(from, from + pageSize - 1);
    if (itensErr) { console.error("Erro buscar itens:", itensErr.message); process.exit(1); }
    for (const i of data ?? []) mapaItens.set(i.code, i.id);
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }
}
console.log(`  price_items carregados: ${mapaItens.size}`);

// Buscar IDs das composições — paginado
let mapaComposicoes = new Map<string, number>();
{
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error: compErr } = await supabase
      .from("service_compositions")
      .select("id, code")
      .eq("sourceCatalogId", catalogoId)
      .range(from, from + pageSize - 1);
    if (compErr) { console.error("Erro buscar composições:", compErr.message); process.exit(1); }
    for (const c of data ?? []) mapaComposicoes.set(c.code, c.id);
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }
}
console.log(`  service_compositions carregados: ${mapaComposicoes.size}`);

const componentes: { compositionId: number; priceItemId: number; componentType: string; coefficient: number; unitPriceSnapshot: number }[] = [];
for (const comp of composicoes) {
  const compositionId = mapaComposicoes.get(comp.code);
  if (!compositionId) continue;
  for (const c of comp.componentes) {
    const priceItemId = mapaItens.get(c.code);
    if (!priceItemId) continue;
    // Truncar para numeric(14,6): máximo 999999.999999
    const coeffTruncado = Math.min(Math.max(c.coefficient, -999999.999999), 999999.999999);
    componentes.push({
      compositionId,
      priceItemId,
      componentType: c.componentType,
      coefficient: Math.round(coeffTruncado * 1e6) / 1e6,
      unitPriceSnapshot: 0,
    });
  }
}

// Deduplicar pares (compositionId, priceItemId) — mesma seção repetida
const componentesUnicos = new Map<string, { compositionId: number; priceItemId: number; componentType: string; coefficient: number; unitPriceSnapshot: number }>();
for (const c of componentes) {
  const key = `${c.compositionId}:${c.priceItemId}`;
  if (!componentesUnicos.has(key)) componentesUnicos.set(key, c);
}
const listaComponentes = Array.from(componentesUnicos.values());
console.log(`  componentes únicos: ${listaComponentes.length} (de ${componentes.length})`);

let gravadosComponentes = 0;
for (let i = 0; i < listaComponentes.length; i += batchSize) {
  const lote = listaComponentes.slice(i, i + batchSize);
  const { error } = await supabase
    .from("composition_components")
    .upsert(lote, { onConflict: "compositionId,priceItemId" });
  if (error) { console.error("Erro composition_components:", error.message); process.exit(1); }
  gravadosComponentes += lote.length;
  console.log(`  ${gravadosComponentes}/${listaComponentes.length}`);
}
console.log(`  composition_components: ${gravadosComponentes}`);

console.log("\n✅ Importação concluída!");
console.log(`  price_catalogs: 1`);
console.log(`  price_items: ${gravadosItens}`);
console.log(`  service_compositions: ${gravadosServicos}`);
console.log(`  composition_components: ${gravadosComponentes}`);
