export type EntradaDuracaoAtividade = {
  durationDays?: number;
  plannedQuantity?: number;
  productivity?: number;
};

export type ResultadoEntradaDuracaoAtividade =
  | { valid: true; payload: EntradaDuracaoAtividade }
  | { valid: false; error: string };

function numeroPositivo(texto: string): number | null {
  if (!texto.trim()) return null;
  const valor = Number(texto.trim().replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : Number.NaN;
}

export function prepararEntradaDuracaoAtividade(input: {
  duracaoDias: string;
  quantidade: string;
  produtividade: string;
}): ResultadoEntradaDuracaoAtividade {
  const duracao = numeroPositivo(input.duracaoDias);
  const quantidade = numeroPositivo(input.quantidade);
  const produtividade = numeroPositivo(input.produtividade);

  if (Number.isNaN(duracao) || (duracao !== null && !Number.isInteger(duracao))) {
    return { valid: false, error: "Informe uma duração inteira positiva em dias." };
  }
  if (Number.isNaN(quantidade)) {
    return { valid: false, error: "Informe uma quantidade positiva." };
  }
  if (Number.isNaN(produtividade)) {
    return { valid: false, error: "Informe uma produtividade positiva." };
  }
  if (produtividade !== null && quantidade === null) {
    return { valid: false, error: "A produtividade precisa estar associada a uma quantidade." };
  }
  if (duracao === null && (quantidade === null || produtividade === null)) {
    return { valid: false, error: "Informe a duração ou a quantidade junto com a produtividade." };
  }

  return {
    valid: true,
    payload: {
      ...(duracao !== null ? { durationDays: duracao } : {}),
      ...(quantidade !== null ? { plannedQuantity: quantidade } : {}),
      ...(produtividade !== null ? { productivity: produtividade } : {}),
    },
  };
}
