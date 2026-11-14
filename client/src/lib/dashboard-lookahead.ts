type SemanaDashboard = {
  situacao: "encerrada" | "corrente" | "futura";
};

/** Em sábados e domingos não há semana útil corrente; priorize a próxima. */
export function selecionarSemanaDashboard<T extends SemanaDashboard>(
  semanas: T[]
): T | undefined {
  return (
    semanas.find(semana => semana.situacao === "corrente") ??
    semanas.find(semana => semana.situacao === "futura") ??
    semanas[semanas.length - 1]
  );
}
