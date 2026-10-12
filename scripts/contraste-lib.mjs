// Contraste WCAG 2.1: contas compartilhadas pelo auditor e pelo gerador.
//
// Nao ha dependencia externa de proposito: a conta e curta e precisa ser a
// mesma nos dois lados.

export const canal = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

export const luz = c => 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);

export const razao = (a, b) => {
  const l1 = luz(a), l2 = luz(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

export function paraRgb(t) {
  const s = String(t).trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");

export const paraHex = c => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

export function paraHsl(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const d2 = 1 - Math.abs(2 * l - 1);
  const s = d === 0 || d2 === 0 ? 0 : d / d2;
  return { h, s, l };
}

export function deHsl({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 };
}

// Escurece (fundo claro) ou clareia (fundo escuro) a cor, preservando matiz e
// saturacao, ate a razao de contraste atingir o alvo contra TODOS os fundos
// informados. Devolve null quando nem preto nem branco resolvem.
export function ajustar(corTexto, fundos, alvo) {
  const textos = Array.isArray(corTexto) ? corTexto : [corTexto];
  const listaFundo = Array.isArray(fundos) ? fundos : [fundos];
  const pior = alvo;
  const base = paraHsl(paraRgb(textos[0]) ?? { r: 0, g: 0, b: 0 });
  const escuro = luz(listaFundo[0]) < 0.5;
  const passo = i => (escuro ? base.l + i / 100 : base.l - i / 100);
  const testa = hex => listaFundo.every(f => razao(paraRgb(hex), f) >= pior);
  // Busca grosseira e depois fina: 1% de luminosidade basta para o olho.
  for (let i = 0; i <= 100; i++) {
    const l = passo(i);
    if (l < 0 || l > 1) break;
    const hex = paraHex(deHsl({ h: base.h, s: base.s, l }));
    if (testa(hex)) {
      for (let j = i - 1; j <= i; j += 0.2) {
        const l2 = passo(j);
        if (l2 < 0 || l2 > 1) continue;
        const hex2_ = paraHex(deHsl({ h: base.h, s: base.s, l: l2 }));
        if (testa(hex2_)) return { hex: hex2_, fundo: escuro ? "clareou" : "escureceu", passos: j };
      }
      return { hex, fundo: escuro ? "clareou" : "escureceu", passos: i };
    }
  }
  return null;
}
