export type ArquimedesIntent = "casual" | "consulta" | "analise" | "operacao";

const CASUAL_PATTERNS = [
  /^(oi|olá|ola|hey|ei)\s*[!.?]*$/i,
  /^(bom dia|boa tarde|boa noite)\s*[!.?]*$/i,
  /^(tudo bem|tudo certo|como vai|como você está|como voce esta)\s*[!.?]*$/i,
  /^(obrigado|obrigada|valeu|vlw|show|beleza|blz|entendi|certo|ok|okay)\s*[!.?]*$/i,
];

const OPERATION_PATTERNS = [
  /\b(crie|criar|adicione|adicionar|altere|alterar|atualize|atualizar|mova|mover|remova|remover|exclua|excluir|salve|salvar|gere|gerar)\b/i,
];

const ANALYSIS_PATTERNS = [
  /\b(analise|analisar|avalie|avaliar|revise|revisar|compare|comparar|diagnostique|diagnosticar|verifique|verificar|identifique|identificar)\b/i,
];

const CONFIRMATION_PATTERN = /(?:^|\b)(confirmo|confirmado|pode aplicar|pode corrigir|aplique|pode executar|sim,?\s*(?:pode|aplique|corrija))(?:\b|$)/i;

/**
 * Confirmação explícita de uma proposta ("confirmo", "pode aplicar"...).
 * É a resposta humana a uma proposta do agente — distinta de um pedido de
 * operação novo. Sem isto, o "confirmo" seria classificado como consulta e a
 * mutação proposta nunca rodaria.
 */
export function isExplicitConfirmation(text: string): boolean {
  return CONFIRMATION_PATTERN.test(stripUiContext(text).trim());
}

function stripUiContext(message: string) {
  return message.replace(/^\s*\[aba:\s*[^\]]+\]\s*/i, "").trim();
}

export function classifyArquimedesIntent(message: string): ArquimedesIntent {
  const text = stripUiContext(message);
  if (CASUAL_PATTERNS.some(pattern => pattern.test(text))) return "casual";
  // Mensagens que proíbem mutação (READ_ONLY, não aplicar/criar/remover) são
  // análise, não operação — mesmo que contenham verbos de operação ou uma
  // confirmação ("confirmo o diagnóstico, mas não aplique nada"). A proibição
  // vence a confirmação: quem proíbe não está autorizando.
  if (/\bREAD_ONLY\b/i.test(text) || /\bn[aã]o\s+(aplicar|aplique|criar|crie|atualizar|atualize|mover|mova|remover|remova|alterar|altere|salvar|salve|gerar|gere)\b/i.test(text)) {
    return "analise";
  }
  // Confirmação explícita de uma proposta é uma ordem de operação: destrava a
  // execução do que foi proposto (e só) na conversa.
  if (isExplicitConfirmation(text)) return "operacao";
  if (OPERATION_PATTERNS.some(pattern => pattern.test(text))) return "operacao";
  if (ANALYSIS_PATTERNS.some(pattern => pattern.test(text))) return "analise";
  return "consulta";
}

export function isSimpleCasualMessage(message: string): boolean {
  return classifyArquimedesIntent(message) === "casual";
}

export function casualResponse(message: string): string {
  const text = stripUiContext(message).toLocaleLowerCase("pt-BR");
  if (/^(obrigado|obrigada|valeu|vlw|show|beleza|blz|entendi|certo|ok|okay)/i.test(text)) {
    return "Por nada! Quando quiser, podemos continuar o planejamento da obra.";
  }
  if (/^(bom dia)/i.test(text)) return "Bom dia! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
  if (/^(boa tarde)/i.test(text)) return "Boa tarde! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
  if (/^(boa noite)/i.test(text)) return "Boa noite! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
  return "Olá! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
}