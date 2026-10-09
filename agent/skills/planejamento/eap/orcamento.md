# Skill: Orçamento e formação de preço

Orçamento é o custo do escopo da EAP, montado a partir de quantitativo × preço unitário. Orçamento
sem quantitativo é chute; preço sem composição é opinião.

## Cadeia de formação

1. item de escopo (folha da EAP) + quantitativo + unidade;
2. serviço do catálogo (composição) correspondente, na mesma unidade;
3. composição = soma de componentes: material, mão de obra e equipamento
   (custo unitário = Σ coeficiente × preço do componente);
4. encargos sociais sobre mão de obra, quando aplicáveis;
5. BDI (benefícios e despesas indiretas) para chegar a preço de venda;
6. preço total = quantidade × custo unitário (com BDI).

Cada etapa precisa ser rastreável: quem olhar depois tem que conseguir voltar do total até o insumo.

## Catálogo de preços (SEINFRA-CE)

Estrutura no banco:

- `price_catalogs` — o catálogo (fonte, referência, estado, status);
- `price_items` — insumos e serviços com preço unitário (descrição, unidade, itemType);
- `service_compositions` — o serviço composto, com unidade e referência;
- `composition_components` — o que compõe o serviço: coeficiente e preço unitário do componente.

Limites conhecidos que o orçamentista deve respeitar:

- descrição de item tem limite de 240 caracteres;
- `service_compositions` **não** tem campo de notas — a trilha hierárquica do catálogo não fica lá;
- `componentType` só admite material, mão de obra e equipamento: **composição dentro de composição
  não é representável** hoje. Quando um serviço é composto por outros serviços, isso não pode ser
  ignorado nem "achatado" silenciosamente — deve aparecer como lacuna declarada.

Referência: o conjunto 028.1 usado na plataforma traz encargos sociais no nome do arquivo
(84,44). Confirmar a taxa efetivamente aplicada antes de usá-la no cálculo — não assumir.

## Regras

- Preço unitário do catálogo é referência de base, não preço final de proposta.
- Não somar o mesmo custo em dois lugares (dupla contagem) — vale para insumo, serviço e BDI.
- BDI não incide sobre o próprio BDI.
- Serviço sem composição no catálogo deve ser tratado como lacuna, com alternativa declarada.
- Insumo sem preço não é insumo grátis: é pendência.
- Custo direto + indireto + encargos + BDI precisa fechar com o total apresentado.

## Comparação com o mercado

Preço de referência só compara com outro preço de referência na mesma data-base e mesma
localidade. Comparar SEINFRA-CE com SINAPI de outro estado sem ressalva é erro metodológico.

## Sinais de alerta

- orçamento sem memória de cálculo;
- total que não fecha com a soma das partes;
- serviço com preço e sem composição;
- quantidade do orçamento diferente da quantidade da EAP;
- encargos ou BDI aplicados duas vezes;
- item de escopo da EAP sem preço (cobertura de custos incompleta).

## Saída esperada

Por item: código EAP, serviço e código do catálogo, quantidade, unidade, custo unitário, composição
(componentes com coeficiente e preço), encargos, BDI, preço total, base de referência e data.
