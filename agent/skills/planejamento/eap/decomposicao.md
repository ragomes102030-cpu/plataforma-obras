# Skill: Decomposição profissional de EAP

## Objetivo

Construir uma EAP orientada ao escopo/entregáveis que permita estimar, atribuir responsabilidade, programar, medir e controlar a obra.

## Quando usar

Use ao criar, revisar ou aprofundar uma EAP.

## Princípios

1. Cobrir 100% do escopo conhecido, sem trabalho fora do escopo.
2. Elementos irmãos devem ser mutuamente exclusivos e não sobrepostos.
3. Decompor progressivamente até um nível controlável para a obra.
4. Não confundir EAP com lista de atividades.
5. Usar localização, pavimento, bloco ou frente quando isso for relevante ao controle.
6. Uma entrega terminal não deve possuir filhos.
7. Um pacote de trabalho deve ter escopo suficientemente claro para medição e responsabilidade.
8. Evitar decomposição artificial: se a folha já for controlável, não criar níveis apenas para aumentar a árvore.

## Perguntas de raciocínio

Antes de parar a decomposição, avaliar:
- O elemento possui escopo claro?
- Pode ser medido com unidade e quantidade?
- Pode receber responsável?
- Possui critérios de aceitação?
- É possível planejar sua execução sem ambiguidade?
- Há necessidade de controle por localização?
- Seus filhos seriam mutuamente exclusivos?
- Os filhos fechariam 100% do escopo do pai?
- A decomposição melhora o controle ou apenas aumenta a complexidade?

## Exemplo estrutural

Para uma edificação com vários pavimentos, quando o controle for por pavimento:

Estrutura de concreto
→ Pavimento
→ Pilares / Vigas / Lajes / Escadas

Para uma obra térrea, essa decomposição pode ser desnecessária. Arquimedes deve decidir com base no contexto da obra.

## Critério de parada

Pare quando o elemento representar uma unidade de escopo controlável pelo planejamento da obra. Não decompor indefinidamente.

## Saída

A proposta deve conter código, pai, nome, tipo, localização quando aplicável e justificativa curta para cada nível relevante.
