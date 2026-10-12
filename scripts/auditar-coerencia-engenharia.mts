/**
 * AUDITORIA EXECUTAVEL das regras de coerencia de engenharia.
 *
 * Nao e teste: e um REPRODUTOR. Cada cena monta uma situacao real de obra e
 * pergunta "que caso faz esta regra errar?" — falso positivo (acusa demais) e
 * falso negativo (acusa de menos). A saida e a evidencia da auditoria em
 * docs/AUDITORIA-COERENCIA-ENGENHARIA.md.
 *
 * NAO toca banco, NAO altera dados. Roda com:
 *   npx tsx scripts/auditar-coerencia-engenharia.mts
 *   npx tsx scripts/auditar-coerencia-engenharia.mts --json
 *
 * Cada cena tem uma HIPOTESE. Se a saida disser "NAO CONFIRMOU", a hipotese
 * estava errada — e o relatorio registra isso tambem. Auditoria que so confirma
 * a si mesma nao audita nada.
 */

import {
  validarCoerenciaEngenharia,
  type AtividadeParaCoerencia,
  type CoerenciaInput,
  type ComposicaoParaCoerencia,
  type ItemOrcamentoParaCoerencia,
  type ObraParaCoerencia,
} from "../server/construction/coerencia-engenharia";

// --------------------------------------------------------------- construtores

function obra(over: Partial<ObraParaCoerencia> = {}): ObraParaCoerencia {
  return {
    projectId: 7,
    nome: "AURORA TESTE",
    tipoDeObra: "edificio",
    descricao: "A estrutura principal sera em concreto armado, incluindo fundacoes, pilares, vigas, lajes e demais elementos estruturais.",
    pavimentos: 6,
    ...over,
  };
}

function item(over: Partial<ItemOrcamentoParaCoerencia>): ItemOrcamentoParaCoerencia {
  return {
    code: "1.0",
    description: "Item",
    unit: "m2",
    quantity: 100,
    unitPrice: 10,
    ...over,
  };
}

function comp(over: Partial<ComposicaoParaCoerencia>): ComposicaoParaCoerencia {
  return {
    id: 1,
    code: "C0001",
    description: "Composicao",
    unit: "m2",
    status: "validada",
    somaComponentes: 0,
    componentesComPreco: 0,
    totalComponentes: 1,
    ...over,
  };
}

/**
 * O chamador le `plannedQuantity` do BANCO (schedule_activities), mas esse campo
 * nao faz parte do contrato do validador (AtividadeParaCoerencia). Tipo local so
 * para reproduzir a derivacao de area do chamador.
 */
type AtividadeDoChamador = AtividadeParaCoerencia & { plannedQuantity?: number | null };

function ativ(over: Partial<AtividadeDoChamador>): AtividadeDoChamador {
  return {
    id: 1,
    wbsCode: "1.1.1",
    name: "Atividade",
    durationDays: 5,
    unit: "un",
    plannedQuantity: 1,
    ...over,
  };
}

/**
 * Reproduz o chamador real (server/routers.ts:4115-4137), que e onde as
 * heuristicas de pavimentos e de area construida vivem. Sem isto a auditoria
 * criticaria o validador por algo que e decisao do chamador.
 *
 * RODADA 2 (verify/coerencia-fixes): o chamador NAO inventa mais 6 pavimentos
 * quando tipoDeObra === 'edificio' — o fallback foi removido. A reproducao
 * abaixo ja reflete o chamador corrigido.
 */
function pavimentosDoChamador(atividades: AtividadeDoChamador[]): number | null {
  const declarados = [...new Set(atividades.map(a => /^1\.4\.\d+\.(\d+)/.exec(a.wbsCode)?.[1]).filter(Boolean))];
  return declarados.length > 1 ? declarados.length : null;
}

/**
 * Area construida do chamador (routers.ts:4130-4134): a MAIOR area de piso
 * declarada nas atividades em m2, nao a soma. Reproduzido aqui porque e a
 * decisao que alimenta a regra 6 — e ela pode esconder subestimacao (R6-03).
 */
function areaDoChamador(atividades: AtividadeDoChamador[]): number | null {
  const candidatos = atividades
    .filter(a => a.unit && /m2|m²/.test(String(a.unit)) && Number(a.plannedQuantity) > 0)
    .filter(a => /contrapis|revestiment.*pis|piso|forr/i.test(a.name))
    .map(a => Number(a.plannedQuantity));
  return candidatos.length ? Math.max(...candidatos) : null;
}

// ------------------------------------------------------------------- as cenas

type Cena = {
  id: string;
  regra: string;
  hipotese: string;
  /** true = a hipotese diz que a regra ACUSA (acha o codigo) */
  esperaAcusar: boolean;
  /** codigo do achado observado; se omitido, qualquer achado conta */
  code: string;
  input: CoerenciaInput;
};

const CASO_AURORA: ItemOrcamentoParaCoerencia = item({
  code: "1.13.2",
  description: "Drenagem externa",
  unit: "m",
  quantity: 350,
  unitPrice: 4137.19,
  compositionId: 22195,
  compositionCode: "C0584",
  compositionDescription: "CADASTRO DE REDE DE ESGOTO/EMISSARIO/DRENAGEM (MEIO MAGNETICO)",
  compositionUnit: "M",
  somaComponentes: 0,
});

const C_AURORA = comp({
  id: 22195,
  code: "C0584",
  description: "CADASTRO DE REDE DE ESGOTO/EMISSARIO/DRENAGEM (MEIO MAGNETICO)",
  unit: "M",
  somaComponentes: 0,
  componentesComPreco: 0,
  totalComponentes: 9,
});

const CONCRETO_15 = "CONCRETO P/VIBR., FCK=15MPa COM AGREGADO PRODUZIDO (S/ TRANSP.)";

const cenas: Cena[] = [
  // ----------------------------------------------------------- regra 1
  {
    id: "R1-01",
    regra: "1 natureza",
    hipotese: "CONTROLE: caso real da AURORA (Drenagem externa -> C0584 cadastro em meio magnetico) e acusado",
    esperaAcusar: true,
    code: "eng_natureza_servico_incompativel",
    input: { obra: obra(), itens: [CASO_AURORA], composicoes: [C_AURORA] },
  },
  {
    id: "R1-02",
    regra: "1 natureza",
    hipotese: "FALSO NEGATIVO: mesmo caso, mas item chamado 'Instalacoes hidrossanitarias' (plural) NAO e acusado",
    esperaAcusar: false,
    code: "eng_natureza_servico_incompativel",
    input: { obra: obra(), itens: [{ ...CASO_AURORA, description: "Instalacoes hidrossanitarias" }], composicoes: [C_AURORA] },
  },
  {
    id: "R1-03",
    regra: "1 natureza",
    hipotese: "FALSO NEGATIVO: composicao de projeto puro ('ELABORACAO DE PROJETO DE DRENAGEM') NAO e acusada (nao esta no vocabulario)",
    esperaAcusar: false,
    code: "eng_natureza_servico_incompativel",
    input: {
      obra: obra(),
      itens: [item({
        code: "1.13.2", description: "Drenagem externa", unit: "m", quantity: 350, unitPrice: 4137.19,
        compositionId: 9001, compositionCode: "C9001",
        compositionDescription: "ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO",
        compositionUnit: "M", somaComponentes: 0,
      })],
      composicoes: [comp({ id: 9001, code: "C9001", description: "ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO", unit: "M", totalComponentes: 3 })],
    },
  },
  {
    id: "R1-04",
    regra: "1 natureza",
    hipotese: "FALSO POSITIVO: composicao de EXECUCAO que menciona 'projeto executivo e as built' e acusada como servico de escritorio",
    esperaAcusar: true,
    code: "eng_natureza_servico_incompativel",
    input: {
      obra: obra(),
      itens: [item({
        code: "1.8.1", description: "Instalacao de agua fria", unit: "m", quantity: 800, unitPrice: 62,
        compositionId: 9002, compositionCode: "C9002",
        compositionDescription: "INSTALACAO DE AGUA FRIA - EXECUCAO INCLUSIVE PROJETO EXECUTIVO E AS BUILT",
        compositionUnit: "M", somaComponentes: 55,
      })],
      composicoes: [comp({ id: 9002, code: "C9002", description: "INSTALACAO DE AGUA FRIA - EXECUCAO INCLUSIVE PROJETO EXECUTIVO E AS BUILT", unit: "M", somaComponentes: 55, componentesComPreco: 4, totalComponentes: 4 })],
    },
  },

  // ----------------------------------------------------------- regra 2
  {
    id: "R2-01",
    regra: "2 sistema",
    hipotese: "FALSO NEGATIVO: obra sem o sistema escrito na descricao ('Edificio de 6 pavimentos') desliga a regra inteira",
    esperaAcusar: false,
    code: "eng_sistema_construtivo_incompativel",
    input: {
      obra: obra({ descricao: "Edificio de 6 pavimentos com area construida de 7200 m2." }),
      itens: [item({ code: "1.4.3", description: "Lajes - Alvenaria estrutural bloco concreto 19x19x39", unit: "m3", quantity: 320, unitPrice: 348.6 })],
      composicoes: [],
    },
  },
  {
    id: "R2-02",
    regra: "2 sistema",
    hipotese: "FALSO POSITIVO: cobertura em estrutura metalica de aco numa obra de concreto armado (solucao corrente) e acusada",
    esperaAcusar: true,
    code: "eng_sistema_construtivo_incompativel",
    input: {
      obra: obra(),
      itens: [item({ code: "1.6.1", description: "Estrutura metalica da cobertura - trelica de aco", unit: "kg", quantity: 18000, unitPrice: 12.4 })],
      composicoes: [],
    },
  },
  {
    id: "R2-03",
    regra: "2 sistema",
    hipotese: "FALSO POSITIVO: obra declarada 'mista' (concreto + alvenaria estrutural) acusa item de alvenaria estrutural, que ela mesma declara",
    esperaAcusar: true,
    code: "eng_sistema_construtivo_incompativel",
    input: {
      obra: obra({ descricao: "Estrutura em concreto armado nos andares tipo e alvenaria estrutural nos pavimentos de base." }),
      itens: [item({ code: "1.5.1", description: "Alvenaria estrutural bloco de concreto 19x19x39", unit: "m2", quantity: 3200, unitPrice: 148 })],
      composicoes: [],
    },
  },

  // ----------------------------------------------------------- regra 3
  {
    id: "R3-01",
    regra: "3 fck",
    hipotese: "FALSO NEGATIVO: item 'Fundacoes' (plural) com concreto FCK=15 nao e acusado — 'fundacoes' nao contem 'fundacao'",
    esperaAcusar: false,
    code: "eng_concreto_resistencia_insuficiente",
    input: {
      obra: obra(),
      itens: [item({ code: "1.3.2", description: "Fundacoes", unit: "m3", quantity: 220, unitPrice: 348.6, compositionId: 22988, compositionCode: "C3270", compositionDescription: CONCRETO_15, compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 22988, code: "C3270", description: CONCRETO_15, unit: "M3", somaComponentes: 91.99, componentesComPreco: 2, totalComponentes: 6 })],
    },
  },
  {
    id: "R3-02",
    regra: "3 fck",
    hipotese: "FALSO POSITIVO: C20 (permitido pela NBR 6118 para concreto estrutural) e acusado como ERROR em 'Sapatas'",
    esperaAcusar: true,
    code: "eng_concreto_resistencia_insuficiente",
    input: {
      obra: obra(),
      itens: [item({ code: "1.3.1", description: "Sapatas isoladas em concreto armado", unit: "m3", quantity: 45, unitPrice: 520, compositionId: 9100, compositionCode: "C9100", compositionDescription: "CONCRETO USINADO BOMBEADO FCK=20MPA", compositionUnit: "M3", somaComponentes: 505 })],
      composicoes: [comp({ id: 9100, code: "C9100", description: "CONCRETO USINADO BOMBEADO FCK=20MPA", unit: "M3", somaComponentes: 505, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },
  {
    id: "R3-03",
    regra: "3 fck",
    hipotese: "FALSO NEGATIVO: item chamado apenas 'Estrutura' com FCK=15 nao e acusado ('estrutura' saiu da lista de elementos)",
    esperaAcusar: false,
    code: "eng_concreto_resistencia_insuficiente",
    input: {
      obra: obra(),
      itens: [item({ code: "1.4", description: "Estrutura", unit: "m3", quantity: 900, unitPrice: 348.6, compositionId: 22988, compositionCode: "C3270", compositionDescription: CONCRETO_15, compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 22988, code: "C3270", description: CONCRETO_15, unit: "M3", somaComponentes: 91.99, componentesComPreco: 2, totalComponentes: 6 })],
    },
  },

  // ----------------------------------------------------------- regra 4
  {
    id: "R4-01",
    regra: "4 preco",
    hipotese: "FALSO POSITIVO: item com BDI de 25% sobre a composicao (faixa usual em obra publica) e acusado — a banda e +-20%",
    esperaAcusar: true,
    code: "eng_preco_sem_lastro",
    input: {
      obra: obra(),
      itens: [item({ code: "1.4.1", description: "Pilares", unit: "m3", quantity: 80, unitPrice: 114.99, compositionId: 9200, compositionCode: "C9200", compositionDescription: "CONCRETO FCK=30MPA", compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 9200, code: "C9200", description: "CONCRETO FCK=30MPA", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },
  {
    id: "R4-02",
    regra: "4 preco",
    hipotese: "FALSO NEGATIVO: o caso dos R$ 1,4 milhao (soma=0) NAO e acusado por 'preco sem lastro' — a regra pula soma<=0",
    esperaAcusar: false,
    code: "eng_preco_sem_lastro",
    input: { obra: obra(), itens: [CASO_AURORA], composicoes: [C_AURORA] },
  },
  {
    id: "R4-03",
    regra: "4 preco",
    hipotese: "FALSO POSITIVO: item em 'm' com composicao em 'm3' e acusado por 'preco sem lastro', quando a causa e a UNIDADE (compositionUnit nunca e consultada)",
    esperaAcusar: true,
    code: "eng_preco_sem_lastro",
    input: {
      obra: obra(),
      itens: [item({ code: "1.3.2", description: "Fundacoes", unit: "m", quantity: 220, unitPrice: 185, compositionId: 9300, compositionCode: "C9300", compositionDescription: "CONCRETO FCK=30MPA", compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 9300, code: "C9300", description: "CONCRETO FCK=30MPA", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },

  // ----------------------------------------------------------- regra 5
  {
    id: "R5-01",
    regra: "5 composicao sem preco",
    hipotese: "FALSO NEGATIVO: composicao com 1 de 50 componentes com preco nao e acusada, ainda que a soma seja inutil",
    esperaAcusar: false,
    code: "eng_composicao_sem_preco",
    input: {
      obra: obra(),
      itens: [],
      composicoes: [comp({ id: 9400, code: "C9400", description: "COMPOSICAO QUASE TODA SEM PRECO", unit: "M3", somaComponentes: 12.5, componentesComPreco: 1, totalComponentes: 50 })],
    },
  },

  // ----------------------------------------------------------- regra 6
  {
    id: "R6-01",
    regra: "6 custo/m2",
    hipotese: "RODADA 2: com area REAL o teste de custo/m2 agora roda — a morte da regra era o chamador passando null, e isso foi corrigido",
    esperaAcusar: true,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ areaConstruida: 7200 }),
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 5193043 })],
      composicoes: [],
    },
  },
  {
    id: "R6-02",
    regra: "6 custo/m2",
    hipotese: "FALSO POSITIVO (quando roda): galpao/obra simples a R$ 1.400/m2 cai abaixo do piso de R$ 1.500 e e acusado",
    esperaAcusar: true,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ areaConstruida: 7200 }),
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 1400 })],
      composicoes: [],
    },
  },

  {
    id: "R6-03",
    regra: "6 custo/m2",
    hipotese: "FALSO NEGATIVO NOVO: a area do chamador e o MAX (nao a soma) das areas de piso — com 2 pavimentos de 1.200 m2 ela vira 1.200 e a regra deixa de acusar uma obra a R$ 1.000/m2",
    esperaAcusar: false,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      // area do chamador = 1.200 (max), area real dos 2 pavimentos = 2.400
      obra: obra({
        areaConstruida: areaDoChamador([
          ativ({ id: 901, wbsCode: "1.7.1", name: "Contrapiso do pavimento tipo 01", durationDays: 5, unit: "m2", plannedQuantity: 1200 }),
          ativ({ id: 902, wbsCode: "1.7.2", name: "Contrapiso do pavimento tipo 02", durationDays: 5, unit: "m2", plannedQuantity: 1200 }),
        ]),
      }),
      itens: [item({ code: "1.4.1", description: "Concreto estrutural usinado", unit: "vb", quantity: 1, unitPrice: 2400000 })],
      composicoes: [],
    },
  },
  {
    id: "R6-04",
    regra: "6 custo/m2",
    hipotese: "FALSO POSITIVO NOVO: o chamador nunca preenche `custoDireto`, entao o numerador cai no heuristico por texto — 'Sinalizacao viaria' (custo direto numa obra viaria) sai da conta e a obra e acusada por R$ 1.389/m2 quando ela tem R$ 1.528/m2",
    esperaAcusar: true,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ areaConstruida: 7200 }),
      itens: [
        item({ code: "1.4.1", description: "Concreto estrutural usinado", unit: "vb", quantity: 1, unitPrice: 10000000 }),
        item({ code: "1.13.1", description: "Sinalizacao viaria horizontal e vertical", unit: "vb", quantity: 1, unitPrice: 1000000 }),
      ],
      composicoes: [],
    },
  },

  // ----------------------------------------------------------- regra 7
  {
    id: "R7-01",
    regra: "7 unidade",
    hipotese: "FALSO POSITIVO: 'und' no orcamento e 'un' no cronograma (mesma unidade) sao tratados como divergentes",
    esperaAcusar: true,
    code: "eng_unidade_divergente",
    input: {
      obra: obra(),
      itens: [item({ code: "1.9.1", description: "Portas", unit: "und", quantity: 40, unitPrice: 1250 })],
      composicoes: [],
      atividades: [ativ({ id: 400, wbsCode: "1.9.1", name: "Portas", unit: "un", plannedQuantity: 40 })],
    },
  },

  // ----------------------------------------------------------- regra 8
  {
    id: "R8-01",
    regra: "8 ciclo de pavimento",
    hipotese: "RODADA 2: sem pavimentos derivaveis a regra acusa como WARNING e NAO afirma numero (antes afirmava 6) — o chamador nao fabrica mais",
    esperaAcusar: true,
    code: "eng_estrutura_sem_ciclo_pavimento",
    input: {
      obra: obra({ pavimentos: pavimentosDoChamador([
        ativ({ id: 375, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3", plannedQuantity: 80, earlyStart: 19, earlyFinish: 27 }),
        ativ({ id: 377, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3", plannedQuantity: 320, earlyStart: 36, earlyFinish: 44 }),
      ]) }),
      itens: [],
      composicoes: [],
      atividades: [
        ativ({ id: 375, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3", plannedQuantity: 80, earlyStart: 19, earlyFinish: 27 }),
        ativ({ id: 377, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3", plannedQuantity: 320, earlyStart: 36, earlyFinish: 44 }),
      ],
    },
  },
  {
    id: "R8-02",
    regra: "8 ciclo de pavimento",
    hipotese: "FALSO NEGATIVO: mesma estrutura absurda numa obra sem tipoDeObra='edificio' — pavimentos vira null e a regra desaparece",
    esperaAcusar: false,
    code: "eng_estrutura_sem_ciclo_pavimento",
    input: {
      obra: obra({ tipoDeObra: "reforma", pavimentos: null }),
      itens: [],
      composicoes: [],
      atividades: [
        ativ({ id: 375, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3", plannedQuantity: 80, earlyStart: 19, earlyFinish: 27 }),
        ativ({ id: 377, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3", plannedQuantity: 320, earlyStart: 36, earlyFinish: 44 }),
      ],
    },
  },

  {
    id: "R8-03",
    regra: "8 ciclo de pavimento",
    hipotese: "RAMO DE ERROR INALCANCAVEL NO APP: quando o chamador CONSEGUE derivar pavimentos (aqui 2, de 1.4.1.1/1.4.1.2) o mesmo subnivel desliga a regra — a mensagem nunca mais volta a citar um numero (pavimentos!=null exige 1.4.N.M, que faz temSubnivel=true)",
    esperaAcusar: false,
    code: "eng_estrutura_sem_ciclo_pavimento",
    input: {
      obra: obra({
        pavimentos: pavimentosDoChamador([
          ativ({ id: 375, wbsCode: "1.4.1.1", name: "Formas dos pilares do 1o pavimento", durationDays: 4, unit: "m2", plannedQuantity: 600 }),
          ativ({ id: 376, wbsCode: "1.4.1.2", name: "Armaduras dos pilares do 1o pavimento", durationDays: 4, unit: "kg", plannedQuantity: 9000 }),
        ]),
      }),
      itens: [],
      composicoes: [],
      atividades: [
        ativ({ id: 375, wbsCode: "1.4.1.1", name: "Formas dos pilares do 1o pavimento", durationDays: 4, unit: "m2", plannedQuantity: 600, earlyStart: 19, earlyFinish: 23 }),
        ativ({ id: 376, wbsCode: "1.4.1.2", name: "Armaduras dos pilares do 1o pavimento", durationDays: 4, unit: "kg", plannedQuantity: 9000, earlyStart: 23, earlyFinish: 27 }),
      ],
    },
  },

  // ----------------------------------------------------------- regra 9
  {
    id: "R9-01",
    regra: "9 sequencia",
    hipotese: "FALSO NEGATIVO: com a fundacao comecando no dia 0 (caso normal) a regra nao roda — exige inicioFundacao > 0",
    esperaAcusar: false,
    code: "eng_sequencia_construtiva_invertida",
    input: {
      obra: obra(),
      itens: [],
      composicoes: [],
      atividades: [
        ativ({ id: 383, wbsCode: "1.6.1", name: "Estrutura da cobertura", durationDays: 6, unit: "m3", plannedQuantity: 18, earlyStart: 0, earlyFinish: 6 }),
        ativ({ id: 373, wbsCode: "1.3.2", name: "Fundacoes", durationDays: 7, unit: "m3", plannedQuantity: 220, earlyStart: 0, earlyFinish: 7 }),
      ],
    },
  },

  // ----------------------------------------------------------- regra 10 + metrica
  {
    id: "R10-01",
    regra: "10 sem predecessor",
    hipotese: "RUIDO: um cronograma com 12 atividades sem vinculo gera 12 achados de severity error, todos 'impedem execucao'",
    esperaAcusar: true,
    code: "eng_atividade_sem_predecessor",
    input: {
      obra: obra(),
      itens: [],
      composicoes: [],
      atividades: Array.from({ length: 12 }, (_, i) =>
        ativ({ id: 500 + i, wbsCode: `1.${i + 5}.1`, name: `Frente ${i + 1}`, durationDays: 20, unit: "un", plannedQuantity: 1, earlyStart: i, earlyFinish: i + 20, semPredecessor: true })
      ),
    },
  },
  {
    id: "R10-02",
    regra: "metrica",
    hipotese: "METRICA INFLADA: um erro de CRONOGRAMA (sem predecessor) joga o valor INTEGRAL do item de mesmo codigo em valorEmRisco",
    esperaAcusar: true,
    code: "eng_atividade_sem_predecessor",
    input: {
      obra: obra(),
      itens: [item({ code: "1.9.1", description: "Portas e esquadrias", unit: "un", quantity: 800, unitPrice: 1250 })],
      composicoes: [],
      atividades: [ativ({ id: 393, wbsCode: "1.9.1", name: "Portas e esquadrias", durationDays: 80, unit: "un", plannedQuantity: 800, earlyStart: 0, earlyFinish: 80, semPredecessor: true })],
    },
  },
];

// -------------------------------------------------------------------- execucao

const emitirJson = process.argv.includes("--json");

type ResultadoCena = {
  id: string;
  regra: string;
  hipotese: string;
  esperado: "acusa" | "silencia";
  observado: "acusa" | "silencia";
  confirmou: boolean;
  codigos: string[];
  severidade: string | null;
  erros: number;
  avisos: number;
  valorEmRisco: number;
  mensagem: string | null;
};

const resultados: ResultadoCena[] = cenas.map(c => {
  const r = validarCoerenciaEngenharia(c.input);
  const codigos = r.issues.map(i => i.code);
  const acusa = codigos.includes(c.code);
  const achado = r.issues.find(i => i.code === c.code);
  return {
    id: c.id,
    regra: c.regra,
    hipotese: c.hipotese,
    esperado: c.esperaAcusar ? "acusa" : "silencia",
    observado: acusa ? "acusa" : "silencia",
    confirmou: acusa === c.esperaAcusar,
    codigos: [...new Set(codigos)],
    severidade: achado?.severity ?? null,
    erros: r.resumo.erros,
    avisos: r.resumo.avisos,
    valorEmRisco: r.resumo.valorEmRisco,
    mensagem: achado?.message ?? null,
  };
});

if (emitirJson) {
  console.log(JSON.stringify({ cenas: resultados }, null, 2));
} else {
  let confirmadas = 0;
  for (const r of resultados) {
    const marca = r.confirmou ? "CONFIRMOU " : "NAO CONFIRMOU";
    if (r.confirmou) confirmadas++;
    console.log(`${marca} ${r.id} [${r.regra}] esperado=${r.esperado} observado=${r.observado}`);
    console.log(`           ${r.hipotese}`);
    console.log(`           achados=${r.codigos.join(",") || "(nenhum)"} erros=${r.erros} avisos=${r.avisos} valorEmRisco=${r.valorEmRisco.toFixed(2)}${r.severidade ? ` severity=${r.severidade}` : ""}`);
    if (r.mensagem) console.log(`           msg: ${r.mensagem}`);
    console.log("");
  }
  console.log(`Hipoteses confirmadas: ${confirmadas}/${resultados.length}`);
}
