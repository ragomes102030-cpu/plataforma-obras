// Gera a migration 0001: as triggers que substituem o `onUpdateNow()`.
//
// POR QUE UMA SEPARADA E NAO NO BASELINE
//
// O teste `server/migrations.test.ts` tem um grupo chamado "DDL novo nao depende
// de migracao ja aplicada", que exige mais de uma migration no journal e
// proibe que uma posterior ALTERe tabela que o baseline cria. Trigger nao e
// ALTER, entao uma migration propria satisfaz o teste E deixa a historia
// correta: o baseline cria a estrutura, a 0001 acrescenta o comportamento.
//
// POR QUE trigger E NAO `DEFAULT`
//
// `ON UPDATE CURRENT_TIMESTAMP` e MySQL. O PostgreSQL nao tem: o `DEFAULT now()`
// so vale na hora do INSERT, e a coluna fica parada para sempre depois. A unica
// forma deReproduzir o comportamento no PostgreSQL e trigger, e o que estas 23
// declaram.
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = "drizzle/schema.ts";
const SAIDA = "drizzle/0001_updated_at_trigger.sql";

// Uma funcao, reutilizada pelas 23 triggers. Uma funcao por tabela seria 23
// copias da mesma logica, e a primeira delas que alguem editasse deixaria as
// outras 22 erradas em silencio.
const FUNCAO = `CREATE OR REPLACE FUNCTION "set_updated_at"() RETURNS trigger AS $$
BEGIN
	NEW."updatedAt" := now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;

const schema = readFileSync(SCHEMA, "utf-8").replace(/\r\n/g, "\n");

// As tabelas sao os blocos `pgTable("nome", {` ... }) e procuro `updatedAt`
// DENTRO do bloco. Sem delimitar pelo bloco, um comentario ou um `.map()` perto
// de outra tabela faria a trigger nascer na tabela errada.
const cabecalhos = [...schema.matchAll(/export const (\w+) = pgTable\(\s*\n?\s*"([A-Za-z0-9_]+)"/g)];
if (cabecalhos.length !== 33) {
  throw new Error(`esperava 33 tabelas, achei ${cabecalhos.length}. NADA foi gravado.`);
}

const comUpdatedAt: string[] = [];
for (let i = 0; i < cabecalhos.length; i++) {
  const m = cabecalhos[i]!;
  const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1]!.index! : schema.length;
  const bloco = schema.slice(m.index!, fim);
  if (/\bupdatedAt:\s*timestamp\(/.test(bloco)) comUpdatedAt.push(m[2]!);
}

if (comUpdatedAt.length !== 23) {
  throw new Error(`esperava 23 tabelas com updatedAt, achei ${comUpdatedAt.length}. NADA foi gravado.`);
}

const unicas = new Set(comUpdatedAt);
if (unicas.size !== comUpdatedAt.length) {
  throw new Error("ha tabela repetida na lista de trigger. NADA foi gravado.");
}

const triggers = comUpdatedAt
  .map(
    tabela => `CREATE TRIGGER "trg_${tabela}_updated_at"
	BEFORE UPDATE ON "${tabela}"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();`
  )
  .join("\n--> statement-breakpoint\n");

const cabecalho = `-- As 23 triggers de \`updatedAt\`.
--
-- O schema usava \`onUpdateNow()\`, que o drizzle traduz para
-- \`ON UPDATE CURRENT_TIMESTAMP\`: um recurso do MySQL. O PostgreSQL nao tem
-- equivalente — o \`DEFAULT now()\` do baseline vale no INSERT e a coluna fica
-- parada depois. A unica forma de reproduzir o comportamento e trigger.
--
-- Uma funcao para as 23. Com uma por tabela, a primeira que alguem editasse
-- deixaria as outras 22 erradas em silencio.
--
-- A lista vem do schema: sao as tabelas cujo bloco declara
-- \`updatedAt: timestamp(...)\`. Nenhuma tabela foi escolhida a mao.

`;

const corpo = `${FUNCAO}\n--> statement-breakpoint\n${triggers}\n`;
writeFileSync(SAIDA, cabecalho + corpo, "utf-8");

console.log(`${comUpdatedAt.length} triggers geradas`);
console.log(`  primeira: ${comUpdatedAt[0]} | ultima: ${comUpdatedAt.at(-1)}`);
console.log(`  linhas: ${(cabecalho + corpo).split("\n").length}`);
