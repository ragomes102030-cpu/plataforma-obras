import { avaliarCpmGantt, type RegistroCpm } from "./gantt-cpm-validade";

export type OrientacaoDeBloqueio = {
  id: string;
  severidade: "bloqueio" | "alerta";
  titulo: string;
  oQueAconteceu: string;
  porQueBloqueia: string;
  passos: string[];
  abaDestino: "eap" | "atividades" | "dependencias" | "cpm" | "baseline" | "producao" | "financeiro";
  rotuloAcao: string;
  evidenciaDeResolucao: string;
  dadosPreservados?: string;
  detalhesTecnicos?: string;
};

export type EntradaDaOrientacao = {
  eapApproved: boolean;
  canCreateActivities?: boolean;
  currentVersionNumber: number | null;
  activities: readonly (RegistroCpm & { id?: number; exemplo?: number | null })[];
  networkValidation: { valid: boolean; issues: readonly { message: string }[] } | null;
  baselines: readonly { status: string; versionId: number | null }[];
  approvedVersionId: number | null;
};

const bloqueio = (
  orientacao: Omit<OrientacaoDeBloqueio, "severidade">,
): OrientacaoDeBloqueio => ({ severidade: "bloqueio", ...orientacao });

/**
 * Explica o fluxo sem interpretar mensagens do servidor. Cada orientação nasce
 * de um estado estruturado e ensina problema, impacto, correção e evidência.
 */
export function orientarFluxoPlanejamento(input: EntradaDaOrientacao) {
  const orientacoes: OrientacaoDeBloqueio[] = [];
  const atividades = input.activities.filter(atividade => Number(atividade.exemplo ?? 0) !== 1);
  const cpm = avaliarCpmGantt(atividades);

  if (!input.eapApproved && !input.canCreateActivities) {
    orientacoes.push(bloqueio({
      id: "eap-nao-aprovada",
      titulo: "Aprovar a Estrutura Analítica",
      oQueAconteceu: "A versão atual da EAP ainda não foi aprovada.",
      porQueBloqueia: "Atividades e baseline precisam nascer de uma estrutura revisada para manter rastreabilidade do escopo.",
      passos: [
        "Abra a EAP e revise a hierarquia, as folhas e o dicionário.",
        "Resolva os bloqueios indicados na própria tela.",
        "Aprove a versão depois da revisão do engenheiro.",
      ],
      abaDestino: "eap",
      rotuloAcao: "Revisar e aprovar EAP",
      evidenciaDeResolucao: "A versão da EAP aparece como aprovada e a criação de atividades é liberada.",
      dadosPreservados: "O escopo e as versões existentes permanecem preservados durante a revisão.",
    }));
  }

  if (atividades.length === 0) {
    orientacoes.push(bloqueio({
      id: "atividades-ausentes",
      titulo: "Definir atividades do cronograma",
      oQueAconteceu: "A obra ainda não possui atividades operacionais cadastradas.",
      porQueBloqueia: "Sem atividades não existem durações, vínculos, caminho crítico ou datas calculáveis.",
      passos: [
        "Abra Atividades e gere ou cadastre os serviços a partir das folhas da EAP.",
        "Informe uma duração fundamentada para cada serviço.",
        "Revise unidade e quantidade quando esses dados estiverem disponíveis.",
      ],
      abaDestino: "atividades",
      rotuloAcao: "Criar atividades",
      evidenciaDeResolucao: "A aba Atividades mostra serviços operacionais com duração válida.",
    }));
  } else if (cpm.duracoesInvalidas > 0) {
    orientacoes.push(bloqueio({
      id: "duracoes-invalidas",
      titulo: "Completar durações das atividades",
      oQueAconteceu: `${cpm.duracoesInvalidas} atividade(s) estão sem duração válida.`,
      porQueBloqueia: "O CPM não calcula datas e folgas quando uma atividade tem duração ausente, zero ou inválida.",
      passos: [
        "Abra Atividades e localize os serviços sinalizados.",
        "Defina durações com base em produtividade, equipe ou premissa explicitamente identificada.",
        "Salve e confirme que nenhuma duração inválida permanece.",
      ],
      abaDestino: "atividades",
      rotuloAcao: "Corrigir durações",
      evidenciaDeResolucao: "O diagnóstico de atividades informa zero durações inválidas.",
      detalhesTecnicos: `duracoesInvalidas=${cpm.duracoesInvalidas}`,
    }));
  }

  if (atividades.length > 0 && !input.networkValidation) {
    orientacoes.push(bloqueio({
      id: "rede-ausente",
      titulo: "Montar a rede de dependências",
      oQueAconteceu: "A rede de precedências ainda não foi validada.",
      porQueBloqueia: "Sem sequência lógica o sistema não sabe quais atividades liberam as seguintes nem consegue calcular o caminho crítico.",
      passos: [
        "Abra Dependências e conecte predecessoras e sucessoras.",
        "Comece por vínculos FS e use outros tipos somente quando a lógica executiva exigir.",
        "Revise atividades isoladas e valide a rede.",
      ],
      abaDestino: "dependencias",
      rotuloAcao: "Resolver dependências",
      evidenciaDeResolucao: "A tela informa rede válida, sem ciclos ou referências inconsistentes.",
    }));
  } else if (atividades.length > 0 && input.networkValidation && !input.networkValidation.valid) {
    orientacoes.push(bloqueio({
      id: "rede-invalida",
      titulo: "Corrigir a rede de dependências",
      oQueAconteceu: `A validação encontrou ${input.networkValidation.issues.length || 1} inconsistência(s) na rede.`,
      porQueBloqueia: "Uma rede com ciclos ou vínculos inválidos produz datas, folgas e caminho crítico incorretos.",
      passos: [
        "Abra Dependências e consulte as inconsistências indicadas.",
        "Corrija ou remova somente os vínculos problemáticos.",
        "Valide novamente antes de calcular o CPM.",
      ],
      abaDestino: "dependencias",
      rotuloAcao: "Resolver dependências",
      evidenciaDeResolucao: "A validação da rede passa sem ciclos, autorrelações ou atividades externas à versão.",
      dadosPreservados: "Atividades e vínculos válidos permanecem preservados.",
      detalhesTecnicos: input.networkValidation.issues.map(item => item.message).join(" | "),
    }));
  }

  const redeValida = input.networkValidation?.valid === true;
  if (atividades.length > 0 && cpm.duracoesInvalidas === 0 && redeValida && !cpm.valido) {
    orientacoes.push(bloqueio({
      id: "cpm-desatualizado",
      titulo: "Recalcular o caminho crítico",
      oQueAconteceu: "O cálculo CPM está ausente, incompleto ou anterior à última alteração do cronograma.",
      porQueBloqueia: "Datas, folgas e caminho crítico desatualizados não podem sustentar uma baseline confiável.",
      passos: [
        "Abra CPM / Caminho Crítico.",
        "Confira o resumo da rede e execute o cálculo.",
        "Revise duração total, atividades críticas e folgas antes de continuar.",
      ],
      abaDestino: "cpm",
      rotuloAcao: "Calcular CPM",
      evidenciaDeResolucao: "Todas as atividades exibem cálculo CPM posterior à última alteração.",
    }));
  }

  if (atividades.length > 0 && cpm.duracoesInvalidas === 0 && redeValida && cpm.valido) {
    if (!input.eapApproved) {
      orientacoes.push(bloqueio({
        id: "versao-nao-aprovada",
        titulo: "Aprovar a versão de trabalho",
        oQueAconteceu: "O cronograma está calculado, mas a versão de trabalho ainda não foi aprovada.",
        porQueBloqueia: "A baseline só pode congelar uma versão revisada e aprovada do plano.",
        passos: [
          "Abra Baseline e revise o resumo da versão de trabalho.",
          "Confirme EAP, atividades, rede e resultado do CPM.",
          "Aprove a versão antes de capturar a referência.",
        ],
        abaDestino: "baseline",
        rotuloAcao: "Revisar versão do plano",
        evidenciaDeResolucao: "A versão corrente aparece como aprovada e apta para captura.",
        dadosPreservados: "A baseline vigente anterior não é apagada durante a revisão.",
      }));
    } else {
      const vigentes = input.baselines.filter(baseline => baseline.status === "ativa");
      if (vigentes.length !== 1 || vigentes[0]?.versionId !== input.approvedVersionId) {
        orientacoes.push(bloqueio({
          id: "baseline-ausente",
          titulo: "Capturar a baseline da versão aprovada",
          oQueAconteceu: "A versão aprovada atual ainda não possui uma baseline vigente correspondente.",
          porQueBloqueia: "Sem referência congelada o sistema não consegue distinguir o plano aprovado das alterações e do realizado.",
          passos: [
            "Abra Baseline e confira a versão aprovada e o CPM calculado.",
            "Registre um nome claro para a referência.",
            "Capture e confirme a baseline vigente.",
          ],
          abaDestino: "baseline",
          rotuloAcao: "Capturar baseline",
          evidenciaDeResolucao: "Existe exatamente uma baseline ativa vinculada à versão aprovada atual.",
        }));
      }
    }
  }

  return {
    bloqueado: orientacoes.length > 0,
    primaria: orientacoes[0] ?? null,
    demais: orientacoes.slice(1),
  };
}
