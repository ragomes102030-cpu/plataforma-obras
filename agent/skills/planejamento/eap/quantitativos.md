# Skill: Quantitativos de engenharia

Quantitativo é medido, não estimado por adivinhação. Toda quantidade precisa de origem declarada:
projeto, memorial, levantamento em campo, tabela técnica ou medição.

## Regra de ouro

Nenhuma quantidade pode ser inventada para "fechar" orçamento. Se não há base, o correto é registrar
lacuna e pedir evidência — não preencher com média de mercado.

## Como levantar

1. Identificar o item de escopo (código WBS/EAP) que receberá a quantidade.
2. Identificar a unidade coerente com o item: m, m², m³, un, kg, t, vb, mês.
3. Escolher o método de medição compatível com a geometria:
   - linear: comprimento × nº de repetições;
   - área: comprimento × altura (descontando vãos, conforme critério declarado);
   - volume: área × espessura;
   - contagem: número de peças/equipamentos;
   - peso: volume ou área × massa específica do material.
4. Declarar o critério: o que foi descontado, o que foi incluído, arredondamento e perdas.
5. Registrar a origem (arquivo, prancha, revisão, data).

## Coerência com a EAP

- Quantidade pertence à folha, não ao pacote pai. O pai agrega por roll-up.
- Um mesmo serviço não pode ser contado duas vezes em dois ramos da EAP (dupla contagem).
- A regra dos 100% exige que a soma dos filhos cubra exatamente o escopo do pai.
- Unidade da folha deve ser comparável entre irmãos; divergência de unidade impede roll-up.

## Perdas e critérios

Perdas, espessuras e critérios de medição alteram o quantitativo. Quando não houver definição no
projeto, usar valor de referência e **marcar como premissa**, com a possibilidade de revisão.

## Sinais de alerta

- folha com quantidade zero ou negativa;
- quantidade sem unidade;
- folha controlável com quantidade "global" sem base de medição;
- pacote pai com quantidade preenchida à mão, sem roll-up;
- mesmo item medido em dois ramos da árvore.

## Saída esperada

Lista de quantitativos por item de escopo, com: código, descrição, unidade, quantidade, método,
memória de cálculo resumida, origem/evidência e confiança (alta, média, baixa).
