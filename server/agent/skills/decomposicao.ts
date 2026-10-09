/**
 * Skill executável: Decomposição profissional de EAP.
 * Converte o conhecimento do markdown em código determinístico.
 */
import type { Skill, SkillContext, SkillInput, SkillOutput } from "./types";

export interface DecomposicaoInput extends SkillInput {
  escopo: string;
  tipoDeObra?: string;
  pavimentos?: number;
  blocos?: number;
  frentes?: string[];
}

export interface DecomposicaoOutput extends SkillOutput {
  data?: {
    estrutura: string[];
    justificativas: string[];
    nivelRecomendado: number;
  };
}

const skill: Skill<DecomposicaoInput, DecomposicaoOutput> = {
  id: "planejamento.eap.decomposicao",
  version: "1.0.0",
  description: "Decomposição profissional de EAP orientada ao escopo/entregáveis.",

  async execute(input: DecomposicaoInput, _context: SkillContext): Promise<DecomposicaoOutput> {
    const erros: string[] = [];
    const avisos: string[] = [];

    // Validação de entrada
    if (!input.escopo || typeof input.escopo !== "string" || input.escopo.trim().length < 10) {
      erros.push("Escopo deve ter pelo menos 10 caracteres.");
    }

    if (input.pavimentos !== undefined && input.pavimentos < 1) {
      erros.push("Número de pavimentos deve ser >= 1.");
    }

    if (input.blocos !== undefined && input.blocos < 1) {
      erros.push("Número de blocos deve ser >= 1.");
    }

    if (erros.length > 0) {
      return { success: false, errors: erros };
    }

    // Lógica de decomposição
    const estrutura: string[] = [];
    const justificativas: string[] = [];
    let nivelRecomendado = 1;

    // Nível 1: Obra completa
    estrutura.push("1. Obra completa");
    justificativas.push("Raiz da EAP. Agrega todo o escopo.");

    // Nível 2: Grandes disciplinas
    estrutura.push("1.1 Estrutura");
    estrutura.push("1.2 Fundações");
    estrutura.push("1.3 Alvenaria");
    estrutura.push("1.4 Cobertura");
    estrutura.push("1.5 Instalações");
    estrutura.push("1.6 Acabamentos");
    justificativas.push("Disciplinas mutuamente exclusivas que cobrem 100% do escopo.");
    nivelRecomendado = 2;

    // Nível 3: Decomposição por pavimento (se aplicável)
    if (input.pavimentos && input.pavimentos > 1) {
      estrutura.push("1.1.1 Pavimento 1");
      estrutura.push("1.1.2 Pavimento 2");
      if (input.pavimentos > 2) {
        estrutura.push(`1.1.3 Pavimentos 3-${input.pavimentos}`);
      }
      justificativas.push(`Decomposição por pavimento recomendada para ${input.pavimentos} pavimentos.`);
      nivelRecomendado = 3;
    }

    // Nível 3: Decomposição por bloco (se aplicável)
    if (input.blocos && input.blocos > 1) {
      estrutura.push("1.1.1 Bloco A");
      estrutura.push("1.1.2 Bloco B");
      if (input.blocos > 2) {
        estrutura.push(`1.1.3 Blocos C-${String.fromCharCode(64 + input.blocos)}`);
      }
      justificativas.push(`Decomposição por bloco recomendada para ${input.blocos} blocos.`);
      nivelRecomendado = 3;
    }

    // Nível 3: Decomposição por frente (se aplicável)
    if (input.frentes && input.frentes.length > 0) {
      for (const frente of input.frentes) {
        estrutura.push(`1.1.${input.frentes.indexOf(frente) + 1} ${frente}`);
      }
      justificativas.push(`Decomposição por frente recomendada: ${input.frentes.join(", ")}.`);
      nivelRecomendado = 3;
    }

    // Avisos
    if (!input.pavimentos && !input.blocos && (!input.frentes || input.frentes.length === 0)) {
      avisos.push("Nenhuma dimensão de localização fornecida. Decomposição pode ser insuficiente para obras multi-pavimento.");
    }

    if (input.tipoDeObra === "edificio" && !input.pavimentos) {
      avisos.push("Edificação sem número de pavimentos. Considere decompor por pavimento.");
    }

    return {
      success: true,
      data: {
        estrutura,
        justificativas,
        nivelRecomendado,
      },
      warnings: avisos,
    };
  },
};

export default skill;
