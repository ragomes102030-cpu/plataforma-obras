import type { ValidationIssue, ValidationSeverity } from "./eap-validator";

/**
 * Validacao de COERENCIA DE ENGENHARIA.
 *
 * O sistema valida forma: schema, tipo, autorizacao, integridade referencial.
 * Nao valida engenharia: se a composicao corresponde ao servico, se a ordem de
 * execucao e construtivamente possivel, se o quantitativo faz sentido para a
 * escala da obra.
 *
 * A diferenca importa. Em 11/10/2026 a AURORA TESTE (OB-PUPOCN) tinha, medida
 * em producao:
 *
 *   - "Drenagem externa" vinculada a "CADASTRO DE REDE ... (MEIO MAGNETICO)"
 *     (plotter, computador, desenhista CAD) a R$ 4.137,19/m: R$ 1.448.016,50,
 *     28% do orcamento da obra. Dado perfeitamente valido; engenharia absurda.
 *   - Estrutura de 6 pavimentos em 4 atividades de 8-9 dias (34 dias no total).
 *   - 21.104 de 23.266 componentes de composicao com preco zero.
 *
 * Nenhum destes e bug: todos passaram pela validacao de forma. O que faltava
 * era esta camada.
 *
 * Principio de desenho: cada regra devolve um achado COM EVIDENCIA (numeros que
 * a sustentam), nunca um "suspeito" generico. Falso positivo aqui custa caro —
 * o engenheiro para de ler os avisos.
 */

export type ObraParaCoerencia = {
  projectId: number;
  nome: string;
  tipoDeObra?: string | null;
  /** Descricao da obra. E dela que sai o sistema construtivo declarado. */
  descricao?: string | null;
  /** Pavimentos acima do terreo, quando aplicavel. */
  pavimentos?: number | null;
  areaTerreno?: number | null;
  /** Area construida total, quando conhecida. Sem ela o teste de custo/m2 nao roda. */
  areaConstruida?: number | null;
};

export type ItemOrcamentoParaCoerencia = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  compositionId?: number | null;
  compositionCode?: string | null;
  compositionDescription?: string | null;
  compositionUnit?: string | null;
  compositionUnitCost?: number | null;
  /** Soma de coeficiente x unitPriceSnapshot dos componentes. null = nao medido. */
  somaComponentes?: number | null;
};

export type ComposicaoParaCoerencia = {
  id: number;
  code: string;
  description: string;
  unit: string;
  status?: string | null;
  somaComponentes: number;
  componentesComPreco: number;
  totalComponentes: number;
};

export type AtividadeParaCoerencia = {
  id: number | string;
  wbsCode: string;
  name: string;
  durationDays: number;
  unit: string | null;
  plannedQuantity: number | null;
  earlyStart?: number | null;
  earlyFinish?: number | null;
  critical?: boolean;
  /** Preenchido pelo chamador quando a rede de dependencias nao da predecessor. */
  semPredecessor?: boolean;
};

export type CoerenciaInput = {
  obra: ObraParaCoerencia;
  itens: ItemOrcamentoParaCoerencia[];
  composicoes: ComposicaoParaCoerencia[];
  atividades?: AtividadeParaCoerencia[];
};

export type CoerenciaIssue = ValidationIssue & {
  severity: ValidationSeverity;
  /** Codigo EAP/WBS do item ou atividade que originou o achado. */
  ref?: string;
};

export type CoerenciaResultado = {
  valid: boolean;
  issues: CoerenciaIssue[];
  resumo: {
    total: number;
    erros: number;
    avisos: number;
    porSeveridade: Record<ValidationSeverity, number>;
    /** Soma em R$ dos itens citados por achados de severidade error. */
    valorEmRisco: number;
  };
};

// ---------------------------------------------------------------- normalizacao

function norm(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza unidade para comparacao: 'M2' = 'm2' = 'm²'. */
function normUnidade(u: string | null | undefined): string {
  return norm(u).replace(/[\u00b2]/g, "2").replace(/[\u00b3]/g, "3").replace(/\s/g, "");
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -------------------------------------------------------------------- regras

/**
 * Vocabulario que denuncia servico de ESCRITORIO (projeto, cadastro, desenho,
 * levantamento) — nao de execucao. Quando aparece na composicao vinculada a um
 * item cujo nome pede execucao fisica, o vinculo esta errado.
 */
const TERMOS_ESCRITORIO = [
  "cadastro de rede",
  "meio magnetico",
  "meio digital",
  "levantamento topografico",
  "servico de topografia",
  "desenho",
  "projeto executivo",
  "projeto basico",
  "as built",
  "digitalizacao",
  "escaneamento",
  "planilha orcamentaria",
];

/** Termos de execucao fisica: o item pede OBRA, nao documento. */
const TERMOS_EXECUCAO = [
  "drenagem",
  "escavacao",
  "assentamento",
  "pavimentacao",
  "concretagem",
  "alvenaria",
  "revestimento",
  "impermeabilizacao",
  "instalacao",
  "execucao",
  "construcao",
  "montagem",
  "calcada",
  "muro",
  "fundacao",
  "estrutura",
  "telhamento",
  "cobertura",
];

function ehServicoDeEscritorio(texto: string): boolean {
  return TERMOS_ESCRITORIO.some(t => texto.includes(t));
}

function pedeExecucaoFisica(texto: string): boolean {
  return TERMOS_EXECUCAO.some(t => texto.includes(t));
}

/**
 * Elementos estruturais de concreto armado. Se a composicao for de alvenaria
 * estrutural, o sistema construtivo nao corresponde ao descrito na obra.
 */
const ELEMENTOS_ESTRUTURAIS = ["pilar", "viga", "laje", "escada", "fundacao", "bloco de fundacao", "sapata", "estrutura da cobertura", "superestrutura"];

/**
 * Elemento estrutural de concreto.
 *
 * Cuidado com o falso positivo que ja aconteceu aqui: o termo "estrutura"
 * casava dentro de "estrUTURAL", e itens de ALVENARIA ("Alvenarias -
 * Alvenaria estrutural bloco ceramico") passavam a ser tratados como elemento
 * de concreto. Alvenaria e vedacao, nao estrutura — a menos que a obra seja
 * de alvenaria estrutural, que nao e o caso. Por isso "estrutura" sozinho
 * saiu da lista e entrou "estrutura da cobertura".
 */
function ehElementoEstrutural(texto: string): boolean {
  return ELEMENTOS_ESTRUTURAIS.some(t => texto.includes(t));
}

/**
 * Sistemas construtivos declarados. A obra declara UM; os itens podem declarar
 * outro — e ai a vinculacao esta errada.
 */
type SistemaConstrutivo = "concreto_armado" | "alvenaria_estrutural" | "metalica" | "mista" | "indefinido";

/**
 * Busca por termo inteiro, nao por substring.
 *
 * Sem isto "aco" casa dentro de "instalACOes" e "fundACOes" (depois de remover
 * os acentos), e instalacao hidrossanitaria vira "estrutura metalica". Foi o
 * segundo falso positivo desta regra — os dois por comparacao de substring.
 * Termo curto exige fronteira.
 */
function contemTermo(texto: string, termo: string): boolean {
  // Os termos desta regra sao palavras simples (letras e espaco). O separador
  // e o espaco ou a borda — nao ha metacaractere de regex a escapar.
  const partes = termo.split(/\s+/).map(p => p.replace(/[^a-z0-9]/gi, ""));
  const palavras = texto.split(/[^a-z0-9]+/).filter(Boolean);
  for (let k = 0; k + partes.length <= palavras.length; k++) {
    if (partes.every((p, n) => palavras[k + n] === p)) return true;
  }
  return false;
}

function detectarSistema(texto: string): SistemaConstrutivo {
  const t = norm(texto);
  const temConcreto =
    contemTermo(t, "concreto armado") ||
    contemTermo(t, "estrutura de concreto") ||
    contemTermo(t, "concreto protendido") ||
    contemTermo(t, "concreto estrutural");
  const temAlvenariaEstrutural = contemTermo(t, "alvenaria estrutural");
  if (temConcreto && temAlvenariaEstrutural) return "mista";
  if (temConcreto) return "concreto_armado";
  if (temAlvenariaEstrutural) return "alvenaria_estrutural";
  if (contemTermo(t, "estrutura metalica") || contemTermo(t, "aco estrutural")) return "metalica";
  return "indefinido";
}

/** Extrai o fck declarado na descricao do concreto, em MPa. */
function fckDeConcreto(texto: string): number | null {
  if (!texto.includes("concreto")) return null;
  const m = texto.match(/fck\s*=?\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  return Number(m[1].replace(",", "."));
}

/** Fck minimo usual para elemento estrutural em edificacao urbana (NBR 6118). */
const FCK_MINIMO_ESTRUTURAL = 25;

// ---------------------------------------------------------------- o validador

export function validarCoerenciaEngenharia(input: CoerenciaInput): CoerenciaResultado {
  const issues: CoerenciaIssue[] = [];
  const atividades = input.atividades ?? [];
  const porCodigo = new Map<string, ItemOrcamentoParaCoerencia>();
  for (const it of input.itens) porCodigo.set(it.code, it);

  const composicaoPorId = new Map<number, ComposicaoParaCoerencia>();
  for (const c of input.composicoes) composicaoPorId.set(c.id, c);

  // ---- 1. Natureza do servico: composicao de escritorio em item de execucao
  for (const it of input.itens) {
    if (!it.compositionId) continue;
    const comp = composicaoPorId.get(it.compositionId);
    const descComp = norm(comp?.description ?? it.compositionDescription);
    const descItem = norm(it.description);
    if (!descComp) continue;

    if (ehServicoDeEscritorio(descComp) && pedeExecucaoFisica(descItem)) {
      const valor = it.quantity * it.unitPrice;
      issues.push({
        severity: "error",
        code: "eng_natureza_servico_incompativel",
        ref: it.code,
        message:
          `"${it.description}" (${it.code}) esta vinculado a composicao "${it.compositionCode} — ` +
          `${it.compositionDescription}", que e servico de ESCRITORIO (projeto/cadastro/desenho), ` +
          `nao execucao fisica. Valor do item: R$ ${brl(valor)}.`,
      });
    }
  }

  // ---- 2. Sistema construtivo incompativel
  //
  // O caso real: o item recebeu como DESCRICAO o nome da composicao SEINFRA
  // usada como rotulo. "Lajes" virou "Lajes - Alvenaria estrutural bloco
  // concreto 19x19x39" e "Alvenarias" virou "Alvenarias - Alvenaria estrutural
  // bloco ceramico 19x19x39" — os dois com o MESMO rotulo, que so podia ser
  // de um deles. A obra e de concreto armado.
  //
  // A regra compara o sistema declarado pela OBRA com o sistema declarado pelo
  // ITEM. Divergencia = vinculacao por semelhanca de texto, nao por sistema.
  const sistemaDaObra = detectarSistema(input.obra.descricao ?? "");
  for (const it of input.itens) {
    const descItem = norm(it.description);
    const sistemaDoItem = detectarSistema(it.description);

    if (sistemaDaObra === "indefinido" || sistemaDoItem === "indefinido") continue;
    if (sistemaDoItem === sistemaDaObra || sistemaDoItem === "mista") continue;

    issues.push({
      severity: "error",
      code: "eng_sistema_construtivo_incompativel",
      ref: it.code,
      message:
        `"${it.description}" (${it.code}) declara sistema ${sistemaDoItem.replace("_", " ")}, ` +
        `mas a obra e de ${sistemaDaObra.replace("_", " ")}. Sao sistemas construtivos distintos: ` +
        `a vinculacao foi feita por semelhanca de texto, nao por sistema.`,
    });
  }

  // ---- 3. Resistencia do concreto em elemento estrutural
  for (const it of input.itens) {
    const descComp = norm(it.compositionDescription);
    const descItem = norm(it.description);
    if (!descComp.includes("concreto")) continue;
    if (!ehElementoEstrutural(descItem)) continue;
    const fck = fckDeConcreto(descComp);
    if (fck == null) continue;
    if (fck < FCK_MINIMO_ESTRUTURAL) {
      issues.push({
        severity: "error",
        code: "eng_concreto_resistencia_insuficiente",
        ref: it.code,
        message:
          `"${it.description}" (${it.code}) usa concreto fck=${fck} MPa. Para elemento estrutural ` +
          `em edificacao urbana a NBR 6118 exige fck >= ${FCK_MINIMO_ESTRUTURAL} MPa ` +
          `(fck=${fck} MPa e concreto de regularizacao, nao estrutural).`,
      });
    }
  }

  // ---- 4. Preco sem lastro: item x soma dos componentes da composicao
  for (const it of input.itens) {
    if (it.somaComponentes == null) continue;
    if (it.somaComponentes <= 0) continue;
    if (it.unitPrice <= 0) continue;
    const razao = it.unitPrice / it.somaComponentes;
    // Tolerancia de 20% cobre BDI, encargos e arredondamento de referencia.
    if (razao > 1.2 || razao < 0.8) {
      const pct = ((razao - 1) * 100).toFixed(0);
      issues.push({
        severity: "error",
        code: "eng_preco_sem_lastro",
        ref: it.code,
        message:
          `Preco do item "${it.description}" (${it.code}) e R$ ${brl(it.unitPrice)}/${it.unit}, mas a ` +
          `soma dos componentes da composicao "${it.compositionCode}" da R$ ${brl(it.somaComponentes)} ` +
          `(divergencia de ${pct}%). O preco nao tem lastro na propria composicao.`,
      });
    }
  }

  // ---- 5. Composicao sem nenhum componente com preco
  for (const c of input.composicoes) {
    if (c.totalComponentes > 0 && c.componentesComPreco === 0) {
      issues.push({
        severity: "warning",
        code: "eng_composicao_sem_preco",
        ref: c.code,
        message:
          `Composicao "${c.code} — ${c.description}" tem ${c.totalComponentes} componentes e ` +
          `NENHUM com preco. O custo da composicao nao e calculavel a partir dela.`,
      });
    }
  }

  // ---- 6. Custo por m2 abaixo da referencia de mercado
  if (input.obra.areaConstruida && input.obra.areaConstruida > 0 && input.itens.length) {
    const total = input.itens.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    if (total > 0) {
      const porM2 = total / input.obra.areaConstruida;
      // CUB comercial Ceara 2026: ~R$ 2.500 a 3.000/m2. Abaixo de 60% do piso
      // o orcamento esta subestimado ou a area esta errada.
      const piso = 2500 * 0.6;
      if (porM2 < piso) {
        issues.push({
          severity: "warning",
          code: "eng_custo_m2_abaixo_referencia",
          ref: input.obra.nome,
          message:
            `Custo por m2 da obra e R$ ${brl(porM2)} (R$ ${brl(total)} / ${input.obra.areaConstruida} m2), ` +
            `abaixo de 60% do CUB comercial de referencia (R$ 2.500/m2). ` +
            `Ou o orcamento esta subestimado, ou a area construida esta errada.`,
        });
      }
    }
  }

  // ---- 7. Unidade divergente entre orcamento e cronograma
  for (const a of atividades) {
    const it = porCodigo.get(a.wbsCode);
    if (!it) continue;
    if (!a.unit) continue;
    if (normUnidade(it.unit) !== normUnidade(a.unit)) {
      issues.push({
        severity: "warning",
        code: "eng_unidade_divergente",
        ref: a.wbsCode,
        message:
          `"${a.name}" (${a.wbsCode}) esta em ${a.unit} no cronograma e em ${it.unit} no orcamento. ` +
          `Medicao cruzada entre orcamento e avanco fisico fica invalida neste item.`,
      });
    }
  }

  // ---- 8. Superestrutura sem decomposicao por pavimento
  const pavimentos = input.obra.pavimentos ?? 0;
  if (pavimentos >= 2) {
    const estrutura = atividades.filter(a => /^1\.4(\.|$)/.test(a.wbsCode));
    const temSubnivel = estrutura.some(a => /^1\.4\.\d+\./.test(a.wbsCode));
    if (estrutura.length > 0 && !temSubnivel) {
      const soma = estrutura.reduce((s, a) => s + a.durationDays, 0);
      issues.push({
        severity: "error",
        code: "eng_estrutura_sem_ciclo_pavimento",
        ref: estrutura[0].wbsCode,
        message:
          `A superestrutura (${estrutura.length} atividades, ${soma} dias no total) nao esta decomposta ` +
          `por pavimento, mas a obra tem ${pavimentos} pavimentos. O ciclo construtivo ` +
          `(forma -> armadura -> concretagem -> cura -> desforma) se repete a cada pavimento e ` +
          `nao esta representado. ${soma} dias para ${pavimentos} pavimentos e implausivel.`,
      });
    }
  }

  // ---- 9. Sequencia construtiva invertida
  const fundacao = atividades.find(a => /^1\.3\.2$/.test(a.wbsCode));
  const inicioFundacao = fundacao?.earlyStart ?? null;
  if (inicioFundacao != null && inicioFundacao > 0) {
    // Elementos que so existem depois da estrutura pronta.
    const dependentes = atividades.filter(a => /^1\.(4|5|6|7|8|9|10|11|12)\./.test(a.wbsCode));
    for (const a of dependentes) {
      if (a.earlyStart == null) continue;
      if (a.earlyStart < inicioFundacao) {
        issues.push({
          severity: "error",
          code: "eng_sequencia_construtiva_invertida",
          ref: a.wbsCode,
          message:
            `"${a.name}" (${a.wbsCode}) comeca no dia ${a.earlyStart}, ANTES da fundacao ` +
            `(${fundacao!.wbsCode}, dia ${inicioFundacao}). Nao e possivel executar ` +
            `este elemento antes da fundacao existir.`,
        });
      }
    }
  }

  // ---- 10. Atividade sem predecessor que deveria ter
  const PODE_COMECAR_SEM_PREDECESSOR = /^1\.(1|2)\./;
  for (const a of atividades) {
    if (!a.semPredecessor) continue;
    if (PODE_COMECAR_SEM_PREDECESSOR.test(a.wbsCode)) continue;
    issues.push({
      severity: "error",
      code: "eng_atividade_sem_predecessor",
      ref: a.wbsCode,
      message:
        `"${a.name}" (${a.wbsCode}) nao tem predecessor e entra no CPM comecando no dia zero, ` +
        `como se pudesse ser executada sem nada antes.`,
    });
  }

  // ------------------------------------------------------------------- resumo
  const erros = issues.filter(i => i.severity === "error").length;
  const avisos = issues.filter(i => i.severity === "warning").length;

  // Valor em risco: soma dos itens de orcamento citados por achados de erro.
  const codigosEmErro = new Set(issues.filter(i => i.severity === "error" && i.ref).map(i => i.ref!));
  let valorEmRisco = 0;
  for (const it of input.itens) {
    if (codigosEmErro.has(it.code)) valorEmRisco += it.quantity * it.unitPrice;
  }

  return {
    valid: erros === 0,
    issues,
    resumo: {
      total: issues.length,
      erros,
      avisos,
      porSeveridade: { error: erros, warning: avisos },
      valorEmRisco,
    },
  };
}
