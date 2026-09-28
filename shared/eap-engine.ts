/**
 * Motor determinístico de EAP a partir de uma base de preços oficial.
 *
 * POR QUE A EAP NASCE DO CATÁLOGO, E NÃO DE UMA TABELA FIXA
 *
 * A primeira versão semeava todo projeto com a mesma `starterWbs` (códigos
 * "1", "1.1", "2.1") e um orçamento com códigos "01.001". Nenhum desses códigos
 * existe na SEINFRA, então o orçamento e a EAP falavam línguas diferentes e o
 * casamento dependia de similaridade de texto sobre português.
 *
 * Aqui a direção é invertida: os nós saem dos SERVIÇOS (`C...`) que existem
 * no catálogo carregado. Cada folha carrega o código oficial em `externalId`.
 * Por construção o orçamento bate com a EAP, porque ambos vêm do mesmo lugar —
 * não é o matching que salva, é a identidade. E `matching.ts:94` já dá +0.15
 * de score quando o código casa exatamente, o que transforma o casamento em
 * acerto e não em aposta.
 *
 * Sem relógio, sem rede, sem banco. Mesmos serviços na mesma ordem produzem a
 * mesma EAP — é isso que a torna auditável e testável.
 */

/** Códigos de serviço da SEINFRA começam com C; insumos, com I. */
export function ehCodigoDeServico(codigo: string): boolean {
  return /^\s*C\s*\d/i.test(codigo);
}

/** Remove acentos e caixa, para casar descrição sem se preocupar com grafia. */
export function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Registro do catálogo que o motor consome — só o que ele precisa. */
export type ServicoDoCatalogo = {
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
};

export type CategoriaDeObra =
  | "preliminares"
  | "fundacao"
  | "estrutura"
  | "vedacao"
  | "instalacoes"
  | "revestimentos"
  | "terraplenagem"
  | "pavimentacao";

export type GrupoDaEap = {
  /** Identificador estável da categoria. */
  categoria: CategoriaDeObra;
  /** Nome do nó de nível 1 exibido na EAP. */
  nome: string;
  /**
   * Palavras que, presentes na descrição, indicam que o serviço pertence a
   * este grupo. A ordem importa: o primeiro grupo que casar vence, então os
   * grupos mais específicos vêm antes.
   */
  termos: string[];
};

/**
 * Ordem deliberada: "pavimentacao" antes de "terraplenagem" porque um serviço
 * de "pavimento" também cita "movimento de terra" em algumas descrições, e
 * "preliminares" primeiro porque canteiro e mobilização aparecem em quase
 * tudo.
 */
export const GRUPOS: GrupoDaEap[] = [
  {
    categoria: "preliminares",
    nome: "Serviços preliminares e mobilização",
    termos: [
      "canteiro",
      "mobilizacao",
      "demobilizacao",
      "instalacao provisoria",
      "provisoria",
      "placa de obra",
      "sinalizacao",
      "limpeza de canteiro",
      "bem feitor",
      "administracao da obra",
      "articulacao",
    ],
  },
  {
    categoria: "fundacao",
    nome: "Fundação e contenções",
    termos: [
      "fundacao",
      "estaca",
      "helice continua",
      "bloco de fundacao",
      "sapata",
      "baldrame",
      "radier",
      "caa d'agua",
      "caixa d'agua",
      "escavacao",
      "aterro",
      "reaterro",
      "talude",
      "cortina de contencao",
      "contencao",
      "gabamento",
      "impermeabilizacao",
    ],
  },
  {
    categoria: "estrutura",
    nome: "Estrutura",
    termos: [
      "estrutura",
      "concreto armado",
      "concreto aparente",
      "laje",
      "viga",
      "pilar",
      "viga baldrame",
      "armação",
      "forma",
      "fôrma",
      "escoramento",
      "concretagem",
      "desforma",
      "demolicao de estrutura",
    ],
  },
  {
    categoria: "vedacao",
    nome: "Vedação e fachadas",
    termos: [
      "alvenaria",
      "bloco ceramic",
      "bloco de concreto",
      "tijolo",
      "emboco",
      "reboco",
      "vergas",
      "contraverga",
      "epoxy",
      "fachada",
      "paineis de fachada",
    ],
  },
  {
    categoria: "instalacoes",
    nome: "Instalações prediais",
    termos: [
      "instalacao eletrica",
      "instalacao hidrossanitaria",
      "instalações eletrica",
      "instalações hidrossanitaria",
      "eletrica",
      "hidraulica",
      "sanitaria",
      "esgoto",
      "agua quente",
      "incendio",
      "spda",
      "iluminacao",
      "tomada",
      "ponto eletrico",
      "elevador",
      "cabo",
      "tubacao",
      "duto",
      "ventilacao",
      "ar condicionado",
      "gas",
    ],
  },
  {
    categoria: "revestimentos",
    nome: "Revestimentos e acabamentos",
    termos: [
      "piso",
      "contrapiso",
      "revestimento",
      "pintura",
      "tinta",
      "ceramica",
      "porcelanato",
      "marmore",
      "granito",
      "forro",
      "gesso",
      "rodape",
      "esquadria",
      "porta",
      "janela",
      "vidro",
      "guarda-corpo",
      "impermeabilizacao de piso",
      "polimento",
    ],
  },
  {
    categoria: "pavimentacao",
    nome: "Pavimentação",
    termos: [
      "pavimento",
      "pavimentacao",
      "recapeamento",
      "revestimento asfaltico",
      "asfalto",
      "cbqp",
      "concreto asfaltico",
      "capa de rolamento",
      "base de pavimento",
      "meio-fio",
      "sarjeta",
      "tapa de bueiro",
    ],
  },
  {
    categoria: "terraplenagem",
    nome: "Terraplenagem e drenagem",
    termos: [
      "terraplenagem",
      "movimento de terra",
      "corte",
      "soflox",
      "bota-fora",
      "aterro de pista",
      "drenagem",
      "galeria",
      "bueiro",
      "canaleta",
      "caixa de inspecao",
      "enrocamento",
    ],
  },
];

/** Id do tipo de obra, como vai no formulário e no schema. */
export type TipoDeObra = "edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos";

/** Tipos de obra que o formulário oferece, com os grupos que cada um usa. */
export const TIPOS_DE_OBRA: Array<{
  value: TipoDeObra;
  label: string;
  grupos: CategoriaDeObra[];
}> = [
  {
    value: "edificio",
    label: "Edifício / construção nova",
    grupos: [
      "preliminares",
      "fundacao",
      "estrutura",
      "vedacao",
      "instalacoes",
      "revestimentos",
    ],
  },
  {
    value: "reforma",
    label: "Reforma",
    grupos: ["preliminares", "vedacao", "instalacoes", "revestimentos"],
  },
  {
    value: "pavimentacao",
    label: "Pavimentação / rodovia",
    grupos: ["preliminares", "terraplenagem", "pavimentacao"],
  },
  {
    value: "saneamento",
    label: "Saneamento básico",
    grupos: ["preliminares", "terraplenagem"],
  },
  {
    value: "todos",
    label: "Todos os grupos disponíveis no catálogo",
    grupos: GRUPOS.map(g => g.categoria),
  },
];

/** Qual grupo um serviço pertence, pela descrição. `null` se não casar. */
export function classificarServico(descricao: string): CategoriaDeObra | null {
  const texto = normalizar(descricao);
  if (!texto) return null;
  for (const grupo of GRUPOS) {
    for (const termo of grupo.termos) {
      if (texto.includes(normalizar(termo))) return grupo.categoria;
    }
  }
  return null;
}

export type NoEapGerada = {
  /** Código do nó na EAP ("1", "1.1", "1.1.1"). */
  code: string;
  name: string;
  level: 1 | 2 | 3;
  nodeType: "grupo" | "pacote" | "entrega";
  /** Código oficial do serviço na folha. `null` nos níveis acima. */
  externalId: string | null;
  unit: string | null;
  unitPrice: number | null;
  /** Categoria que originou o nó. */
  categoria: CategoriaDeObra | null;
  sortOrder: number;
};

export type ResultadoDoMotor = {
  nos: NoEapGerada[];
  /** Serviços do catálogo que entraram como folha. */
  servicosUsados: number;
  /** Serviços do catálogo que não casaram com nenhum grupo. */
  servicosSemGrupo: number;
  /** Grupos pedidos que não hanno serviço correspondente no catálogo. */
  gruposVazios: CategoriaDeObra[];
  /** `null` quando o motor rodou. Texto quando a EAP não pode ser gerada. */
  aviso: string | null;
};

/** Nunca lança: o chamador decide o que fazer com um resultado incompleto. */
export function gerarEap(
  servicos: ServicoDoCatalogo[],
  opcoes: { tipoDeObra?: string; maximoPorGrupo?: number } = {}
): ResultadoDoMotor {
  const MAXIMO_PADRAO = 12;
  const maximo = opcoes.maximoPorGrupo ?? MAXIMO_PADRAO;

  // `Array.isArray` e nao `?? []`: um `null` chega do chamador em teste e de
  // qualquer consulta malformada, e `null.filter` estoura.
  const entrada = Array.isArray(servicos) ? servicos : [];
  const soServicos = entrada.filter(
    (s): s is ServicoDoCatalogo =>
      !!s && typeof s.code === "string" && ehCodigoDeServico(s.code)
  );

  const gruposPedidos = resolverGrupos(opcoes.tipoDeObra);
  const gruposVazios: CategoriaDeObra[] = [];
  const porCategoria = new Map<CategoriaDeObra, ServicoDoCatalogo[]>();
  let semGrupo = 0;

  for (const servico of soServicos) {
    const categoria = classificarServico(servico.description);
    if (!categoria) {
      semGrupo += 1;
      continue;
    }
    if (!gruposPedidos.has(categoria)) continue;
    const lista = porCategoria.get(categoria) ?? [];
    lista.push(servico);
    porCategoria.set(categoria, lista);
  }

  const nos: NoEapGerada[] = [];
  let order = 0;
  let raiz = 0;

  // A ordem dos nós segue a ordem de GRUPOS, não a do catálogo: a EAP precisa
  // ler na ordem de execução da obra (preliminares → acabamento).
  for (const grupo of GRUPOS) {
    if (!gruposPedidos.has(grupo.categoria)) continue;
    const candidatos = porCategoria.get(grupo.categoria) ?? [];
    if (!candidatos.length) {
      gruposVazios.push(grupo.categoria);
      continue;
    }
    const escolhidos = escolherRepresentantes(candidatos, maximo);
    raiz += 1;
    nos.push({
      code: String(raiz),
      name: grupo.nome,
      level: 1,
      nodeType: "grupo",
      externalId: null,
      unit: null,
      unitPrice: null,
      categoria: grupo.categoria,
      sortOrder: order++,
    });
    escolhidos.forEach((servico, indice) => {
      nos.push({
        code: `${raiz}.${indice + 1}`,
        name: servico.description.slice(0, 220),
        level: 2,
        nodeType: "entrega",
        externalId: servico.code,
        unit: servico.unit,
        unitPrice: Number(servico.unitPrice),
        categoria: grupo.categoria,
        sortOrder: order++,
      });
    });
  }

  const aviso = nos.length
    ? null
    : soServicos.length
      ? "Nenhum serviço do catálogo casou com os grupos deste tipo de obra."
      : "O catálogo não tem serviços (códigos C...) para gerar a EAP.";

  return {
    nos,
    servicosUsados: nos.filter(n => n.externalId !== null).length,
    servicosSemGrupo: semGrupo,
    gruposVazios,
    aviso,
  };
}

function resolverGrupos(tipoDeObra?: string): Set<CategoriaDeObra> {
  if (!tipoDeObra) return new Set(GRUPOS.map(g => g.categoria));
  const tipo = TIPOS_DE_OBRA.find(t => t.value === tipoDeObra);
  if (!tipo) return new Set(GRUPOS.map(g => g.categoria));
  return new Set(tipo.grupos);
}

/**
 * Escolhe no máximo N serviços de um grupo, preservando a ordem do catálogo.
 *
 * A ordem do catálogo é a ordem oficial da planilha, que segue a sequência de
 * execução dentro do grupo. Em vez de pegar os N primeiros (que num catálogo
 * grande vira só uma família de serviço, ex.: todos "concreto"), espalha pelo
 * grupo preservando o relativo.
 */
function escolherRepresentantes(
  candidatos: ServicoDoCatalogo[],
  maximo: number
): ServicoDoCatalogo[] {
  if (candidatos.length <= maximo) return candidatos;
  const out: ServicoDoCatalogo[] = [];
  const passo = candidatos.length / maximo;
  for (let i = 0; i < maximo; i += 1) {
    out.push(candidatos[Math.floor(i * passo)]);
  }
  return out;
}
