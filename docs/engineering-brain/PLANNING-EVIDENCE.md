# Cérebro de Engenharia — Evidência de planejamento

## Objetivo

Toda atividade do planejamento deve possuir uma evidência mínima que permita ao Arquimedes explicar por que sua duração e suas relações foram usadas.

## Estrutura

Cada atividade deve poder registrar:

- **Dados:** EAP, nome, unidade, quantidade, duração, calendário e relações.
- **Regra:** método de duração e regras de precedência/CPM aplicáveis.
- **Premissa:** produtividade, equipe, restrições, sequência construtiva ou estimativa adotada.
- **Cálculo:** fórmula ou procedimento determinístico utilizado.
- **Resultado:** início, término, folga, criticidade e impacto no prazo.
- **Decisão:** aprovação, revisão, bloqueio ou necessidade de informação.
- **Fonte:** origem da premissa, documento, tabela, histórico ou indicação explícita de que é estimativa.
- **Confiança:** nível da evidência (não informado, estimativa, informado pelo engenheiro, apoiado por dado/medição, validado).

## Regra de não-invenção

Se quantidade, produtividade, composição, calendário ou fonte não estiver disponível, o Arquimedes deve declarar a lacuna. Ele não deve fabricar um valor ou atribuir uma fonte inexistente.

## Regra de cálculo

O LLM interpreta e explica. Motores determinísticos calculam duração, rede, CPM e indicadores. A explicação deve reproduzir os dados efetivamente usados pelo motor.

## Aurora

Na versão 2 do Aurora existem 53 atividades, 79 dependências e CPM persistido para 53 atividades. A duração de 303 dias úteis é o resultado do conjunto atual de premissas e não deve ser apresentada como prazo aprovado.

## Próxima etapa

Adicionar a evidência aos objetos de planejamento e criar validações que diferenciem:
1. dado ausente;
2. dado estimado;
3. dado informado pelo engenheiro;
4. dado sustentado por fonte;
5. dado validado.

A qualidade da premissa deve influenciar o gate de aprovação, sem transformar automaticamente toda ausência de informação em erro estrutural.
