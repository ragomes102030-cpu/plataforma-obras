# REG-AURORA-CPM-001 — CPM fica desatualizado após mudança na rede

## Sintoma
Aba CPM podia apresentar um estado diferente do gate: o scheduler armazenava CPM por atividade, enquanto o gate recalculava a rede em memória. Além disso, alterações em dependências não alteravam necessariamente activity.updatedAt.

## Causa
O contrato de validade estava centrado na atividade, mas CPM depende do conjunto da rede: duração/início/restrições e relações predecessor-sucessor/lag. Isso permitia divergência entre o resultado persistido, a interface e o gate.

## Regra adotada
Uma alteração relevante de atividade ou relação invalida o resultado CPM persistido. O último cpmCalculatedAt é preservado para auditoria, mas os campos derivados (datas CPM, folgas e criticidade) são limpos; o trigger de updatedAt torna o resultado inequivocamente anterior à mudança. O CPM volta a ser atual somente após novo cálculo válido.

## Referência de mercado
O Primavera P6 documenta que o CPM usa durações e relacionamentos e que mudanças em atividade/relacionamento que afetam datas exigem novo scheduling quando o cálculo automático está desativado. O Microsoft Project também trata o caminho crítico como resultado do cronograma e das relações, sujeito a mudança quando a lógica ou durações mudam.

## Regressão mínima
1. Criar duas atividades com duração válida.
2. Criar uma dependência FS.
3. Calcular CPM.
4. Confirmar estado Atualizado e gate de CPM OK.
5. Alterar duração/início de uma atividade ou criar/alterar relação.
6. Confirmar estado Desatualizado.
7. Confirmar que a baseline é bloqueada até novo cálculo.
8. Recalcular CPM.
9. Confirmar Atualizado + gate OK.

## Critério de aceite
Interface, API e gate devem convergir para a mesma conclusão: não existe CPM válido para baseline enquanto os dados que alimentam a rede forem posteriores ao último cálculo.

## Status
Correção implementada no ciclo de regressão Aurora; validação live deve ser executada após deploy.