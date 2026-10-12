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
 *   4. A regra 4 tinha a banda centrada em BDI = 0% em silencio. Pior: acusava
 *      divergencia de PRECO quando a causa era UNIDADE (o campo compositionUnit
 *      existia e nunca era lido).
 *   5. A regra 3 tratava C20 como invalido, mas a NBR 6118 o permite.
 *
 * Principio mantido: cada achado devolve EVIDENCIA, nunca suspeito generico.
 * ---------------------------------------------------------------------------
 * REVISAO 3 — achados que continuavam ABERTOS na rodada 2 da auditoria.
 *
 *   1. R1-03: o vocabulario de escritorio era fechado. Uma composicao
 *      "ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO" nao
 *      era reconhecida, porque so existiam "projeto executivo" e "projeto
 *      basico". Faltavam sondagem, ensaio, laudo, consultoria, supervisao,
 *      plotagem/impressao. "projeto" puro NAO foi adicionado: casa tambem
 *      "EXECUCAO ... INCLUSIVE PROJETO EXECUTIVO" (cena R1-04) — o texto nao
 *      separa "o projeto" (assunto) de "projetar" (servico).
 *   2. R2-01: obra cuja DESCRICAO nao nomeia o sistema DESLIGAVA a regra 2
 *      inteira. O sistema passa a ser inferido da maioria dos itens da EAP, e a
 *      mensagem declara que a base foi inferida. Se NEM a descricao nem os itens
 *      declaram sistema, a regra avisa que NAO PODE AVALIAR
 *      (eng_sistema_construtivo_nao_avaliavel, warning) em vez de ficar
 *      silenciosa: ausencia de achado nao pode ser lida como coerencia.
 *   3. R3-03: um item chamado apenas "Estrutura" nao casava com nenhum radical
 *      estrutural especifico, e a checagem de fck era PULADA nele — justamente
 *      no item mais estrutural da EAP.
 *   4. R4-01: o esperado passa a ser (1 + BDI DECLARADO da obra), com a banda em
 *      torno dele. SEM BDI declarado o achado e WARNING de conferencia, nunca
 *      error: assumir 0% para poder acusar era a origem do falso positivo.
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
  /**
   * Area construida em m2.
   *
   * ATENCAO a semantica (verificacao R6-03): e a area construida TOTAL — soma
   * das areas de piso de todos os niveis. O chamador passava o MAX de um item
   * de piso, e com 2 pavimentos de 1.200 m2 a "area construida" virava 1.200
   * em vez de 2.400: a obra aparecia 2x mais cara por m2 e a regra acusava de
   * menos. Mesmo vicio do numero de pavimentos fabricado — numero plausivel de
   * heuristica exibido como dado.
   */
  areaConstruida?: number | null;
  /** Origem da area construida. Sem isto a mensagem nao pode citar a fonte. */
  areaConstruidaFonte?: string | null;
  /**
   * BDI declarado da obra, em FRACAO (0.25 = 25%). Ausente/null = nao declarado.
   *
   * R4-01: a banda de preco era simetrica em torno da razao 1,0 — ou seja,
   * centrada em BDI = 0% em silencio. Um BDI de 25%, rotina em obra publica,
   * caia fora e virava ERROR em massa. Agora o esperado e (1 + BDI declarado) e
   * a mensagem cita o valor usado. Sem BDI declarado o achado e WARNING de
   * conferencia, nunca error: assumir 0% e exatamente o que produzia o falso
   * positivo. Mesma logica do CUB declarado por obra — nao se inventa parametro
   * de custo para poder acusar.
   */
  bdiDeclarado?: number | null;
  /**
   * CUB declarado da obra, em R$/m2. Ver `cubUf`/`cubMes`.
   *
   * R6-02: o CUB e o parametro de custo que a obra DECLARA. Os tres campos
   * (valor + UF + mes) juntos SAO a declaracao — valor sem UF/mes nao e
   * referencia, porque nao da para dizer de onde o numero veio. Antes o piso
   * era um chute fixo (R$ 2.500/m2 * 0,6) que dava falso alarme em galpao.
   *
   * Sem CUB declarado a regra 6 NAO RODA: a cobertura nomeia o motivo
   * ("obra nao declarou CUB") e nenhum item e conferido. Declaracao PARCIAL
   * (ex.: valor sem mes) tambem nao roda, e a cobertura diz QUAL campo falta —
   * tratar parcial como "nao declarado" esconderia metade da causa.
   *
   * Os tres sao campos separados (e nao um objeto) de proposito: o estado
   * parcial precisa ser representavel para poder ser NOMEADO.
   */
  cubValor?: number | null;
  /** UF de referencia do CUB declarado (ex.: "SP"). */
  cubUf?: string | null;
  /** Mes de referencia do CUB declarado, no formato AAAA-MM (ex.: "2026-09"). */
  cubMes?: string | null;
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

/**
 * Cobertura de uma regra: quantos itens ela CONSEGUIU avaliar e por que os outros
 * ficaram fora.
 *
 * Nasceu da aplicacao do principio "ausencia de achado nao pode ser lida como
 * coerencia" ao orcamento INTEIRO. Na AURORA, 35 de 53 itens (66%) nao tem
 * composicao vinculada e o painel mostrava "11 achados" como se a obra tivesse
 * sido conferida.
 *
 * Isto NAO e achado e NAO muda severidade de nada: e declaracao de ALCANCE.
 * `motivo` e sempre NOMEADO ("sem composicao vinculada"), nunca generico
 * ("nao aplicavel") — um motivo generico esconde justamente o que se quer ver.
 */
export type CoberturaRegra = {
  /** Nome da regra com o numero, ex.: "4. preco sem lastro". */
  regra: string;
  /** Sobre o que a regra conta: itens, composicoes ou atividades. */
  universo: "itens" | "composicoes" | "atividades";
  /** Universo da regra (todos os candidatos). */
  total: number;
  /** Quantos a regra realmente conseguiu checar. */
  avaliados: number;
  /** total - avaliados, com o motivo nomeado. */
  fora: number;
  /**
   * Motivo NOMEADO predominante das exclusoes. `null` quando `fora === 0`.
   * Uma regra pode ter mais de uma razao de exclusao — por isso o detalhe
   * completo vem em `motivos`, e nao se esconde a segunda causa atras da primeira.
   */
  motivo: string | null;
  /** Detalhe por motivo, do maior para o menor. */
  motivos: { motivo: string; itens: number }[];
  /**
   * Qualificador do ALCANCE que nao e exclusao de item. `null` na maioria.
   *
   * R6-02: a regra 4 RODA sem BDI declarado — os itens sao avaliados, so nao
   * ha parametro declarado. Dizer "item fora por nao declarar BDI" seria mentir
   * sobre itens que foram conferidos. Entao o estado da declaracao entra aqui,
   * como nota da REGRA: "obra nao declarou BDI — conferencia, nao verificacao".
   * `motivo` = item fora; `nota` = parametro que muda a natureza do que foi
   * conferido. Misturar os dois faria a cobertura repetir o pecado que corrigiu.
   */
  nota: string | null;
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
    /** Alcance de cada regra. Sem isto, "sem achado" e indistinguivel de "conferido". */
    cobertura: CoberturaRegra[];
  };
};

/**
 * Resumo vazio no formato EXATO do contrato.
 *
 * Existe para o caminho degenerado (banco nao configurado) nao poder divergir do
 * formato real: um `resumo` incompleto aqui faz o tipo do procedimento virar uniao
 * e o painel so enxergar os campos comuns aos dois lados. Foi o campo `cobertura`
 * que expos isto — antes era `porDominio`.
 */
export const RESUMO_COERENCIA_VAZIO: CoerenciaResultado["resumo"] = {
  total: 0,
  erros: 0,
  avisos: 0,
  porSeveridade: { error: 0, warning: 0 },
  valorEmRisco: 0,
  porDominio: { orcamento: 0, cronograma: 0 },
  cobertura: [],
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
  // R1-03: o vocabulario era fechado demais. Uma composicao
  // "ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO" nao era
  // reconhecida, porque so existiam "projeto executivo" e "projeto basico" —
  // "projeto" sozinho nao estava na lista. Os termos abaixo cobrem os servicos
  // de escritorio que faltavam (projeto generico, sondagem, ensaio, laudo,
  // consultoria, supervisao, plotagem/impressao).
  //
  // NAO foi adicionado "projeto" puro de proposito: ele casa tambem
  // "EXECUCAO ... INCLUSIVE PROJETO EXECUTIVO E AS BUILT", composicao de
  // EXECUCAO que menciona o projeto como parte do escopo (cena R1-04 da
  // auditoria). O texto nao distingue "o projeto" (assunto) de "projetar"
  // (servico) — por isso o radical generico so entra quando houver um negativo
  // que separe os dois casos. "elaborac"/"anteprojet" cobrem o caso real sem
  // esse risco.
  "elaborac",
  "anteprojet",
  "servico tecnic",
  "sem execuc",
  "sondag",
  "ensai",
  "laudo",
  "consultoria",
  "supervis",
  "fiscalizac",
  "plotagem",
  "impress",
  "projetist",
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

/**
 * Elementos estruturais de concreto.
 *
 * R3-03: faltava o radical generico "estrutur". Um item chamado apenas
 * "Estrutura" — nome comum de EAP — nao casava com nenhum dos especificos
 * (pilar, viga, laje, sapata...) e a checagem de fck era PULADA nele. O falso
 * negativo era silencioso justamente no item mais estrutural da EAP.
 * "estrutur" casa "estrutura", "estruturas" e "superestrutura" de uma vez; o
 * alargamento e contido pela segunda condicao da regra, que continua exigindo
 * que a composicao cite concreto.
 */
const RADICAIS_ESTRUTURAIS = ["pilar", "viga", "laje", "escada", "fundac", "sapata", "estrutur"];

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
 * Sistema construtivo inferido dos ITENS da EAP, quando a obra nao declara.
 *
 * R2-01: obra cuja descricao nao nomeia o sistema DESLIGAVA a regra 2 inteira, e
 * o item que contradiz a obra passava sem ser visto. A EAP e um dado da propria
 * obra: quando um sistema aparece de forma consistente nos itens, esse e o
 * sistema que a obra declara. Um item isolado contra a maioria e exatamente o
 * que a regra deve apontar — logo nao ha circularidade util em exigir maioria.
 *
 * Itens "indefinido" e "mista" nao votam: nao declaram sistema, e usa-los como
 * voto faria a propria indefinicao virar o sistema da obra.
 */
function inferirSistemaDosItens(itens: ItemOrcamentoParaCoerencia[]): SistemaConstrutivo {
  const votos = new Map<SistemaConstrutivo, number>();
  for (const it of itens) {
    const s = detectarSistema(it.description);
    if (s === "indefinido" || s === "mista") continue;
    votos.set(s, (votos.get(s) ?? 0) + 1);
  }
  let vencedor: SistemaConstrutivo = "indefinido";
  let max = 0;
  for (const [s, n] of votos) {
    if (n > max) { max = n; vencedor = s; }
  }
  return vencedor;
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

/**
 * Itens que nao sao custo direto de construcao (entram no orcamento, nao na obra).
 *
 * ATENCAO: esta lista e FALLBACK por texto, e o texto engana. A verificacao
 * (R6-04) mostrou que `custoDireto` era declarado no contrato e NENHUM chamador
 * preenchia — o mesmo padrao de campo morto que ja tinha acontecido com
 * `compositionUnit`. Sem o campo, uma obra viaria tinha "Sinalizacao viaria"
 * classificada como nao-custo-direto (por causa de "sinalizac") e era acusada
 * de R$ 1.389/m2 quando tinha R$ 1.528/m2.
 *
 * Ordem de confianca: campo explicito > classificacao pelo item de EAP. O
 * chamador DEVE preencher `custoDireto`; o fallback existe para nao quebrar,
 * nao para ser a fonte.
 */
const RADICAIS_NAO_CUSTO_DIRETO_FALLBACK = ["administrac", "licenc", "projeto executiv", "projeto basic", "as built", "comissionament", "mobilizac", "desmobilizac", "documentac"];

function ehCustoDireto(it: ItemOrcamentoParaCoerencia): boolean {
  if (typeof it.custoDireto === "boolean") return it.custoDireto;
  return !contemAlgum(it.description, RADICAIS_NAO_CUSTO_DIRETO_FALLBACK);
}

/** Atividade de elemento que so existe depois da infraestrutura. */
function ehElementoSuperior(wbsCode: string): boolean {
  return /^1\.(4|5|6|7|8|9|10|11|12|13|14|15)\./.test(wbsCode);
}

/**
 * CUB declarado pela obra (R$/m2).
 *
 * R6-02: devolve o CUB SOMENTE quando os tres campos estao presentes e o valor
 * e positivo. Valor sem UF/mes nao e referencia — nao da para dizer de onde o
 * numero veio. A obra que nao declara (ou declara pela metade) fica sem CUB:
 * o sistema nao inventa parametro de custo para poder acusar.
 */
function cubDeclaradoDaObra(
  obra: Pick<ObraParaCoerencia, "cubValor" | "cubUf" | "cubMes">,
): { valor: number; uf: string; mes: string } | null {
  const valor = obra.cubValor;
  const uf = obra.cubUf?.trim();
  const mes = obra.cubMes?.trim();
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return null;
  if (!uf || !mes) return null;
  return { valor, uf, mes };
}

/**
 * Campos do CUB que faltam declarar, na ordem em que o engenheiro os preenche.
 *
 * Serve para NOMEAR o estado parcial. Se os tres faltam, a obra nao declarou
 * CUB; se um ou dois faltam, a declaracao esta incompleta e a cobertura diz
 * QUAL campo falta — tratar parcial como "nao declarado" esconderia metade da
 * causa e mandaria o engenheiro procurar o problema no lugar errado.
 */
function cubCamposFaltantes(
  obra: Pick<ObraParaCoerencia, "cubValor" | "cubUf" | "cubMes">,
): string[] {
  const faltantes: string[] = [];
  const valor = obra.cubValor;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) faltantes.push("valor");
  if (!obra.cubUf?.trim()) faltantes.push("UF");
  if (!obra.cubMes?.trim()) faltantes.push("mes de referencia");
  return faltantes;
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

  // --------------------------------------------------------------- cobertura
  //
  // Cada regra declara quantos candidatos conseguiu avaliar e por que os outros
  // ficaram fora. O motivo e sempre NOMEADO. Nenhuma severidade e alterada por
  // isto — e declaracao de ALCANCE, nao achado.
  const cobertura: CoberturaRegra[] = [];
  const contar = (exclusoes: Map<string, number>, motivo: string) =>
    exclusoes.set(motivo, (exclusoes.get(motivo) ?? 0) + 1);
  const registrarAlcance = (
    regra: string,
    universo: CoberturaRegra["universo"],
    total: number,
    avaliados: number,
    exclusoes: Map<string, number>,
    nota: string | null = null,
  ) => {
    const motivos = [...exclusoes.entries()]
      .filter(([, n]) => n > 0)
      .map(([motivo, itens]) => ({ motivo, itens }))
      .sort((a, b) => b.itens - a.itens);
    cobertura.push({
      regra,
      universo,
      total,
      avaliados,
      fora: motivos.reduce((s, m) => s + m.itens, 0),
      motivo: motivos[0]?.motivo ?? null,
      motivos,
      nota,
    });
  };

  const atividades = input.atividades ?? [];
  const porCodigo = new Map<string, ItemOrcamentoParaCoerencia>();
  for (const it of input.itens) porCodigo.set(it.code, it);

  const composicaoPorId = new Map<number, ComposicaoParaCoerencia>();
  for (const c of input.composicoes) composicaoPorId.set(c.id, c);

  // Sistema construtivo da obra.
  //
  // R2-01: se a DESCRICAO da obra nao nomeia o sistema, a regra 2 inteira ficava
  // desligada — e o item que contradiz a obra passava. A EAP e um dado da obra:
  // quando um sistema aparece de forma consistente nos itens, e ele que a obra
  // declara. A mensagem diz qual foi a base (declarada na descricao ou inferida).
  const sistemaDeclarado = detectarSistema(input.obra.descricao ?? "");
  const sistemaDaObra = sistemaDeclarado !== "indefinido"
    ? sistemaDeclarado
    : inferirSistemaDosItens(input.itens);
  const sistemaInferido = sistemaDeclarado === "indefinido" && sistemaDaObra !== "indefinido";
  const obraEhMista = sistemaDaObra === "mista";

  // ---- 1. Natureza do servico: composicao de escritorio em item de execucao
  {
    const achados: string[] = [];
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    let valor = 0;
    let exemplo = "";
    for (const it of input.itens) {
      if (!it.compositionId) { contar(exclusoes, "sem composicao vinculada"); continue; }
      const comp = composicaoPorId.get(it.compositionId);
      const descComp = comp?.description ?? it.compositionDescription ?? "";
      const descItem = it.description;
      if (!descComp) {
        contar(exclusoes, comp ? "composicao sem descricao" : "composicao nao encontrada");
        continue;
      }
      avaliados++;

      if (contemAlgum(descComp, RADICAIS_ESCRITORIO) && contemAlgum(descItem, RADICAIS_EXECUCAO)) {
        achados.push(it.code);
        valor += it.quantity * it.unitPrice;
        if (!exemplo) exemplo = `"${it.description}" (${it.code}) -> "${it.compositionCode} — ${descComp}"`;
      }
    }
    registrarAlcance("1. natureza do servico", "itens", input.itens.length, avaliados, exclusoes);
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
  {
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
  if (!obraEhMista && sistemaDaObra !== "indefinido") {
    const achados: string[] = [];
    for (const it of input.itens) {
      const descItem = it.description;
      const sistemaDoItem = detectarSistema(descItem);
      if (sistemaDoItem === "indefinido") { contar(exclusoes, "item sem sistema construtivo reconhecivel"); continue; }
      if (sistemaDoItem === "mista") { contar(exclusoes, "item declara sistema misto (nao comparavel a um sistema unico)"); continue; }
      avaliados++;
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
          `(${sistemaDaObra.replace("_", " ")}` +
          `${sistemaInferido ? ", inferido da maioria dos itens — a obra nao nomeia o sistema na descricao" : ""}). ` +
          `Itens: ${achados.slice(0, 8).join(", ")}` +
          `${achados.length > 8 ? ` (+${achados.length - 8})` : ""}.`,
      });
    }
  } else if (sistemaDaObra === "indefinido") {
    // R2-01 (fechamento): a regra NAO PODE ficar silenciosa quando nao consegue
    // avaliar. Obra sem sistema na descricao E sem nenhum item que declare um
    // sistema reconhecivel = a checagem nao rodou, e a AUSENCIA de achado seria
    // lida como "obra coerente". Aqui a nao-avaliacao e declarada ao usuario,
    // como conferencia (nunca error: nao ha dado para acusar).
    for (const _ of input.itens) contar(exclusoes, "obra sem sistema construtivo declarado nem inferivel");
    add({
      severity: "warning",
      dominio: "orcamento",
      code: "eng_sistema_construtivo_nao_avaliavel",
      refs: [],
      message:
        "A regra 2 NAO PODE SER AVALIADA: a obra nao declara o sistema construtivo na descricao " +
        "e nenhum item da EAP declara um sistema reconhecivel. Declarar o sistema da obra " +
        "(na descricao ou na tipologia) habilita a verificacao. " +
        "ATENCAO: nao haver achado de incompatibilidade aqui NAO significa que a obra e coerente — " +
        "significa que ela nao foi verificada.",
    });
  } else {
    // Obra MISTA: a regra nao acusa por decisao (a obra declara os dois sistemas).
    // Isto e uma NAO-AVALIACAO declarada, nao um "nao ha nada a ver".
    for (const _ of input.itens) contar(exclusoes, "obra declara sistema misto: a regra nao avalia por decisao");
  }
    registrarAlcance("2. sistema construtivo incompativel", "itens", input.itens.length, avaliados, exclusoes);
  }

  // ---- 3. Resistencia do concreto em elemento estrutural
  {
    const achados: string[] = [];
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    let exemplo = "";
    for (const it of input.itens) {
      // Ordem dos motivos = ordem de ACAO para o engenheiro. O item que nao e elemento
      // estrutural esta fora da regra independente da composicao; o que e estrutural mas
      // nao tem composicao vinculada precisa VINCULAR — dizer "a composicao nao cita
      // concreto" para um item sem composicao manda procurar o que nao existe.
      if (!contemAlgum(it.description, RADICAIS_ESTRUTURAIS)) { contar(exclusoes, "item nao e elemento estrutural"); continue; }
      if (!it.compositionId) { contar(exclusoes, "sem composicao vinculada"); continue; }
      const descComp = it.compositionDescription ?? "";
      if (!descComp) { contar(exclusoes, "composicao sem descricao"); continue; }
      if (!contemRadical(descComp, "concret")) { contar(exclusoes, "composicao nao cita concreto"); continue; }
      const fck = fckDeConcreto(descComp);
      if (fck == null) { contar(exclusoes, "fck nao declarado na composicao"); continue; }
      avaliados++;
      if (fck >= FCK_MINIMO_ESTRUTURAL) continue;
      achados.push(it.code);
      if (!exemplo) exemplo = `"${it.description}" (${it.code}) usa fck=${fck} MPa`;
    }
    registrarAlcance("3. resistencia do concreto", "itens", input.itens.length, avaliados, exclusoes);
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
  //   (a) R4-01: a banda era SIMETRICA em torno da razao 1,0 — isto e, centrada
  //       em BDI = 0% em silencio. Um BDI de 25%, rotina em obra publica, caia
  //       fora e virava error em massa. Agora o esperado e (1 + BDI DECLARADO da
  //       obra) e a mensagem cita o valor usado. SEM BDI declarado o achado e
  //       WARNING de conferencia, nunca error: assumir 0% para poder acusar e
  //       exatamente o que produzia o falso positivo. Mesma logica do CUB
  //       declarado por obra — nao se inventa parametro de custo.
  //   (b) quando a UNIDADE do item difere da unidade da composicao, a
  //       divergencia de valor e efeito da unidade, nao do preco. O campo
  //       compositionUnit existia no contrato e nunca era lido. Agora e lido e
  //       o achado muda de natureza.
  {
    const TOLERANCIA_PRECO = 0.1; // 10% em torno do esperado, nao em torno de 1,0
    const bdi = typeof input.obra.bdiDeclarado === "number" ? input.obra.bdiDeclarado : null;
    const esperado = 1 + (bdi ?? 0);
    const pctBdi = bdi == null ? null : Math.round(bdi * 100);
    const achadosPreco: string[] = [];
    const achadosUnidade: string[] = [];
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    let exemplo = "";

    for (const it of input.itens) {
      if (!it.compositionId) { contar(exclusoes, "sem composicao vinculada"); continue; }
      const unitItem = normUnidade(it.unit);
      const unitComp = normUnidade(it.compositionUnit);
      if (unitComp && unitItem && unitComp !== unitItem) {
        contar(exclusoes, "unidade divergente da composicao");
        achadosUnidade.push(it.code);
        continue; // divergencia de unidade explica o valor; nao acusar preco
      }
      if (it.somaComponentes == null || it.somaComponentes <= 0) { contar(exclusoes, "soma de componentes indisponivel"); continue; }
      if (it.unitPrice <= 0) { contar(exclusoes, "preco do item nao informado"); continue; }
      avaliados++;
      const razao = it.unitPrice / it.somaComponentes;
      if (razao > esperado * (1 + TOLERANCIA_PRECO) || razao < esperado * (1 - TOLERANCIA_PRECO)) {
        achadosPreco.push(it.code);
        if (!exemplo)
          exemplo =
            `"${it.description}" (${it.code}) a R$ ${brl(it.unitPrice)}/${it.unit} contra ` +
            `R$ ${brl(it.somaComponentes)} dos componentes de ${it.compositionCode} ` +
            `(razao ${razao.toFixed(2)}, esperado ${esperado.toFixed(2)})`;
      }
    }
    registrarAlcance(
      "4. preco sem lastro",
      "itens",
      input.itens.length,
      avaliados,
      exclusoes,
      // R6-02: a regra RODA sem BDI declarado — os itens nao estao "fora", por
      // isso o estado da declaracao vira NOTA da regra, e nao motivo de exclusao.
      bdi == null
        ? "obra nao declarou BDI — a comparacao de preco assume BDI 0% e vale como CONFERENCIA, nao como verificacao"
        : null,
    );

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
        // BDI declarado -> ha parametro e o desvio e medido contra ele: ERROR.
        // Sem BDI declarado -> WARNING de conferencia: nao se assume 0% para
        // poder acusar (R4-01).
        severity: bdi == null ? "warning" : "error",
        dominio: "orcamento",
        code: "eng_preco_sem_lastro",
        refs: achadosPreco,
        message:
          `${achadosPreco.length} item(ns) com preco divergindo mais de ${Math.round(TOLERANCIA_PRECO * 100)}% ` +
          `do esperado para a propria composicao (` +
          `${pctBdi == null
            ? "a obra NAO declara BDI: a comparacao assume BDI 0% e vale como CONFERENCIA, nao como acusacao — declarar o BDI da obra transforma isto em verificacao"
            : `soma dos componentes (custo direto) + BDI declarado de ${pctBdi}%`}). ` +
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
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    for (const c of input.composicoes) {
      if (c.totalComponentes === 0) { contar(exclusoes, "composicao sem componentes"); continue; }
      avaliados++;
      if (c.componentesComPreco === 0) { semPreco.push(c.code); continue; }
      const cobertura = c.componentesComPreco / c.totalComponentes;
      if (cobertura < LIMIAR_COBERTURA) parcial.push(c.code);
    }
    registrarAlcance("5. cobertura de preco da composicao", "composicoes", input.composicoes.length, avaliados, exclusoes);
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

  // ---- 6. Custo por m2 abaixo do CUB declarado
  //
  // Correcoes da auditoria (a/b/c) mais o R6-02:
  //   (a) a regra estava MORTA no app: o chamador passava area nula. Sem area,
  //       ela nao roda E ISSO NAO E SILENCIO — a cobertura nomeia o motivo.
  //   (b) o numerador era o orcamento TOTAL (com administracao, licencas,
  //       servicos de escritorio). O CUB e CUSTO DIRETO de construcao.
  //       Comparar os dois inflava o R$/m2 e fazia a regra acusar de menos.
  //   (c) o piso era R$ 2.500/m2 * 0,6 — um CUB INVENTADO pelo sistema.
  //       R6-02: a referencia passa a ser o CUB que a OBRA DECLARA (valor + UF
  //       + mes). Sem CUB declarado a regra NAO RODA — o sistema nao inventa
  //       parametro de custo para poder acusar. A cobertura nomeia
  //       "obra nao declarou CUB"; se a declaracao estiver incompleta, nomeia
  //       QUAL campo falta (parcial != nao declarado). O piso de 60% do CUB
  //       declarado continua sendo HEURISTICA, e a mensagem diz isso e cita
  //       valor, UF e mes declarados.
  {
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    const cub = cubDeclaradoDaObra(input.obra);
    const faltantes = cubCamposFaltantes(input.obra);
    if (!cub) {
      const motivo = faltantes.length === 3
        ? "obra nao declarou CUB"
        : `declaracao de CUB incompleta (falta ${faltantes.join(", ")})`;
      for (const _ of input.itens) contar(exclusoes, motivo);
    } else if (!input.obra.areaConstruida || input.obra.areaConstruida <= 0) {
      for (const _ of input.itens) contar(exclusoes, "obra sem area construida");
    } else {
      const diretos = input.itens.filter(ehCustoDireto);
      for (const it of input.itens) {
        if (!ehCustoDireto(it)) contar(exclusoes, "item nao e custo direto de construcao");
      }
      const totalDireto = diretos.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      if (totalDireto > 0) {
        avaliados = diretos.length;
        const porM2 = totalDireto / input.obra.areaConstruida;
        const FRACAO_PISO_CUB = 0.6; // heuristica declarada — ver mensagem
        const piso = cub.valor * FRACAO_PISO_CUB;
        if (porM2 < piso) {
          add({
            severity: "warning",
            dominio: "orcamento",
            code: "eng_custo_m2_abaixo_referencia",
            refs: [input.obra.nome],
            message:
              `Custo direto por m2 e R$ ${brl(porM2)} (R$ ${brl(totalDireto)} de ${diretos.length} itens de custo ` +
              `direto / ${input.obra.areaConstruida} m2${input.obra.areaConstruidaFonte ? ` — area ${input.obra.areaConstruidaFonte}` : ""}). ` +
              `Abaixo do piso de R$ ${brl(piso)}/m2 = 60% do CUB declarado pela obra (R$ ${brl(cub.valor)}/m2 — ` +
              `${cub.uf}, referencia ${cub.mes}). ` +
              `O piso de 60% e heuristica sobre o CUB declarado: confirme antes de concluir subestimacao.`,
          });
        }
      } else {
        for (const _ of diretos) contar(exclusoes, "custo direto sem valor informado");
      }
    }
    registrarAlcance("6. custo por m2", "itens", input.itens.length, avaliados, exclusoes);
  }

  // ---- 7. Unidade divergente entre orcamento e cronograma
  {
    const achados: string[] = [];
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    for (const a of atividades) {
      const it = porCodigo.get(a.wbsCode);
      if (!it) { contar(exclusoes, "atividade sem item correspondente no orcamento"); continue; }
      if (!a.unit) { contar(exclusoes, "atividade sem unidade"); continue; }
      avaliados++;
      if (normUnidade(it.unit) !== normUnidade(a.unit)) achados.push(a.wbsCode);
    }
    registrarAlcance("7. unidade orcamento x cronograma", "atividades", atividades.length, avaliados, exclusoes);
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

  // ---- 8. Superestrutura: decomposicao por nivel E plausibilidade de duracao
  //
  // Revisao 3 (achado R8-03 da verificacao): a versao anterior tinha as duas
  // condicoes mutuamente exclusivas, entao o ramo de ERROR era INALCANCAVEL:
  // `pavimentos` so vinha preenchido com >=2 subniveis "1.4.N.M", mas QUALQUER
  // "1.4.N." ja ligava `temSubnivel` e desligava a regra. Quando o chamador
  // conseguia medir, a regra nao rodava; quando rodava, o numero nao existia.
  // Resultado: a mensagem "a obra declara N pavimentos" descrevia um caminho
  // que o app nunca alcancava — e o diagnostico util ("16 dias para 6
  // pavimentos e implausivel") era impossivel de emitir.
  //
  // Agora sao DUAS checagens independentes:
  //   (a) SEM decomposicao -> nao da para avaliar o ciclo. Error se a obra
  //       declara mais de um pavimento (e ai a ausencia e defeito), warning se
  //       nao declara (nao sabemos a escala).
  //   (b) COM decomposicao -> os niveis existem, entao da para checar se a
  //       duracao POR NIVEL e plausivel. E onde o dado fica util.
  {
    const estrutura = atividades.filter(a => /^1\.4(\.|$)/.test(a.wbsCode));
    const niveis = new Set(
      estrutura.map(a => /^1\.4\.\d+\.(\d+)/.exec(a.wbsCode)?.[1]).filter((x): x is string => Boolean(x)),
    );
    const temSubnivel = niveis.size > 0;

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
    } else if (temSubnivel && niveis.size >= 2) {
      // Ha decomposicao: checar plausibilidade POR NIVEL. E aqui que o numero
      // de pavimentos deixa de ser decoracao e vira medida.
      const porNivel = new Map<string, number>();
      for (const a of estrutura) {
        const n = /^1\.4\.\d+\.(\d+)/.exec(a.wbsCode)?.[1];
        if (!n) continue;
        porNivel.set(n, (porNivel.get(n) ?? 0) + a.durationDays);
      }
      const duracoes = [...porNivel.values()];
      const minNivel = Math.min(...duracoes);
      // Um ciclo de pavimento em concreto armado leva 2-4 semanas (10-20 dias
      // uteis) so de forma/armadura/concretagem/cura/desforma. Abaixo de 5 dias
      // por nivel nao ha ciclo representado — ha um numero digitado.
      const MINIMO_CICLO_NIVEL = 5;
      if (minNivel < MINIMO_CICLO_NIVEL) {
        const nivelCurto = [...porNivel.entries()].sort((a, b) => a[1] - b[1])[0];
        add({
          severity: "error",
          dominio: "cronograma",
          code: "eng_ciclo_pavimento_implausivel",
          refs: [...porNivel.keys()].map(n => `1.4.*.${n}`),
          message:
            `A superestrutura esta decomposta em ${niveis.size} niveis, mas o nivel ${nivelCurto[0]} soma ` +
            `apenas ${nivelCurto[1]} dia(s). Um ciclo de pavimento em concreto armado (forma, armadura, ` +
            `concretagem, cura, desforma) leva semanas — menos de ${MINIMO_CICLO_NIVEL} dias por nivel ` +
            `nao representa ciclo construtivo.`,
        });
      }
    }
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    for (const a of atividades) {
      if (!/^1\.4(\.|$)/.test(a.wbsCode)) { contar(exclusoes, "atividade fora da superestrutura"); continue; }
      if (estrutura.length > 0 && (!temSubnivel || niveis.size >= 2)) { avaliados++; continue; }
      contar(exclusoes, "superestrutura em nivel unico: nao ha ciclo entre niveis para comparar");
    }
    registrarAlcance("8. superestrutura e ciclo de pavimento", "atividades", atividades.length, avaliados, exclusoes);
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
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    if (fimFundacao != null && fimFundacao > 0) {
      const achados: string[] = [];
      let exemplo = "";
      for (const a of atividades) {
        if (!ehElementoSuperior(a.wbsCode)) { contar(exclusoes, "atividade que nao e elemento superior"); continue; }
        if (a.earlyStart == null) { contar(exclusoes, "atividade sem inicio (earlyStart) calculado"); continue; }
        avaliados++;
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
    } else {
      for (const _ of atividades) contar(exclusoes, "obra sem fundacao (1.3.2) com termino no CPM");
    }
    registrarAlcance("9. sequencia construtiva", "atividades", atividades.length, avaliados, exclusoes);
  }

  // ---- 10. Atividade sem predecessor
  //
  // Revisao 3 (sugestao da verificacao): distinguir DADO de ENGENHARIA.
  //
  // A flag `semPredecessor` vem de uma consulta filtrada por versionId. Se as
  // atividades tiverem versao e as dependencias nao, o conjunto volta VAZIO e
  // TODA atividade vira "sem predecessor". O engenheiro veria 200 erros,
  // concluiria que a regra e ruim e pararia de ler.
  //
  // Entao: quando NENHUMA atividade tem predecessor, o problema nao e o
  // cronograma — e o vinculo de versao. Isso e achado de DADO, com um achado
  // so, e a mensagem diz onde olhar. Acusar a obra pelo encanamento e o que
  // faz o usuario desligar o validador.
  {
    const PODE_COMECAR_SEM_PREDECESSOR = /^1\.(1|2)\./;
    const exclusoes = new Map<string, number>();
    let avaliados = 0;
    for (const a of atividades) {
      if (PODE_COMECAR_SEM_PREDECESSOR.test(a.wbsCode)) {
        contar(exclusoes, "atividade que pode comecar sem predecessor (frente de inicio)");
        continue;
      }
      avaliados++;
    }
    registrarAlcance("10. atividade sem predecessor", "atividades", atividades.length, avaliados, exclusoes);
    const candidatas = atividades.filter(a => !PODE_COMECAR_SEM_PREDECESSOR.test(a.wbsCode));
    const semPred = candidatas.filter(a => a.semPredecessor);

    const todasSemPred = candidatas.length > 1 && semPred.length === candidatas.length;
    if (todasSemPred) {
      add({
        severity: "error",
        dominio: "cronograma",
        code: "eng_dependencias_ausentes_para_a_versao",
        refs: candidatas.map(a => a.wbsCode),
        message:
          `Nenhuma das ${candidatas.length} atividades tem predecessor. Isso nao e um cronograma em serie: ` +
          `e ausencia de vinculo — provavelmente as atividades estao numa versao do plano e as dependencias ` +
          `em nenhuma, ou em outra. Verifique o vinculo de versao antes de tratar como erro de rede.`,
      });
    } else if (semPred.length) {
      add({
        severity: "error",
        dominio: "cronograma",
        code: "eng_atividade_sem_predecessor",
        refs: semPred.map(a => a.wbsCode),
        message:
          `${semPred.length} atividade(s) sem predecessor entram no CPM comecando no dia zero, como se ` +
          `pudessem ser executadas sem nada antes. Itens: ${semPred.map(a => a.wbsCode).slice(0, 10).join(", ")}` +
          `${semPred.length > 10 ? ` (+${semPred.length - 10})` : ""}.`,
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
      cobertura,
    },
  };
}
