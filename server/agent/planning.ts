/**
 * Motor de raciocínio do Arquimedes.
 * Antes de rotear tools, a IA analisa o modelo digital da obra
 * e gera um plano de ação estruturado.
 */
import type { ProjectModel } from "../../shared/project-model";

export interface PlanoAcao {
  intencao: "analise" | "operacao" | "consulta";
  objetivo: string;
  passos: PlanoPasso[];
  ferramentasNecessarias: string[];
  riscos: string[];
  premissas: string[];
}

export interface PlanoPasso {
  ordem: number;
  descricao: string;
  ferramenta?: string;
  parametros?: Record<string, unknown>;
  resultadoEsperado: string;
}

/**
 * Gera um plano de ação estruturado baseado no modelo digital da obra.
 * É determinístico — não depende de LLM.
 */
export function gerarPlanoAcao(
  model: ProjectModel,
  intencao: "analise" | "operacao" | "consulta",
  objetivo: string
): PlanoAcao {
  const passos: PlanoPasso[] = [];
  const ferramentasNecessarias: string[] = [];
  const riscos: string[] = [];
  const premissas: string[] = [];

  // Passo 1: Validar estrutura da EAP
  if (model.eap.length === 0) {
    passos.push({
      ordem: 1,
      descricao: "EAP vazia. Verificar se a obra tem escopo definido.",
      resultadoEsperado: "Confirmar se EAP está vazia ou se há erro de carregamento.",
    });
    riscos.push("EAP vazia — análise limitada ao escopo declarado.");
  } else {
    passos.push({
      ordem: 1,
      descricao: `Validar estrutura da EAP (${model.eap.length} nós).`,
      ferramenta: "validar_estrutura",
      parametros: { project_id: model.project.code },
      resultadoEsperado: "Estrutura válida, sem órfãos ou duplicidades.",
    });
    ferramentasNecessarias.push("validar_estrutura");
  }

  // Passo 2: Verificar atividades e dependências
  if (model.activities.length === 0) {
    passos.push({
      ordem: 2,
      descricao: "Nenhuma atividade cronogramada. Verificar se há EAP mas sem atividades.",
      resultadoEsperado: "Confirmar se atividades existem ou se há gap de planejamento.",
    });
    riscos.push("Sem atividades — cronograma não operacional.");
  } else {
    passos.push({
      ordem: 2,
      descricao: `Verificar ${model.activities.length} atividades e ${model.dependencies.length} dependências.`,
      ferramenta: "listar_atividades",
      parametros: { project_id: model.project.code },
      resultadoEsperado: "Lista de atividades com duração e quantitativos.",
    });
    ferramentasNecessarias.push("listar_atividades");

    if (model.dependencies.length > 0) {
      passos.push({
        ordem: 3,
        descricao: "Validar rede de dependências.",
        ferramenta: "validar_dependencias",
        parametros: { project_id: model.project.code },
        resultadoEsperado: "Rede válida, sem ciclos ou desconexões.",
      });
      ferramentasNecessarias.push("validar_dependencias");
    }
  }

  // Passo 3: Verificar orçamento
  if (model.budget.items.length === 0) {
    passos.push({
      ordem: 4,
      descricao: "Orçamento vazio. Verificar se há budget definido.",
      resultadoEsperado: "Confirmar se orçamento existe ou se há gap.",
    });
    riscos.push("Sem orçamento — análise de custos limitada.");
  } else {
    passos.push({
      ordem: 4,
      descricao: `Analisar orçamento (${model.budget.items.length} itens).`,
      resultadoEsperado: "Orçamento com quantitativos e preços.",
    });
  }

  // Passo 4: Verificar produção
  if (model.production.entries.length === 0) {
    passos.push({
      ordem: 5,
      descricao: "Nenhum lançamento de produção. Verificar se obra iniciou.",
      resultadoEsperado: "Confirmar se produção existe ou se obra não iniciou.",
    });
  } else {
    passos.push({
      ordem: 5,
      descricao: `Analisar produção (${model.production.entries.length} lançamentos).`,
      resultadoEsperado: "Produção com quantidades e datas.",
    });
  }

  // Passo 5: Verificar baselines
  if (model.baselines.length === 0) {
    passos.push({
      ordem: 6,
      descricao: "Nenhum baseline definido. Verificar se há baseline aprovado.",
      resultadoEsperado: "Confirmar se baseline existe ou se há gap.",
    });
  } else {
    passos.push({
      ordem: 6,
      descricao: `Analisar ${model.baselines.length} baseline(s).`,
      resultadoEsperado: "Baseline com atividades e datas planejadas.",
    });
  }

  // Premissas
  premissas.push("Modelo digital carregado do banco local.");
  premissas.push("MCPs podem estar indisponíveis — fallback local ativo.");

  return {
    intencao,
    objetivo,
    passos,
    ferramentasNecessarias,
    riscos,
    premissas,
  };
}

/**
 * Formata o plano de ação para injeção no system prompt.
 */
export function formatarPlanoAcao(plano: PlanoAcao): string {
  const linhas: string[] = [
    "PLANO DE AÇÃO ESTRUTURADO:",
    `Intenção: ${plano.intencao}`,
    `Objetivo: ${plano.objetivo}`,
    "",
    "Passos:",
  ];

  for (const passo of plano.passos) {
    linhas.push(`  ${passo.ordem}. ${passo.descricao}`);
    if (passo.ferramenta) {
      linhas.push(`     Ferramenta: ${passo.ferramenta}`);
    }
    linhas.push(`     Resultado esperado: ${passo.resultadoEsperado}`);
  }

  if (plano.ferramentasNecessarias.length > 0) {
    linhas.push("", "Ferramentas necessárias:");
    for (const ferramenta of plano.ferramentasNecessarias) {
      linhas.push(`  - ${ferramenta}`);
    }
  }

  if (plano.riscos.length > 0) {
    linhas.push("", "Riscos identificados:");
    for (const risco of plano.riscos) {
      linhas.push(`  - ${risco}`);
    }
  }

  if (plano.premissas.length > 0) {
    linhas.push("", "Premissas:");
    for (const premissa of plano.premissas) {
      linhas.push(`  - ${premissa}`);
    }
  }

  return linhas.join("\n");
}
