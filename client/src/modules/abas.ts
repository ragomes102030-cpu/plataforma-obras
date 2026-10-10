/**
 * O registro das abas da obra. É DADO, não código.
 *
 * POR QUE FICAR AQUI E NÃO DENTRO DO COMPONENTE
 *
 * Porque a ordem e o conjunto são do dono do modelo, não da interface. Acrescentar
 * uma aba é acrescentar uma entrada nesta lista: nenhum componente muda, nenhum
 * `switch` cresce, nenhum teste de componente quebra. A aba que entra em `pronta`
 * precisa de uma linha no `Home.tsx` que decide o que ela mostra; as que entram
 * como `pendente` aparecem sozinhas, com o que falta escrito.
 *
 * POR QUE A ORDEM É A DO PLANEJAMENTO, E NÃO A DA PLANILHA
 *
 * A planilha de referência tem seis abas e cobre prazo, medição e produção —
 * que é o mesmo território do Mattos. Ela não tem suprimentos, não tem
 * contrato, não tem risco, e não distingue medição de faturamento de
 * pagamento. A ordem aqui segue a sequência em que uma obra é de fato planejada:
 * escopo, depois prazo, depois suprimentos, depois ritmo, depois dinheiro.
 *
 * As abas que ainda não existem estão declaradas como `pendente` com o motivo.
 * Aba pendente não desenha tela vazia que pareça funcionando.
 */

export type StatusDaAba = "pronta" | "pendente";

export type AbaDoSistema = {
  id: string;
  /** Texto da aba. */
  rotulo: string;
  status: StatusDaAba;
  /**
   * Quando a aba está pendente: o que falta, onde falta e por que é o caminho.
   * É este texto que impede que a ausência vire tela genérica de "em breve".
   */
  falta?: string;
};

export const ABAS: readonly AbaDoSistema[] = [
  {
    id: "dashboard",
    rotulo: "DASHBOARD",
    status: "pronta",
  },
  {
    id: "escopo",
    rotulo: "ESCOPO",
    status: "pronta",
  },
  {
    id: "eap",
    rotulo: "EAP",
    status: "pronta",
  },
  {
    id: "atividades",
    rotulo: "ATIVIDADES",
    status: "pronta",
  },
  {
    id: "dependencias",
    rotulo: "DEPENDÊNCIAS",
    status: "pronta",
  },
  {
    id: "cpm",
    rotulo: "CPM / CAMINHO CRÍTICO",
    status: "pronta",
  },
  {
    id: "baseline",
    rotulo: "BASELINE",
    status: "pronta",
  },
  {
    id: "gantt",
    rotulo: "GANTT",
    status: "pronta",
  },
  {
    id: "linha-balanco",
    rotulo: "LINHA DE BALANÇO",
    status: "pronta",
  },
  {
    id: "producao",
    rotulo: "CONTROLE",
    status: "pronta",
  },
  {
    id: "suprimentos",
    rotulo: "SUPRIMENTOS",
    status: "pronta",
  },
  {
    id: "financeiro",
    rotulo: "ORÇAMENTO E CUSTOS",
    status: "pronta",
  },
  {
    id: "riscos",
    rotulo: "RISCOS",
    status: "pronta",
  },
  {
    id: "curva-s",
    rotulo: "CURVA S",
    status: "pronta",
  },
];

export type IdDaAba = string;
