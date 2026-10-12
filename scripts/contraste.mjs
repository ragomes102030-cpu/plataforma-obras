// Calcula contraste e sugere uma cor que passa. Serve para nao escrever numero
// de contraste de cabeca dentro do CSS.
//
// Uso: node scripts/contraste.mjs "#64798c" "#101923" [alvo]
import { paraRgb, paraHex, razao, ajustar, paraHsl } from "./contraste-lib.mjs";

const [cor, ...resto] = process.argv.slice(2);
const alvo = Number(resto.find(a => /^\d/.test(a)) ?? 4.5);
const fundos = resto.filter(a => a.startsWith("#") || a.startsWith("rgb"));

const t = paraRgb(cor);
if (!t) { console.error(`cor invalida: ${cor}`); process.exit(1); }
console.log(`cor ${paraHex(t)}  matiz ${Math.round(paraHsl(t).h)}o  saturacao ${Math.round(paraHsl(t).s * 100)}%  luz ${Math.round(paraHsl(t).l * 100)}%`);
for (const f of fundos) {
  const r = paraRgb(f);
  const razao_ = razao(t, r);
  const minimo = razao_ >= 4.5 ? (razao_ >= 4.5 ? "ok AA" : "") : "REPROVA";
  console.log(`  sobre ${paraHex(r)}: ${razao_.toFixed(2)}:1  ${razao_ >= alvo ? "passa" : `REPROVA (alvo ${alvo})`}`);
}
const ajuste = ajustar(cor, fundos.map(paraRgb), alvo);
if (ajuste) {
  console.log(`\nsugestao: ${ajuste.hex}  (${ajuste.fundo})`);
  for (const f of fundos) console.log(`  sobre ${f}: ${razao(paraRgb(ajuste.hex), paraRgb(f)).toFixed(2)}:1`);
} else {
  console.log(`\nsem sugestao: nem preto nem branco atingem ${alvo} em todos os fundos`);
}
