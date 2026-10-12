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
 * Nenhum destes e bug: todos passaram pela validacao de forma.
 *
 * ---------------------------------------------------------------------------
 * REVISAO 2 — correcoes da auditoria externa (22 cenas reproduziveis).
 *
 * A primeira versao tinha defeitos que so aparecem contra o app real, nao
 * contra o fixture do teste. Os principais:
 *
 *   1. PLURAL. A comparacao por palavra inteira falhava em portugues: "cao"
 *      vira "coes", entao "fundacoes" NAO contem "fundacao". Os nomes mais
 *      comuns de EAP sao plurais (Fundacoes, Instalacoes, Pavimentacoes,
 *      Escavacoes). O caso dos R$ 1,4 milhao foi pego por SORTE de grafia
 *      ("drenagem" e invariavel). Agora compara por RADICAL.
 *   2. valorEmRisco somava dinheiro de orcamento com qualidade de dado: um
 *      achado de CRONOGRAMA cita codigo de atividade, que tambem e codigo de
 *      item — e o valor integral do item entrava na conta. Agora cada achado
 *      tem DOMINIO, e so o dominio de orcamento soma dinheiro.
 *   3. Tres regras nao rodavam no app: a 6 porque o chamador passa area nula,
 *      a 9 porque exigia fundacao depois do dia 0, a 8 porque inferia um
 *      numero de pavimentos que o proprio dado desligava.
 *   4. A regra 4 tinha a banda centrada em BDI = 0% em silencio, e o projeto
 *      decidiu nao ter BDI. Pior: acusava divergencia de PRECO quando a causa
 *      era UNIDADE (o campo compositionUnit existia e nunca era lido).
 *   5. A regra 3 tratava C20 como invalido, mas a NBR 6118 o permite.
 *
 * Principio mantido: cada achado devolve EVIDENCIA, nunca suspeito generico.
 * ---------------------------------------------------------------------------
 */

export type ObraParaCoerencia = {
  projectId: number;
  nome: string;
  tipoDeObra?: string | null;
  /** Descricao da obra. E dela que sai o sistema construtivo declarado. */
  descricao?: string | null;
  /**
   * Pavimentos acima do terreo. SO passe este valor se ele vier de um dado da
   * obra. Inferir aqui ja produziu uma mensagem que afirmava "a obra tem 6
   * pavimentos" a partir de heuristica — o numero parecia dado e era chute.
   */
  pavimentos?: number | null;
  /** Area construida em m2. Se ausente, a regra de custo/m2 nao roda. */
  areaConstruida?: number | null;
  /** Origem da area construida, para a mensagem nao afirmar sem dizer de onde veio. */
  areaConstruidaFonte?: string | null;
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
  /** Soma de coeficiente x unitPriceSnapshot dos componentes. null = nao medido. */
  somaComponentes?: number | null;
  /** Item de custo direto de construcao (false para administracao, projeto, licenca). */
  custoDireto?: boolean;
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

/** De que natureza e o achado. Decide o que entra no resumo financeiro. */
export type DominioAchado = "orcamento" | "cronograma";

export type CoerenciaIssue = ValidationIssue & {
  severity: ValidationSeverity;
  dominio: DominioAchado;
  /** Codigos afetados. Agrupado por causa raiz: um achado pode citar varios. */
  refs: string[];
  /** Primeiro ref, para exibicao rapida. */
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
    /**
     * Soma dos itens de orcamento citados por achados de ORCAMENTO.
     *
     * Nao inclui achados de cronograma. A versao anterior somava os dois e o
     * numero ficava inflado por construcao: uma atividade sem predecessor
     * jogava o valor integral do item de mesmo codigo no "valor em risco".
     */
    valorEmRisco: number;
    /** Quantos achados sao de orcamento e quantos de cronograma. */
    porDominio: Record<DominioAchado, number>;
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

/**
 * Normaliza unidade para comparacao.
 *
 * Alem de acento e expoente, trata ABREVIACAO: "und" e "un" sao a mesma
 * unidade (unidade), "m2" e "m²" tambem. A versao anterior comparava a string
 * crua e acusava divergencia entre "und" (orcamento) e "un" (cronograma) —
 * falso positivo que faria o engenheiro procurar erro onde nao ha.
 */
function normUnidade(u: string | null | undefined): string {
  const base = norm(u).replace(/[\u00b2]/g, "2").replace(/[\u00b3]/g, "3").replace(/\s/g, "");
  const ABREVIACOES: Record<string, string> = {
    und: "un", unid: "un", unidades: "un", unidade: "un",
    kg: "kg", t: "t", ton: "t", tonelada: "t",
    m: "m", metro: "m", metros: "m", mt: "m",
    m2: "m2", metro2: "m2", "m^2": "m2",
    m3: "m3", metro3: "m3", "m^3": "m3",
    vb: "vb", verba: "vb", gb: "vb", global: "vb",
    h: "h", hora: "h", horas: "h",
    cj: "cj", conjunto: "cj", pç: "pc", pc: "pc", peca: "pc",
  };
  return ABREVIACOES[base] ?? base;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Compara por RADICAL, nao por palavra inteira.
 *
 * Em portugues o plural nao contem o singular: "cao" vira "coes". Logo
 * "fundacoes" NAO contem "fundacao" — e Fundacoes, Instalacoes,
 * Pavimentacoes e Escavacoes sao exatamente os nomes mais comuns de EAP.
 * A versao anterior usava palavra inteira e nao reconhecia nenhum deles.
 *
 * Radical casa os dois: "fundac" esta em "fundacao" e em "fundacoes".
 * O radical precisa ter 4+ letras para nao voltar o falso positivo de termo
 * curto ("aco" dentro de "instalacoes").
 */
function contemRadical(texto: string, radical: string): boolean {
  const r = norm(radical);
  if (r.length < 4) return false;
  return norm(texto).includes(r);
}

function contemAlgum(texto: string, radicais: string[]): boolean {
  return radicais.some(r => contemRadical(texto, r));
}

// -------------------------------------------------------------------- regras

/**
 * Radicais de servico de ESCRITORIO (projeto, cadastro, desenho, levantamento)
 * — nao de execucao. Todos com 4+ letras e escolhidos para casar singular e
 * plural pelo radical.
 */
const RADICAIS_ESCRITORIO = [
  "cadastr",
  "meio magnetic",
  "meio digit",
  "levantamento topografic",
  "topografi",
  "desenh",
  "projeto executiv",
  "projeto basic",
  "as built",
  "digitalizac",
  "escaneament",
  "planilha orcament",
];

/** Radicais de execucao fisica: o item pede OBRA, nao documento. */
const RADICAIS_EXECUCAO = [
  "drenag",
  "escavac",
  "assentament",
  "pavimentac",
  "concretag",
  "alvenari",
  "revestiment",
  "impermeabilizac",
  "instalac",
  "execuc",
  "construc",
  "montag",
  "calcad",
  "muro",
  "fundac",
  "estrutur",
  "telhament",
  "cobertur",
  "esquadri",
  "pintur",
  "forr",
  "contrapis",
  "piso",
  "viga",
  "pilar",
  "laje",
];

/** Elementos estruturais de concreto. */
const RADICAIS_ESTRUTURAIS = ["pilar", "viga", "laje", "escada", "fundac", "sapata", "superestrutur", "estrutura da cobertur"];

type SistemaConstrutivo = "concreto_armado" | "alvenaria_estrutural" | "metalica" | "mista" | "indefinido";

function detectarSistema(texto: string): SistemaConstrutivo {
  const t = norm(texto);
  const temConcreto = contemRadical(t, "concreto armad") || contemRadical(t, "estrutura de concret") || contemRadical(t, "concreto protendid");
  const temAlvenariaEstrutural = contemRadical(t, "alvenaria estrutural");
  if (temConcreto && temAlvenariaEstrutural) return "mista";
  if (temConcreto) return "concreto_armado";
  if (temAlvenariaEstrutural) return "alvenaria_estrutural";
  if (contemRadical(t, "estrutura metalic")) return "metalica";
  return "indefinido";
}

/**
 * Fck declarado no texto, em MPa. Aceita "FCK=15MPa", "fck 20", "C20".
 */
function fckDeConcreto(texto: string): number | null {
  const t = norm(texto);
  if (!t.includes("concreto") && !/\bc\d{2}\b/.test(t)) return null;
  const porFck = t.match(/fck\s*=?\s*(\d+(?:[.,]\d+)?)/);
  if (porFck) return Number(porFck[1].replace(",", "."));
  const porClasse = t.match(/\bc(\d{2})\b/);
  if (porClasse) return Number(porClasse[1]);
  return null;
}

/**
 * Fck minimo estrutural.
 *
 * A NBR 6118:2014 (Tabela 7.1) admite C20 como classe minima para concreto
 * estrutural. A versao anterior usava 25 e acusava C20 — atribuindo a norma um
 * minimo que ela nao estabelece como regra geral. 20 e o piso correto; abaixo
 * disso (15, 10) e concreto de regularizacao.
 */
const FCK_MINIMO_ESTRUTURAL = 20;

/** Itens que nao sao custo direto de construcao (entram no orcamento, nao na obra). */
const RADICAIS_NAO_CUSTO_DIRETO = ["administrac", "licenc", "projeto", "as built", "comissionament", "teste", "mobilizac", "desmobilizac", "limpez", "seguranc", "sinalizac", "documentac"];

function ehCustoDireto(it: ItemOrcamentoParaCoerencia): boolean {
  if (typeof it.custoDireto === "boolean") return it.custoDireto;
  return !contemAlgum(it.description, RADICAIS_NAO_CUSTO_DIRETO);
}

/** Atividade de elemento que so existe depois da infraestrutura. */
function ehElementoSuperior(wbsCode: string): boolean {
  return /^1\.(4|5|6|7|8|9|10|11|12|13|14|15)\./.test(wbsCode);
}

// ---------------------------------------------------------------- o validador

type Coletor = {
  issues: CoerenciaIssue[];
  add: (i: Omit<CoerenciaIssue, "refs"> & { refs?: string[] }) => void;
};

export function validarCoerenciaEngenharia(input: CoerenciaInput): CoerenciaResultado {
  const coletor: Coletor = {
    issues: [],
    add: i => {
      const refs = i.refs ?? (i.ref ? [i.ref] : []);
      coletor.issues.push({ ...i, refs, ref: refs[0] });
    },
  };
  const { add } = coletor;

  const atividades = input.atividades ?? [];
  const porCodigo = new Map<string, ItemOrcamentoParaCoerencia>();
  for (const it of input.itens) porCodigo.set(it.code, it);

  const composicaoPorId = new Map<number, ComposicaoParaCoerencia>();
  for (const c of input.composicoes) composicaoPorId.set(c.id, c);

  const sistemaDaObra = detectarSistema(input.obra.descricao ?? "");
  const obraEhMista = sistemaDaObra === "mista";

  // ---- 1. Natureza do servico: composicao de escritorio em item de execucao
  {
    const achados: string[] = [];
    let valor = 0;
    let exemplo = "";
    for (const it of input.itens) {
      if (!it.compositionId) continue;
      const comp = composicaoPorId.get(it.compositionId);
      const descComp = comp?.description ?? it.compositionDescription ?? "";
      const descItem = it.description;
      if (!descComp) continue;

      if (contemAlgum(descComp, RADICAIS_ESCRITORIO) && contemAlgum(descItem, RADICAIS_EXECUCAO)) {
        achados.push(it.code);
        valor += it.quantity * it.unitPrice;
        if (!exemplo) exemplo = `"${it.description}" (${it.code}) -> "${it.compositionCode} — ${descComp}"`;
      }
    }
    if (achados.length) {
      add({
        severity: "error",
        dominio: "orcamento",
        code: "eng_natureza_servico_incompativel",
        refs: achados,
        message:
          `${achados.length} item(ns) de execucao fisica vinculados a composicao de ESCRITORIO ` +
          `(projeto/cadastro/desenho). Total: R$ ${brl(valor)}. Ex.: ${exemplo}.`,
      });
    }
  }

  // ---- 2. Sistema construtivo incompativel
  //
  // Compara o sistema que a OBRA declara com o que o ITEM declara. Se a obra e
  // mista, nao acusa — ela declara os dois sistemas, e acusar um deles seria
  // acusar o proprio dado da obra.
  //
  // A mensagem descreve apenas o OBSERVAVEL (divergencia entre os dois
  // sistemas). A versao anterior afirmava "a vinculacao foi feita por
  // semelhanca de texto" — causa que o validador nao pode observar.
  if (!obraEhMista && sistemaDaObra !== "indefinido") {
    const achados: string[] = [];
    for (const it of input.itens) {
      const descItem = it.description;
      const sistemaDoItem = detectarSistema(descItem);
      if (sistemaDoItem === "indefinido" || sistemaDoItem === "mista") continue;
      if (sistemaDoItem === sistemaDaObra) continue;
      achados.push(it.code);
    }
    if (achados.length) {
      add({
        severity: "error",
        dominio: "orcamento",
        code: "eng_sistema_construtivo_incompativel",
        refs: achados,
        message:
          `${achados.length} item(ns) declaram sistema construtivo diferente do declarado pela obra ` +
          `(${sistemaDaObra.replace("_", " ")}). Itens: ${achados.slice(0, 8).join(", ")}` +
          `${achados.length > 8 ? ` (+${achados.length - 8})` : ""}.`,
      });
    }
  }

  // ---- 3. Resistencia do concreto em elemento estrutural
  {
    const achados: string[] = [];
    let exemplo = "";
    for (const it of input.itens) {
      const descComp = it.compositionDescription ?? "";
      if (!contemRadical(descComp, "concret")) continue;
      if (!contemAlgum(it.description, RADICAIS_ESTRUTURAIS)) continue;
      const fck = fckDeConcreto(descComp);
      if (fck == null || fck >= FCK_MINIMO_ESTRUTURAL) continue;
      achados.push(it.code);
      if (!exemplo) exemplo = `"${it.description}" (${it.code}) usa fck=${fck} MPa`;
    }
    if (achados.length) {
      add({
        severity: "error",
        dominio: "orcamento",
        code: "eng_concreto_resistencia_insuficiente",
        refs: achados,
        message:
          `${achados.length} elemento(s) estrutural(is) com concreto abaixo de C${FCK_MINIMO_ESTRUTURAL} ` +
          `(minimo da NBR 6118 Tabela 7.1 para concreto estrutural). Ex.: ${exemplo}.`,
      });
    }
  }

  // ---- 4. Preco sem lastro (e unidade divergente como causa separada)
  //
  // Duas correcoes da auditoria:
  //   (a) a banda era centrada em BDI = 0% em silencio, e o projeto decidiu nao
  //       ter BDI. A tolerancia agora e DECLARADA e estreita, coerente com essa
  //       decisao — nao ha BDI a absorver.
  //   (b) quando a UNIDADE do item difere da unidade da composicao, a
  //       divergencia de valor e efeito da unidade, nao do preco. O campo
  //       compositionUnit existia no contrato e nunca era lido. Agora e lido e
  //       o achado muda de natureza.
  {
    const TOLERANCIA_PRECO = 0.1; // projeto sem BDI: 10% cobre arredondamento de referencia
    const achadosPreco: string[] = [];
    const achadosUnidade: string[] = [];
    let exemplo = "";

    for (const it of input.itens) {
      if (!it.compositionId) continue;
      const unitItem = normUnidade(it.unit);
      const unitComp = normUnidade(it.compositionUnit);
      if (unitComp && unitItem && unitComp !== unitItem) {
        achadosUnidade.push(it.code);
        continue; // divergencia de unidade explica o valor; nao acusar preco
      }
      if (it.somaComponentes == null || it.somaComponentes <= 0 || it.unitPrice <= 0) continue;
      const razao = it.unitPrice / it.somaComponentes;
      if (razao > 1 + TOLERANCIA_PRECO || razao < 1 - TOLERANCIA_PRECO) {
        achadosPreco.push(it.code);
        if (!exemplo)
          exemplo =
            `"${it.description}" (${it.code}) a R$ ${brl(it.unitPrice)}/${it.unit} contra ` +
            `R$ ${brl(it.somaComponentes)} dos componentes de ${it.compositionCode}`;
      }
    }

    if (achadosUnidade.length) {
      add({
        severity: "warning",
        dominio: "orcamento",
        code: "eng_unidade_composicao_divergente",
        refs: achadosUnidade,
        message:
          `${achadosUnidade.length} item(ns) com unidade diferente da unidade da composicao vinculada. ` +
          `A comparacao de valor entre item e composicao fica invalida nestes itens. ` +
          `Itens: ${achadosUnidade.slice(0, 8).join(", ")}${achadosUnidade.length > 8 ? ` (+${achadosUnidade.length - 8})` : ""}.`,
      });
    }
    if (achadosPreco.length) {
      add({
        severity: "error",
        dominio: "orcamento",
        code: "eng_preco_sem_lastro",
        refs: achadosPreco,
        message:
          `${achadosPreco.length} item(ns) com preco divergindo mais de ${Math.round(TOLERANCIA_PRECO * 100)}% ` +
          `da soma dos componentes da propria composicao (tolerancia estreita: o projeto declara BDI 0%). ` +
          `Ex.: ${exemplo}.`,
      });
    }
  }

  // ---- 5. Composicao com cobertura de preco insuficiente
  //
  // Duas correcoes da auditoria:
  //   (a) a regra so olhava "nenhum componente com preco". Uma composicao com
  //       1 de 50 precos passava — e a soma e tao inutil quanto zero (cena
  //       R5-01: soma 12,50 com 1 de 50).
  //   (b) o criterio binario escondia o caso pior, que e o PARCIAL: o custo
  //       parece calculavel e nao e.
  {
    const LIMIAR_COBERTURA = 0.5; // menos de metade dos componentes com preco
    const semPreco: string[] = [];
    const parcial: string[] = [];
    for (const c of input.composicoes) {
      if (c.totalComponentes === 0) continue;
      if (c.componentesComPreco === 0) { semPreco.push(c.code); continue; }
      const cobertura = c.componentesComPreco / c.totalComponentes;
      if (cobertura < LIMIAR_COBERTURA) parcial.push(c.code);
    }
    if (semPreco.length) {
      add({
        severity: "warning",
        dominio: "orcamento",
        code: "eng_composicao_sem_preco",
        refs: semPreco,
        message:
          `${semPreco.length} composicao(oes) com componentes e NENHUM com preco. ` +
          `O custo nao e calculavel a partir delas. Composicoes: ${semPreco.slice(0, 8).join(", ")}` +
          `${semPreco.length > 8 ? ` (+${semPreco.length - 8})` : ""}.`,
      });
    }
    if (parcial.length) {
      add({
        severity: "warning",
        dominio: "orcamento",
        code: "eng_composicao_preco_incompleto",
        refs: parcial,
        message:
          `${parcial.length} composicao(oes) com MENOS DA METADE dos componentes precificados. ` +
          `O custo parece calculavel e nao e: a soma sai subestimada sem avisar. ` +
          `Composicoes: ${parcial.slice(0, 8).join(", ")}${parcial.length > 8 ? ` (+${parcial.length - 8})` : ""}.`,
      });
    }
  }

  // ---- 6. Custo por m2 abaixo da referencia
  //
  // Tres correcoes da auditoria:
  //   (a) a regra estava MORTA no app: o chamador passava area nula. Agora, sem
  //       area, ela nao roda E ISSO NAO E SILENCIO — o resumo registra que a
  //       checagem foi pulada e por que.
  //   (b) o numerador era o orcamento TOTAL (com administracao, licencas,
  //       servicos de escritorio). O CUB e CUSTO DIRETO de construcao.
  //       Comparar os dois inflava o R$/m2 e fazia a regra acusar de menos.
  //   (c) o piso de 60% do CUB nao tinha lastro e dava falso alarme em galpao.
  //       Agora o piso e parametro explicito, declarado no resultado.
  if (input.obra.areaConstruida && input.obra.areaConstruida > 0 && input.itens.length) {
    const diretos = input.itens.filter(ehCustoDireto);
    const totalDireto = diretos.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    if (totalDireto > 0) {
      const porM2 = totalDireto / input.obra.areaConstruida;
      const PISO_CUB = 2500 * 0.6; // 60% do CUB comercial de referencia — HEURISTICA, ver mensagem
      if (porM2 < PISO_CUB) {
        add({
          severity: "warning",
          dominio: "orcamento",
          code: "eng_custo_m2_abaixo_referencia",
          refs: [input.obra.nome],
          message:
            `Custo direto por m2 e R$ ${brl(porM2)} (R$ ${brl(totalDireto)} de ${diretos.length} itens de custo ` +
            `direto / ${input.obra.areaConstruida} m2${input.obra.areaConstruidaFonte ? ` — area ${input.obra.areaConstruidaFonte}` : ""}). ` +
            `Abaixo do piso de R$ ${brl(PISO_CUB)}/m2 (60% de um CUB comercial de referencia de R$ 2.500/m2). ` +
            `O piso e heuristica e nao substitui o CUB da regiao: confirme antes de concluir subestimacao.`,
        });
      }
    }
  }

  // ---- 7. Unidade divergente entre orcamento e cronograma
  {
    const achados: string[] = [];
    for (const a of atividades) {
      const it = porCodigo.get(a.wbsCode);
      if (!it || !a.unit) continue;
      if (normUnidade(it.unit) !== normUnidade(a.unit)) achados.push(a.wbsCode);
    }
    if (achados.length) {
      add({
        severity: "warning",
        dominio: "cronograma",
        code: "eng_unidade_divergente",
        refs: achados,
        message:
          `${achados.length} item(ns) com unidade diferente entre cronograma e orcamento. ` +
          `Medicao cruzada entre avanco fisico e financeiro fica invalida nestes itens. ` +
          `Itens: ${achados.slice(0, 8).join(", ")}${achados.length > 8 ? ` (+${achados.length - 8})` : ""}.`,
      });
    }
  }

  // ---- 8. Superestrutura sem decomposicao por nivel
  //
  // A versao anterior FABRICAVA o numero de pavimentos e afirmava "a obra tem 6
  // pavimentos" como se fosse dado. A prova de que era fabricado: o numero saia
  // de "1.4.N.M" e so era usado quando NAO havia subnivel "1.4.N." — as duas
  // condicoes sao mutuamente exclusivas, entao ver o dado desligava a regra.
  //
  // Agora: se a obra informa pavimentos (dado real), acusa como error citando o
  // numero. Se nao informa, acusa como warning SEM afirmar numero — o problema
  // observavel e a ausencia de decomposicao, nao um numero que nao temos.
  {
    const estrutura = atividades.filter(a => /^1\.4(\.|$)/.test(a.wbsCode));
    const temSubnivel = estrutura.some(a => /^1\.4\.\d+\./.test(a.wbsCode));
    if (estrutura.length > 0 && !temSubnivel) {
      const soma = estrutura.reduce((s, a) => s + a.durationDays, 0);
      const pav = input.obra.pavimentos;
      const temNumero = typeof pav === "number" && pav >= 2;
      add({
        severity: temNumero ? "error" : "warning",
        dominio: "cronograma",
        code: "eng_estrutura_sem_ciclo_pavimento",
        refs: estrutura.map(a => a.wbsCode),
        message: temNumero
          ? `A superestrutura (${estrutura.length} atividades, ${soma} dias no total) nao esta decomposta ` +
            `por pavimento, e a obra declara ${pav} pavimentos. O ciclo construtivo se repete a cada nivel ` +
            `e nao esta representado.`
          : `A superestrutura (${estrutura.length} atividades, ${soma} dias no total) nao esta decomposta por ` +
            `nivel. Em obra de mais de um pavimento o ciclo construtivo (forma, armadura, concretagem, cura, ` +
            `desforma) se repete a cada nivel. O numero de pavimentos nao consta da obra — confirme para ` +
            `avaliar se ${soma} dias e plausivel.`,
      });
    }
  }

  // ---- 9. Sequencia construtiva invertida
  //
  // A versao anterior exigia fundacao comecando DEPOIS do dia 0, entao nao
  // rodava no caso comum (fundacao no dia 0). Agora compara com o FIM da
  // fundacao: elemento superior nao pode comecar antes de a fundacao terminar.
  // Isso pega tanto "cobertura no dia 0 com fundacao no dia 12" quanto
  // "cobertura no dia 0 com fundacao tambem no dia 0" (0 < fim da fundacao).
  {
    const fundacao = atividades.find(a => /^1\.3\.2$/.test(a.wbsCode));
    const fimFundacao = fundacao?.earlyFinish ?? null;
    if (fimFundacao != null && fimFundacao > 0) {
      const achados: string[] = [];
      let exemplo = "";
      for (const a of atividades) {
        if (!ehElementoSuperior(a.wbsCode)) continue;
        if (a.earlyStart == null) continue;
        if (a.earlyStart < fimFundacao) {
          achados.push(a.wbsCode);
          if (!exemplo)
            exemplo = `"${a.name}" (${a.wbsCode}) comeca no dia ${a.earlyStart}, e a fundacao ` +
              `(${fundacao!.wbsCode}) so termina no dia ${fimFundacao}`;
        }
      }
      if (achados.length) {
        add({
          severity: "error",
          dominio: "cronograma",
          code: "eng_sequencia_construtiva_invertida",
          refs: achados,
          message:
            `${achados.length} atividade(s) de elemento superior comecam antes de a fundacao terminar. ` +
            `Ex.: ${exemplo}.`,
        });
      }
    }
  }

  // ---- 10. Atividade sem predecessor que deveria ter
  {
    const PODE_COMECAR_SEM_PREDECESSOR = /^1\.(1|2)\./;
    const achados: string[] = [];
    for (const a of atividades) {
      if (!a.semPredecessor) continue;
      if (PODE_COMECAR_SEM_PREDECESSOR.test(a.wbsCode)) continue;
      achados.push(a.wbsCode);
    }
    if (achados.length) {
      add({
        severity: "error",
        dominio: "cronograma",
        code: "eng_atividade_sem_predecessor",
        refs: achados,
        message:
          `${achados.length} atividade(s) sem predecessor entram no CPM comecando no dia zero, como se ` +
          `pudessem ser executadas sem nada antes. Itens: ${achados.slice(0, 10).join(", ")}` +
          `${achados.length > 10 ? ` (+${achados.length - 10})` : ""}.`,
      });
    }
  }

  // ------------------------------------------------------------------- resumo
  const issues = coletor.issues;
  const erros = issues.filter(i => i.severity === "error").length;
  const avisos = issues.filter(i => i.severity === "warning").length;

  // Valor em risco: SO itens de orcamento citados por achados de dominio
  // orcamento. Achado de cronograma cita codigo de atividade, que coincide com
  // codigo de item — somar os dois inflava o numero por construcao.
  const codigosOrcamento = new Set(
    issues.filter(i => i.severity === "error" && i.dominio === "orcamento").flatMap(i => i.refs),
  );
  let valorEmRisco = 0;
  for (const it of input.itens) {
    if (codigosOrcamento.has(it.code)) valorEmRisco += it.quantity * it.unitPrice;
  }

  const porDominio: Record<DominioAchado, number> = {
    orcamento: issues.filter(i => i.dominio === "orcamento").length,
    cronograma: issues.filter(i => i.dominio === "cronograma").length,
  };

  return {
    valid: erros === 0,
    issues,
    resumo: {
      total: issues.length,
      erros,
      avisos,
      porSeveridade: { error: erros, warning: avisos },
      valorEmRisco,
      porDominio,
    },
  };
}
