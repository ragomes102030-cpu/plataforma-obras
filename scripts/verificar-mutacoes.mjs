// Verifica, por mutação, que os testes prendem as decisões que dizem prender.
//
// Três cuidados, todos aprendidos errando:
//
// 1. No Windows, `execFileSync("pnpm", ...)` sem shell não roda `pnpm.CMD` — o
//    script recebia relatório vazio e acusava falso negativo. O vitest é
//    chamado pelo `node` do binário real.
// 2. O vitest escreve o relatório em STDERR; é preciso fundir os dois fluxos.
// 3. "O teste falhou" não basta. A mutação tem de derrubar por ASSERÇÃO. Um
//    crash (TypeError, ReferenceError) prova que o código quebrou, não que o
//    teste prende a decisão.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VITEST = require.resolve("vitest/vitest.mjs");

const MUTACOES = [
  {
    nome: "casamento volta a ser por includes (perde a fronteira de palavra)",
    arquivo: "shared/eap-engine.ts",
    de: "if (padrao.test(texto)) return grupo.categoria;",
    para: "if (texto.includes(grupo.padroes[0].source.slice(3))) return grupo.categoria;",
    teste: "shared/eap-hierarquia.test.ts",
  },
  {
    nome: "classificação ignora a trilha e usa só a descrição",
    arquivo: "shared/eap-engine.ts",
    de: "  const pelaTrilha = classificarPorTrilha(trilha);\n  if (pelaTrilha) return pelaTrilha;",
    para: "  const pelaTrilha: CategoriaDeObra | undefined = undefined;\n  if (pelaTrilha) return pelaTrilha;",
    teste: "shared/eap-hierarquia.test.ts",
  },
  {
    nome: "tubulão volta para estrutura (perde o override de subgrupo)",
    arquivo: "shared/eap-engine.ts",
    de: '["tubuloes a ceu aberto", "fundacao"],',
    para: '["tubuloes a ceu aberto", "estrutura"],',
    teste: "shared/eap-hierarquia.test.ts",
  },
  {
    nome: "edifício deixa de pedir cobertura",
    arquivo: "shared/eap-engine.ts",
    de: '      "instalacoes",\n      "cobertura",\n      "revestimentos",',
    para: '      "instalacoes",\n      "revestimentos",',
    teste: "shared/eap-hierarquia.test.ts",
  },
  {
    nome: "saneamento deixa de pedir a rede de tubos",
    arquivo: "shared/eap-engine.ts",
    de: 'grupos: ["preliminares", "terraplenagem", "instalacoes"],',
    para: 'grupos: ["preliminares", "terraplenagem"],',
    teste: "shared/eap-hierarquia.test.ts",
  },
  {
    nome: "seeder para de ler a trilha de notes",
    arquivo: "server/construction/eap-seeder.ts",
    de: "trilha: extrairTrilha(s.notes),",
    para: "trilha: [],",
    teste: "server/construction/eap-seeder.test.ts",
  },
  {
    nome: "parser volta a ler ITEM como coluna de código",
    arquivo: "shared/price-sources/seinfra.ts",
    de: "if (code < 0 && matchHeaderField(cell, HEADER_SYNONYMS.officialCode))\n        code = c;",
    para: "if (code < 0 && matchHeaderField(cell, HEADER_SYNONYMS.code)) code = c;",
    teste: "shared/price-sources/seinfra-hierarquia.test.ts",
  },
  {
    nome: "parser volta a descartar as linhas de agrupamento",
    arquivo: "shared/price-sources/seinfra.ts",
    de: "if (temItem && code && !descricao && ehNumeroDeItem(item)) {",
    para: "if (item === String.fromCharCode(35, 35)) {",
    teste: "shared/price-sources/seinfra-hierarquia.test.ts",
  },
  {
    nome: "extração da trilha perde a leitura do separador",
    arquivo: "shared/price-sources/seinfra.ts",
    de: '  const separador = notas.indexOf(" | ");\n  if (separador === -1) return [];',
    para: "  const separador = -1;\n  if (separador === -1) return [];",
    teste: "shared/price-sources/seinfra-hierarquia.test.ts",
  },
  {
    nome: "descrição volta a ser prefixada com o capítulo (suja o nome da folha)",
    arquivo: "shared/price-sources/seinfra.ts",
    de: "      description: descricao.slice(0, 240),",
    para: "      description: (trilha.join(' - ') + ' - ' + descricao).slice(0, 240),",
    teste: "shared/price-sources/seinfra-hierarquia.test.ts",
  },
];

let problemas = 0;
for (const m of MUTACOES) {
  const original = readFileSync(m.arquivo, "utf-8");
  if (!original.includes(m.de)) {
    console.log(`ERRO   ${m.nome}: padrao nao encontrado em ${m.arquivo}`);
    problemas += 1;
    continue;
  }
  writeFileSync(m.arquivo, original.replace(m.de, m.para));

  let relatorio = "";
  let codigo = 0;
  try {
    relatorio = execFileSync(
      process.execPath,
      [VITEST, "run", m.teste, "--reporter=basic"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (erro) {
    codigo = 1;
    relatorio = `${erro.stdout ?? ""}${erro.stderr ?? ""}`;
  } finally {
    writeFileSync(m.arquivo, original);
  }

  const limpo = relatorio.replace(/\x1b\[[0-9;]*m/g, "");
  const assercoes = (limpo.match(/AssertionError/g) || []).length;
  const crashes = (limpo.match(/TypeError|ReferenceError|is not a function|is not defined/g) || []).length;
  const resumo = (limpo.match(/Tests\s+\d+[^\n]*/) || ["sem resumo"])[0].trim();
  const passouTudo = /Tests\s+\d+ passed/.test(limpo);

  if (!resumo || resumo === "sem resumo") {
    console.log(`ERRO   ${m.nome}: nao consegui ler o relatorio do vitest`);
    console.log(`        ${limpo.slice(0, 200) || "(vazio)"}`);
    problemas += 1;
  } else if (codigo === 0 || passouTudo) {
    console.log(`FALHOU  ${m.nome}`);
    console.log(`        ${m.teste} continuou passando — o teste nao prende esta decisao`);
    problemas += 1;
  } else if (assercoes === 0) {
    console.log(`FALHOU  ${m.nome}`);
    console.log(`        quebrou sem assercao (${crashes} crash): ${resumo}`);
    console.log(`        o teste prova que o codigo quebrou, nao que prende a decisao`);
    problemas += 1;
  } else {
    console.log(`ok      ${m.nome}`);
    console.log(`        ${assercoes} assercao(oes) | ${resumo}`);
  }
}

console.log(
  problemas === 0
    ? "\nTodas as mutacoes foram detectadas por assercao."
    : `\n${problemas} problema(s).`
);
process.exit(problemas === 0 ? 0 : 1);
