/**
 * Ferramenta de diagnóstico para uma planilha nova da SEINFRA.
 *
 *   npx tsx scripts/inspecionar-catalogo-seinfra.mts <caminho.xls> [tipoDeObra]
 *
 * Lê o arquivo com o mesmo código de produção e imprime, para cada grupo da
 * EAP, as 12 folhas que o motor escolheria — com a trilha da planilha ao lado,
 * para dar para conferir se a peça está na ala certa.
 *
 * POR QUE ISTO EXISTE
 *
 * A classificação do motor foi calibrada contra a SEINFRA-CE 028. Quando sair
 * uma versão nova, a hierarquia pode ter mudado de nome, ganho capítulo ou
 * deixar de ter algum. Rodar este script antes de importar mostra o efeito na
 * EAP sem tocar no banco, e o `conferir-mapa-seinfra.mts` avisa quais
 * subgrupos do mapa não existem mais na planilha.
 *
 * `tipoDeObra` padrão: `edificio`.
 */
import { readFileSync } from "node:fs";
import { parseSeinfraRows, extrairTrilha } from "../shared/price-sources/seinfra";
import { gerarEap } from "../shared/eap-engine";

const caminho = process.argv[2];
if (!caminho) {
  console.error(
    "uso: npx tsx scripts/inspecionar-catalogo-seinfra.mts <caminho.xls> [tipoDeObra]"
  );
  process.exit(1);
}
const tipo = process.argv[3] ?? "edificio";

const bytes = new Uint8Array(readFileSync(caminho));
const XLSX = await import("xlsx");
const wb = XLSX.read(bytes, { type: "array" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: null,
  blankrows: false,
});

const parsed = parseSeinfraRows(rows, caminho);
const entrada = parsed.records.map(r => ({
  code: r.code,
  description: r.description,
  unit: r.unit,
  unitPrice: r.unitPrice,
  trilha: extrairTrilha(r.notes),
}));

const servicos = entrada.filter(s => /^C/i.test(s.code));
const comTrilha = servicos.filter(s => s.trilha.length).length;
const capitulos = new Set(
  servicos.flatMap(s => (s.trilha.length ? [s.trilha[0]!] : []))
);

console.log(`arquivo:        ${caminho}`);
console.log(`registros:      ${parsed.records.length} (ignorados ${parsed.skipped})`);
console.log(`servicos C...:  ${servicos.length}`);
console.log(`com trilha:     ${comTrilha} de ${servicos.length}`);
console.log(`capitulos:      ${capitulos.size}`);
console.log("");

const r = gerarEap(entrada, { tipoDeObra: tipo });
console.log(
  `=== ${tipo}: ${r.nos.length} nos, ${r.servicosUsados} servicos, ${r.servicosSemGrupo} sem grupo ===`
);
if (r.aviso) console.log(`aviso: ${r.aviso}`);
if (r.gruposVazios.length) console.log(`grupos vazios: ${r.gruposVazios.join(", ")}`);

for (const grupo of r.nos.filter(n => n.level === 1)) {
  console.log(`\n[${grupo.code}] ${grupo.name}`);
  for (const folha of r.nos.filter(n => n.code.startsWith(`${grupo.code}.`))) {
    const svc = servicos.find(s => s.code === folha.externalId);
    console.log(
      `   ${folha.externalId!.padEnd(7)} ${(folha.unit ?? "").padEnd(7)} R$ ${String(
        folha.unitPrice
      ).padStart(10)}  ${folha.name.slice(0, 60).padEnd(60)} | ${svc?.trilha.join(" > ") ?? ""}`
    );
  }
}
