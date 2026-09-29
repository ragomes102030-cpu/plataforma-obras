import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { scoreCandidate } from "./shared/price-sources/matching";

const files = [
  { path: "C:\\Users\\CORRET~1\\AppData\\Local\\Temp\\aionui\\830d7edf\\Tabela-de-Insumos-028---ENC.-SOCIAIS-114,15 (1).xls", label: "028 ENC.SOCIAIS-114,15 (sem desoneração)" },
  { path: "C:\\Users\\CORRET~1\\AppData\\Local\\Temp\\aionui\\830d7edf\\Tabela-de-Insumos-028.1---ENC.-SOCIAIS-84,44.xls", label: "028.1 ENC.SOCIAIS-84,44 (com desoneração)" },
];

type Row = { source: string; code: string | null; description: string; unit: string; unitPrice: number };

function parseOne(p: string, label: string): Row[] {
  const wb = XLSX.read(fs.readFileSync(p), { type: "buffer" });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === "insumos") ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const joined = (rows[i] ?? []).map(c => String(c ?? "").toLowerCase()).join("|");
    if (joined.includes("insumo") && joined.includes("descri") && joined.includes("unidade") && joined.includes("valor")) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error("header not found in " + p);
  const header = (rows[headerIdx] ?? []).map(c => String(c ?? "").trim());
  const col: Record<string, number> = {};
  header.forEach((h, idx) => {
    const n = h.toLowerCase();
    if (n === "insumo" || n === "codigo" || n === "código") col.code = idx;
    else if (n.startsWith("descri")) col.desc = idx;
    else if (n.startsWith("unid")) col.unit = idx;
    else if (n.startsWith("val")) col.price = idx;
  });
  const out: Row[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const desc = r[col.desc]; if (desc == null || desc === "") continue;
    let price = r[col.price];
    if (typeof price === "string") price = Number(String(price).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(Number(price))) continue;
    out.push({
      source: label,
      code: r[col.code] == null ? null : String(r[col.code]).trim(),
      description: String(desc).trim(),
      unit: r[col.unit] == null ? "" : String(r[col.unit]).trim(),
      unitPrice: Number(price),
    });
  }
  return out;
}

const catalogs = files.map(f => ({ label: f.label, rows: parseOne(f.path, f.label) }));
for (const c of catalogs) console.log(`PARSED ${c.label}: ${c.rows.length} rows`);

const items: Array<{ id: number; description: string; unit: string; quantity: number; unitPrice: number; totalPrice: number }> =
  JSON.parse(fs.readFileSync("C:\\Users\\CORRET~1\\AppData\\Local\\Temp\\opencode\\budget-items.json", "utf8"));

const THRESHOLD = 0.30;
const results = items.map(item => {
  const best: Record<string, { score: number; row: Row } | null> = {};
  for (const cat of catalogs) {
    let top: { score: number; row: Row } | null = null;
    for (const row of cat.rows) {
      const { score } = scoreCandidate(item.description, row.description, item.unit, row.unit);
      if (!top || score > top.score) top = { score, row };
    }
    best[cat.label] = top;
  }
  const bestOverall = Object.entries(best).sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0))[0];
  const match = bestOverall?.[1] ?? null;
  const variation = match && item.unitPrice > 0 ? (match.row.unitPrice - item.unitPrice) / item.unitPrice : null;
  const alert = variation != null && Math.abs(variation) > THRESHOLD;
  return { item, match: match ? { ...match.row, score: match.score } : null, variation, alert, threshold: THRESHOLD };
});

const outPath = "C:\\Users\\CORRET~1\\AppData\\Local\\Temp\\opencode\\reconcile-preview.json";
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log("WROTE " + outPath);
for (const r of results) {
  const v = r.variation == null ? "n/a" : (r.variation * 100).toFixed(1) + "%";
  console.log([
    `id=${r.item.id}`,
    r.item.description.slice(0, 60),
    `manual=${r.item.unitPrice}`,
    `match=${r.match?.unitPrice ?? "-"}`,
    `score=${r.match?.score.toFixed(3) ?? "-"}`,
    `var=${v}`,
    r.alert ? "ALERT" : "ok",
    r.match?.code ?? "",
  ].join(" | "));
}