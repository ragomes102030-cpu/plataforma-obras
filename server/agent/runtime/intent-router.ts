export type ArquimedesIntent = "casual" | "consulta" | "analise" | "operacao";

const CASUAL_PATTERNS = [
  /^(oi|olá|ola|hey|ei)\s*[!.?]*$/i,
  /^(bom dia|boa tarde|boa noite)\s*[!.?]*$/i,
  /^(tudo bem|tudo certo|como vai|como você está|como voce esta)\s*[!.?]*$/i,
  /^(obrigado|obrigada|valeu|vlw|show|beleza|blz|entendi|certo|ok|okay)\s*[!.?]*$/i,
];

const OPERATION_PATTERNS = [
  /\b(crie|criar|adicione|adicionar|altere|alterar|atualize|atualizar|mova|mover|remova|remover|exclua|excluir|salve|salvar|gere|gerar|preencha|preencher|preencham|complete|completar|completem|construa|construir|vincule|vincular|planeje|planejar|execute|executar)\b/i,
];

const ANALYSIS_PATTERNS = [
  /\b(analise|analisar|avalie|avaliar|revise|revisar|compare|comparar|diagnostique|diagnosticar|verifique|verificar|identifique|identificar)\b/i,
];

const CONFIRMATION_PATTERN = /(?:^|\b)(confirmo|confirmado|pode aplicar|pode corrigir|aplique|pode executar|sim,?\s*(?:pode|aplique|corrija))(?:\b|$)/i;

const READ_ONLY_PATTERNS = [
  /\bREAD_ONLY\b/i,
  /\b(?:somente|apenas)\s+leitura\b/i,
  /\bsem\s+(?:alterar|modificar|gravar|escrever)\s+(?:dados|nada|qualquer\s+dado)\b/i,
  /\bn[aã]o\s+(?:fa[cç]a|faca|execute|executar)\s+(?:nenhuma|qualquer)\s+altera[cç][aã]o\b/i,
  /\bn[aã]o\s+(?:aplique|aplicar|altere|alterar|modifique|modificar|grave|gravar|crie|criar|atualize|atualizar|mova|mover|remova|remover|salve|salvar|gere|gerar|execute|executar)\s+(?:nada|nenhum(?:a)?\s+(?:dado|altera[cç][aã]o|n[oó]|item)|qualquer\s+(?:dado|altera[cç][aã]o)|a\s+proposta|a\s+EAP)\b/i,
];

function forbidsAllMutation(text: string) {
  return READ_ONLY_PATTERNS.some(pattern => pattern.test(text));
}

function removeNegatedMutationCommands(text: string) {
  return text.replace(
    /\bn[aã]o\s+(?:aplicar|aplique|criar|crie|atualizar|atualize|mover|mova|remover|remova|alterar|altere|salvar|salve|gerar|gere|executar|execute)\b(?:\s+[^,.;!?\n]{1,80})?/gi,
    " ",
  );
}

/**
 * Confirmação explícita de uma proposta ("confirmo", "pode aplicar"...).
 * É a resposta humana a uma proposta do agente — distinta de um pedido de
 * operação novo. Sem isto, o "confirmo" seria classificado como consulta e a
 * mutação proposta nunca rodaria.
 */
export function isExplicitConfirmation(text: string): boolean {
  const normalized = stripUiContext(text).trim();
  return !forbidsAllMutation(normalized) && CONFIRMATION_PATTERN.test(removeNegatedMutationCommands(normalized));
}

function stripUiContext(message: string) {
  return message.replace(/^\s*\[aba:\s*[^\]]+\]\s*/i, "").trim();
}

export function classifyArquimedesIntent(message: string): ArquimedesIntent {
  const text = stripUiContext(message);
  if (CASUAL_PATTERNS.some(pattern => pattern.test(text))) return "casual";
  // Uma restrição ampla de leitura impede mutação. Restrições pontuais como
  // "não aprove" ou "não crie baseline" não anulam outra ação explicitamente
  // solicitada (por exemplo, editar o rascunho da EAP).
  if (forbidsAllMutation(text)) {
    return "analise";
  }
  const intentText = removeNegatedMutationCommands(text);
  // Confirmação explícita de uma proposta é uma ordem de operação: destrava a
  // execução do que foi proposto (e só) na conversa.
  if (isExplicitConfirmation(text)) return "operacao";
  if (OPERATION_PATTERNS.some(pattern => pattern.test(intentText))) return "operacao";
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
