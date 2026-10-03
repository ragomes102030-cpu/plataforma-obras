import type { EapScopeNode } from "../construction/eap-validator";

export type QaEapPackage = {
  code: string;
  activityId: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

export type QaScheduleActivity = {
  id: string;
  wbsCode: string;
  name: string;
  durationDays: number;
  predecessors: string[];
};

export type CompleteEapQaFixture = {
  project: {
    code: string;
    name: string;
    type: string;
    location: string;
    lifecycle: "draft";
  };
  eap: EapScopeNode[];
  packages: QaEapPackage[];
  schedule: QaScheduleActivity[];
  expectedApprovalFlow: readonly ["draft", "validated", "under_review", "approved", "applied"];
};

const node = (
  id: number,
  code: string,
  name: string,
  parentId: number | null,
  nodeType: "grupo" | "pacote",
  decompositionBasis: string,
  scope: string,
  unit: string | null = null,
  quantity: number | null = null,
): EapScopeNode => ({
  id,
  projectId: 9001,
  externalId: null,
  externalUid: `qa-${code}`,
  parentId,
  code,
  name,
  level: code.split(".").length,
  nodeType,
  unit,
  plannedQuantity: quantity,
  sortOrder: id,
  description: scope,
  inclusions: scope,
  exclusions: "Serviços não descritos neste pacote e alterações de projeto.",
  location: "Obra QA — Eusébio/CE",
  responsible: "Engenheiro responsável",
  acceptanceCriteria: "Execução conforme projeto, inspeção registrada e medição aprovada.",
  decompositionBasis,
  scopeStatus: "rascunho",
});

export const COMPLETE_EAP_QA_FIXTURE: CompleteEapQaFixture = {
  project: {
    code: "ARQUIMEDES-E2E-001",
    name: "Residência Unifamiliar QA — Fluxo E2E",
    type: "residencial_unifamiliar",
    location: "Eusébio/CE",
    lifecycle: "draft",
  },
  eap: [
    node(1, "1", "Residência Unifamiliar QA", null, "grupo", "project", "Construção completa da residência, desde preparação até entrega."),
    node(2, "1.1", "Infraestrutura", 1, "grupo", "phase", "Serviços de fundação, infraestrutura e elementos enterrados."),
    node(3, "1.1.1", "Fundação", 2, "grupo", "deliverable", "Fundação executada e liberada para início da estrutura."),
    node(4, "1.1.1.1", "Escavação e preparo das fundações", 3, "pacote", "component", "Escavação, regularização e preparo das cavas das fundações.", "m3", 42),
    node(5, "1.1.1.2", "Armadura das fundações", 3, "pacote", "component", "Corte, dobra, montagem e posicionamento das armaduras das fundações.", "kg", 1850),
    node(6, "1.1.1.3", "Concretagem das fundações", 3, "pacote", "component", "Fornecimento, lançamento, adensamento e cura do concreto das fundações.", "m3", 28),
    node(7, "1.2", "Superestrutura", 1, "grupo", "phase", "Serviços da estrutura acima da fundação, incluindo elementos de concreto."),
    node(8, "1.2.1", "Estrutura de concreto", 7, "grupo", "deliverable", "Estrutura de concreto concluída e liberada para vedação."),
    node(9, "1.2.1.1", "Formas da estrutura", 8, "pacote", "component", "Montagem, escoramento, desforma e limpeza das formas estruturais.", "m2", 620),
    node(10, "1.2.1.2", "Armadura da estrutura", 8, "pacote", "component", "Corte, dobra, montagem e posicionamento das armaduras estruturais.", "kg", 7200),
    node(11, "1.2.1.3", "Concretagem da estrutura", 8, "pacote", "component", "Lançamento, adensamento, acabamento e cura do concreto estrutural.", "m3", 74),
    node(12, "1.3", "Vedações e acabamentos", 1, "grupo", "phase", "Vedações internas e externas e revestimentos finais da residência."),
    node(13, "1.3.1", "Vedações", 12, "grupo", "deliverable", "Paredes e fechamentos executados conforme projeto arquitetônico."),
    node(14, "1.3.1.1", "Alvenaria de vedação", 13, "pacote", "component", "Execução das alvenarias internas e externas, incluindo amarrações e vergas previstas.", "m2", 480),
    node(15, "1.3.1.2", "Chapisco e emboço", 13, "pacote", "component", "Chapisco, emboço e regularização das superfícies destinadas ao acabamento.", "m2", 910),
    node(16, "1.4", "Instalações e entrega", 1, "grupo", "phase", "Instalações prediais, testes, limpeza e entrega da residência."),
    node(17, "1.4.1", "Instalações prediais", 16, "grupo", "deliverable", "Instalações elétricas e hidrossanitárias executadas e testadas."),
    node(18, "1.4.1.1", "Instalações elétricas", 17, "pacote", "discipline", "Eletrodutos, cabos, quadros, dispositivos e pontos elétricos conforme projeto.", "pt", 86),
    node(19, "1.4.1.2", "Instalações hidrossanitárias", 17, "pacote", "discipline", "Tubulações, conexões, registros, pontos e testes hidrossanitários.", "pt", 64),
    node(20, "1.4.2", "Entrega da obra", 16, "grupo", "deliverable", "Comissionamento, limpeza, documentação e entrega final da residência."),
    node(21, "1.4.2.1", "Comissionamento e testes finais", 20, "pacote", "component", "Testes funcionais, correções de pendências e registros de comissionamento.", "vb", 1),
    node(22, "1.4.2.2", "Limpeza e entrega", 20, "pacote", "component", "Limpeza final, organização, documentação e entrega formal da obra.", "vb", 1),
  ],
  packages: [
    ["1.1.1.1", "ATV-01", "Escavação e preparo das fundações", 3, ["m3", 42, 85, 3570]],
    ["1.1.1.2", "ATV-02", "Armadura das fundações", 4, ["kg", 1850, 8.5, 15725]],
    ["1.1.1.3", "ATV-03", "Concretagem das fundações", 3, ["m3", 28, 690, 19320]],
    ["1.2.1.1", "ATV-04", "Formas da estrutura", 8, ["m2", 620, 92, 57040]],
    ["1.2.1.2", "ATV-05", "Armadura da estrutura", 10, ["kg", 7200, 8.9, 64080]],
    ["1.2.1.3", "ATV-06", "Concretagem da estrutura", 7, ["m3", 74, 715, 52910]],
    ["1.3.1.1", "ATV-07", "Alvenaria de vedação", 8, ["m2", 480, 88, 42240]],
    ["1.3.1.2", "ATV-08", "Chapisco e emboço", 9, ["m2", 910, 46, 41860]],
    ["1.4.1.1", "ATV-09", "Instalações elétricas", 10, ["pt", 86, 185, 15910]],
    ["1.4.1.2", "ATV-10", "Instalações hidrossanitárias", 9, ["pt", 64, 240, 15360]],
    ["1.4.2.1", "ATV-11", "Comissionamento e testes finais", 5, ["vb", 1, 6800, 6800]],
    ["1.4.2.2", "ATV-12", "Limpeza e entrega", 3, ["vb", 1, 4200, 4200]],
  ].map(([code, activityId, name, durationDays, values]) => ({
    code: code as string,
    activityId: activityId as string,
    unit: (values as unknown[])[0] as string,
    quantity: (values as unknown[])[1] as number,
    unitCost: (values as unknown[])[2] as number,
    totalCost: (values as unknown[])[3] as number,
  })),
  schedule: [
    { id: "ATV-01", wbsCode: "1.1.1.1", name: "Escavação e preparo das fundações", durationDays: 3, predecessors: [] },
    { id: "ATV-02", wbsCode: "1.1.1.2", name: "Armadura das fundações", durationDays: 4, predecessors: ["ATV-01"] },
    { id: "ATV-03", wbsCode: "1.1.1.3", name: "Concretagem das fundações", durationDays: 3, predecessors: ["ATV-02"] },
    { id: "ATV-04", wbsCode: "1.2.1.1", name: "Formas da estrutura", durationDays: 8, predecessors: ["ATV-03"] },
    { id: "ATV-05", wbsCode: "1.2.1.2", name: "Armadura da estrutura", durationDays: 10, predecessors: ["ATV-04"] },
    { id: "ATV-06", wbsCode: "1.2.1.3", name: "Concretagem da estrutura", durationDays: 7, predecessors: ["ATV-05"] },
    { id: "ATV-07", wbsCode: "1.3.1.1", name: "Alvenaria de vedação", durationDays: 8, predecessors: ["ATV-06"] },
    { id: "ATV-08", wbsCode: "1.3.1.2", name: "Chapisco e emboço", durationDays: 9, predecessors: ["ATV-07"] },
    { id: "ATV-09", wbsCode: "1.4.1.1", name: "Instalações elétricas", durationDays: 10, predecessors: ["ATV-08"] },
    { id: "ATV-10", wbsCode: "1.4.1.2", name: "Instalações hidrossanitárias", durationDays: 9, predecessors: ["ATV-08"] },
    { id: "ATV-11", wbsCode: "1.4.2.1", name: "Comissionamento e testes finais", durationDays: 5, predecessors: ["ATV-09", "ATV-10"] },
    { id: "ATV-12", wbsCode: "1.4.2.2", name: "Limpeza e entrega", durationDays: 3, predecessors: ["ATV-11"] },
  ],
  expectedApprovalFlow: ["draft", "validated", "under_review", "approved", "applied"],
};
