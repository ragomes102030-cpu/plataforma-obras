/* eslint-disable no-console */
/**
 * Mede a COBERTURA POR REGRA de uma OBRA REAL.
 *
 * LEITURA PURA: toda consulta deste script e SELECT. Nao ha INSERT/UPDATE/DELETE
 * em lugar nenhum — nem por engano. Um guard em `q()` recusa qualquer coisa que
 * nao comece com SELECT.
 *
 * Por que este script existe: a cobertura e a resposta para "quantos itens cada
 * regra CONSEGUIU avaliar?". O validador e uma funcao PURA dos dados da obra, entao
 * o numero que este script imprime e exatamente o que o painel vai mostrar depois
 * que a branch for integrada — sem precisar de deploy.
 *
 * FIDELIDADE: este script replica o mapeamento do chamador real
 * (server/routers.ts:4054-4198, validateEngineeringCoherence) linha a linha. Ele NAO
 * importa aquele codigo (o chamador vive dentro do router e depende de sessao/DB
 * drizzle), entao a replicacao pode divergir se o chamador mudar. Para tornar a
 * divergencia DETECTAVEL, o script cruza os metadados da base com as medicoes
 * independentes D1-D4 do lead e grita DIVERGE quando o numero nao bate.
 *
 * Uso (Windows PowerShell):
 *   $env:SUPABASE_DB_URL = "<string de conexao>"
 *   npx tsx scripts/medir-cobertura-obra.mts
 *
 * Uso (bash):
 *   SUPABASE_DB_URL="<string de conexao>" npx tsx scripts/medir-cobertura-obra.mts
 *
 * Opcoes:
 *   --obra OB-PUPOCN          codigo da obra (default: OB-PUPOCN)
 *   --project-id 12           seleciona por id em vez de codigo
 *   --database-url-env VAR    nome da variavel de ambiente com a string (default SUPABASE_DB_URL)
 *   --json                    saida JSON (para anexar em relatorio)
 *
 * NUNCA passe a string de conexao na linha de comando: ela aparece no historico e
 * na lista de processos. Use a variavel de ambiente.
 */
import { validarCoerenciaEngenharia } from "../server/construction/coerencia-engenharia";

type Entrada = Parameters<typeof validarCoerenciaEngenharia>[0];

// Metadados medidos pelo lead (D1-D4). Servem de CRUZAMENTO, nao de verdade:
// se a base mudou desde entao, o DIVERGE e a informacao — nao o erro.
const CRUZAMENTO_D1_D4 = { itens: 53, comComposicao: 18, semComposicao: 35 };

type Args = { obra: string; projectId: number | null; envVar: string; json: boolean; autoteste: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { obra: "OB-PUPOCN", projectId: null, envVar: "SUPABASE_DB_URL", json: false, autoteste: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--obra") args.obra = String(argv[++i] ?? "");
    else if (a === "--project-id") args.projectId = Number(argv[++i]);
    else if (a === "--database-url-env") args.envVar = String(argv[++i] ?? "");
    else if (a === "--json") args.json = true;
    else if (a === "--autoteste") args.autoteste = true;
    else if (a === "--help" || a === "-h") {
      console.log("Uso: npx tsx scripts/medir-cobertura-obra.mts [--obra CODE] [--project-id N] [--database-url-env VAR] [--json] [--autoteste]");
      console.log("  --autoteste   roda o pipeline inteiro com dados sinteticos, SEM banco (prova o script)");
      console.log("A string de conexao vem SEMPRE de variavel de ambiente. Nunca da linha de comando.");
      process.exit(0);
    } else {
      throw new Error(`Argumento desconhecido: ${a} (use --help)`);
    }
  }
  if (args.projectId != null && !Number.isFinite(args.projectId)) throw new Error("--project-id precisa ser numero");
  return args;
}

type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  end: () => Promise<void>;
};

/** Conexao real. Import dinamico para o script nao exigir "pg" no caminho de autoteste. */
async function conectar(dsn: string): Promise<PoolLike> {
  const pgMod: any = await import("pg");
  const pg = pgMod.default ?? pgMod;
  return new pg.Pool({ connectionString: dsn }) as PoolLike;
}

/**
 * Autoteste: pool FALSO — sem rede, sem banco, sem credencial.
 *
 * Exercita o pipeline inteiro (SQL -> mapeamento -> validador -> frase do painel)
 * com dados sinteticos no formato MEDIDO da AURORA: 53 itens, 18 com composicao.
 * Existe para que o script nao seja apontado para um banco de verdade sem antes
 * provar que funciona. Nao substitui a medicao real — so prova o instrumento.
 */
function poolDeAutoteste(): PoolLike {
  const itens = Array.from({ length: 53 }, (_, i) => ({
    code: `1.4.${i + 1}`, description: i < 18 ? `Pilares ${i}` : `Servico ${i}`,
    unit: "m3", quantity: "1", unitPrice: "100",
    compositionId: i < 18 ? 900 + i : null,
  }));
  const comps = Array.from({ length: 18 }, (_, i) => ({ id: 900 + i, code: `C${i}`, description: "CONCRETO FCK=25MPa", unit: "M3", status: "ativo" }));
  const componentes = Array.from({ length: 18 }, (_, i) => ({ compositionId: 900 + i, coefficient: "1", unitPriceSnapshot: "100" }));
  const atividades = [
    { id: 11, wbsCode: "1.3.2", name: "Fundacao", durationDays: 20, unit: "m3", plannedQuantity: "10", earlyStart: 1, earlyFinish: 20, critical: 1 },
    { id: 12, wbsCode: "1.4.1", name: "Pilares", durationDays: 30, unit: "m3", plannedQuantity: "20", earlyStart: 25, earlyFinish: 55, critical: 1 },
  ];
  return {
    async query(sql: string) {
      const s = sql.replace(/\s+/g, " ");
      if (/from projects/i.test(s)) return { rows: [{ id: 7, code: "OB-AUTOTESTE", name: "AURORA TESTE (AUTOTESTE)", descricao: "Edificio em concreto armado", tipoDeObra: "edificio" }] };
      if (/from budget_versions/i.test(s)) return { rows: [{ id: 1, versionNumber: 3, status: "published" }] };
      if (/from budget_items/i.test(s)) return { rows: itens };
      if (/from composition_components/i.test(s)) return { rows: componentes };
      if (/from service_compositions/i.test(s)) return { rows: comps };
      if (/from project_plan_versions/i.test(s)) return { rows: [{ id: 5 }] };
      if (/from schedule_activities/i.test(s)) return { rows: atividades };
      if (/from schedule_dependencies/i.test(s)) return { rows: [{ successorId: 12 }] };
      throw new Error(`Autoteste: consulta nao prevista -> ${s.slice(0, 60)}`);
    },
    async end() {},
  };
}

/** "4. preco sem lastro" -> "a regra de preco sem lastro" (mesma frase do painel). */
function nomeDaRegra(regra: string): string {
  return `a regra de ${regra.replace(/^\s*\d+\.\s*/, "").trim()}`;
}

/** A frase que o painel mostra, para o numero medido e o numero visto baterem. */
function fraseDoPainel(c: { regra: string; universo: string; total: number; avaliados: number; fora: number; motivo: string | null; motivos: { motivo: string; itens: number }[] }): string {
  const alvo = c.total === 0
    ? `nao havia ${c.universo} para conferir`
    : `conferiu ${c.avaliados} de ${c.total} ${c.universo}`;
  if (c.fora === 0) return `${nomeDaRegra(c.regra)} ${alvo}`;
  const motivos = c.motivos.length > 1
    ? c.motivos.map(m => `${m.itens} ${m.motivo}`).join("; ")
    : c.motivo;
  return `${nomeDaRegra(c.regra)} ${alvo} | ${c.fora} fora por ${motivos}`;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const dsn = process.env[args.envVar] ?? process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!dsn && !args.autoteste) {
    const alternativas = [...new Set([args.envVar, "SUPABASE_DB_URL", "DATABASE_URL"])].join(" / ");
    console.error(`Sem string de conexao. Defina uma destas variaveis de ambiente: ${alternativas}.`);
    console.error(`Exemplo (PowerShell): $env:${args.envVar} = "<string de conexao>"`);
    console.error("Este script NAO aceita a string na linha de comando, de proposito.");
    console.error("Para verificar o script sem banco: npx tsx scripts/medir-cobertura-obra.mts --autoteste");
    process.exit(2);
  }

  const pool: PoolLike = args.autoteste ? poolDeAutoteste() : await conectar(dsn!);

  // Guard de leitura: nada que nao seja SELECT sai daqui.
  async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const texto = sql.trim();
    if (!/^select\b/i.test(texto)) {
      throw new Error(`LEITURA PURA: consulta nao-SELECT bloqueada -> ${texto.slice(0, 60)}`);
    }
    const r = await pool.query(texto, params as any[]);
    return r.rows as T[];
  }

  try {
    // ---- obra ---------------------------------------------------------------
    const [projeto] = args.projectId != null
      ? await q<{ id: number; code: string | null; name: string; descricao: string | null; tipoDeObra: string | null }>(
          `select id, code, name, "descricao", "tipoDeObra" from projects
            where "deletedAt" is null and id = $1 limit 1`, [args.projectId])
      : await q<{ id: number; code: string | null; name: string; descricao: string | null; tipoDeObra: string | null }>(
          `select id, code, name, "descricao", "tipoDeObra" from projects
            where "deletedAt" is null and upper(code) = upper($1) limit 1`, [args.obra]);
    if (!projeto) {
      console.error(`Obra nao encontrada: ${args.projectId != null ? `projectId=${args.projectId}` : `code=${args.obra}`}`);
      process.exit(3);
    }
    const projectId = projeto.id;

    // ---- orcamento: versao mais recente (routers.ts:4064-4073) --------------
    const [orcamento] = await q<{ id: number; versionNumber: number; status: string }>(
      `select id, "versionNumber", status from budget_versions
        where "projectId" = $1 order by "versionNumber" desc limit 1`, [projectId]);

    const itens = orcamento
      ? await q<{ code: string; description: string; unit: string | null; quantity: string; unitPrice: string; compositionId: number | null }>(
          `select code, description, unit, quantity, "unitPrice", "compositionId" from budget_items
            where "budgetVersionId" = $1`, [orcamento.id])
      : [];

    // ---- composicoes citadas + componentes (routers.ts:4076-4095) -----------
    const idsComposicao = [...new Set(itens.map(i => i.compositionId).filter((x): x is number => typeof x === "number"))];

    const comps = idsComposicao.length
      ? await q<{ id: number; code: string; description: string | null; unit: string | null; status: string | null }>(
          `select id, code, description, unit, status from service_compositions where id = any($1::int[])`, [idsComposicao])
      : [];

    const componentes = idsComposicao.length
      ? await q<{ compositionId: number; coefficient: string; unitPriceSnapshot: string }>(
          `select "compositionId", coefficient, "unitPriceSnapshot" from composition_components
            where "compositionId" = any($1::int[])`, [idsComposicao])
      : [];

    const somaPorComp = new Map<number, number>();
    const comPrecoPorComp = new Map<number, number>();
    const totalPorComp = new Map<number, number>();
    for (const c of componentes) {
      const id = c.compositionId;
      somaPorComp.set(id, (somaPorComp.get(id) ?? 0) + Number(c.coefficient) * Number(c.unitPriceSnapshot));
      totalPorComp.set(id, (totalPorComp.get(id) ?? 0) + 1);
      if (Number(c.unitPriceSnapshot) > 0) comPrecoPorComp.set(id, (comPrecoPorComp.get(id) ?? 0) + 1);
    }
    const compPorId = new Map(comps.map(c => [c.id, c]));

    // ---- versao corrente do plano (getCurrentPlanVersionId) -----------------
    const [plano] = await q<{ id: number }>(
      `select id from project_plan_versions where "projectId" = $1 order by "versionNumber" desc limit 1`, [projectId]);
    const versionId: number | null = plano?.id ?? null;

    // ---- atividades e dependencias da versao corrente (routers.ts:4097-4113) -
    const filtroVersao = versionId == null
      ? `"versionId" is null`
      : `"versionId" = ${versionId}`;

    const atividades = await q<{ id: number; wbsCode: string; name: string; durationDays: number; unit: string | null; plannedQuantity: string | null; earlyStart: number | null; earlyFinish: number | null; critical: number }>(
      `select id, "wbsCode", name, "durationDays", unit, "plannedQuantity", "earlyStart", "earlyFinish", critical
         from schedule_activities where "projectId" = $1 and ${filtroVersao}`, [projectId]);

    const deps = await q<{ successorId: number }>(
      `select "successorId" from schedule_dependencies where "projectId" = $1 and ${filtroVersao}`, [projectId]);
    const comPredecessor = new Set(deps.map(d => d.successorId));

    // ---- pavimentos e area: SO o que o dado declara (routers.ts:4115-4158) ---
    const pavimentosDeclarados = [...new Set(atividades.map(a => /^1\.4\.\d+\.(\d+)/.exec(a.wbsCode)?.[1]).filter(Boolean))];
    const pavimentos = pavimentosDeclarados.length > 1 ? pavimentosDeclarados.length : null;

    const itensDePiso = atividades.filter(
      a => a.unit && /m2|m²/.test(String(a.unit)) && Number(a.plannedQuantity) > 0 &&
           /contrapis|revestiment.*pis|revestiment.*piso/i.test(a.name),
    );
    const porNivel = new Map<string, number>();
    const semNivel: number[] = [];
    for (const a of itensDePiso) {
      const nivel = /^1\.[\d.]+?\.(\d+)$/.exec(a.wbsCode)?.[1];
      const qtd = Number(a.plannedQuantity);
      if (nivel) porNivel.set(nivel, Math.max(porNivel.get(nivel) ?? 0, qtd));
      else semNivel.push(qtd);
    }
    const somaPorNivel = [...porNivel.values()].reduce((s, v) => s + v, 0);
    const areaConstruida = somaPorNivel > 0 ? somaPorNivel : (semNivel.length ? Math.max(...semNivel) : null);
    const areaConstruidaFonte = areaConstruida == null
      ? null
      : somaPorNivel > 0
        ? "soma das areas de piso por nivel, declaradas nas atividades da obra"
        : "area de piso declarada nas atividades (a obra nao tem decomposicao por nivel)";

    // ---- entrada do validador: copia fiel de routers.ts:4160-4197 -----------
    const entrada: Entrada = {
      obra: {
        projectId, nome: projeto.name, tipoDeObra: projeto.tipoDeObra,
        descricao: projeto.descricao, pavimentos, areaConstruida, areaConstruidaFonte,
      },
      itens: itens.map(i => ({
        code: i.code, description: i.description, unit: i.unit,
        quantity: Number(i.quantity), unitPrice: Number(i.unitPrice),
        compositionId: i.compositionId,
        compositionCode: i.compositionId ? (compPorId.get(i.compositionId)?.code ?? null) : null,
        compositionDescription: i.compositionId ? (compPorId.get(i.compositionId)?.description ?? null) : null,
        compositionUnit: i.compositionId ? (compPorId.get(i.compositionId)?.unit ?? null) : null,
        somaComponentes: i.compositionId ? (somaPorComp.get(i.compositionId) ?? 0) : null,
        custoDireto: !/^1\.1(\.|$)/.test(i.code) && !/administrac|licenc|projeto|as built|comissionament|mobilizac|desmobilizac|documentac/i.test(i.description),
      })),
      composicoes: comps.map(c => ({
        id: c.id, code: c.code, description: c.description, unit: c.unit, status: c.status,
        somaComponentes: somaPorComp.get(c.id) ?? 0,
        componentesComPreco: comPrecoPorComp.get(c.id) ?? 0,
        totalComponentes: totalPorComp.get(c.id) ?? 0,
      })),
      atividades: atividades.map(a => ({
        id: a.id, wbsCode: a.wbsCode, name: a.name, durationDays: a.durationDays,
        unit: a.unit, plannedQuantity: a.plannedQuantity == null ? null : Number(a.plannedQuantity),
        earlyStart: a.earlyStart, earlyFinish: a.earlyFinish, critical: Number(a.critical) === 1,
        semPredecessor: !comPredecessor.has(a.id),
      })),
    };

    const resultado = validarCoerenciaEngenharia(entrada);

    // ---- cruzamento com as medicoes D1-D4 do lead ---------------------------
    const comComposicao = itens.filter(i => i.compositionId != null).length;
    const semComposicao = itens.length - comComposicao;
    const cruzamento = {
      itens: { medido: itens.length, esperado: CRUZAMENTO_D1_D4.itens, ok: itens.length === CRUZAMENTO_D1_D4.itens },
      comComposicao: { medido: comComposicao, esperado: CRUZAMENTO_D1_D4.comComposicao, ok: comComposicao === CRUZAMENTO_D1_D4.comComposicao },
      semComposicao: { medido: semComposicao, esperado: CRUZAMENTO_D1_D4.semComposicao, ok: semComposicao === CRUZAMENTO_D1_D4.semComposicao },
    };

    const payload = {
      obra: { projectId, code: projeto.code, nome: projeto.name, tipoDeObra: projeto.tipoDeObra },
      orcamento: orcamento ? { id: orcamento.id, versionNumber: orcamento.versionNumber, status: orcamento.status } : null,
      plano: { versionId },
      contagens: {
        itens: itens.length, comComposicao, semComposicao,
        composicoes: comps.length, componentes: componentes.length,
        atividades: atividades.length, dependencias: deps.length,
        pavimentos, areaConstruida, areaConstruidaFonte,
      },
      cruzamentoD1D4: cruzamento,
      cobertura: resultado.resumo.cobertura,
      resumo: {
        total: resultado.resumo.total, erros: resultado.resumo.erros, avisos: resultado.resumo.avisos,
        valorEmRisco: resultado.resumo.valorEmRisco, porDominio: resultado.resumo.porDominio,
      },
      achados: resultado.issues.map(i => ({ code: i.code, severity: i.severity, dominio: i.dominio, refs: i.refs })),
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    // ---- saida legivel ------------------------------------------------------
    const linha = "=".repeat(78);
    console.log(linha);
    if (args.autoteste) {
      console.log("MODO AUTOTESTE — dados sinteticos, SEM banco, SEM rede. Prova o instrumento, nao a obra.");
      console.log(linha);
    }
    console.log(`COBERTURA POR REGRA — ${projeto.name}${projeto.code ? ` (${projeto.code})` : ""}  projectId=${projectId}`);
    console.log(linha);
    console.log(`orcamento ....... ${orcamento ? `v${orcamento.versionNumber} [${orcamento.status}]` : "(nenhum)"}`);
    console.log(`plano ........... ${versionId == null ? "(sem versao: filtra versionId IS NULL)" : `versao ${versionId}`}`);
    console.log(`itens ........... ${itens.length}`);
    console.log(`composicoes ..... ${comps.length}   componentes ${componentes.length}`);
    console.log(`atividades ...... ${atividades.length}   dependencias ${deps.length}`);
    console.log(`pavimentos ...... ${pavimentos ?? "(nao declarado)"}`);
    console.log(`area construida . ${areaConstruida ?? "(nao declarada)"}${areaConstruidaFonte ? `  [${areaConstruidaFonte}]` : ""}`);

    console.log(`\nCRUZAMENTO COM AS MEDICOES D1-D4 DO LEAD (a base pode ter mudado; DIVERGE e informacao)`);
    console.log(`  itens .............. ${itens.length} (esperado ${CRUZAMENTO_D1_D4.itens}) ${cruzamento.itens.ok ? "OK" : "DIVERGE"}`);
    console.log(`  com composicao ..... ${comComposicao} (esperado ${CRUZAMENTO_D1_D4.comComposicao}) ${cruzamento.comComposicao.ok ? "OK" : "DIVERGE"}`);
    console.log(`  sem composicao ..... ${semComposicao} (esperado ${CRUZAMENTO_D1_D4.semComposicao}) ${cruzamento.semComposicao.ok ? "OK" : "DIVERGE"}`);

    console.log(`\nO QUE FOI CONFERIDO (a mesma frase que o painel mostra)`);
    for (const c of resultado.resumo.cobertura) {
      console.log(`  ${fraseDoPainel(c)}`);
    }

    const semMotivo = resultado.resumo.cobertura.filter(c => c.fora > 0 && !c.motivo);
    const contaAberta = resultado.resumo.cobertura.filter(c => c.avaliados + c.fora !== c.total);
    console.log(`\nINVARIANTES`);
    console.log(`  motivo nomeado em toda regra com itens fora .. ${semMotivo.length === 0 ? "OK" : `FALHOU (${semMotivo.map(c => c.regra).join(", ")})`}`);
    console.log(`  avaliados + fora === total em toda regra ..... ${contaAberta.length === 0 ? "OK" : `FALHOU (${contaAberta.map(c => c.regra).join(", ")})`}`);

    console.log(`\nACHADOS`);
    console.log(`  total ${resultado.resumo.total} | erros ${resultado.resumo.erros} | avisos ${resultado.resumo.avisos} | valorEmRisco R$ ${brl(resultado.resumo.valorEmRisco)}`);
    console.log(`  orcamento ${resultado.resumo.porDominio.orcamento} | cronograma ${resultado.resumo.porDominio.cronograma}`);
    for (const i of resultado.issues) {
      console.log(`  [${i.severity}] ${i.code} (${i.dominio}) refs=${i.refs.length}`);
    }
    console.log(linha);

    // ---- veredito do autoteste ---------------------------------------------
    if (args.autoteste) {
      const c4 = resultado.resumo.cobertura.find(c => c.regra.startsWith("4."));
      const veredito = [
        { nome: "cruzamento 53/18/35 bate com as medicoes do lead", ok: cruzamento.itens.ok && cruzamento.comComposicao.ok && cruzamento.semComposicao.ok },
        { nome: "regra de preco DECLARA 18 de 53, 35 fora por 'sem composicao vinculada'", ok: c4?.total === 53 && c4?.avaliados === 18 && c4?.fora === 35 && c4?.motivo === "sem composicao vinculada" },
        { nome: "as 10 regras registram cobertura", ok: resultado.resumo.cobertura.length === 10 },
        { nome: "motivo nomeado em toda regra com itens fora e conta fechada", ok: semMotivo.length === 0 && contaAberta.length === 0 },
      ];
      console.log("VEREDITO DO AUTOTESTE");
      for (const v of veredito) console.log(`  ${v.ok ? "OK      " : "FALHOU  "} ${v.nome}`);
      const falhas = veredito.filter(v => !v.ok).length;
      console.log(`  -> ${veredito.length - falhas}/${veredito.length} ${falhas === 0 ? "(instrumento confiavel)" : "(NAO CONFIE no instrumento)"}`);
      console.log(linha);
      if (falhas > 0) process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
