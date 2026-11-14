# Evidência de quantitativo no orçamento

## Problema

Hoje `budget_items.source` significa fonte do preço. O orçamento não tem campo separado para prancha/revisão/hash/memória da quantidade. Usar `source` para os dois significados mistura evidências e torna difícil distinguir transcrição de projeto, premissa do cenário e quantidade validada.

## Solução

Adicionar em `budget_items` um texto `quantityEvidence` para referência rastreável do quantitativo e `quantityEvidenceStatus` com os valores `pendente`, `cenario` e `validada`. `pendente` é o padrão para preservar segurança de migração. A tela de edição identifica os campos separadamente, e o detalhe do item mostra situação e evidência da quantidade à parte da fonte de preço.

Uma versão de orçamento só pode ser aprovada se cada item estiver em `cenario` ou `validada` e tiver evidência preenchida. `cenario` é adequado para quantidade extraída de projeto fictício/planejamento sem liberação executiva; não equivale a quantidade medida, execução confirmada ou aprovação técnica externa. A medição continua vindo dos lançamentos de produção aprovados.

## Fora de escopo

- Nenhuma quantidade, preço ou item do Piazza será alterado por esta implementação.
- Não se inferem unidades, produtividades ou quantitativos.
- Não há soma automática de linhas de diâmetros, pavimentos ou sistemas diferentes.
- O campo existente `source` continua reservado à origem do preço/composição.

## Aceite

- A API persiste e devolve status e evidência da quantidade.
- `pendente`, `cenario` e `validada` são estados explícitos; status de entrada é validado no servidor.
- A aprovação bloqueia item pendente ou sem referência de quantidade e explica o motivo.
- A interface permite registrar e ler evidência e status sem confundi-los com preço.
- Os demais cálculos de orçamento e medição não tratam `cenario` como produção realizada.
