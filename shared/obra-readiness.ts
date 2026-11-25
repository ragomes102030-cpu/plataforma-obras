export type EstadoProntidao = "bloqueado" | "incompleto" | "pronto_revisao" | "aprovado" | "desatualizado" | "indisponivel";

export type EtapaProntidao = "escopo" | "eap" | "orcamento" | "atividades" | "rede" | "cpm" | "baseline" | "execucao";

export type BloqueioProntidao = {
  codigo: string;
  titulo: string;
  explicacao: string;
  comoResolver: string;
  impacta: EtapaProntidao[];
  severidade: "critica" | "alta" | "media";
};

export type SnapshotProntidao = {
  escopo?: { declarado: boolean; validado: boolean };
  eap?: { existe: boolean; aprovada: boolean; folhas: number };
  orcamento?: { existe: boolean; aprovado: boolean; itens: number; semComposicao: number; itensComBloqueioDeAprovacao: number };
  atividades?: { total: number; semLocal: number; semDuracao: number };
  rede?: { totalAtividades: number; totalDependencias: number; ciclos: number; desconectada?: boolean };
  cpm?: { calculadoEm: string | null; alteradoDepois: boolean; atividadesCalculadas: number };
  baseline?: { existe: boolean; aprovada: boolean };
  execucao?: { medicoes: number; comUnidade: number; confirmadas: number };
  lob?: { parcelas: number; foraJanelaCpm: number; orfas: number; parcelasEmLocaisDidaticos?: number; atividadesSemLocalOperacional?: number };
};

export type ResultadoProntidao = {
  etapas: Record<EtapaProntidao, { estado: EstadoProntidao; bloqueios: BloqueioProntidao[] }>;
  primeiraBarreira: BloqueioProntidao | null;
  /** O planejamento pode ser usado mesmo enquanto o gate financeiro está em revisão. */
  prontoParaPlanejamento: boolean;
  prontoParaAcompanhamento: boolean;
};

const bloqueio = (codigo: string, titulo: string, explicacao: string, comoResolver: string, impacta: EtapaProntidao[], severidade: BloqueioProntidao["severidade"] = "alta"): BloqueioProntidao => ({ codigo, titulo, explicacao, comoResolver, impacta, severidade });

export function avaliarProntidaoObra(snapshot: SnapshotProntidao): ResultadoProntidao {
  const etapas = {} as ResultadoProntidao["etapas"];
  const add = (etapa: EtapaProntidao, estado: EstadoProntidao, bloqueios: BloqueioProntidao[] = []) => { etapas[etapa] = { estado, bloqueios }; };
  const escopo = snapshot.escopo;
  if (!escopo?.declarado) add("escopo", "bloqueado", [bloqueio("ESCOPO_AUSENTE", "Escopo não declarado", "A obra ainda não informa claramente o que será entregue.", "Preencha natureza, localização, descrição e premissas na aba Escopo.", ["escopo", "eap", "orcamento"], "critica")]);
  else if (!escopo.validado) add("escopo", "pronto_revisao", [bloqueio("ESCOPO_NAO_VALIDADO", "EAP aguardando aprovação", "O escopo da obra está cadastrado, mas a versão de trabalho da EAP ainda não foi aprovada como referência do planejamento.", "Revise a hierarquia e os pacotes de trabalho e aprove a versão na aba EAP. A aprovação congela essa versão.", ["eap"], "alta")]);
  else add("escopo", "aprovado");

  const eap = snapshot.eap;
  if (!eap?.existe || eap.folhas === 0) add("eap", "bloqueado", [bloqueio("EAP_SEM_FOLHAS", "EAP sem pacotes executáveis", "A estrutura não possui folhas que possam virar atividades.", "Crie os filhos dos nós até que os pacotes de trabalho estejam definidos.", ["atividades", "orcamento"], "critica")]);
  else if (!eap.aprovada) add("eap", "pronto_revisao", [bloqueio("EAP_NAO_APROVADA", "EAP em revisão", "A EAP existe, mas ainda não é a referência consolidada da obra.", "Revise a hierarquia e aprove uma versão da EAP antes de liberar baseline.", ["baseline", "cpm"], "alta")]);
  else add("eap", "aprovado");

  const orc = snapshot.orcamento;
  const orcBloqueios: BloqueioProntidao[] = [];
  if (!orc?.existe || orc.itens === 0) orcBloqueios.push(bloqueio("ORCAMENTO_AUSENTE", "Orçamento inexistente", "Não há itens para formar custo planejado.", "Crie uma versão de orçamento a partir das folhas da EAP.", ["orcamento", "execucao"], "critica"));
  else {
    if (orc.itensComBloqueioDeAprovacao > 0) orcBloqueios.push(bloqueio("ORCAMENTO_ITENS_PENDENTES", "Orçamento com itens pendentes de validação", `${orc.itensComBloqueioDeAprovacao} item(ns) ainda têm bloqueio de preço, origem rastreável ou evidência de quantidade.`, "Abra Orçamento e Custos, corrija os bloqueios listados e documente exceções com fonte e evidência verificáveis.", ["orcamento", "execucao"], "alta"));
  }
  add("orcamento", orcBloqueios.length ? "incompleto" : orc?.aprovado ? "aprovado" : "pronto_revisao", orcBloqueios);

  const atividades = snapshot.atividades;
  const atividadeBloqueios: BloqueioProntidao[] = [];
  if (!atividades?.total) atividadeBloqueios.push(bloqueio("ATIVIDADES_AUSENTES", "Cronograma sem atividades", "Não há unidades executáveis para calcular prazo.", "Gere atividades a partir das folhas aprovadas da EAP.", ["atividades", "rede", "cpm"], "critica"));
  else if (atividades.semDuracao > 0) atividadeBloqueios.push(bloqueio("ATIVIDADES_SEM_DURACAO", "Atividades sem duração", `${atividades.semDuracao} atividade(s) não têm duração calculável.`, "Informe produtividade validada ou duração explícita; não invente duração.", ["cpm", "baseline"], "alta"));
  add("atividades", atividadeBloqueios.length ? "incompleto" : "pronto_revisao", atividadeBloqueios);

  const rede = snapshot.rede;
  const redeBloqueios: BloqueioProntidao[] = [];
  if (!rede?.totalAtividades) redeBloqueios.push(bloqueio("REDE_AUSENTE", "Rede de precedências ausente", "O cronograma não possui atividades suficientes para formar uma rede.", "Cadastre atividades e suas relações dentro da mesma obra.", ["rede", "cpm"], "critica"));
  if (rede?.ciclos) redeBloqueios.push(bloqueio("REDE_COM_CICLO", "Rede contém ciclo", `${rede.ciclos} ciclo(s) impedem o cálculo determinístico.`, "Remova a relação que fecha o ciclo e recalcule a rede.", ["rede", "cpm"], "critica"));
  // Nós sem predecessor são raízes legítimas da rede (por exemplo, o início
  // planejado da obra). A qualidade da rede deve ser bloqueada por ciclos ou
  // componentes desconectados, não pela ausência de um elo de entrada no nó
  // inicial.
  if (rede?.desconectada) redeBloqueios.push(bloqueio("REDE_DESCONECTADA", "Rede de atividades desconectada", "Há atividades em blocos sem ligação entre si; cada bloco pode ser calculado como se começasse no dia zero.", "Conecte as cadeias com dependências tecnicamente justificadas e recalcule o CPM. Preserve atividades de início sem predecessora quando forem raízes válidas.", ["rede", "cpm"], "critica"));
  add("rede", redeBloqueios.length ? "bloqueado" : "pronto_revisao", redeBloqueios);

  const cpm = snapshot.cpm;
  const cpmBloqueios: BloqueioProntidao[] = [];
  if (!cpm?.calculadoEm || cpm.alteradoDepois) cpmBloqueios.push(bloqueio("CPM_DESATUALIZADO", "CPM ausente ou desatualizado", "Datas, durações ou dependências mudaram depois do último cálculo.", "Corrija a rede e execute Calcular CPM antes de confiar em prazo, folgas ou caminho crítico.", ["cpm", "baseline"], "critica"));
  add("cpm", cpmBloqueios.length ? "desatualizado" : "pronto_revisao", cpmBloqueios);

  const baseline = snapshot.baseline;
  const baselineBloqueios: BloqueioProntidao[] = [];
  if (!baseline?.existe || !baseline.aprovada) baselineBloqueios.push(bloqueio("BASELINE_AUSENTE", "Baseline não aprovada", "Ainda não existe uma referência congelada para comparar o realizado.", "Aprove a EAP, recalcule o CPM e capture a baseline de prazo. O orçamento continua no fluxo financeiro e não é pré-requisito para congelar o cronograma.", ["baseline", "execucao"], "alta"));
  add("baseline", baselineBloqueios.length ? "bloqueado" : "aprovado", baselineBloqueios);

  const execucao = snapshot.execucao;
  const lob = snapshot.lob;
  const execBloqueios: BloqueioProntidao[] = [];
  if (lob?.atividadesSemLocalOperacional) execBloqueios.push(bloqueio("LOB_ATIVIDADES_SEM_UNIDADE", "Atividades sem unidade operacional específica", `${lob.atividadesSemLocalOperacional} atividade(s) ainda não estão vinculadas a uma unidade física cadastrada; por isso, não podem ser distribuídas automaticamente na Linha de Balanço.`, "Use uma correspondência exata com unidades físicas cadastradas. Para escopos gerais, decomponha por local somente quando os documentos definirem essa distribuição; serviços sem repetição podem permanecer fora da LOB.", ["execucao"], "media"));
  if (lob?.orfas) execBloqueios.push(bloqueio("LOB_PARCELAS_ORFAS", "Parcelas sem atividade válida", `${lob.orfas} parcela(s) referenciam atividades ausentes na versão corrente.`, "Revise as referências na versão de trabalho antes da homologação.", ["execucao"], "critica"));
  if (lob?.parcelasEmLocaisDidaticos) execBloqueios.push(bloqueio("LOB_LOCAL_DIDATICO", "Parcelas em locais demonstrativos", `${lob.parcelasEmLocaisDidaticos} parcela(s) estão atribuídas a locais identificados como didáticos.`, "Revise a localização física de cada serviço na versão de trabalho. Serviços globais não devem gerar repetição artificial entre pavimentos.", ["execucao"], "critica"));
  if (lob?.foraJanelaCpm) execBloqueios.push(bloqueio("LOB_FORA_JANELA_CPM", "Linha de Balanço contradiz o CPM", `${lob.foraJanelaCpm} parcela(s) estão fora da janela oficial de execução da atividade.`, "Revise datas e locais na versão de trabalho, respeitando o calendário da obra. Não invente escadinhas.", ["execucao"], "critica"));
  if (!execucao?.medicoes) execBloqueios.push(bloqueio(
    "MEDICAO_AUSENTE",
    "Boletim de medição contratual pendente",
    "Não há boletim de medição aprovado, faturado ou pago. Lançamentos de produção confirmados no Controle são apontamentos de campo e não substituem o boletim contratual.",
    "Abra Orçamento e Custos > Medição e desembolso para conferir itens, quantidades, unidades, período e evidências; aprove o boletim somente após validar a medição real.",
    ["execucao"],
    "media"
  ));
  else if (!execucao.comUnidade) execBloqueios.push(bloqueio(
    "MEDICAO_SEM_ITENS",
    "Boletim contratual sem itens quantitativos vinculados",
    "Há boletim(ns) aprovados, faturados ou pagos, mas nenhum item quantitativo do orçamento está vinculado. Lançamentos de produção, sozinhos, não formam um boletim contratual.",
    "Abra Orçamento e Custos > Medição e desembolso, vincule os itens corretos e confira quantidade, unidade, período e evidência antes da aprovação.",
    ["execucao"],
    "alta"
  ));
  add("execucao", execBloqueios.length ? "incompleto" : "pronto_revisao", execBloqueios);
  const ordem: EtapaProntidao[] = ["escopo", "eap", "orcamento", "atividades", "rede", "cpm", "baseline", "execucao"];
  const primeiraBarreira = ordem.flatMap(etapa => etapas[etapa].bloqueios)[0] ?? null;
  // Orçamento sem composição e baseline ausente impedem controle financeiro/EV,
  // mas não devem impedir o engenheiro de continuar estruturando o planejamento.
  // O gate estrutural continua rígido para evitar cronograma sem escopo, EAP,
  // rede ou CPM coerentes.
  const gateEstrutural = ["escopo", "eap", "atividades", "rede", "cpm"] as EtapaProntidao[];
  const prontoParaPlanejamento = gateEstrutural.every(etapa => etapas[etapa].bloqueios.length === 0);
  return {
    etapas,
    primeiraBarreira,
    prontoParaPlanejamento,
    prontoParaAcompanhamento: !primeiraBarreira,
  };
}
