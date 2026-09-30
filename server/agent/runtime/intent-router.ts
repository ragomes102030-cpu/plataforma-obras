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

export function classifyArquimedesIntent(message: string): ArquimedesIntent {
  const text = message.trim();
  if (CASUAL_PATTERNS.some(pattern => pattern.test(text))) return "casual";
  if (OPERATION_PATTERNS.some(pattern => pattern.test(text))) return "operacao";
  if (ANALYSIS_PATTERNS.some(pattern => pattern.test(text))) return "analise";
  return "consulta";
}

export function isSimpleCasualMessage(message: string): boolean {
  return classifyArquimedesIntent(message) === "casual";
}

export function casualResponse(message: string): string {
  const text = message.trim().toLocaleLowerCase("pt-BR");
  if (/^(obrigado|obrigada|valeu|vlw|show|beleza|blz|entendi|certo|ok|okay)/i.test(text)) {
    return "Por nada! Quando quiser, podemos continuar o planejamento da obra.";
  }
  if (/^(bom dia)/i.test(text)) return "Bom dia! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
  if (/^(boa tarde)/i.test(text)) return "Boa tarde! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
  if (/^(boa noite)/i.test(text)) return "Boa noite! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
  return "Olá! Sou o Arquimedes. Como posso ajudar no planejamento da obra?";
}
