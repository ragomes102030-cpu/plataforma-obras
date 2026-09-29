import { readFileSync, writeFileSync } from "node:fs";
const p = "drizzle/schema.ts";
const s = readFileSync(p, "utf-8");

// O arquivo usa CRLF.
const needle = 'totalFloat: int("totalFloat"),\r\n    cpmCalculatedAt: timestamp("cpmCalculatedAt"),';
const replacement = 'totalFloat: int("totalFloat"),\r\n    mustStartOn: timestamp("mustStartOn"),\r\n    finishNoLaterThan: timestamp("finishNoLaterThan"),\r\n    cpmCalculatedAt: timestamp("cpmCalculatedAt"),';

if (!s.includes(needle)) {
  // tenta com \n apenas
  const needle2 = 'totalFloat: int("totalFloat"),\n    cpmCalculatedAt: timestamp("cpmCalculatedAt"),';
  if (!s.includes(needle2)) {
    const idx = s.indexOf('totalFloat: int("totalFloat")');
    console.log("found at:", idx);
    console.log("snippet:", JSON.stringify(s.slice(idx, idx + 120)));
    process.exit(1);
  }
  const result = s.replace(needle2, replacement.replace(/\r\n/g, "\n"));
  writeFileSync(p, result);
  console.log("schema.ts atualizado (LF).");
  process.exit(0);
}

const result = s.replace(needle, replacement);
writeFileSync(p, result);
console.log("schema.ts atualizado (CRLF).");
