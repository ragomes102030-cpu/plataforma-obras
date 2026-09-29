import fs from "node:fs";
import { scoreMatch, normalizeText } from "../../shared/price-sources/index";

const items = JSON.parse(fs.readFileSync("C:\\Users\\CORRET~1\\AppData\\Local\\Temp\\opencode\\budget-items.json", "utf8"));
const catalog = JSON.parse(fs.readFileSync("C:\\Users\\CorRET~1\\AppData\\Local\\Temp\\opencode\\seinfra-catalog.json", "utf8"));

const results = [];
for (const item of items) {
  const query = item.description ?? item.nome ?? "";
  const unit = item.unidade ?? item.unit ?? "";
  let best = null;
  for (const row of catalog) {
    const score = scoreMatch(query, row.description, unit, row.unit);
    if (!best || score > best.score) {
      best = { score, code: row.code, description: row.description, unit: row.unit, unitPrice: row.unitPrice, source: row.source };
    }
  }
  const manualPrice = item.unitPrice ?? item.precoUnitario ?? 0;
  const seinfraPrice = best ? best.unitPrice : 0;
  const variation = manualPrice > 0 ? (seinfraPrice - manualPrice) / manualPrice : null;
  results.push({
    budgetItemId: item.id,
    description: query,
    unit,
    manualPrice,
    manualTotal: item.totalPrice ?? item.total ?? 0,
    quantity: item.quantity ?? item.quantidade ?? 0,
    match: best,
    score: best ? best.score : 0,
    variation,
    variationPct: variation != null ? variation * 100 : null,
    alert: variation != null && Math.abs(variation) > 0.3,
  });
}
results.sort((a, b) => b.score - a.score);
fs.writeFileSync("C:\\Users\\CorRET~1\\AppData\\Local\\Temp\\opencode\\match-results.json".replace("CORRET~1","Correta Engenharia"), JSON.stringify(results, null, 2));
console.log("MATCH_RESULTS", results.length);
for (const r of results) {
  console.log([
    `id=${r.budgetItemId}`,
    `score=${(r.score*100).toFixed(1)}%`,
    `manual=${r.manualPrice}`,
    `seinfra=${r.match ? r.match.unitPrice : "n/a"}`,
    `var=${r.variationPct != null ? r.variationPct.toFixed(1)+"%" : "n/a"}`,
    r.alert ? "ALERT" : "ok",
    r.description.slice(0,50),
    "->",
    r.match ? r.match.description.slice(0,50) : "NO_MATCH",
    r.match ? r.match.code : "",
  ].join(" | "));
}