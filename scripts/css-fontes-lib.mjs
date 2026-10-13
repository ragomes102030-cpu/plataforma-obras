// Leitor de CSS compartilhado pelos geradores de tipografia (campo e desktop).
//
// Este arquivo nasceu de `gerar-tipografia-campo.mjs`: as funcoes foram movidas
// para ca sem mudanca de comportamento. A prova de que a mudanca nao alterou
// nada e o SHA256 de `client/src/campo-tipografia.css` continuar o mesmo depois
// de regenerar.
//
// O que mora aqui e o que e dificil de acertar duas vezes:
//   - `lerRegras`  le por profundidade de chaves, para nao confundir `@media`
//                  aninhado com regra de topo (o erro da primeira versao);
//   - `extrairTamanho` le `font-size:` E o atalho `font: 800 8px/1 mono`, e
//                  descarta o atalho invalido que o navegador joga fora;
//   - `listarFontes` le os arquivos na ORDEM DO BUNDLE, porque em
//                  especificidade igual quem vence e a ultima declaracao.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Ordem real, tirada do grafo de imports: main.tsx importa `./App` ANTES de
// `./index.css`; Home.tsx importa planilha.css antes de eap.css; e
// theme-tokens.css e importado no topo de index.css.
export const ORDEM = ["planilha.css", "eap.css", "theme-tokens.css", "index.css", "seletor-obra.css"];

// As camadas geradas ficam de fora: uma nao pode ler a outra.
export const IGNORAR = new Set(["mobile.css", "campo-tipografia.css", "tipografia-desktop.css"]);

// Leitor de CSS por profundidade de chaves.
//
// A primeira versao deste leitor procurava o proximo "{" e o proximo "}" e
// nunca desempilhava o ambiente de `@media`: depois do primeiro `@media` do
// arquivo, TODA regra seguinte era considerada dentro dele. O contexto saia
// errado para quase todo o index.css (o encadeamento virava o menor `max-width`
// visto ate ali). Aqui a pilha sobe no "{" e desce no "}".
export function lerRegras(texto) {
  const achadas = [];
  const pilha = [];
  let inicioDoCabecalho = 0;
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (c === "{") {
      const cabecalho = texto.slice(inicioDoCabecalho, i).trim();
      const semLixo = cabecalho.replace(/^[}\s;]+/, "");

      if (semLixo.startsWith("@")) {
        pilha.push(semLixo);
        inicioDoCabecalho = i + 1;
        i += 1;
        continue;
      }

      const fim = texto.indexOf("}", i);
      if (fim === -1) break;
      achadas.push({
        seletor: semLixo.replace(/\s+/g, " "),
        corpo: texto.slice(i + 1, fim),
        contexto: pilha.filter((p) => /^@(media|supports|container)/.test(p)).join(" && "),
      });
      i = fim + 1;
      inicioDoCabecalho = i;
      continue;
    }

    if (c === "}") {
      pilha.pop();
      inicioDoCabecalho = i + 1;
    }
    i += 1;
  }

  return achadas;
}

// O app escreve tamanho de duas formas: `font-size: 9px` e o atalho
// `font: 800 8px/1 ui-monospace`. Ler so o `font-size` deixava de fora
// justamente os rotulos menores -- `.scopo-tag`, `.pl-atividade-tag`,
// `td.mono`, `.pl-duracao-input` entre outros.
export function extrairTamanho(corpo) {
  const mAtalho = /(?:^|[;\s])font\s*:\s*([^;]+)/i.exec(corpo);
  const mTamanho = /font-size\s*:\s*([^;]+)/i.exec(corpo);
  const posAtalho = mAtalho ? mAtalho.index : -1;
  const posTamanho = mTamanho ? mTamanho.index : -1;

  let valor = null;
  let origem = null;
  let importante = false;

  if (mTamanho && posTamanho > posAtalho) {
    importante = /!important/i.test(mTamanho[1]);
    valor = mTamanho[1].replace(/!important/i, "").trim();
    origem = "font-size";
  } else if (mAtalho) {
    importante = /!important/i.test(mAtalho[1]);
    // De "800 8px/1 ui-monospace" interessa o "8px": o tamanho e o primeiro
    // pedaco que termina em unidade de tamanho, ignorando peso e familia.
    for (const pedaco of mAtalho[1].split(/[\s,]+/)) {
      const antesDaBarra = pedaco.split("/")[0];
      if (/^[\d.]+(px|rem|em|%|pt)$/i.test(antesDaBarra)) {
        valor = antesDaBarra;
        origem = "atalho font";
        break;
      }
    }

    // Mas o atalho pode estar INVALIDO e o navegador descarta a declaracao
    // inteira -- e ai o tamanho que vale nao e o que esta escrito. O caso real
    // e `font: 700 11px/1 inherit`: a familia do atalho nao aceita palavra
    // reservada (`inherit`, `initial`, `unset`, `revert`), so `font: inherit`
    // sozinho. O Chrome joga fora o `font:` todo, o botao herda a fonte da
    // pagina e fica com 16px. O gerador lia "11px" e sobrescrevia para 12.5px,
    // ENCOLHENDO o botao -- medido em 6 botoes (`.pl-atividades-btn.secondary`,
    // `.scopo-btn.secondary`, os filtros `.ativo`). Lendo a declaracao como
    // invalida, o seletor fica de fora e o tamanho herdado permanece.
    const ultimaPalavra = mAtalho[1].replace(/!important/i, "").trim().split(/\s+/).pop();
    if (ultimaPalavra && /^(inherit|initial|unset|revert|revert-layer)$/i.test(ultimaPalavra)) {
      valor = null;
      origem = null;
      importante = false;
    }
  }

  return valor === null ? null : { valor, origem, importante };
}

export const emPx = (v) => {
  const m = /^([\d.]+)px$/i.exec(v);
  return m ? parseFloat(m[1]) : null;
};

// Le os CSS do app na ordem do bundle e devolve uma declaracao por regra que
// declare tamanho de fonte: { arquivo, seletor, media, valor, origem, importante }.
export function listarFontes(RAIZ, { ignorar = IGNORAR } = {}) {
  const disponiveis = readdirSync(RAIZ).filter((f) => f.endsWith(".css") && !ignorar.has(f));
  const arquivos = [
    ...ORDEM.filter((f) => disponiveis.includes(f)),
    ...disponiveis.filter((f) => !ORDEM.includes(f)),
  ];

  const declaracoes = [];
  for (const arquivo of arquivos) {
    const bruto = readFileSync(path.join(RAIZ, arquivo), "utf8");
    const semComentario = bruto.replace(/\/\*[\s\S]*?\*\//g, "");

    for (const regra of lerRegras(semComentario)) {
      const { seletor, corpo, contexto } = regra;
      if (!seletor || seletor.includes("{") || seletor.includes("}")) continue;

      const t = extrairTamanho(corpo);
      if (!t) continue;
      declaracoes.push({ arquivo, seletor, media: contexto, valor: t.valor, origem: t.origem, importante: t.importante });
    }
  }

  return { arquivos, declaracoes };
}

// Agrupa as declaracoes por (seletor, contexto de media) preservando a ordem do
// bundle. A decisao e por (seletor, contexto), e nao pelo seletor inteiro: um
// mesmo seletor pode ser pequeno dentro de um `@media` e ja passar do piso fora
// dele -- `.janela-agente-abrir` e 12px ate 600px e 12.5px acima disso.
export function agruparPorContexto(declaracoes) {
  const porContexto = new Map();
  for (const d of declaracoes) {
    const chave = `${d.media}|||${d.seletor}`;
    if (!porContexto.has(chave)) {
      porContexto.set(chave, { seletor: d.seletor, media: d.media, valores: [], origens: [], importantes: [] });
    }
    const grupo = porContexto.get(chave);
    grupo.valores.push(d.valor);
    grupo.origens.push(d.origem);
    grupo.importantes.push(d.importante);
  }
  return porContexto;
}

// Separa as condicoes de uma cadeia de `@media` em { larguras, outros }.
// `max-width` vira largura; `min-width` e qualquer outra condicao viram `outros`
// (nao dao para normalizar sem inventar).
export function condicoesDe(cadeia) {
  const larguras = [];
  const minimos = [];
  const outros = [];
  if (!cadeia) return { larguras, minimos, outros };

  const mult = /\(\s*width\s*>=\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cadeia);
  for (const parte of cadeia.split(" && ")) {
    const semAt = parte.replace(/^@(media|supports|container)\s*/, "");
    for (const cond of semAt.match(/\([^)]*\)/g) || []) {
      const rangeMax = /\(\s*width\s*<=\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      const rangeMin = /\(\s*width\s*>=\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      const max = /\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      const min = /\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      if (max) larguras.push(parseFloat(max[1]));
      else if (rangeMax) larguras.push(parseFloat(rangeMax[1]));
      else if (min) minimos.push(parseFloat(min[1]));
      else if (rangeMin) minimos.push(parseFloat(rangeMin[1]));
      else outros.push(cond);
    }
  }
  if (mult) minimos.push(parseFloat(mult[1]));
  return { larguras, minimos, outros };
}

// Normalizacao usada pela camada de CAMPO: varios `max-width` aninhados
// equivalem ao menor deles; acima de 900px a camada nem se aplica, entao esse
// contexto vira vazio. Condicao que nao e de largura nao da para reescrever.
export function normalizarMediaCampo(cadeia, TETO_MAX = 900) {
  if (!cadeia) return { contexto: "", temOutros: false };
  const partes = cadeia.split(" && ");
  const larguras = [];
  const outros = [];
  for (const parte of partes) {
    for (const cond of parte.replace(/^@media\s*/, "").match(/\([^)]*\)/g) || []) {
      const max = /\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      const min = /\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      if (max) larguras.push(parseFloat(max[1]));
      else if (min) outros.push(`(min-width: ${parseFloat(min[1])}px)`);
      else outros.push(cond);
    }
  }
  const teto = larguras.length ? Math.min(...larguras) : null;
  // Acima de TETO_MAX a camada de campo nem se aplica: o contexto resolvido vira vazio.
  const tetoUtil = teto !== null && teto < TETO_MAX ? `(max-width: ${teto}px)` : "";
  const condicoes = [tetoUtil, ...outros].filter(Boolean);
  return { contexto: condicoes.join(" and "), temOutros: outros.length > 0 };
}
