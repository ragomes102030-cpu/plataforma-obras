/**
 * Extrai o modelo de dados de `drizzle/schema.ts` lendo o arquivo como texto.
 * O drizzle não expõe introspecção em runtime de forma utilizável aqui, e o
 * que importa na auditoria é a DECLARAÇÃO: tabela, colunas, tipos, PK, FK,
 * índice e unique.
 */
import { readFileSync, writeFileSync } from "node:fs";

const fonte = readFileSync("drizzle/schema.ts", "utf-8");
const linhas = fonte.split(/\r?\n/);

type Tabela = {
  nome: string;
  exportada: string;
  colunas: string[];
  pk: string[];
  fks: string[];
  uniques: string[];
  indices: string[];
  linha: number;
};

const tabelas: Tabela[] = [];
let atual: Tabela | null = null;
let profundidadeColuna = 0;

const ehAtributo = (l: string) => /^\s{4,8}\w+:\s/.test(l);

for (let i = 0; i < linhas.length; i += 1) {
  const l = linhas[i]!;

  // O nome pode estar na mesma linha do export (`mysqlTable("users", {`) ou na
  // seguinte. A primeira versão do parser exigia linha própria e perdeu 10
  // tabelas — incluindo `projects`, que é a raiz de tudo.
  const inicio = l.match(/^export const (\w+) = (mysqlTable|sqliteTable|pgTable)\(/);
  if (inicio) {
    atual = {
      nome: "",
      exportada: inicio[1]!,
      colunas: [],
      pk: [],
      fks: [],
      uniques: [],
      indices: [],
      linha: i + 1,
    };
    tabelas.push(atual);
    // NÃO `continue`: o nome da tabela pode estar na própria linha do export
    // (`mysqlTable("users", {`). Pulando a linha, o nome era procurado na
    // primeira coluna e o inventário saía com "openId" como nome de tabela.
  }
  if (!atual) continue;

  // Nome literal da tabela: na mesma linha do export ou na seguinte.
  if (!atual.nome) {
    const nome = l.match(/"(\w+)"\s*,/) ?? (linhas[i + 1] ?? "").match(/^\s*"(\w+)"/);
    if (nome) atual.nome = nome[1]!;
  }

  if (ehAtributo(l)) {
    const m = l.match(/^\s*(\w+):\s*(.+?),?$/);
    if (m) {
      const [, chave, tipo] = m;
      // FK: .references(() => x.y)
      if (/\.references\(/.test(tipo!)) {
        atual.fks.push(`${chave} -> ${(tipo!.match(/references\(\(\) => (\w+)\.(\w+)/) ?? [])[2] ?? "?"}`);
      }
      if (/primaryKey\(/.test(tipo!)) atual.pk.push(chave!);
      atual.colunas.push(`${chave}: ${tipo!.replace(/\s+/g, " ").replace(/,$/, "")}`);
    }
    continue;
  }

  for (const m of l.matchAll(/uniqueIndex\("([^"]+)"\)\.on\(([^)]*)\)/g)) {
    atual.uniques.push(`${m[1]} (${m[2]!.trim()})`);
  }
  for (const m of l.matchAll(/(?<!unique)index\("([^"]+)"\)\.on\(([^)]*)\)/g)) {
    atual.indices.push(`${m[1]} (${m[2]!.trim()})`);
  }
  if (/\)\s*;?\s*$/.test(l) && l.includes("=> [") === false && atual.colunas.length) {
    // fim da tabela
  }
}

const out: string[] = [];
out.push(`TABELAS: ${tabelas.length}`);
out.push("");
for (const t of tabelas) {
  out.push("=".repeat(72));
  out.push(`${t.nome}   (export ${t.exportada}, linha ${t.linha})`);
  out.push(`  PK: ${t.pk.length ? t.pk.join(", ") : "(id autoincrement)"}`);
  if (t.fks.length) out.push(`  FK: ${t.fks.join(", ")}`);
  if (t.uniques.length) out.push(`  UNIQUE: ${t.uniques.join("; ")}`);
  if (t.indices.length) out.push(`  INDEX: ${t.indices.join("; ")}`);
  for (const c of t.colunas) out.push(`    ${c}`);
  out.push("");
}

writeFileSync("docs/schema-inventario.txt", out.join("\n"), "utf-8");
console.log(out.join("\n"));
console.log(`[docs/schema-inventario.txt — ${tabelas.length} tabelas]`);
