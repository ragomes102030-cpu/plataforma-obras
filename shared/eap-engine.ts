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
  /**
   * Caminho hierárquico na planilha oficial (capítulo > subgrupo). Vem das
   * linhas de agrupamento do `Planos-de-Serviços` e é o sinal mais forte de
   * classificação. Ausente em catálogo sem hierarquia, e aí vale a descrição.
   */
  trilha?: readonly string[];
};

export type CategoriaDeObra =
  | "preliminares"
  | "fundacao"
  | "estrutura"
  | "vedacao"
  | "instalacoes"
  | "cobertura"
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
      // "desmobilizacao" e não "demobilizacao": o `includes` antigo casava por
      // acidente, porque "desmobilizacao" contém a sequência "demobilizacao".
      // Com casamento por palavra inteira o erro apareceu.
      "desmobilizacao",
      "instalacao provisoria",
      "provisoria",
      "placa de obra",
      "placas padrao",
      "sinalizacao",
      "limpeza de canteiro",
      "limpeza mecanizada de terreno",
      "raspagem",
      "retirada de arvores",
      "remocao de camada vegetal",
      "bem feitor",
      "administracao da obra",
      "articulacao",
      // Instalações de apoio do canteiro. Só entram como rede de segurança:
      // com a trilha da planilha (ver `CAPITULOS_SEINFRA`) a taxonomia oficial
      // decide, e estes termos ficam para catálogo sem hierarquia.
      "alojamento",
      "barracao",
      "refeitorio",
      "fossa sumidouro",
      "sanitario provisorio",
      "letreiro",
      "vigia",
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
      "vigamento",
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
    // "Instalações e redes", e não "Instalações prediais": o capítulo 16 da
    // SEINFRA é o maior da planilha (1.082 serviços) e é rede de água e
    // esgoto — ramal,collector, poço de visita, ligação predial. Num edifício
    // é instalação predial; numa obra de saneamento é a própria obra.
    nome: "Instalações e redes",
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
      // "gasometro" e "regulador de gas" entraram porque o casamento por
      // palavra inteira deixou o termo "gas" de alcançar as duas: "GASÔMETRO"
      // é uma palavra só, e não contém "gas" como palavra.
      "gasometro",
      "regulador de gas",
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
    // Grupo novo. Sem ele, o capítulo 11 da SEINFRA (154 serviços: telhas,
    // madeira, metálica, domos) não tinha onde cair e uma obra de edifício
    // saía sem cobertura nenhuma — o serviço que fecha a casa.
    categoria: "cobertura",
    nome: "Cobertura",
    termos: [
      "cobertura",
      "telhado",
      "telha",
      "cumeeira",
      "calha",
      "rufo",
      "beiral",
      "domo",
      "agua-furtada",
      "estrutura de madeira",
      "estrutura metalica",
      "forro de madeira",
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

/**
 * Taxonomia oficial da SEINFRA: capítulo → grupo da EAP.
 *
 * POR QUE A TRILHA DA PLANILHA MANDA, E NÃO A PALAVRA SOLTA
 *
 * Medido no `Planos-de-Serviços` da SEINFRA-CE 028 (4.435 serviços), classificar
 * só pela descrição errava de forma estrutural: `EXECUÇÃO DE SONDAGEM ELÉTRICA`
 * e `PROTENSÃO E INJEÇÃO EM CABO` caíam em Instalações (por "cabo"), e
 * `DISJUNTOR TRIPOLAR C/ACIONAMENTO NA PORTA DO Q.D.` caía em Revestimentos
 * (por "porta"). Com a trilha, `C2820` é `1.1.1 SERVICOS PRELIMINARES > SONDAGENS`
 * e `C3343` é `6 FUNDAÇÕES E ESTRUTURAS > ESTACAS` — sem ambiguidade.
 *
 * Os 30 capítulos e os subgrupos citados aqui vieram da leitura da planilha
 * 028. É a taxonomia da própria SEINFRA, não invenção do motor.
 */
const CAPITULOS_SEINFRA: Record<string, CategoriaDeObra> = {
  "servicos preliminares": "preliminares",
  "movimento de terra": "terraplenagem",
  "servicos auxiliares": "preliminares",
  "obras de drenagem": "terraplenagem",
  "argamassas": "revestimentos",
  "fundacoes e estruturas": "estrutura",
  "contencoes": "fundacao",
  "paredes e paineis": "vedacao",
  "esquadrias e ferragens": "revestimentos",
  "vidros": "revestimentos",
  "cobertura": "cobertura",
  "impermeabilizacao": "fundacao",
  "protecao termica": "revestimentos",
  "revestimentos": "revestimentos",
  "pisos": "revestimentos",
  "instalacoes hidraulicas": "instalacoes",
  "servicos operacionais": "preliminares",
  "inst eletricas telefonia logica som e sistemas de controle": "instalacoes",
  "pintura": "revestimentos",
  "pavimentacao do sistema viario": "pavimentacao",
  "conservacao do sistema viario": "pavimentacao",
  "obras portuarias": "terraplenagem",
  "transportes para obras rodoviarias": "preliminares",
  "sinalizacao do sistema viario": "pavimentacao",
  "urbanizacao paisagismo": "terraplenagem",
  "muros e fechamentos": "vedacao",
  "sistema de ar condicionado": "instalacoes",
  "rede de distribuicao de gas natural": "instalacoes",
  "acessibilidade a edificacoes e espacos": "revestimentos",
};

/**
 * Subgrupos que divergem do capítulo.
 *
 * Só o necessário. "FUNDAÇÕES E ESTRUTURAS" mistura tubulão (fundação) e formas
 * (estrutura); "IMPERMEABILIZAÇÃO" mistura baldrame (fundação), calha
 * (cobertura) e reservatório (instalações); "ACESSIBILIDADE" reagrupa serviços
 * que a SEINFRA distribui por naturezas distintas. O resto segue o capítulo.
 */
const SUBGRUPOS_SEINFRA: Array<[string, CategoriaDeObra]> = [
  ["tubuloes a ceu aberto", "fundacao"],
  ["tubuloes a ar comprimido", "fundacao"],
  ["estacas", "fundacao"],
  // 6.4 EMBASAMENTOS E BALDRAMES vai para fundação, e não para o capítulo
  // (estrutura): é o peito de alvenaria sob a carga que se distribui para o
  // solo, e não um elemento estrutural do pavimento acima.
  ["embasamentos e baldrames", "fundacao"],
  ["formas", "estrutura"],
  ["armaduras", "estrutura"],
  ["concretos", "estrutura"],
  ["elementos de concreto pre fabricado", "estrutura"],
  ["junta de dilatacao", "estrutura"],
  ["recuperacao estrutural", "estrutura"],
  ["rasgo em concreto para tubulacoes", "estrutura"],
  // 12 IMPERMEABILIZAÇÃO
  ["baldrames", "fundacao"],
  ["calhas", "cobertura"],
  ["coberturas", "cobertura"],
  ["reservatorios", "instalacoes"],
  ["cortina", "fundacao"],
  ["impermeabilizacao utilizando manta", "fundacao"],
  // 29 ACESSIBILIDADE — a SEINFRA reagrupa aqui serviços de naturezas distintas
  ["instalacoes loucas e acessorios", "instalacoes"],
  ["sinalizacao", "pavimentacao"],
];

const SUBGRUPOS_NORMALIZADOS: Array<[string, CategoriaDeObra]> =
  SUBGRUPOS_SEINFRA.map(([nome, categoria]) => [normalizar(nome), categoria]);

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
      "cobertura",
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
    // `instalacoes` entrou porque, na taxonomia da SEINFRA, a rede de água e
    // esgoto É o capítulo 16 (TUBOS E CONEXÕES, POÇOS E CAIXAS, LIGAÇÕES
    // PREDIAIS) — o maior da planilha, com 1.082 serviços. Sem ele, uma obra
    // de saneamento saía sem um único tubo: só escavação e bueiro, e ainda
    // pegando "OBRAS PORTUÁRIAS" e "TOTEM RODOVIÁRIO" para preencher cota.
    grupos: ["preliminares", "terraplenagem", "instalacoes"],
  },
  {
    value: "todos",
    label: "Todos os grupos disponíveis no catálogo",
    grupos: GRUPOS.map(g => g.categoria),
  },
];

/**
 * Casa o termo como PALAVRA INTEIRA, aceitando plural.
 *
 * O casamento por `includes` puro errava feio em português: `porta` casava
 * dentro de "PORTARIA" e "IMPORTAÇÃO", e `gas` casava dentro de "VIGAS" — o
 * serviço ia para o grupo errado e virava folha da EAP.
 *
 * A fronteira é início/fim de palavra (espaço no texto normalizado, que já
 * substituiu pontuação e hífen) com sufixo opcional `s`, porque a planilha
 * escreve "PISOS CERÂMICOS" e "CABOS" no plural.
 */
function padraoDoTermo(termo: string): RegExp {
  const alvo = normalizar(termo);
  const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escapado}s?(?=\\s|$)`);
}

/**
 * `GRUPOS` com os padrões já compilados.
 *
 * Compilado uma vez na carga do módulo, e não a cada chamada: `gerarEap` roda
 * contra ~4.400 serviços da SEINFRA-CE, o que dá quase um milhão de testes de
 * regex por EAP. Nada aqui é mutável em tempo de execução — a ordem de
 * consulta continua sendo a ordem de `GRUPOS`, que é a regra de precedência.
 */
const GRUPOS_COMPILADOS: Array<{ categoria: CategoriaDeObra; padroes: RegExp[] }> =
  GRUPOS.map(grupo => ({
    categoria: grupo.categoria,
    padroes: grupo.termos.map(padraoDoTermo),
  }));

/**
 * Grupo do serviço pela taxonomia oficial da planilha.
 *
 * `trilha` é o caminho lido da hierarquia (`["INSTALAÇÕES HIDRÁULICAS",
 * "TUBOS E CONEXÕES DE PVC"]`). O subgrupo tem precedência sobre o capítulo
 * porque é ele que distingue, por exemplo, "6.5 FORMAS" (estrutura) de
 * "6.1 TUBULÕES" (fundação) dentro do mesmo capítulo.
 *
 * Devolve `undefined` — não `null` — quando não há opinião sobre a linha, para
 * o chamador cair na classificação por descrição.
 */
export function classificarPorTrilha(
  trilha: readonly string[] | null | undefined
): CategoriaDeObra | undefined {
  if (!trilha || !trilha.length) return undefined;
  const nomes = [...trilha].reverse().map(normalizar);
  // Duas passadas: igualdade exata primeiro, para não deixar um prefixo curto
  // ("cortina") ganhar de um nome mais específico que só começa igual.
  for (const nome of nomes) {
    for (const [subgrupo, categoria] of SUBGRUPOS_NORMALIZADOS) {
      if (nome === subgrupo) return categoria;
    }
  }
  // A planilha embute a norma técnica no título do subgrupo — 12.8 é
  // "IMPERMEABILIZAÇÃO UTILIZANDO MANTA ASFÁLTICA (ABNT NBR 9952:2014)" —, e
  // essa parte muda a cada revisão da norma. Casar por prefixo evita reescrever
  // o mapa a cada versão.
  for (const nome of nomes) {
    for (const [subgrupo, categoria] of SUBGRUPOS_NORMALIZADOS) {
      if (nome.startsWith(subgrupo)) return categoria;
    }
  }
  const capitulo = normalizar(trilha[0]!);
  return Object.prototype.hasOwnProperty.call(CAPITULOS_SEINFRA, capitulo)
    ? CAPITULOS_SEINFRA[capitulo]
    : undefined;
}

/**
 * Qual grupo um serviço pertence.
 *
 * A trilha da planilha manda; a descrição é a rede de segurança para catálogo
 * sem hierarquia (cadastro manual, outra fonte) e para linha que a taxonomia
 * não cobre — o capítulo 30 "SERVIÇOS DIVERSOS" é exatamente esse caso.
 */
export function classificarServico(
  descricao: string,
  trilha?: readonly string[] | null
): CategoriaDeObra | null {
  const pelaTrilha = classificarPorTrilha(trilha);
  if (pelaTrilha) return pelaTrilha;
  const texto = normalizar(descricao);
  if (!texto) return null;
  for (const grupo of GRUPOS_COMPILADOS) {
    for (const padrao of grupo.padroes) {
      if (padrao.test(texto)) return grupo.categoria;
    }
  }
  return null;
}

export type NoEapGerada = {
  /** Código do nó na EAP ("1", "1.1", "1.1.1"). */
  code: string;
  name: string;
  level: number;
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
  /** Preserva a hierarquia da trilha do catálogo em vez de reduzir cada grupo a 12 exemplos. */
  const limite = opcoes.maximoPorGrupo;
  const entrada = Array.isArray(servicos) ? servicos : [];
  const soServicos = entrada.filter((s): s is ServicoDoCatalogo =>
    !!s &&
    typeof s.code === "string" &&
    (s.itemType === "servico" || s.itemType === undefined) &&
    ehCodigoDeServico(s.code)
  );
  const gruposPedidos = resolverGrupos(opcoes.tipoDeObra);
  const gruposVazios: CategoriaDeObra[] = [];
  const porCategoria = new Map<CategoriaDeObra, ServicoDoCatalogo[]>();
  let semGrupo = 0;
  for (const servico of soServicos) {
    const categoria = classificarServico(servico.description, servico.trilha);
    if (!categoria) { semGrupo += 1; continue; }
    if (!gruposPedidos.has(categoria)) continue;
    const lista = porCategoria.get(categoria) ?? []; lista.push(servico); porCategoria.set(categoria, lista);
  }
  const nos: NoEapGerada[] = []; let order = 0; let raiz = 0;
  for (const grupo of GRUPOS) {
    if (!gruposPedidos.has(grupo.categoria)) continue;
    let candidatos = porCategoria.get(grupo.categoria) ?? [];
    if (!candidatos.length) { gruposVazios.push(grupo.categoria); continue; }
    if (limite && limite > 0 && candidatos.length > limite) candidatos = escolherRepresentantes(candidatos, limite);
    raiz += 1;
    nos.push({ code: String(raiz), name: grupo.nome, level: 1, nodeType: "grupo", externalId: null, unit: null, unitPrice: null, categoria: grupo.categoria, sortOrder: order++ });
    const comTrilha = candidatos.filter(s => s.trilha && s.trilha.length);
    if (!comTrilha.length) {
      candidatos.forEach((servico, indice) => nos.push({ code: String(raiz) + ".1." + String(indice + 1), name: servico.description.slice(0,220), level: 3, nodeType: "entrega", externalId: servico.code, unit: servico.unit, unitPrice: Number(servico.unitPrice), categoria: grupo.categoria, sortOrder: order++ }));
      continue;
    }
    /**
     * Constrói a árvore por prefixos da trilha. Assim, se a fonte trouxer
     * capítulo > sistema > subsistema > componente, todos os níveis aparecem.
     * Não colapsamos o caminho no último rótulo.
     */
    const filhosPorPai = new Map<string, Map<string, { name: string; code: string; level: number }>>();
    const folhasPorPai = new Map<string, ServicoDoCatalogo[]>();
    const garantir = (parentCode: string, name: string, level: number): string => {
      const chave = normalizar(name);
      const filhos = filhosPorPai.get(parentCode) ?? new Map();
      const existente = filhos.get(chave);
      if (existente) return existente.code;
      const code = parentCode + "." + String(filhos.size + 1);
      filhos.set(chave, { name, code, level });
      filhosPorPai.set(parentCode, filhos);
      return code;
    };

    for (const servico of candidatos) {
      const labels = (servico.trilha ?? []).map(v => v.trim()).filter(Boolean);
      const caminho = labels.slice(1).length ? labels.slice(1) : ["Serviços"];
      let parentCode = String(raiz);
      let level = 2;
      for (const label of caminho) {
        parentCode = garantir(parentCode, label.slice(0, 220), level);
        level += 1;
      }
      const folhas = folhasPorPai.get(parentCode) ?? [];
      folhas.push(servico);
      folhasPorPai.set(parentCode, folhas);
    }

    const emitir = (parentCode: string) => {
      const filhos = filhosPorPai.get(parentCode);
      if (filhos) {
        for (const filho of filhos.values()) {
          nos.push({
            code: filho.code,
            name: filho.name,
            level: filho.level,
            nodeType: "pacote",
            externalId: null,
            unit: null,
            unitPrice: null,
            categoria: grupo.categoria,
            sortOrder: order++,
          });
          emitir(filho.code);
        }
      }
      const folhas = folhasPorPai.get(parentCode) ?? [];
      folhas.forEach((servico, indice) => {
        nos.push({
          code: parentCode + "." + String(indice + 1),
          name: servico.description.slice(0, 220),
          level: (parentCode.split(".").length + 1),
          nodeType: "entrega",
          externalId: servico.code,
          unit: servico.unit,
          unitPrice: Number(servico.unitPrice),
          categoria: grupo.categoria,
          sortOrder: order++,
        });
      });
    };
    emitir(String(raiz));
  }
  const aviso = nos.length ? null : soServicos.length ? "Nenhum serviço do catálogo casou com os grupos deste tipo de obra." : "O catálogo não tem serviços (códigos C...) para gerar a EAP.";
  return { nos, servicosUsados: nos.filter(n => n.externalId !== null).length, servicosSemGrupo: semGrupo, gruposVazios, aviso };
}
function resolverGrupos(tipoDeObra?: string): Set<CategoriaDeObra> {
  if (!tipoDeObra) return new Set(GRUPOS.map(g => g.categoria));
  const tipo = TIPOS_DE_OBRA.find(t => t.value === tipoDeObra);
  if (!tipo) return new Set(GRUPOS.map(g => g.categoria));
  return new Set(tipo.grupos);
}

/**
 * Escolhe no máximo N serviços de um grupo que representem o grupo inteiro.
 *
 * Duas passadas. A primeira dá UM serviço de cada subgrupo da planilha, na
 * ordem em que a SEINFRA os organiza; a segunda completa a cota com o que
 * sobrou. Sem a primeira passada, o grupo "Instalações e redes" (que tem 1.882
 * serviços na SEINFRA-CE 028) saía com quatro conexões PVC de diâmetro
 * diferente em sequência e nenhumatubulação de aço, nenhum poço de visita,
 * nenhuma ligação predial — folha de EAP que não descreve a obra.
 *
 * Sem trilha (catálogo sem hierarquia), cai no espalhamento por índice, que
 * preserva o relativo sem inventar agrupamento.
 */
function escolherRepresentantes(
  candidatos: ServicoDoCatalogo[],
  maximo: number
): ServicoDoCatalogo[] {
  if (candidatos.length <= maximo) return candidatos;

  const comTrilha = candidatos.every(c => c.trilha && c.trilha.length);
  if (!comTrilha) {
    const out: ServicoDoCatalogo[] = [];
    const passo = candidatos.length / maximo;
    for (let i = 0; i < maximo; i += 1) {
      out.push(candidatos[Math.floor(i * passo)]!);
    }
    return out;
  }

  const escolhidos: ServicoDoCatalogo[] = [];
  const escolhidosIds = new Set<string>();
  const vistos = new Set<string>();
  for (const servico of candidatos) {
    if (escolhidos.length >= maximo) break;
    const chave = normalizar(servico.trilha!.join(" > "));
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    escolhidos.push(servico);
    escolhidosIds.add(servico.code);
  }
  // Segunda passada pelo que sobrou, espalhado: senão a cota remanescente
  // inteira vem do subgrupo mais populoso, e "Estrutura" saía com quatro
  // "FORMA" em sequência.
  const restantes = candidatos.filter(s => !escolhidosIds.has(s.code));
  if (restantes.length) {
    const passo = restantes.length / (maximo - escolhidos.length);
    for (let i = 0; escolhidos.length < maximo; i += 1) {
      const indice = Math.floor(i * passo);
      if (indice >= restantes.length) break;
      escolhidos.push(restantes[indice]!);
    }
  }
  return escolhidos;
}
