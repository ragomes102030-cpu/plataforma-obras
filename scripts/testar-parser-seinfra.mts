import { readFileSync } from 'fs';
import XLSX from 'xlsx';
import { parseSeinfraRows, extrairTrilha } from '../shared/price-sources/seinfra';

const bytes = readFileSync('C:/Users/Correta Engenharia/Desktop/Planejamento de obras/seinfra-028.1/Planos-de-Servicos-028.1.xls');
const wb = XLSX.read(bytes, { type: 'array' });
console.log('Sheets:', wb.SheetNames);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '', blankrows: false });
console.log('Linhas:', rows.length);
const result = parseSeinfraRows(rows, 'Planos-de-Servicos-028.1.xls');
console.log('Servicos:', result.records.length);
console.log('Ignorados:', result.skipped);
console.log('Amostra:');
result.records.slice(0, 5).forEach(r => console.log(' ', r.code, '|', r.unit, '| R$' + r.unitPrice, '|', r.description.slice(0, 60)));
const comTrilha = result.records.filter(r => extrairTrilha(r.notes).length > 0).length;
console.log('Com trilha:', comTrilha, '/', result.records.length);
