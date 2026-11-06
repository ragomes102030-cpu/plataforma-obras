# Motor de consistência da obra

## Objetivo

O Arquimedes não trata Dashboard, EAP, orçamento, cronograma, CPM, baseline e controle como telas independentes. Cada etapa publica um estado verificável e a próxima etapa só é considerada pronta quando os dados anteriores permitem uma decisão auditável.

## Ordem de decisão

1. **Escopo**: natureza, localização, descrição e premissas declaradas; a EAP deve carregar nós com escopo validado.
2. **EAP**: versão aprovada, hierarquia íntegra e folhas executáveis (pacotes/entregas).
3. **Orçamento**: itens vinculados às folhas, composição rastreável e fonte oficial (SEINFRA/SINAPI ou exceção justificada).
4. **Atividades**: duração declarada, unidade/quantitativo e local físico quando aplicável.
5. **Rede**: predecessoras dentro da mesma obra, sem ciclos e com um único início lógico.
6. **CPM**: recalculado depois da última alteração de atividade ou dependência.
7. **Baseline**: criada somente após EAP, orçamento e CPM aptos; é a referência congelada.
8. **Execução**: medições com itens quantitativos, unidade, evidência e aprovação.

## Contrato do motor

`shared/obra-readiness.ts` é a fonte única das regras e das mensagens. O servidor monta um snapshot real do banco em `planning.readiness`; Dashboard, Orçamento, Cronograma e Baseline exibem a mesma primeira barreira causal. Cada bloqueio informa código, impacto, explicação e como resolver.

## Critérios de lançamento do MVP

- Nenhuma tela declara “pronto” enquanto existir uma barreira anterior.
- Preços didáticos e itens sem composição não habilitam controle financeiro.
- Ciclos e atividades sem predecessora aparecem como bloqueios de rede, não como linhas pontilhadas silenciosas.
- CPM desatualizado invalida prazo, folga e caminho crítico até novo cálculo.
- Acompanhamento só considera avanço agregado quando há itens de medição vinculados.
- A ausência de MCP não quebra o fluxo: o engenheiro pode corrigir manualmente e o mesmo motor valida o resultado.

## Regressões mínimas

As regras puras têm testes para orçamento didático, ciclo de rede, predecessora ausente e medição sem itens. As obras de demonstração Aurora Teste e Projeto Escola Arquimedes devem ser usadas como fixtures de auditoria; qualquer falha é reportada como `PASSOU`, `FALHOU` ou `NÃO TESTÁVEL`.
