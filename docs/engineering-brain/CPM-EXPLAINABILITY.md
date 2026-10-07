# Cérebro de Engenharia — CPM explicável (Aurora)

## Estado validado em 2026-10-06

Projeto Aurora (Supabase projectId 6, versão 2):
- EAP: 53 pacotes-folha
- Atividades: 53
- Dependências: 79
- Grafo: 53/53 atividades ordenáveis; sem ciclo
- CPM persistido: 53/53 atividades
- Atividades críticas: 20
- Duração determinística atual: 303 dias úteis

## Regra de interpretação

Os 303 dias úteis NÃO representam uma duração de obra aprovada. São o resultado determinístico do motor CPM para as durações e relações atualmente cadastradas.

As durações atuais são premissas iniciais de planejamento. Antes de baseline/aprovação, o Arquimedes deve identificar quais durações possuem base quantitativa, produtividade, calendário e/ou premissa técnica suficiente.

## Modelo de explicação obrigatório

Para cada resultado relevante, o Arquimedes deve conseguir responder:

1. **Dados** — quais atividades, durações e relações foram usadas.
2. **Regra** — qual regra de precedência/CPM foi aplicada.
3. **Premissa** — de onde veio cada duração ou relação; se não houver fonte, declarar como estimativa.
4. **Cálculo** — como início/fim, folga e criticidade foram obtidos.
5. **Resultado** — impacto no prazo e no caminho/conjunto crítico.
6. **Decisão** — o que o engenheiro pode aprovar, alterar ou investigar.
7. **Recalculo** — quais resultados ficam inválidos quando uma premissa ou relação muda.

## Comportamento esperado

- Arquimedes não deve tratar o CPM como aprovação automática.
- Uma alteração na rede deve invalidar o CPM persistido até novo cálculo.
- Dependências podem ser FS, SS, FF ou SF quando tecnicamente justificadas; FS não deve ser usado como padrão cego.
- Ausência de quantitativo/produtividade deve ser apresentada como lacuna de premissa, não como erro estrutural da EAP, salvo quando uma regra explícita exigir o dado.
- Quando a fonte de uma premissa for desconhecida, o sistema deve dizer isso em vez de inventar uma justificativa.
- O engenheiro deve poder questionar uma premissa, alterar a duração/relação e recalcular.
- O caminho crítico deve ser tratado como conjunto crítico quando houver múltiplas ramificações críticas convergentes.

## Regra de aprovação

CPM calculado e atualizado é condição necessária para a etapa de baseline, mas não é aprovação de engenharia por si só. A aprovação deve considerar também a qualidade das premissas, lógica de rede, calendário e demais gates técnicos.

## Regressão

REG-AURORA-CPM-001 já comprovou o ciclo:
calculado -> alteração da rede -> desatualizado -> recalcular -> calculado/persistido.

## Próxima evolução

Implementar no Cérebro de Engenharia uma evidência estruturada por atividade/relação:
dados -> regra -> premissa -> cálculo -> resultado -> decisão -> fonte/nível de confiança.

Essa camada deve ser independente do provedor LLM; o LLM interpreta e explica, enquanto regras e motores determinísticos permanecem como fonte operacional de verdade.
