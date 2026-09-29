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
    id: "eap",
    rotulo: "EAP",
    status: "pronta",
  },
  {
    id: "cronograma",
    rotulo: "CRONOGRAMA",
    status: "pronta",
  },
  {
    id: "dashboard",
    rotulo: "DASHBOARD",
    status: "pronta",
  },
  {
    id: "suprimentos",
    rotulo: "SUPRIMENTOS",
    status: "pendente",
    falta:
      "Material tem prazo antes de existir na obra: requisição, aprovação, fabricação, inspeção, expedição, entrega. O CPM de hoje só sabe que o material chegou. Falta a tabela de marcos de fornecimento e a way de ligá-los ao cronograma.",
  },
  {
    id: "producao",
    rotulo: "PRODUÇÃO",
    status: "pendente",
    falta:
      "A tabela de lançamentos por data e atividade já existe no banco, e é dela que sai o % Real. Falta a grade por linha × data, e o cálculo do executado consolidado por atividade.",
  },
  {
    id: "financeiro",
    rotulo: "FINANCEIRO",
    status: "pendente",
    falta:
      "Medição, faturamento e pagamento são três coisas distintas e hoje são uma só. Falta o valor do contrato gravado na obra e a separação entre o que foi medido, o que foi cobrado e o que entrou.",
  },
  {
    id: "riscos",
    rotulo: "RISCOS",
    status: "pendente",
    falta:
      "Registro de risco com responsável, probabilidade, impacto e plano de resposta, e o efeito de cada risco no prazo. Não existe nenhuma tabela de risco no banco.",
  },
  {
    id: "curva-s",
    rotulo: "CURVA S",
    status: "pendente",
    falta:
      "A curva física e a financeira, comparando planejado e realizado. O motor já devolve o agregado ponderado por quantidade; falta a série histórica e a linha de base para comparar.",
  },
];

export type IdDaAba = string;
