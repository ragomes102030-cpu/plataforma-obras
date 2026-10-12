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

/**
 * CUB declarado pela obra (R6-02). R$ 2.500/m2 * 0,6 = R$ 1.500/m2 reproduz o
 * piso que a regra 6 usava antes: as cenas de regra 6 medem o MESMO alvo, agora
 * ancorado na declaracao da obra em vez de um numero inventado pelo sistema.
 */
const CUB_DECLARADO = { cubValor: 2500, cubUf: "SP", cubMes: "2026-09" } as const;

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
 * Area construida do chamador (routers.ts:4138-4158).
 *
 * RODADA 2: o chamador usava o MAX da area de piso — com 2 pavimentos de
 * 1.200 m2 a area virava 1.200, a obra aparecia 2x mais cara por m2 e a regra
 * acusava de MENOS (R6-03).
 *
 * RODADA 3: o chamador passou a SOMAR as areas de piso de cada NIVEL distinto.
 * Sem decomposicao por nivel, soma os itens de piso que nao se repetem —
 * contrapiso e revestimento do MESMO piso dobrariam, por isso usa o MAX dos
 * sem-nivel. A reproducao abaixo ja reflete o chamador corrigido.
 */
function areaDoChamador(atividades: AtividadeDoChamador[]): number | null {
  const itensDePiso = atividades.filter(
    a => a.unit && /m2|m²/.test(String(a.unit)) && Number(a.plannedQuantity) > 0 &&
         /contrapis|revestiment.*pis|revestiment.*piso/i.test(a.name)
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
  return somaPorNivel > 0 ? somaPorNivel : (semNivel.length ? Math.max(...semNivel) : null);
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
  /**
   * Severidade exigida do achado, quando ele e observado.
   * RODADA 3: permite travar "warning de conferencia" (R4-01 sem BDI declarado)
   * como comportamento esperado, nao como ausencia de achado.
   */
  severidade?: "error" | "warning";
  /**
   * Trecho que PRECISA aparecer na mensagem do achado.
   *
   * Existe porque achar o codigo nao basta: o achado da regra 5 estava correto
   * ("8 composicoes sem preco") e nao informava o que decide — quanto dinheiro
   * esta preso ali. Cena que so confere o codigo passaria com a mensagem vazia
   * de valor. Aqui o R$ e exigido no texto.
   */
  contemNoTexto?: string;
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
    hipotese: "CORRIGIDO (plural): o mesmo caso com o item 'Instalacoes hidrossanitarias' (plural) agora E acusado — a comparacao passou a ser por radical, nao por palavra inteira",
    esperaAcusar: true,
    code: "eng_natureza_servico_incompativel",
    input: { obra: obra(), itens: [{ ...CASO_AURORA, description: "Instalacoes hidrossanitarias" }], composicoes: [C_AURORA] },
  },
  {
    id: "R1-03",
    regra: "1 natureza",
    hipotese: "CORRIGIDO (R1-03): composicao de projeto puro ('ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO') agora E acusada — o vocabulario de escritorio foi ampliado",
    esperaAcusar: true,
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
    hipotese: "ABERTO POR DECISAO (R1-04): composicao de EXECUCAO que menciona 'projeto executivo e as built' segue acusada como servico de escritorio — o texto nao separa 'o projeto' (assunto) de 'projetar' (servico), e foi por isso que 'projeto' puro NAO entrou no vocabulario",
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
    hipotese: "CORRIGIDO (R2-01): obra sem o sistema na descricao tem o sistema INFERIDO da maioria dos itens (concreto armado) e o item divergente E acusado — antes a regra inteira ficava desligada",
    esperaAcusar: true,
    code: "eng_sistema_construtivo_incompativel",
    input: {
      obra: obra({ descricao: "Obra de reforma e ampliacao do bloco administrativo." }),
      itens: [
        item({ code: "1.4.1", description: "Pilares em concreto armado", unit: "m3", quantity: 320, unitPrice: 800 }),
        item({ code: "1.4.2", description: "Vigas em concreto armado", unit: "m3", quantity: 320, unitPrice: 800 }),
        item({ code: "1.4.3", description: "Lajes em concreto armado", unit: "m3", quantity: 320, unitPrice: 800 }),
        item({ code: "1.5.1", description: "Alvenaria estrutural bloco de concreto 19x19x39", unit: "m2", quantity: 3200, unitPrice: 148 }),
      ],
      composicoes: [],
    },
  },
  {
    id: "R2-02",
    regra: "2 sistema",
    hipotese: "ABERTO POR DECISAO (R2-02): cobertura em estrutura metalica de aco numa obra de concreto armado (solucao corrente) segue acusada — cobertura metalica sobre estrutura de concreto nao e incoerencia por si",
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
    hipotese: "CORRIGIDO (obra mista): obra declarada 'mista' (concreto + alvenaria estrutural) NAO acusa mais o item de alvenaria estrutural que ela mesma declara",
    esperaAcusar: false,
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
    hipotese: "CORRIGIDO (plural): item 'Fundacoes' (plural) com concreto FCK=15 agora E acusado — 'fundacoes' e 'fundacao' passaram a casar pelo radical 'fundac'",
    esperaAcusar: true,
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
    hipotese: "CORRIGIDO (NBR 6118): C20 (permitido pela NBR 6118 para concreto estrutural) NAO e mais acusado nem como ERROR nem como WARNING em 'Sapatas'",
    esperaAcusar: false,
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
    hipotese: "CORRIGIDO (R3-03): item chamado apenas 'Estrutura' com FCK=15 agora E acusado — o radical generico 'estrutur' entrou na lista de elementos",
    esperaAcusar: true,
    code: "eng_concreto_resistencia_insuficiente",
    input: {
      obra: obra(),
      itens: [item({ code: "1.4", description: "Estrutura", unit: "m3", quantity: 900, unitPrice: 348.6, compositionId: 22988, compositionCode: "C3270", compositionDescription: CONCRETO_15, compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 22988, code: "C3270", description: CONCRETO_15, unit: "M3", somaComponentes: 91.99, componentesComPreco: 2, totalComponentes: 6 })],
    },
  },

  {
    id: "R2-04",
    regra: "2 sistema",
    hipotese: "FECHAMENTO R2-01: quando NEM a descricao NEM os itens declaram sistema, a regra avisa que NAO PODE AVALIAR (warning) — antes ficava silenciosa, e a ausencia de achado parecia coerencia",
    esperaAcusar: true,
    code: "eng_sistema_construtivo_nao_avaliavel",
    severidade: "warning",
    input: {
      obra: obra({ descricao: "Obra de reforma e ampliacao do bloco administrativo." }),
      itens: [item({ code: "1.1.1", description: "Administracao e controle da obra", unit: "vb", quantity: 1, unitPrice: 100000 })],
      composicoes: [],
    },
  },

  // ----------------------------------------------------------- regra 4
  {
    id: "R4-01",
    regra: "4 preco",
    hipotese: "CORRIGIDO (R4-01): item a razao 1,25 (BDI de 25%, faixa usual em obra publica) NAO e acusado quando a obra DECLARA esse BDI — a banda passou a ser em torno de 1+BDI, nao de 1,0",
    esperaAcusar: false,
    code: "eng_preco_sem_lastro",
    input: {
      obra: obra({ bdiDeclarado: 0.25 }),
      itens: [item({ code: "1.4.1", description: "Pilares", unit: "m3", quantity: 80, unitPrice: 114.99, compositionId: 9200, compositionCode: "C9200", compositionDescription: "CONCRETO FCK=30MPA", compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 9200, code: "C9200", description: "CONCRETO FCK=30MPA", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },

  {
    id: "R4-04",
    regra: "4 preco",
    hipotese: "CONTROLE (R4-01b): com BDI de 25% DECLARADO, um desvio real de 60% (razao 1,60) continua sendo ERROR — declarar o BDI nao cega a regra",
    esperaAcusar: true,
    code: "eng_preco_sem_lastro",
    severidade: "error",
    input: {
      obra: obra({ bdiDeclarado: 0.25 }),
      itens: [item({ code: "1.4.2", description: "Vigas", unit: "m3", quantity: 40, unitPrice: 147.18, compositionId: 9200, compositionCode: "C9200", compositionDescription: "CONCRETO FCK=30MPA", compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 9200, code: "C9200", description: "CONCRETO FCK=30MPA", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },

  {
    id: "R4-05",
    regra: "4 preco",
    hipotese: "CORRIGIDO (R4-01c): SEM BDI declarado o mesmo desvio de 25% e WARNING de conferencia, NUNCA error — era o que acusava em massa quem tem BDI",
    esperaAcusar: true,
    code: "eng_preco_sem_lastro",
    severidade: "warning",
    input: {
      obra: obra(),
      itens: [item({ code: "1.4.3", description: "Lajes", unit: "m3", quantity: 60, unitPrice: 114.99, compositionId: 9200, compositionCode: "C9200", compositionDescription: "CONCRETO FCK=30MPA", compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 9200, code: "C9200", description: "CONCRETO FCK=30MPA", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },
  {
    id: "R4-02",
    regra: "4 preco",
    hipotese: "ABERTO POR DECISAO (R4-02): o caso dos R$ 1,4 milhao (soma=0) NAO e acusado por 'preco sem lastro' — a regra pula soma<=0. Sem lastro nenhum, o item nao pode ser conferido",
    esperaAcusar: false,
    code: "eng_preco_sem_lastro",
    input: { obra: obra(), itens: [CASO_AURORA], composicoes: [C_AURORA] },
  },
  {
    id: "R4-03",
    regra: "4 preco",
    hipotese: "CORRIGIDO (R4-03): item em 'm' com composicao em 'm3' deixou de ser acusado por 'preco sem lastro' — a divergencia de UNIDADE agora e lida (compositionUnit) e tratada como causa separada",
    esperaAcusar: false,
    code: "eng_preco_sem_lastro",
    input: {
      obra: obra(),
      itens: [item({ code: "1.3.2", description: "Fundacoes", unit: "m", quantity: 220, unitPrice: 185, compositionId: 9300, compositionCode: "C9300", compositionDescription: "CONCRETO FCK=30MPA", compositionUnit: "M3", somaComponentes: 91.99 })],
      composicoes: [comp({ id: 9300, code: "C9300", description: "CONCRETO FCK=30MPA", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    },
  },

  {
    id: "R4-06",
    regra: "4 preco do item",
    hipotese: "IMPACTO EM R$ (R4-02 revisado): item cujo custo a regra 4 NAO CONSEGUE conferir (composicao somando zero) agora tem achado proprio, NOMEADO, com o valor — antes saia da regra sem nome nem valor, so contado na cobertura. E o MESMO dinheiro que a regra 5 reporta pela composicao, visto pelo lado do item: nao e um segundo total somavel",
    esperaAcusar: true,
    code: "eng_item_custo_nao_conferivel",
    severidade: "warning",
    contemNoTexto: "Total: R$ 1.448.016,50",
    input: {
      obra: obra(),
      itens: [item({ code: "1.13.2", description: "Drenagem externa", unit: "m", quantity: 2, unitPrice: 724008.25, compositionId: 22195, compositionCode: "C0584", compositionUnit: "M", somaComponentes: 0 })],
      composicoes: [comp({ id: 22195, code: "C0584", description: "CADASTRO DE REDE DE DRENAGEM (MEIO MAGNETICO)", unit: "M", somaComponentes: 0, componentesComPreco: 0, totalComponentes: 3 })],
    },
  },

  // ----------------------------------------------------------- regra 5
  {
    id: "R5-01",
    regra: "5 composicao sem preco",
    hipotese: "FECHADO (era R5-01): composicao com 1 de 50 componentes com preco PASSOU a ser acusada como cobertura PARCIAL — era o achado que passava batido, e a soma de 12,50 com 1 de 50 e tao inutil quanto zero",
    esperaAcusar: true,
    code: "eng_composicao_preco_incompleto",
    severidade: "warning",
    contemNoTexto: "MENOS DA METADE",
    input: {
      obra: obra(),
      itens: [],
      composicoes: [comp({ id: 9400, code: "C9400", description: "COMPOSICAO QUASE TODA SEM PRECO", unit: "M3", somaComponentes: 12.5, componentesComPreco: 1, totalComponentes: 50 })],
    },
  },
  {
    id: "R5-02",
    regra: "5 composicao sem preco",
    hipotese: "IMPACTO EM R$: a composicao sem preco cita os itens VINCULADOS e o valor preso neles — antes o achado dizia apenas o codigo da composicao, e o R$ nao aparecia em lugar nenhum",
    esperaAcusar: true,
    code: "eng_composicao_sem_preco",
    severidade: "warning",
    contemNoTexto: "Total: R$ 1.448.016,50",
    input: {
      obra: obra(),
      itens: [item({ code: "1.13.2", description: "Drenagem externa", unit: "m", quantity: 2, unitPrice: 724008.25, compositionId: 22195, compositionCode: "C0584", compositionUnit: "M", somaComponentes: 0 })],
      composicoes: [comp({ id: 22195, code: "C0584", description: "CADASTRO DE REDE DE DRENAGEM (MEIO MAGNETICO)", unit: "M", somaComponentes: 0, componentesComPreco: 0, totalComponentes: 3 })],
    },
  },
  {
    id: "R5-03",
    regra: "5 composicao sem preco",
    hipotese: "SEM ITEM VINCULADO a mensagem DECLARA a ausencia — nao devolve 'R$ 0,00', que teria aparencia de medicao",
    esperaAcusar: true,
    code: "eng_composicao_sem_preco",
    severidade: "warning",
    contemNoTexto: "Sem item de orcamento vinculado",
    input: {
      obra: obra(),
      itens: [],
      composicoes: [comp({ id: 9401, code: "C0095", description: "SERVICO SEM PRECO E SEM ITEM", unit: "M3", somaComponentes: 0, componentesComPreco: 0, totalComponentes: 4 })],
    },
  },
  {
    id: "R5-04",
    regra: "5 composicao com preco parcial",
    hipotese: "IMPACTO EM R$ no caso PARCIAL (o pior: o custo PARECE calculavel): 1 de 50 componentes precificados, item de R$ 200.724,80 citado",
    esperaAcusar: true,
    code: "eng_composicao_preco_incompleto",
    severidade: "warning",
    contemNoTexto: "Total: R$ 200.724,80",
    input: {
      obra: obra(),
      itens: [item({ code: "1.7.4", description: "Alvenaria de vedacao", unit: "m2", quantity: 4, unitPrice: 50181.20, compositionId: 3270, compositionCode: "C3270", compositionUnit: "M2", somaComponentes: 12.5 })],
      composicoes: [comp({ id: 3270, code: "C3270", description: "ALVENARIA DE VEDACAO", unit: "M2", somaComponentes: 12.5, componentesComPreco: 1, totalComponentes: 50 })],
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
      obra: obra({ ...CUB_DECLARADO, areaConstruida: 7200 }),
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 5193043 })],
      composicoes: [],
    },
  },
  {
    id: "R6-02",
    regra: "6 custo/m2",
    hipotese: "R6-02: a referencia nao e mais o CUB inventado do sistema — e o CUB DECLARADO pela obra. Custo de R$ 1.400/m2 fica abaixo de 60% do CUB declarado (R$ 2.500/SP/2026-09) e e acusado; a mensagem cita valor, UF e mes",
    esperaAcusar: true,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ ...CUB_DECLARADO, areaConstruida: 7200 }),
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 1400 })],
      composicoes: [],
    },
  },

  {
    id: "R6-03",
    regra: "6 custo/m2",
    hipotese: "CORRIGIDO (R6-03): o chamador agora SOMA as areas por nivel distinto — os 2 pavimentos de 1.200 m2 viram 2.400 m2 e a obra a R$ 1.000/m2 E acusada (antes o MAX escondia a subestimacao)",
    esperaAcusar: true,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      // area do chamador = 1.200 + 1.200 = 2.400 (soma por nivel), nao mais 1.200 (max)
      obra: obra({
        ...CUB_DECLARADO,
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
    hipotese: "CORRIGIDO (R6-04): o fallback por texto nao joga mais 'Sinalizacao viaria' (custo direto de obra viaria) fora da conta — a obra com R$ 1.528/m2 deixou de ser acusada",
    esperaAcusar: false,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ ...CUB_DECLARADO, areaConstruida: 7200 }),
      itens: [
        item({ code: "1.4.1", description: "Concreto estrutural usinado", unit: "vb", quantity: 1, unitPrice: 10000000 }),
        item({ code: "1.13.1", description: "Sinalizacao viaria horizontal e vertical", unit: "vb", quantity: 1, unitPrice: 1000000 }),
      ],
      composicoes: [],
    },
  },
  {
    id: "R6-05",
    regra: "6 custo/m2",
    hipotese: "R6-02: obra que NAO declara CUB nao recebe referencia inventada — a regra nao roda e nao acusa (a cobertura nomeia 'obra nao declarou CUB')",
    esperaAcusar: false,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ areaConstruida: 7200 }),
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 800 })],
      composicoes: [],
    },
  },
  {
    id: "R6-06",
    regra: "6 custo/m2",
    hipotese: "R6-02: declaracao PARCIAL de CUB (valor sem UF/mes) tambem nao roda — nao e referencia, e a cobertura nomeia o campo que falta",
    esperaAcusar: false,
    code: "eng_custo_m2_abaixo_referencia",
    input: {
      obra: obra({ cubValor: 2500, areaConstruida: 7200 }),
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 800 })],
      composicoes: [],
    },
  },

  // ----------------------------------------------------------- regra 7
  {
    id: "R7-01",
    regra: "7 unidade",
    hipotese: "CORRIGIDO: 'und' no orcamento e 'un' no cronograma (mesma unidade) NAO sao mais tratados como divergentes",
    esperaAcusar: false,
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
    hipotese: "CORRIGIDO (R8-01): sem subnivel '1.4.N.M' nao ha pavimentos derivaveis, e a regra acusa como WARNING sem afirmar numero (antes afirmava 6) — o chamador nao fabrica mais",
    esperaAcusar: true,
    code: "eng_estrutura_sem_ciclo_pavimento",
    severidade: "warning",
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
    hipotese: "CORRIGIDO (R8-02): a regra nao desaparece mais em obra que nao e 'edificio' — a mesma estrutura absurda acusa como WARNING (nao sabemos a escala, mas a ausencia de ciclo e dita)",
    esperaAcusar: true,
    code: "eng_estrutura_sem_ciclo_pavimento",
    severidade: "warning",
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
    hipotese: "CORRIGIDO (R8-03): o ramo de error deixou de ser inalcancavel — com decomposicao por nivel a regra mede a duracao POR NIVEL e 4 dias por nivel e ERROR (novo achado eng_ciclo_pavimento_implausivel)",
    esperaAcusar: true,
    code: "eng_ciclo_pavimento_implausivel",
    severidade: "error",
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
    hipotese: "CORRIGIDO: com a fundacao comecando no dia 0 (caso normal) a regra agora RODA e acusa a estrutura da cobertura antes das fundacoes",
    esperaAcusar: true,
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
    hipotese: "CORRIGIDO (caso degenerado): quando NENHUMA atividade tem predecessor o achado e UM so, de DADO (eng_dependencias_ausentes_para_a_versao), em vez de 12 achados de atividade — acusar a obra pelo encanamento e o que desliga o validador",
    esperaAcusar: true,
    code: "eng_dependencias_ausentes_para_a_versao",
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

// ------------------------------------------------- cobertura (alcance, nao achado)
//
// Nao sao cenas de ACHADO: aqui se verifica a DECLARACAO DE ALCANCE de cada regra.
// Sem ela, "sem achado" e indistinguivel de "conferido" — e foi assim que o painel
// chegou a dizer "Nenhuma incoerencia encontrada" na AURORA com 35 de 53 itens fora.

type ResultadoCobertura = {
  id: string;
  hipotese: string;
  confirmou: boolean;
  detalhe: string;
};

const coberturas: ResultadoCobertura[] = [];
const registrarCobertura = (id: string, hipotese: string, ok: boolean, detalhe: string) =>
  coberturas.push({ id, hipotese, confirmou: ok, detalhe });

// C1 — o caso AURORA em miniatura: 53 itens, 18 com composicao vinculada.
{
  const itens = Array.from({ length: 53 }, (_, i) =>
    i < 18
      ? item({ code: `i${i}`, description: `Servico ${i}`, unit: "m3", unitPrice: 100, compositionId: 900 + i, compositionUnit: "M3", somaComponentes: 100 })
      : item({ code: `i${i}`, description: `Servico ${i}`, unit: "m3", unitPrice: 100 }),
  );
  const composicoes = Array.from({ length: 18 }, (_, i) =>
    comp({ id: 900 + i, code: `C${i}`, unit: "M3", totalComponentes: 1, componentesComPreco: 1 }),
  );
  const r = validarCoerenciaEngenharia({ obra: obra(), itens, composicoes });
  const c = r.resumo.cobertura.find(x => x.regra.startsWith("4."));
  registrarCobertura(
    "C1",
    "a regra de preco DECLARA 18 de 53 itens conferidos e 35 fora por 'sem composicao vinculada'",
    c?.total === 53 && c?.avaliados === 18 && c?.fora === 35 && c?.motivo === "sem composicao vinculada",
    `regra 4: total=${c?.total} avaliados=${c?.avaliados} fora=${c?.fora} motivo="${c?.motivo}"`,
  );
}

// C2 — invariante de fechamento: nenhuma regra pode "esquecer" item sem dizer.
{
  const r = validarCoerenciaEngenharia({
    obra: obra(),
    itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3", unitPrice: 50 })],
    composicoes: [],
  });
  const c = r.resumo.cobertura;
  const fecham = c.filter(x => x.avaliados + x.fora === x.total);
  registrarCobertura(
    "C2",
    "as 10 regras registram cobertura e fecham a conta (avaliados + fora === total)",
    c.length === 10 && fecham.length === 10,
    `${fecham.length}/${c.length} regras fecham a conta`,
  );
}

// C3 — motivo NOMEADO, nunca generico.
{
  const GENERICOS = ["nao aplicavel", "n/a", "outros", "diversos", "generico", "varios"];
  const r = validarCoerenciaEngenharia({
    obra: obra(),
    itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3", unitPrice: 50 })],
    composicoes: [],
  });
  const comFora = r.resumo.cobertura.filter(x => x.fora > 0);
  const nomeados = comFora.filter(x => x.motivo && !GENERICOS.includes(x.motivo) && x.motivo.length > 8);
  registrarCobertura(
    "C3",
    "todo motivo de exclusao e NOMEADO — nunca 'nao aplicavel'",
    comFora.length > 0 && nomeados.length === comFora.length,
    `${nomeados.length}/${comFora.length} regras com motivo nomeado`,
  );
}

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
  textoExigido: string | null;
};

const resultados: ResultadoCena[] = cenas.map(c => {
  const r = validarCoerenciaEngenharia(c.input);
  const codigos = r.issues.map(i => i.code);
  const acusa = codigos.includes(c.code);
  const achado = r.issues.find(i => i.code === c.code);
  const contem = !c.contemNoTexto || (achado?.message ?? "").includes(c.contemNoTexto);
  return {
    id: c.id,
    regra: c.regra,
    hipotese: c.hipotese,
    esperado: c.esperaAcusar ? "acusa" : "silencia",
    observado: acusa ? "acusa" : "silencia",
    confirmou: acusa === c.esperaAcusar && (!c.severidade || achado?.severity === c.severidade) && contem,
    codigos: [...new Set(codigos)],
    severidade: achado?.severity ?? null,
    erros: r.resumo.erros,
    avisos: r.resumo.avisos,
    valorEmRisco: r.resumo.valorEmRisco,
    mensagem: achado?.message ?? null,
    textoExigido: contem ? null : (c.contemNoTexto ?? null),
  };
});

if (emitirJson) {
  console.log(JSON.stringify({ cenas: resultados, cobertura: coberturas }, null, 2));
} else {
  let confirmadas = 0;
  for (const r of resultados) {
    const marca = r.confirmou ? "CONFIRMOU " : "NAO CONFIRMOU";
    if (r.confirmou) confirmadas++;
    console.log(`${marca} ${r.id} [${r.regra}] esperado=${r.esperado} observado=${r.observado}`);
    console.log(`           ${r.hipotese}`);
    console.log(`           achados=${r.codigos.join(",") || "(nenhum)"} erros=${r.erros} avisos=${r.avisos} valorEmRisco=${r.valorEmRisco.toFixed(2)}${r.severidade ? ` severity=${r.severidade}` : ""}`);
    if (r.mensagem) console.log(`           msg: ${r.mensagem}`);
    if (r.textoExigido) console.log(`           TEXTO EXIGIDO AUSENTE NA MENSAGEM: "${r.textoExigido}"`);
    console.log("");
  }
  console.log(`Hipoteses confirmadas: ${confirmadas}/${resultados.length}`);

  let cobConfirmadas = 0;
  console.log("");
  for (const c of coberturas) {
    const marca = c.confirmou ? "CONFIRMOU " : "NAO CONFIRMOU";
    if (c.confirmou) cobConfirmadas++;
    console.log(`${marca} ${c.id} [cobertura] ${c.hipotese}`);
    console.log(`           ${c.detalhe}`);
  }
  console.log(`Cobertura confirmada: ${cobConfirmadas}/${coberturas.length}`);
}
