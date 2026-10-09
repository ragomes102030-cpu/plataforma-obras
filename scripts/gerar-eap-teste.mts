import XLSX from 'xlsx';
import { parseSeinfraRows, extrairTrilha } from '../shared/price-sources/seinfra';
import { gerarEap } from '../shared/eap-engine';
import { readFileSync } from 'fs';

const bytes = readFileSync('C:/Users/Correta Engenharia/Desktop/Planejamento de obras/seinfra-028.1/Planos-de-Servicos-028.1.xls');
const wb = XLSX.read(bytes, { type: 'array' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '', blankrows: false });
const parsed = parseSeinfraRows(rows, 'Planos-de-Servicos-028.1.xls');
const entrada = parsed.records.map(r => ({
  code: r.code, description: r.description, unit: r.unit, unitPrice: r.unitPrice,
  trilha: extrairTrilha(r.notes),
}));
const r = gerarEap(entrada, { tipoDeObra: 'edificio' });
console.log(`Nos: ${r.nos.length}, Servicos usados: ${r.servicosUsados}, Sem grupo: ${r.servicosSemGrupo}`);
if (r.aviso) console.log('Aviso:', r.aviso);
if (r.gruposVazios.length) console.log('Grupos vazios:', r.gruposVazios.join(', '));
for (const grupo of r.nos.filter(n => n.level === 1)) {
  console.log(`\n[${grupo.code}] ${grupo.name}`);
  for (const folha of r.nos.filter(n => n.code.startsWith(`${grupo.code}.`))) {
    console.log(`   ${folha.externalId!.padEnd(7)} ${(folha.unit ?? '').padEnd(7)} R$ ${String(folha.unitPrice).padStart(10)}  ${folha.name.slice(0, 55)}`);
  }
}
