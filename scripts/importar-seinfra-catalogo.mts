/**
 * Importador em lote do catálogo SEINFRA-CE (Tabela Unificada, versão 028.x).
 *
 * Consome os TRÊS arquivos oficiais (download manual do site da SEINFRA-CE) e
 * materializa o catálogo nas quatro tabelas do schema:
 *
 *   Tabela-de-Insumos-<versão>.xls   → priceCatalogs (1) + priceItems (N insumos)
 *   Planos-de-Servicos-<versão>.xls  → serviceCompositions (N serviços)
 *   Composicoes-<versão>.xls         → compositionComponents (M coeficientes)
 *
 * Os três arquivos NÃO são intercambiáveis (ver shared/price-sources/README.md):
 * só o Planos-de-Serviços tem serviço, e só o de Composições tem coeficiente.
 *
 * ── SEGURANÇA ───────────────────────────────────────────────────────────────
 * 1. O MODO PADRÃO É DRY-RUN. Nada é gravado sem `--execute`.
 * 2. Gravar exige `--execute` + `--database-url` + `--user-id`, explícitos.
 * 3. Este script NÃO importa `server/db` e NÃO lê `DATABASE_URL` do ambiente por
 *    conta própria: o DSN entra pela linha de comando (ou por
 *    `--database-url-env <VAR>`, também explícito). Sem isso não há conexão.
 * 4. DSNs de produção conhecidos (Supabase do projeto e hosts Render) são
 *    recusados, a menos que se passe `--allow-production` de propósito.
 * 5. O host do DSN é sempre impresso com credenciais redigidas.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/importar-seinfra-catalogo.mts --insumos <xls> --planos <xls> \
 *     --composicoes <xls> --reference 028.1 --json out/relatorio.json
 *
 *   # gravação (de propósito, contra um banco de teste):
 *   npx tsx scripts/importar-seinfra-catalogo.mts --insumos <xls> --planos <xls> \
 *     --composicoes <xls> --reference 028.1 --execute \
 *     --database-url "postgres://.../teste" --user-id 1
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

import {
  lerPrimeiraAba,
  parsePtBrCurrency,
  reconhecerPlanilhaSeinfra,
  seinfraAdapter,
} from "../shared/price-sources/seinfra";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type TipoComponente = "material" | "mao_de_obra" | "equipamento";
type TipoItem = TipoComponente | "servico";

interface ItemCatalogo {
  code: string;
  description: string;
  unit: string;
  itemType: TipoItem;
  unitPrice: number;
  notes?: string;
  temTrilha: boolean;
}

interface ComponenteComposicao {
  code: string;
  coefficient: number;
  unitPriceSnapshot: number;
  componentType: TipoComponente;
}

interface ComposicaoPlanilha {
  code: string;
  description: string;
  unit: string;
  componentes: ComponenteComposicao[];
  /** Componentes C… (sub-serviços) descartados neste bloco — enum sem "servico". */
  componentesDescartados: number;
  valorGeral: number | null;
}

interface ResultadoComposicoes {
  composicoes: ComposicaoPlanilha[];
  linhasComponentes: number;
  componentesServico: number;
  componentesSemPreco: number;
  componentesForaDeBloco: number;
}

interface Avisos {
  descricoesTruncadas: number;
  unidadesTruncadas: number;
  servicosSemTrilha: number;
  componentesServicoNaoRepresentaveis: number;
  /** Blocos cujos componentes são TODOS C… (composição de composição). */
  blocosSomenteComposicoes: number;
  blocosSomenteComposicoesExemplos: string[];
  componentesOrfaos: number;
  componentesOrfaosExemplos: string[];
  versaoComposicoesDivergente: string | null;
  blocosSemComponentes: number;
  composicoesSemItemNoCatalogo: number;
  composicoesSemItemNoCatalogoExemplos: string[];
  /** Componentes válidos que ficam sem destino por não haver serviço correspondente. */
  componentesSemComposicao: number;
  itensDuplicadosNoArquivo: number;
  servicosDuplicadosNoArquivo: number;
}

const USO = `
Importador do catálogo SEINFRA-CE em lote (dry-run por padrão)

ENTRADAS (ao menos --insumos ou --planos)
  --insumos <arquivo.xls>        Tabela de Insumos  → priceItems
  --planos <arquivo.xls>         Planos de Serviços → serviceCompositions
  --composicoes <arquivo.xls>    Composições        → compositionComponents

CATÁLOGO
  --reference <028.1>            referencePeriod (senão inferido do nome do arquivo)
  --name <texto>                 nome do catálogo (default: "SEINFRA-CE <reference>")
  --state <UF>                   default: CE
  --composition-status <s>       rascunho | validada | arquivada (default: validada)
  --also-import-services-as-items
                                 grava também os serviços em price_items (única
                                 forma de preservar a trilha da EAP, porque
                                 service_compositions não tem coluna de notas)

GRAVAÇÃO (só com --execute)
  --execute                      libera escrita (sem isso: dry-run)
  --database-url <dsn>           DSN do banco de destino (obrigatório p/ --execute)
  --database-url-env <VAR>       lê o DSN de uma variável de ambiente nomeada
  --user-id <int>                createdBy (obrigatório p/ --execute)
  --allow-production             permite DSN de produção conhecido (evite)
  --batch-size <n>               default: 500
  --no-ssl                       desliga SSL (default: ligado fora de localhost)

OUTROS
  --limit <n>                    limita registros por arquivo (smoke test)
  --allow-version-mismatch       aceita Composições de versão diferente do catálogo
  --print-sql                    imprime uma amostra das 4 instruções SQL que
                                 seriam executadas (não conecta em nada)
  --json <arquivo>               grava o relatório em JSON
  --verbose                      imprime progresso detalhado
  --help                         esta mensagem
`;

// ─────────────────────────────────────────────────────────────────────────────
// Parser do arquivo de Composições (um bloco por serviço)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O arquivo de Composições é um relatório com um BLOCO por serviço:
 *
 *   C1802 - BOMBA CENTRÍFUGA DE 1/4 CV ... - UN
 *   MAO DE OBRA |  | Unidade | Coeficiente | Preço | Total
 *   I0043      | AJUDANTE DE ENCANADOR | H | 8 | 21.1 | 168.8
 *   "" | "" | "" | "" | Total: | 378.24
 *   MATERIAIS |  |  |  |  |
 *   I0852 | BOMBA CENTRIFUGA P=1/4CV | UN | 1 | 457.81 | 457.81
 *   "" | "" | "" | "Valor Geral:" | "" | 836.05
 *
 * Regra de reconhecimento da linha de componente: coluna 0 com código de insumo
 * (I…/G…) E coeficiente numérico na coluna 3. Assim as linhas de subtotal
 * (coluna 0 vazia) e as de seção caem fora sem heurística frágil.
 *
 * Componente de serviço (C…) existe no arquivo, mas o enum
 * composition_components.componentType não tem "servico" — é contado e
 * descartado com aviso explícito, nunca em silêncio.
 */
export function parseComposicoesSeinfraRows(rows: unknown[]): ResultadoComposicoes {
  const composicoes: ComposicaoPlanilha[] = [];
  let atual: ComposicaoPlanilha | null = null;
  let secao: TipoComponente | "servico" | null = null;
  let linhasComponentes = 0;
  let componentesServico = 0;
  let componentesSemPreco = 0;
  let componentesForaDeBloco = 0;

  const celula = (row: unknown[], indice: number): string =>
    String(row?.[indice] ?? "").trim();

  for (const rowBruto of rows) {
    const row = (rowBruto as unknown[]) ?? [];
    const c0 = celula(row, 0);
    const c1 = celula(row, 1);
    const c2 = celula(row, 2);
    const c3 = celula(row, 3);
    const c4 = celula(row, 4);

    // Linha de seção do bloco: "MAO DE OBRA", "MATERIAIS", "EQUIPAMENTOS".
    const secaoNormalizada = c0
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/\s+/g, " ");
    if (!c1 && !c3) {
      if (secaoNormalizada === "MAO DE OBRA") {
        secao = "mao_de_obra";
        continue;
      }
      if (secaoNormalizada.startsWith("MATERIA")) {
        secao = "material";
        continue;
      }
      if (secaoNormalizada.startsWith("EQUIPAMENTO")) {
        secao = "equipamento";
        continue;
      }
      if (secaoNormalizada.startsWith("SERVICO")) {
        secao = "servico";
        continue;
      }
    }

    // Cabeçalho de bloco: "C1802 - DESCRIÇÃO - UN".
    if (/^C\s*\d{3,}\s*-\s*\S/i.test(c0) && !c1) {
      const partes = c0.split(/\s+-\s+/);
      const codigo = (partes[0] ?? "").trim().toUpperCase();
      const unidade = partes.length > 1 ? (partes[partes.length - 1] ?? "").trim() : "UN";
      const descricao = partes.slice(1, -1).join(" - ").trim() || codigo;
      atual = {
        code: codigo,
        description: descricao,
        unit: unidade || "UN",
        componentes: [],
        componentesDescartados: 0,
        valorGeral: null,
      };
      composicoes.push(atual);
      secao = null;
      continue;
    }

    // Linha de componente (insumo ou sub-serviço) com coeficiente numérico.
    if (/^[IGC]\s*\d{2,}/i.test(c0)) {
      const coeficiente = parsePtBrCurrency(c3);
      const preco = parsePtBrCurrency(c4);
      if (coeficiente !== null && preco !== null) {
        linhasComponentes += 1;
        if (/^C/i.test(c0)) {
          componentesServico += 1; // não representável no enum atual
          if (atual) atual.componentesDescartados += 1;
          continue;
        }
        if (!atual) {
          componentesForaDeBloco += 1;
          continue;
        }
        const tipo: TipoComponente =
          secao === "mao_de_obra" || secao === "material" || secao === "equipamento"
            ? secao
            : /mao de obra|ajudante|pedreiro|servente|encanador|armador/i.test(c1)
              ? "mao_de_obra"
              : "material";
        atual.componentes.push({
          code: c0.toUpperCase(),
          coefficient: coeficiente,
          unitPriceSnapshot: preco,
          componentType: tipo,
        });
        continue;
      }
      if (coeficiente !== null && preco === null) {
        componentesSemPreco += 1;
        continue;
      }
      continue;
    }

    // "Valor Geral" do bloco — guardado no relatório para conferência.
    if (atual && c3.toLowerCase().startsWith("valor geral")) {
      const total = parsePtBrCurrency(c4);
      if (total !== null) atual.valorGeral = total;
      continue;
    }
  }

  return {
    composicoes,
    linhasComponentes,
    componentesServico,
    componentesSemPreco,
    componentesForaDeBloco,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** ON CONFLICT DO UPDATE não aceita duas linhas com a mesma chave no mesmo INSERT. */
function dedupePorCodigo<T extends { code: string }>(lista: T[]): { unicos: T[]; duplicados: number } {
  const mapa = new Map<string, T>();
  let duplicados = 0;
  for (const item of lista) {
    if (mapa.has(item.code)) duplicados += 1;
    mapa.set(item.code, item);
  }
  return { unicos: [...mapa.values()], duplicados };
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

// ── construtores de SQL (usados na escrita real e no --print-sql) ─────────────

const SQL_CATALOGO = `INSERT INTO price_catalogs (name, "sourceType", state, "referencePeriod", status, "createdBy")
 VALUES ($1, 'SEINFRA'::price_catalogs_sourceType, $2, $3, 'ativo'::price_catalogs_status, $4)
 RETURNING id`;

function sqlItens(catalogoId: number, lote: ItemCatalogo[]): { sql: string; valores: unknown[] } {
  const tuplas = lote.map(
    (_, i) =>
      `($${i * 7 + 1},$${i * 7 + 2},$${i * 7 + 3},$${i * 7 + 4},` +
      `$${i * 7 + 5}::price_items_itemType,$${i * 7 + 6}::numeric,$${i * 7 + 7})`
  );
  const valores = lote.flatMap(item => [
    catalogoId,
    item.code,
    item.description,
    item.unit,
    item.itemType,
    item.unitPrice.toFixed(2),
    item.notes ?? null,
  ]);
  const sql = `INSERT INTO price_items ("catalogId", code, description, unit, "itemType", "unitPrice", notes)
   VALUES ${tuplas.join(",")}
   ON CONFLICT ("catalogId", code) DO UPDATE SET
     description = EXCLUDED.description,
     unit = EXCLUDED.unit,
     "itemType" = EXCLUDED."itemType",
     "unitPrice" = EXCLUDED."unitPrice",
     notes = EXCLUDED.notes,
     "updatedAt" = now()`;
  return { sql, valores };
}

function sqlServicos(
  catalogoId: number,
  reference: string,
  status: string,
  userId: number,
  lote: ItemCatalogo[]
): { sql: string; valores: unknown[] } {
  const tuplas = lote.map(
    (_, i) =>
      `($${i * 7 + 1},$${i * 7 + 2},$${i * 7 + 3},$${i * 7 + 4},` +
      `$${i * 7 + 5},$${i * 7 + 6}::service_compositions_status,$${i * 7 + 7})`
  );
  const valores = lote.flatMap(servico => [
    servico.code,
    servico.description,
    servico.unit,
    catalogoId,
    reference,
    status,
    userId,
  ]);
  const sql = `INSERT INTO service_compositions (code, description, unit, "sourceCatalogId", "referencePeriod", status, "createdBy")
   VALUES ${tuplas.join(",")}
   ON CONFLICT (code) DO UPDATE SET
     description = EXCLUDED.description,
     unit = EXCLUDED.unit,
     "sourceCatalogId" = EXCLUDED."sourceCatalogId",
     "referencePeriod" = EXCLUDED."referencePeriod",
     status = EXCLUDED.status,
     "updatedAt" = now()`;
  return { sql, valores };
}

interface LinhaComponente {
  compositionId: number;
  priceItemId: number;
  componentType: TipoComponente;
  coefficient: number;
  unitPriceSnapshot: number;
}

function sqlComponentes(lote: LinhaComponente[]): { sql: string; valores: unknown[] } {
  const tuplas = lote.map(
    (_, i) =>
      `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3}::composition_components_componentType,` +
      `$${i * 5 + 4}::numeric,$${i * 5 + 5}::numeric)`
  );
  const valores = lote.flatMap(linha => [
    linha.compositionId,
    linha.priceItemId,
    linha.componentType,
    linha.coefficient.toFixed(6),
    linha.unitPriceSnapshot.toFixed(2),
  ]);
  const sql = `INSERT INTO composition_components ("compositionId", "priceItemId", "componentType", coefficient, "unitPriceSnapshot")
   VALUES ${tuplas.join(",")}
   ON CONFLICT ("compositionId", "priceItemId") DO UPDATE SET
     "componentType" = EXCLUDED."componentType",
     coefficient = EXCLUDED.coefficient,
     "unitPriceSnapshot" = EXCLUDED."unitPriceSnapshot"`;
  return { sql, valores };
}

/** DSN de produção conhecido: Supabase do projeto e hosts Render. */
const DSNS_DE_PRODUCAO = [/tromrvfijbtihuilvnuk/i, /\.render\.com/i, /onrender\.com/i];

function hostRedigido(dsn: string): string {
  try {
    const url = new URL(dsn);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "<dsn inválido>";
  }
}

const AZUL = (texto: string): string => texto;

// ─────────────────────────────────────────────────────────────────────────────
// Programa
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values: cli } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: false,
    strict: true,
    options: {
      insumos: { type: "string" },
      planos: { type: "string" },
      composicoes: { type: "string" },
      reference: { type: "string" },
      name: { type: "string" },
      state: { type: "string" },
      "composition-status": { type: "string" },
      "also-import-services-as-items": { type: "boolean", default: false },
      execute: { type: "boolean", default: false },
      "database-url": { type: "string" },
      "database-url-env": { type: "string" },
      "user-id": { type: "string" },
      "allow-production": { type: "boolean", default: false },
      "batch-size": { type: "string" },
      "no-ssl": { type: "boolean", default: false },
      limit: { type: "string" },
      "allow-version-mismatch": { type: "boolean", default: false },
      "print-sql": { type: "boolean", default: false },
      json: { type: "string" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (cli.help) {
    console.log(USO.trim());
    return;
  }

  const verbose = Boolean(cli.verbose);
  const batchSize = Math.max(1, Number(cli["batch-size"] ?? 500));
  const limite = cli.limit ? Math.max(1, Number(cli.limit)) : Infinity;
  const modoExecucao = Boolean(cli.execute);

  let dsn: string | null = cli["database-url"] ?? null;
  if (!dsn && cli["database-url-env"]) {
    const nomeVariavel = cli["database-url-env"];
    const valor = process.env[nomeVariavel];
    if (!valor) {
      console.error(`--database-url-env ${nomeVariavel}: variável vazia/inexistente.`);
      process.exitCode = 2;
      return;
    }
    dsn = valor;
  }

  if (!cli.insumos && !cli.planos) {
    console.error("Informe ao menos --insumos ou --planos. Use --help para a ajuda.");
    process.exitCode = 2;
    return;
  }

  if (modoExecucao) {
    if (!dsn) {
      console.error(
        "--execute exige --database-url explícito. Este script nunca pega o DSN do ambiente sozinho."
      );
      process.exitCode = 3;
      return;
    }
    if (!cli["user-id"]) {
      console.error("--execute exige --user-id (createdBy).");
      process.exitCode = 3;
      return;
    }
    if (DSNS_DE_PRODUCAO.some(p => p.test(dsn as string)) && !cli["allow-production"]) {
      console.error(
        `DSN de produção detectado (${hostRedigido(dsn)}). Recusado por segurança: ` +
          "use um banco de teste, ou passe --allow-production conscientemente."
      );
      process.exitCode = 4;
      return;
    }
  }

  const modo = modoExecucao ? "EXECUTE" : "DRY-RUN";
  console.log(`SEINFRA-CE · importador em lote · modo ${modo}`);
  if (modoExecucao && dsn) console.log(`destino: ${hostRedigido(dsn)}`);

  // ── avisos ────────────────────────────────────────────────────────────────
  const avisos: Avisos = {
    descricoesTruncadas: 0,
    unidadesTruncadas: 0,
    servicosSemTrilha: 0,
    componentesServicoNaoRepresentaveis: 0,
    blocosSomenteComposicoes: 0,
    blocosSomenteComposicoesExemplos: [],
    componentesOrfaos: 0,
    componentesOrfaosExemplos: [],
    versaoComposicoesDivergente: null,
    blocosSemComponentes: 0,
    composicoesSemItemNoCatalogo: 0,
    composicoesSemItemNoCatalogoExemplos: [],
    componentesSemComposicao: 0,
    itensDuplicadosNoArquivo: 0,
    servicosDuplicadosNoArquivo: 0,
  };

  const lerArquivo = (caminho: string): { bytes: Uint8Array; nome: string } => ({
    bytes: new Uint8Array(readFileSync(caminho)),
    nome: caminho.split(/[\\/]/).pop() ?? caminho,
  });

  const truncarDescricao = (valor: string): string => {
    if (valor.length <= 240) return valor;
    avisos.descricoesTruncadas += 1;
    return valor.slice(0, 240);
  };
  const truncarUnidade = (valor: string): string => {
    if (valor.length <= 32) return valor;
    avisos.unidadesTruncadas += 1;
    return valor.slice(0, 32);
  };

  const itens: ItemCatalogo[] = [];
  const servicos: ItemCatalogo[] = [];
  const entradas: Record<string, unknown> = {};
  let referenceInferida: string | null = null;
  const corte = (lista: unknown[]): number =>
    limite === Infinity ? lista.length : Math.min(lista.length, limite);

  // ── arquivo de Insumos → priceItems ───────────────────────────────────────
  if (cli.insumos) {
    const { bytes, nome } = lerArquivo(cli.insumos);
    const tipo = reconhecerPlanilhaSeinfra(await lerPrimeiraAba(bytes));
    const resultado = await seinfraAdapter.parse(nome, bytes);
    referenceInferida = referenceInferida ?? resultado.referenceHint;
    const usados = resultado.records.slice(0, corte(resultado.records));
    for (const registro of usados) {
      itens.push({
        code: registro.code.toUpperCase(),
        description: truncarDescricao(registro.description),
        unit: truncarUnidade(registro.unit || "UN"),
        itemType: registro.itemType,
        unitPrice: registro.unitPrice,
        notes: registro.notes,
        temTrilha: Boolean(registro.notes && registro.notes.includes(" | ")),
      });
    }
    entradas.insumos = {
      arquivo: nome,
      tipoReconhecido: tipo,
      registrosLidos: resultado.records.length,
      registrosUsados: usados.length,
      ignoradosPeloParser: resultado.skipped,
      referenceHint: resultado.referenceHint,
    };
    console.log(
      `insumos: ${usados.length}/${resultado.records.length} registros usados ` +
        `(ignorados pelo parser: ${resultado.skipped}) · ${nome}`
    );
  }

  // ── Planos de Serviços → serviceCompositions ──────────────────────────────
  if (cli.planos) {
    const { bytes, nome } = lerArquivo(cli.planos);
    const tipo = reconhecerPlanilhaSeinfra(await lerPrimeiraAba(bytes));
    const resultado = await seinfraAdapter.parse(nome, bytes);
    referenceInferida = referenceInferida ?? resultado.referenceHint;
    const usados = resultado.records.slice(0, corte(resultado.records));
    for (const registro of usados) {
      const temTrilha = Boolean(registro.notes && registro.notes.includes(" | "));
      if (!temTrilha) avisos.servicosSemTrilha += 1;
      servicos.push({
        code: registro.code.toUpperCase(),
        description: truncarDescricao(registro.description),
        unit: truncarUnidade(registro.unit || "UN"),
        itemType: "servico",
        unitPrice: registro.unitPrice,
        notes: registro.notes,
        temTrilha,
      });
    }
    entradas.planos = {
      arquivo: nome,
      tipoReconhecido: tipo,
      registrosLidos: resultado.records.length,
      registrosUsados: usados.length,
      ignoradosPeloParser: resultado.skipped,
      referenceHint: resultado.referenceHint,
    };
    console.log(
      `serviços: ${usados.length}/${resultado.records.length} registros usados ` +
        `(ignorados pelo parser: ${resultado.skipped}) · ${nome}`
    );
  }

  // ── Composições → compositionComponents ───────────────────────────────────
  let resultadoComposicoes: ResultadoComposicoes | null = null;
  if (cli.composicoes) {
    const { bytes, nome } = lerArquivo(cli.composicoes);
    const rows = await lerPrimeiraAba(bytes);
    const bruto = parseComposicoesSeinfraRows(rows);
    resultadoComposicoes = { ...bruto, composicoes: bruto.composicoes.slice(0, corte(bruto.composicoes)) };
    const hint = nome.match(/(\d{2,3}\.\d{1,2}[A-Za-z]?)/)?.[1] ?? null;
    entradas.composicoes = {
      arquivo: nome,
      tipoReconhecido: reconhecerPlanilhaSeinfra(rows),
      blocosLidos: bruto.composicoes.length,
      blocosUsados: resultadoComposicoes.composicoes.length,
      linhasDeComponente: bruto.linhasComponentes,
      componentesDeServico: bruto.componentesServico,
      componentesSemPreco: bruto.componentesSemPreco,
      referenceHint: hint,
    };
    console.log(
      `composições: ${resultadoComposicoes.composicoes.length} blocos usados de ${bruto.composicoes.length} · ` +
        `${bruto.linhasComponentes} linhas de componente · ${nome}`
    );
  }

  const reference = cli.reference ?? referenceInferida;
  if (!reference) {
    console.error(
      "Não foi possível inferir --reference do nome dos arquivos. Informe --reference (ex.: 028.1)."
    );
    process.exitCode = 2;
    return;
  }
  const nomeCatalogo = cli.name ?? `SEINFRA-CE ${reference}`;
  const compositionStatus = (cli["composition-status"] ?? "validada").toLowerCase();
  if (!["rascunho", "validada", "arquivada"].includes(compositionStatus)) {
    console.error(`--composition-status inválido: ${compositionStatus}`);
    process.exitCode = 2;
    return;
  }

  const referenceComposicoes = (entradas.composicoes as { referenceHint?: string } | undefined)
    ?.referenceHint;
  if (referenceComposicoes && referenceComposicoes !== reference) {
    avisos.versaoComposicoesDivergente = `composições ${referenceComposicoes} ≠ catálogo ${reference}`;
    if (!cli["allow-version-mismatch"]) {
      console.error(
        `RECUSADO: ${avisos.versaoComposicoesDivergente}. Os coeficientes e os preços congelados ` +
          "(unitPriceSnapshot) seriam de outra versão. Use --allow-version-mismatch para prosseguir."
      );
      process.exitCode = 5;
      return;
    }
  }

  // ── consolidação ──────────────────────────────────────────────────────────
  const dedupeInsumos = dedupePorCodigo(itens);
  const dedupeServicos = dedupePorCodigo(servicos);
  avisos.itensDuplicadosNoArquivo = dedupeInsumos.duplicados;
  avisos.servicosDuplicadosNoArquivo = dedupeServicos.duplicados;

  const itensParaGravar: ItemCatalogo[] = [...dedupeInsumos.unicos];
  if (cli["also-import-services-as-items"]) {
    for (const servico of dedupeServicos.unicos) {
      if (!itensParaGravar.some(item => item.code === servico.code)) itensParaGravar.push(servico);
    }
  }
  const codigosDeItem = new Set(itensParaGravar.map(item => item.code));

  const componentesValidos: Array<{ composicao: string; componente: ComponenteComposicao }> = [];
  let componentesTotal = 0;
  for (const composicao of resultadoComposicoes?.composicoes ?? []) {
    if (composicao.componentes.length === 0) {
      if (composicao.componentesDescartados > 0) {
        // Bloco cujos componentes são todos C… (composição de composição).
        avisos.blocosSomenteComposicoes += 1;
        if (avisos.blocosSomenteComposicoesExemplos.length < 10) {
          avisos.blocosSomenteComposicoesExemplos.push(composicao.code);
        }
      } else {
        avisos.blocosSemComponentes += 1;
      }
    }
    const vistos = new Set<string>();
    for (const componente of composicao.componentes) {
      componentesTotal += 1;
      if (!codigosDeItem.has(componente.code)) {
        avisos.componentesOrfaos += 1;
        if (avisos.componentesOrfaosExemplos.length < 10) {
          avisos.componentesOrfaosExemplos.push(`${composicao.code}→${componente.code}`);
        }
        continue;
      }
      if (vistos.has(componente.code)) continue;
      vistos.add(componente.code);
      componentesValidos.push({ composicao: composicao.code, componente });
    }
  }
  avisos.componentesServicoNaoRepresentaveis = resultadoComposicoes?.componentesServico ?? 0;

  const servicosNoCatalogo = new Set(dedupeServicos.unicos.map(servico => servico.code));
  const composicoesSemServico = (resultadoComposicoes?.composicoes ?? []).filter(
    composicao => !servicosNoCatalogo.has(composicao.code)
  );
  avisos.composicoesSemItemNoCatalogo = composicoesSemServico.length;
  avisos.composicoesSemItemNoCatalogoExemplos = composicoesSemServico.map(c => c.code);
  // Componentes que existem no arquivo mas não têm serviço para onde ser amarrados:
  // contam como válidos mas NÃO chegam a ser gravados.
  const nomesSemServico = new Set(composicoesSemServico.map(c => c.code));
  const componentesSemComposicao = componentesValidos.filter(({ composicao }) =>
    nomesSemServico.has(composicao)
  ).length;
  avisos.componentesSemComposicao = componentesSemComposicao;

  const contagem = {
    catalogo: 1,
    priceItems: itensParaGravar.length,
    priceItemsInsumos: dedupeInsumos.unicos.length,
    priceItemsServicos: itensParaGravar.length - dedupeInsumos.unicos.length,
    serviceCompositions: dedupeServicos.unicos.length,
    compositionComponents: componentesValidos.length,
    compositionComponentsPrevistos: componentesValidos.length - avisos.componentesSemComposicao,
    componentesDescartados: componentesTotal - componentesValidos.length,
  };

  console.log("");
  console.log(`reference: ${reference} · catálogo: "${nomeCatalogo}" · UF: ${cli.state ?? "CE"}`);
  console.log(
    `priceItems: ${contagem.priceItems} (insumos ${contagem.priceItemsInsumos}` +
      `${contagem.priceItemsServicos ? ` + serviços ${contagem.priceItemsServicos}` : ""})`
  );
  console.log(`serviceCompositions: ${contagem.serviceCompositions} (status ${compositionStatus})`);
  console.log(`compositionComponents: ${contagem.compositionComponents}`);
  if (avisos.componentesSemComposicao)
    console.log(
      `  → previstos para gravação: ${contagem.compositionComponentsPrevistos} ` +
        `(${avisos.componentesSemComposicao} ficam de fora por falta de serviço correspondente)`
    );

  console.log("");
  console.log("avisos:");
  if (avisos.versaoComposicoesDivergente)
    console.log(`  ! ${avisos.versaoComposicoesDivergente} (aceito com --allow-version-mismatch)`);
  if (contagem.componentesDescartados)
    console.log(
      `  ! ${contagem.componentesDescartados} componente(s) descartado(s): ` +
        `${avisos.componentesServicoNaoRepresentaveis} de serviço (enum sem "servico"), ` +
        `${avisos.componentesOrfaos} sem insumo no catálogo`
    );
  if (avisos.componentesOrfaosExemplos.length)
    console.log(`    exemplos: ${avisos.componentesOrfaosExemplos.join(", ")}`);
  if (avisos.blocosSemComponentes)
    console.log(`  ! ${avisos.blocosSemComponentes} bloco(s) sem NENHUM componente (verificar parser)`);
  if (avisos.blocosSomenteComposicoes)
    console.log(
      `  ~ ${avisos.blocosSomenteComposicoes} composição(ões) formada(s) só por outras composições ` +
        "(C…) — sem representação no enum atual; entram com 0 componentes" +
        (avisos.blocosSomenteComposicoesExemplos.length
          ? `: ${avisos.blocosSomenteComposicoesExemplos.join(", ")}`
          : "")
    );
  if (avisos.composicoesSemItemNoCatalogo)
    console.log(
      `  ! ${avisos.composicoesSemItemNoCatalogo} composição(ões) sem serviço correspondente em ` +
        "service_compositions (seriam ignoradas na gravação)" +
        (avisos.composicoesSemItemNoCatalogoExemplos.length
          ? `: ${avisos.composicoesSemItemNoCatalogoExemplos.join(", ")}`
          : "")
    );
  if (avisos.servicosSemTrilha) console.log(`  ! ${avisos.servicosSemTrilha} serviço(s) sem trilha`);
  if (avisos.descricoesTruncadas)
    console.log(`  ! ${avisos.descricoesTruncadas} descrição(ões) truncada(s) em 240`);
  if (avisos.unidadesTruncadas)
    console.log(`  ! ${avisos.unidadesTruncadas} unidade(s) truncada(s) em 32`);
  if (avisos.itensDuplicadosNoArquivo)
    console.log(`  ! ${avisos.itensDuplicadosNoArquivo} insumo(s) duplicado(s) no arquivo (fica o último)`);
  if (avisos.servicosDuplicadosNoArquivo)
    console.log(`  ! ${avisos.servicosDuplicadosNoArquivo} serviço(s) duplicado(s) no arquivo (fica o último)`);
  if (!cli["also-import-services-as-items"] && dedupeServicos.unicos.length) {
    console.log(
      `  ! a trilha de ${dedupeServicos.unicos.filter(s => s.temTrilha).length} serviço(s) NÃO é ` +
        "persistida: service_compositions não tem coluna de notas " +
        "(use --also-import-services-as-items)"
    );
  }

  // ── pré-visualização do SQL (sem conexão) ─────────────────────────────────
  if (cli["print-sql"]) {
    console.log("");
    console.log(AZUL("PRÉ-VISUALIZAÇÃO DO SQL — amostra de 2 linhas por tabela; NADA é executado."));
    const bloco = (titulo: string, sql: string, valores: unknown[]): void => {
      console.log(`\n-- ${titulo} (${valores.length} parâmetros)`);
      console.log(sql);
      console.log(`-- params: ${JSON.stringify(valores)}`);
    };
    bloco("1. price_catalogs", SQL_CATALOGO, [
      nomeCatalogo,
      cli.state ?? "CE",
      reference,
      Number(cli["user-id"] ?? 0),
    ]);
    const amostraItens = sqlItens(0, itensParaGravar.slice(0, 2));
    bloco("2. price_items", amostraItens.sql, amostraItens.valores);
    const amostraServicos = sqlServicos(
      0,
      reference,
      compositionStatus,
      Number(cli["user-id"] ?? 0),
      dedupeServicos.unicos.slice(0, 2)
    );
    bloco("3. service_compositions", amostraServicos.sql, amostraServicos.valores);
    const amostraComponentes = sqlComponentes(
      componentesValidos.slice(0, 2).map(({ componente }) => ({
        compositionId: 0,
        priceItemId: 0,
        componentType: componente.componentType,
        coefficient: componente.coefficient,
        unitPriceSnapshot: componente.unitPriceSnapshot,
      }))
    );
    bloco("4. composition_components", amostraComponentes.sql, amostraComponentes.valores);
    console.log("");
  }

  // ── gravação ──────────────────────────────────────────────────────────────
  let gravacao: Record<string, unknown> | null = null;

  if (!modoExecucao) {
    console.log("");
    console.log(AZUL("DRY-RUN: nenhuma escrita foi feita e nenhuma conexão foi aberta."));
  } else {
    console.log("");
    console.log("EXECUTE: gravando...");
    const inicio = Date.now();

    // Usar Supabase JS client (API REST) em vez do driver pg local
    // O pooler do Supabase rejeita autenticação via driver pg local
    const supabaseUrl = cli["supabase-url"];
    const supabaseKey = cli["supabase-key"];
    if (!supabaseUrl || !supabaseKey) {
      console.error("Modo Supabase API: --supabase-url e --supabase-key são obrigatórios");
      process.exit(1);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Helper para executar queries via Supabase
    async function execQuery(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> {
      // Converter placeholders $1, $2, ... para formato Supabase
      let convertedSql = sql;
      if (params && params.length > 0) {
        // Substituir $N por valores literais
        for (let i = params.length - 1; i >= 0; i--) {
          const val = params[i];
          const literal = val === null ? "NULL" : typeof val === "number" ? String(val) : `'${String(val).replace(/'/g, "''")}'`;
          convertedSql = convertedSql.replace(`$${i + 1}`, literal);
        }
      }
      const { data, error } = await supabase.rpc("exec_sql", { query: convertedSql });
      if (error) throw new Error(error.message);
      return (data as Array<Record<string, unknown>>) ?? [];
    }

    type PoolLike = {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
      connect: () => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
        release: () => void;
      }>;
      end: () => Promise<void>;
    };
    const pgmod = (await import("pg")) as unknown as Record<string, unknown>;
    const PoolCtor = (pgmod.Pool ??
      (pgmod.default as Record<string, unknown> | undefined)?.Pool) as
      | (new (config: Record<string, unknown>) => PoolLike)
      | undefined;
    if (!PoolCtor) throw new Error("Não foi possível carregar o driver pg (npm i pg).");

    const host = new URL(dsn as string).hostname;
    // Pooler do Supabase exige username no formato postgres.<project-ref>
    let normalizedDsn = dsn as string;
    if (host.endsWith(".pooler.supabase.com")) {
      const u = new URL(dsn as string);
      if (u.username === "postgres") {
        u.username = `postgres.tromrvfijbtihuilvnuk`;
        normalizedDsn = u.toString();
      }
    }
    const pool = new PoolCtor({
      connectionString: normalizedDsn,
      max: 4,
      ssl:
        cli["no-ssl"] || /localhost|127\.0\.0\.1/.test(host)
          ? undefined
          : { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) catálogo
      const catalogo = await client.query(SQL_CATALOGO, [
        nomeCatalogo,
        cli.state ?? "CE",
        reference,
        Number(cli["user-id"]),
      ]);
      const catalogoId = Number(catalogo.rows[0]!.id);
      console.log(`  price_catalogs: id ${catalogoId}`);

      // 2) price_items
      let gravadosItens = 0;
      for (const lote of emLotes(itensParaGravar, batchSize)) {
        const { sql, valores } = sqlItens(catalogoId, lote);
        await client.query(sql, valores);
        gravadosItens += lote.length;
        if (verbose) console.log(`  price_items: ${gravadosItens}/${itensParaGravar.length}`);
      }

      // 3) service_compositions
      let gravadosServicos = 0;
      for (const lote of emLotes(dedupeServicos.unicos, batchSize)) {
        const { sql, valores } = sqlServicos(catalogoId, reference, compositionStatus, Number(cli["user-id"]), lote);
        await client.query(sql, valores);
        gravadosServicos += lote.length;
        if (verbose) console.log(`  service_compositions: ${gravadosServicos}/${dedupeServicos.unicos.length}`);
      }

      // 4) ids para amarrar os componentes
      const mapaItens = new Map<string, number>();
      for (const lote of emLotes(itensParaGravar.map(item => item.code), 5000)) {
        const resposta = await client.query(
          `SELECT id, code FROM price_items WHERE "catalogId" = $1 AND code = ANY($2::text[])`,
          [catalogoId, lote]
        );
        for (const linha of resposta.rows) mapaItens.set(String(linha.code), Number(linha.id));
      }
      const mapaComposicoes = new Map<string, number>();
      for (const lote of emLotes(dedupeServicos.unicos.map(servico => servico.code), 5000)) {
        const resposta = await client.query(
          `SELECT id, code FROM service_compositions WHERE code = ANY($1::text[])`,
          [lote]
        );
        for (const linha of resposta.rows) mapaComposicoes.set(String(linha.code), Number(linha.id));
      }

      // 5) composition_components
      const componentesParaGravar = componentesValidos
        .map(({ composicao, componente }) => ({
          compositionId: mapaComposicoes.get(composicao),
          priceItemId: mapaItens.get(componente.code),
          componentType: componente.componentType,
          coefficient: componente.coefficient,
          unitPriceSnapshot: componente.unitPriceSnapshot,
        }))
        .filter(
          (linha): linha is typeof linha & { compositionId: number; priceItemId: number } =>
            typeof linha.compositionId === "number" && typeof linha.priceItemId === "number"
        );

      const componentesSemDestino = componentesValidos.length - componentesParaGravar.length;
      let gravadosComponentes = 0;
      for (const lote of emLotes(componentesParaGravar, batchSize)) {
        const { sql, valores } = sqlComponentes(lote);
        await client.query(sql, valores);
        gravadosComponentes += lote.length;
        if (verbose)
          console.log(`  composition_components: ${gravadosComponentes}/${componentesParaGravar.length}`);
      }

      await client.query("COMMIT");
      gravacao = {
        catalogoId,
        priceItemsGravados: gravadosItens,
        serviceCompositionsGravadas: gravadosServicos,
        compositionComponentsGravados: gravadosComponentes,
        componentesSemDestino,
        duracaoMs: Date.now() - inicio,
      };
      console.log(`  COMMIT ok em ${Date.now() - inicio} ms`);
    } catch (erro) {
      await client.query("ROLLBACK");
      throw erro;
    } finally {
      client.release();
      await pool.end();
    }
  }

  // ── relatório ─────────────────────────────────────────────────────────────
  const relatorio = {
    modo,
    referencia: reference,
    catalogo: nomeCatalogo,
    uf: cli.state ?? "CE",
    compositionStatus,
    contagem,
    avisos,
    entradas,
    gravacao,
    geradoEm: new Date().toISOString(),
  };

  if (cli.json) {
    mkdirSync(dirname(cli.json), { recursive: true });
    writeFileSync(cli.json, `${JSON.stringify(relatorio, null, 2)}\n`, "utf8");
    console.log(`relatório: ${cli.json}`);
  }

  console.log("");
  console.log(JSON.stringify(relatorio, null, 2));
}

// Só executa quando chamado como script; importável para testes/diagnóstico.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(erro => {
    console.error("FALHA:", erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  });
}
