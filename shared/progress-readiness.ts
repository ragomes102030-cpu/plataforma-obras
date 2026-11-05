import type { OrientacaoDeBloqueio } from "./planning-guidance";

export type EntradaProntidaoDeAvanco = {
  pesosFisicosAprovados: boolean;
  temProducaoConfirmada: boolean;
  orcamentoAprovado: boolean;
  orcamentoDidatico: boolean;
  atividadesSemCusto: number;
  erroFisico?: boolean;
  erroFinanceiro?: boolean;
};

export type ProntidaoDeAvanco = {
  fisico: "disponivel" | "sem_pesos" | "sem_producao" | "erro";
  financeiro: "disponivel" | "sem_orcamento" | "cobertura_incompleta" | "didatico" | "erro";
  evDisponivel: boolean;
  orientacoes: OrientacaoDeBloqueio[];
};

const alerta = (entrada: Omit<OrientacaoDeBloqueio, "severidade">): OrientacaoDeBloqueio => ({
  severidade: "alerta",
  ...entrada,
});

/** Avalia os dois eixos sem usar orçamento como substituto de peso físico. */
export function avaliarProntidaoDeAvanco(input: EntradaProntidaoDeAvanco): ProntidaoDeAvanco {
  const fisico: ProntidaoDeAvanco["fisico"] = input.erroFisico
    ? "erro"
    : !input.pesosFisicosAprovados
      ? "sem_pesos"
      : !input.temProducaoConfirmada
        ? "sem_producao"
        : "disponivel";
  const financeiro: ProntidaoDeAvanco["financeiro"] = input.erroFinanceiro
    ? "erro"
    : !input.orcamentoAprovado
      ? "sem_orcamento"
      : input.orcamentoDidatico
        ? "didatico"
        : input.atividadesSemCusto > 0
          ? "cobertura_incompleta"
          : "disponivel";

  const orientacoes: OrientacaoDeBloqueio[] = [];
  if (fisico === "erro") {
    orientacoes.push(alerta({
      id: "avanco-fisico-erro", titulo: "Não foi possível consultar o avanço físico",
      oQueAconteceu: "Uma fonte necessária ao acompanhamento físico não respondeu.",
      porQueBloqueia: "Sem leitura confirmada o painel não pode publicar percentual realizado ou desvio.",
      passos: ["Atualize a página.", "Confira Atividades e Produção se o erro continuar."],
      abaDestino: "producao", rotuloAcao: "Conferir produção",
      evidenciaDeResolucao: "O painel volta a classificar o avanço físico sem erro de consulta.",
    }));
  } else if (fisico === "sem_pesos") {
    orientacoes.push(alerta({
      id: "avanco-fisico-sem-pesos", titulo: "Definir pesos do avanço físico",
      oQueAconteceu: "As atividades existem, mas não há pesos físicos aprovados para consolidar a obra.",
      porQueBloqueia: "Somar m², m³, unidades e dias mistura grandezas diferentes e produziria um percentual falso. O acompanhamento por atividade continua disponível.",
      passos: [
        "Revise as atividades e seus critérios de medição.",
        "Defina uma participação física explícita para cada atividade operacional.",
        "Submeta os pesos à validação do engenheiro antes de publicar o agregado.",
      ],
      abaDestino: "atividades", rotuloAcao: "Definir pesos físicos",
      evidenciaDeResolucao: "Os pesos físicos aprovados cobrem 100% das atividades operacionais sem duplicidade.",
      dadosPreservados: "Prazos, produção e orçamento permanecem preservados; apenas o percentual agregado fica oculto.",
    }));
  } else if (fisico === "sem_producao") {
    orientacoes.push(alerta({
      id: "avanco-fisico-sem-producao", titulo: "Registrar a produção realizada",
      oQueAconteceu: "Não existe produção confirmada até a data de referência.",
      porQueBloqueia: "Ausência de lançamento não comprova execução zero; por isso o painel não calcula realizado nem desvio.",
      passos: ["Abra Produção.", "Lance a quantidade executada na atividade correta.", "Revise e confirme o lançamento."],
      abaDestino: "producao", rotuloAcao: "Registrar produção",
      evidenciaDeResolucao: "Existe ao menos um lançamento confirmado, válido e vinculado à versão atual.",
    }));
  }

  if (financeiro === "erro") {
    orientacoes.push(alerta({
      id: "orcamento-erro", titulo: "Não foi possível consultar o orçamento",
      oQueAconteceu: "A fonte financeira não respondeu.",
      porQueBloqueia: "O valor agregado não pode ser calculado sem confirmar orçamento, preços e cobertura.",
      passos: ["Atualize a página.", "Abra Orçamento e Custos se o erro continuar."],
      abaDestino: "financeiro", rotuloAcao: "Conferir orçamento",
      evidenciaDeResolucao: "O orçamento volta a ser consultado e recebe um estado de prontidão específico.",
    }));
  } else if (financeiro === "sem_orcamento") {
    orientacoes.push(alerta({
      id: "orcamento-sem-referencia", titulo: "Aprovar o orçamento de referência",
      oQueAconteceu: "Não há uma versão de orçamento aprovada para a obra.",
      porQueBloqueia: "Valor agregado, custo planejado e curva financeira exigem uma referência de preço rastreável.",
      passos: ["Abra Orçamento e Custos.", "Revise quantitativos, preços, fontes e BDI.", "Aprove a versão depois da conferência."],
      abaDestino: "financeiro", rotuloAcao: "Aprovar orçamento de referência",
      evidenciaDeResolucao: "Existe uma versão ativa aprovada, com itens precificados e fontes identificadas.",
    }));
  } else if (financeiro === "didatico") {
    orientacoes.push(alerta({
      id: "orcamento-didatico", titulo: "Substituir o orçamento de teste",
      oQueAconteceu: "A versão aprovada contém somente valores didáticos de teste.",
      porQueBloqueia: "Dados de demonstração validam o fluxo, mas não representam custo real nem habilitam valor agregado.",
      passos: ["Abra Orçamento e Custos.", "Importe ou cadastre preços com fonte e data-base.", "Revise a cobertura e aprove a nova referência."],
      abaDestino: "financeiro", rotuloAcao: "Revisar orçamento de teste",
      evidenciaDeResolucao: "A versão aprovada não contém itens identificados como didáticos e possui fontes rastreáveis.",
    }));
  } else if (financeiro === "cobertura_incompleta") {
    orientacoes.push(alerta({
      id: "orcamento-cobertura-incompleta", titulo: "Completar a cobertura financeira",
      oQueAconteceu: `${input.atividadesSemCusto} atividade(s) operacionais estão sem custo vinculado.`,
      porQueBloqueia: "O valor agregado parcial faria a obra parecer mais avançada ou mais atrasada do que está.",
      passos: ["Abra Orçamento e Custos.", "Vincule cada atividade a um item válido ou classifique-a explicitamente como marco sem custo.", "Revalide a cobertura."],
      abaDestino: "financeiro", rotuloAcao: "Completar cobertura do orçamento",
      evidenciaDeResolucao: "Todas as atividades operacionais têm custo válido ou justificativa explícita de ausência de custo.",
      detalhesTecnicos: `atividadesSemCusto=${input.atividadesSemCusto}`,
    }));
  }

  return {
    fisico,
    financeiro,
    evDisponivel: fisico === "disponivel" && financeiro === "disponivel",
    orientacoes,
  };
}
