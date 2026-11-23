# Residencial Piazza — plano de ação e execução QA

## Premissas controladas

- A obra é um cenário de validação do sistema, não uma medição contratual.
- Os preços devem vir de catálogo oficial versionado (SEINFRA-CE 028.1 no cenário QA).
- Quantidades sem conferência de campo permanecem `cenario`; nunca são promovidas silenciosamente a `validada`.
- Cada item precisa de código, unidade compatível, preço, fonte, vínculo EAP e evidência do quantitativo.
- `vb` não é convertido automaticamente para `un`, `m`, `m²` ou `m³`; deve ser detalhado em serviços mensuráveis.

## Sequência de execução

1. **Escopo/EAP** — conferir que cada folha tem disciplina, unidade, quantidade, dono e critério de medição; validar a estrutura antes do cronograma.
2. **Orçamento item a item** — abrir a linha, pesquisar o catálogo, selecionar o serviço/composição compatível, conferir unidade e preço, registrar a evidência e salvar.
3. **Conciliação EAP–orçamento** — garantir uma folha EAP por item e eliminar órfãos; itens sem vínculo aparecem como pendência explícita.
4. **Atividades e dependências** — converter folhas em atividades, justificar inícios sem predecessora, validar relações e recalcular CPM.
5. **Pesos físicos** — atribuir pesos aprovados por atividade usando critério de medição; orçamento não substitui peso físico.
6. **Baseline** — somente criar snapshot depois que EAP, custos, atividades e dependências passarem pelos gates.
7. **Gantt/LOB/Curva S** — derivar as visualizações da mesma fonte de verdade; marcar dados de cenário e ausência de produção como `SEM DADO`.
8. **Aprovação** — liberar orçamento e baseline apenas quando todos os itens tiverem rastreabilidade e evidência exigidas.

## Gargalos corrigidos

- Pacote JSON obrigatório na interface: removido; a operação agora é por item.
- Aprovação prematura: o botão fica desabilitado enquanto houver item sem vínculo oficial, preço, fonte ou evidência.
- Valores simbólicos/didáticos: não habilitam aprovação nem controle financeiro.
- Unidade `vb`: permanece aberta até decomposição mensurável, evitando conversão enganosa.

## Critério de aceite

O planejamento só pode ser declarado pronto quando os oito gates acima passarem, os testes automatizados estiverem verdes e a confirmação ao vivo mostrar os mesmos estados. Caso contrário, o status correto é `APROVADO COM RESSALVAS` ou `BLOQUEADO POR ERRO`.
