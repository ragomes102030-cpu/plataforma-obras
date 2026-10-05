/**
 * Templates canônicos de EAP.
 *
 * A EAP define o escopo/entregáveis da obra. Catálogos de preços são fontes
 * posteriores para orçamento, composições e quantitativos; não definem a árvore.
 *
 * O template é uma estrutura inicial adaptativa: Arquimedes e o usuário podem
 * decompor, remover ou acrescentar pacotes antes da aprovação da baseline.
 */

export type TipoTemplateEap = "edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos";

export type TemplateEapNode = {
  name: string;
  nodeType: "grupo" | "pacote" | "entrega";
  decompositionBasis: "project" | "deliverable" | "system" | "discipline" | "location" | "phase" | "component" | "other";
  description: string;
  inclusions: string;
  exclusions: string;
  acceptanceCriteria: string;
  children?: TemplateEapNode[];
};

const pacote = (name: string, description?: string): TemplateEapNode => ({
  name,
  nodeType: "pacote",
  decompositionBasis: "deliverable",
  description: description ?? `Entregável de ${name.toLowerCase()} necessário para concluir a obra.`,
  inclusions: `Serviços e entregas necessários para ${name.toLowerCase()}, conforme projeto e escopo contratado.`,
  exclusions: "Itens pertencentes a outros pacotes ou explicitamente fora do escopo contratado.",
  acceptanceCriteria: `Entregável ${name.toLowerCase()} concluído, inspecionado e aceito conforme projeto, especificações e critérios de qualidade.`,
});

const grupo = (
  name: string,
  children: TemplateEapNode[],
  decompositionBasis: TemplateEapNode["decompositionBasis"] = "phase",
): TemplateEapNode => ({
  name,
  nodeType: "grupo",
  decompositionBasis,
  description: `Escopo da fase ${name.toLowerCase()}.`,
  inclusions: `Todos os entregáveis necessários para concluir ${name.toLowerCase()}.`,
  exclusions: "Escopos pertencentes a outras fases ou fora do contrato.",
  acceptanceCriteria: `Fase ${name.toLowerCase()} concluída e liberada para a próxima etapa.`,
  children,
});

export const TEMPLATES_EAP: Record<Exclude<TipoTemplateEap, "todos">, TemplateEapNode[]> = {
  edificio: [
    grupo("Implantação e administração", [
      pacote("Mobilização e canteiro"),
      pacote("Administração e controle da obra"),
      pacote("Licenças, sinalização e segurança"),
    ], "phase"),
    grupo("Serviços preliminares", [
      pacote("Locação e preparação do terreno"),
      pacote("Limpeza e remoção"),
      pacote("Demolições e remanejamentos", "Demolições e remanejamentos previstos no projeto e no escopo da obra."),
    ], "phase"),
    grupo("Infraestrutura", [
      pacote("Terraplenagem"),
      pacote("Fundações"),
      pacote("Contenções"),
    ], "system"),
    grupo("Superestrutura", [
      pacote("Pilares"),
      pacote("Vigas"),
      pacote("Lajes"),
      pacote("Escadas e elementos estruturais complementares"),
    ], "system"),
    grupo("Vedações", [
      pacote("Alvenarias"),
      pacote("Divisórias e sistemas leves"),
      pacote("Elementos de vedação complementares"),
    ], "system"),
    grupo("Cobertura", [
      pacote("Estrutura da cobertura"),
      pacote("Telhamento e fechamento"),
      pacote("Calhas, rufos e arremates"),
    ], "system"),
    grupo("Impermeabilização", [
      pacote("Impermeabilização de fundações e áreas enterradas"),
      pacote("Impermeabilização de áreas molhadas"),
      pacote("Impermeabilização de cobertura e áreas expostas"),
    ], "system"),
    grupo("Revestimentos", [
      pacote("Chapisco, emboço e reboco"),
      pacote("Contrapisos"),
      pacote("Revestimentos de paredes"),
      pacote("Revestimentos de pisos"),
      pacote("Forros"),
    ], "system"),
    grupo("Esquadrias e vidros", [
      pacote("Portas e esquadrias"),
      pacote("Vidros"),
      pacote("Ferragens e acessórios"),
    ], "system"),
    grupo("Instalações", [
      pacote("Instalações hidrossanitárias"),
      pacote("Instalações elétricas"),
      pacote("SPDA e aterramento"),
      pacote("Sistemas de incêndio"),
      pacote("Telecomunicações e sistemas especiais"),
      pacote("Climatização e ventilação"),
    ], "system"),
    grupo("Fachada", [
      pacote("Revestimento e acabamento de fachada"),
      pacote("Esquadrias e elementos externos"),
      pacote("Selagens e arremates"),
    ], "system"),
    grupo("Acabamentos", [
      pacote("Pintura"),
      pacote("Louças, metais e acessórios"),
      pacote("Bancadas e elementos de acabamento"),
      pacote("Sinalização e acabamento final"),
    ], "system"),
    grupo("Áreas externas e urbanização", [
      pacote("Calçadas e pavimentação externa"),
      pacote("Drenagem externa"),
      pacote("Muros, gradis e fechamentos"),
      pacote("Paisagismo e urbanização"),
    ], "system"),
    grupo("Comissionamento", [
      pacote("Testes e inspeções"),
      pacote("Comissionamento dos sistemas"),
      pacote("Correção de pendências"),
    ], "phase"),
    grupo("Entrega da obra", [
      pacote("As built e documentação"),
      pacote("Limpeza e desmobilização"),
      pacote("Entrega e aceite final"),
    ], "phase"),
  ],
  reforma: [
    grupo("Implantação e planejamento", [
      pacote("Mobilização e canteiro"),
      pacote("Proteções, isolamento e segurança"),
      pacote("Administração e controle da obra"),
    ], "phase"),
    grupo("Levantamentos e demolições", [
      pacote("Levantamento e diagnóstico"),
      pacote("Demolições"),
      pacote("Remoções e remanejamentos"),
    ], "phase"),
    grupo("Recuperação e adequações", [
      pacote("Recuperação de elementos existentes"),
      pacote("Adequações civis"),
      pacote("Reforços e correções estruturais"),
    ], "system"),
    grupo("Vedações e esquadrias", [
      pacote("Alvenarias e fechamentos"),
      pacote("Divisórias"),
      pacote("Portas, esquadrias e vidros"),
    ], "system"),
    grupo("Instalações", [
      pacote("Instalações hidrossanitárias"),
      pacote("Instalações elétricas"),
      pacote("Incêndio e segurança"),
      pacote("Telecomunicações e sistemas especiais"),
      pacote("Climatização"),
    ], "system"),
    grupo("Impermeabilização", [
      pacote("Áreas molhadas"),
      pacote("Coberturas e áreas expostas"),
      pacote("Áreas enterradas"),
    ], "system"),
    grupo("Revestimentos e acabamentos", [
      pacote("Paredes e tetos"),
      pacote("Pisos"),
      pacote("Forros"),
      pacote("Pintura"),
      pacote("Louças, metais e acessórios"),
    ], "system"),
    grupo("Áreas externas", [
      pacote("Pavimentação e calçadas"),
      pacote("Drenagem"),
      pacote("Muros e fechamentos"),
      pacote("Paisagismo e urbanização"),
    ], "system"),
    grupo("Comissionamento e entrega", [
      pacote("Testes e inspeções"),
      pacote("Correção de pendências"),
      pacote("Documentação e entrega"),
    ], "phase"),
  ],
  pavimentacao: [
    grupo("Implantação", [
      pacote("Mobilização e canteiro"),
      pacote("Sinalização e segurança de tráfego"),
      pacote("Locação e controle topográfico"),
    ], "phase"),
    grupo("Terraplenagem", [
      pacote("Limpeza e preparação do terreno"),
      pacote("Cortes e escavações"),
      pacote("Aterros e compactação"),
      pacote("Transporte e destinação"),
    ], "system"),
    grupo("Drenagem", [
      pacote("Drenagem superficial"),
      pacote("Drenagem profunda"),
      pacote("Bueiros e dispositivos"),
    ], "system"),
    grupo("Pavimento", [
      pacote("Subleito"),
      pacote("Sub-base"),
      pacote("Base"),
      pacote("Revestimento"),
    ], "system"),
    grupo("Obras complementares", [
      pacote("Meio-fio e sarjetas"),
      pacote("Calçadas e acessos"),
      pacote("Muros e contenções"),
    ], "system"),
    grupo("Sinalização", [
      pacote("Sinalização horizontal"),
      pacote("Sinalização vertical"),
      pacote("Dispositivos de segurança"),
    ], "system"),
    grupo("Controle e entrega", [
      pacote("Controle tecnológico"),
      pacote("Ensaios e inspeções"),
      pacote("As built e entrega"),
    ], "phase"),
  ],
  saneamento: [
    grupo("Implantação", [
      pacote("Mobilização e canteiro"),
      pacote("Locação e topografia"),
      pacote("Sinalização e segurança"),
    ], "phase"),
    grupo("Serviços preliminares", [
      pacote("Limpeza e preparação"),
      pacote("Demolições e remanejamentos"),
      pacote("Escoramentos e contenções provisórias"),
    ], "phase"),
    grupo("Movimento de terra", [
      pacote("Escavação de valas"),
      pacote("Aterro e reaterro"),
      pacote("Transporte e destinação"),
    ], "system"),
    grupo("Abastecimento de água", [
      pacote("Redes de distribuição"),
      pacote("Adutoras e linhas principais"),
      pacote("Reservação e estruturas"),
      pacote("Ligações prediais"),
    ], "system"),
    grupo("Esgotamento sanitário", [
      pacote("Redes coletoras"),
      pacote("Poços de visita e caixas"),
      pacote("Estações e unidades especiais"),
      pacote("Ligações prediais"),
    ], "system"),
    grupo("Drenagem e dispositivos", [
      pacote("Drenagem superficial"),
      pacote("Galerias e dispositivos"),
      pacote("Travessias e bueiros"),
    ], "system"),
    grupo("Pavimentação e recomposição", [
      pacote("Recomposição de pavimento"),
      pacote("Calçadas e acessos"),
      pacote("Sinalização e acabamento"),
    ], "system"),
    grupo("Comissionamento", [
      pacote("Testes de estanqueidade e pressão"),
      pacote("Limpeza e desinfecção"),
      pacote("Inspeção e correção de pendências"),
    ], "phase"),
    grupo("Entrega", [
      pacote("Documentação e as built"),
      pacote("Treinamento e operação assistida"),
      pacote("Entrega e aceite final"),
    ]),
  ],
};

export function templateDaEap(tipo: TipoTemplateEap | string): TemplateEapNode[] {
  if (tipo === "todos") {
    return Object.values(TEMPLATES_EAP).flat();
  }
  return TEMPLATES_EAP[tipo as keyof typeof TEMPLATES_EAP] ?? TEMPLATES_EAP.edificio;
}
