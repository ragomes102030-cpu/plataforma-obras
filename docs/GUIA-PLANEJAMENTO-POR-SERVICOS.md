# Guia de planejamento de obra por serviços

> **Normativo.** Última atualização: 26/11/2026.

## Para que serve

Use o sistema para organizar os serviços da obra, definir quando cada um pode
começar, calcular o prazo e registrar o que está acontecendo no canteiro. **Não
é necessário cadastrar orçamento ou preço para planejar o prazo.**

Na primeira visita à Dashboard, a seção **Como planejar esta obra** mostra as
cinco etapas e um botão para abrir a próxima ação.

## Comece por estes passos

### 1. Defina os serviços na EAP

Organize o escopo em pacotes executáveis e revise a hierarquia. A EAP deve
representar o trabalho que será entregue. Aprove a estrutura de referência
antes de gerar atividades a partir dela.

Cadastre locais físicos apenas quando fizerem parte do escopo real. Não divida
um serviço por pavimentos ou unidades sem uma base que determine essa divisão.

### 2. Planeje a duração de cada serviço

Na aba **Atividades**, confira o nome, a duração e, quando conhecida, a unidade
e a quantidade. Informe a duração diretamente em dias úteis ou derive-a de
quantidade e produtividade justificadas. Revise as premissas antes de confiar
no prazo calculado.

Uma quantidade, duração ou peso estimado continua sendo uma premissa. Identifique
premissas QA como estimativas de teste; não as apresente como medição de campo.

### 3. Ordene a execução

Na aba **Dependências**, relacione atividades que dependem umas das outras.
Use o tipo de relação e a defasagem adequados à sequência técnica. Atividades
que podem começar independentemente podem permanecer como raízes; não crie
ligações artificiais só para eliminar um aviso.

Resolva ciclos e conflitos da rede antes de usar o caminho crítico. Leia os
nomes e códigos apontados pela validação para localizar o elo que precisa de
revisão.

### 4. Defina a data inicial, calcule o CPM e registre a baseline

Uma data inicial é necessária para mostrar datas civis. Sem ela, o sistema ainda
pode trabalhar com posições relativas em **D+**. Confira também o calendário de
dias úteis, feriados, exceções e restrições antes de calcular o CPM.

Depois de revisar durações, dependências e resultado do caminho crítico, registre
uma **baseline de prazo**. A baseline é a fotografia do plano de referência; uma
atualização de campo não a altera.

### 5. Atualize os serviços no campo

No cronograma, abra o inspetor da atividade e registre a posição na data do
relato. Informe o estado, o início real quando houver, e o término real quando
concluída. Para uma atividade em andamento ou bloqueada, use **duração restante
ou data de término prevista** — apenas uma das duas. Bloqueios pedem o motivo.

Os relatos ficam no histórico temporal por atividade e versão. Uma correção cria
um novo registro ligado ao anterior; não apaga o histórico e não grava produção,
medição ou custo.

## Como ler a Dashboard

- **Plano calculado:** término derivado do CPM atual.
- **Previsão pelos relatos:** projeção somente de leitura, calculada com a rede,
  o calendário e as atualizações de prazo da versão atual até a data de posição.
- **Serviços atualizados:** cobertura dos relatos temporais. Um serviço sem relato
  conserva a duração planejada para a projeção, mas isso não confirma execução.
- **Fora de sequência:** uma atividade começou antes da janela indicada pela rede;
  revise o relato e as predecessoras.
- **Previsão indisponível:** a tela informa o requisito exato. Exemplos: data
  inicial ausente, CPM desatualizado ou serviço bloqueado sem estimativa de fim.
- **Baseline:** comparação com o plano congelado, quando há uma baseline ativa.

Uma projeção posterior ao corte começa no próximo dia útil. Datas-limite declaradas
continuam visíveis; se a projeção não as cumprir, a Dashboard apresenta um aviso.
O cálculo não altera atividades, CPM salvo ou baseline.

## Prazo, avanço físico e custo são bases diferentes

| Controle | O que representa | Necessita de orçamento? |
| --- | --- | --- |
| Programação e CPM | Duração, sequência e datas do plano | Não |
| Atualização de prazo | Estado e datas relatadas por serviço | Não |
| Avanço físico agregado | Quantidades medidas e pesos físicos com critério | Não para programar prazo; exige evidência própria |
| Custo, valor agregado e Curva S financeira | Valores orçados e execução financeira rastreável | Sim |
| Linha de Balanço | Repetição do serviço em unidades físicas definidas | Não; depende de locais repetitivos válidos |

Ausência de relatório não significa execução zero. Estado temporal e duração não
geram percentual físico. A Curva S financeira não substitui a programação de
serviços, e um plano de prazo não autoriza medição contratual.

## Vocabulário

- **EAP/WBS:** decomposição do escopo em entregas e pacotes de trabalho.
- **Atividade:** serviço executável com duração, responsável/local quando
  aplicáveis e identidade própria no cronograma.
- **CPM:** cálculo de datas, folgas e caminho crítico a partir das durações,
  relações, restrições e calendário.
- **Baseline:** fotografia aprovada do plano que serve de referência para
  comparação.
- **Relato de prazo:** registro datado do estado e das datas de uma atividade.
- **Previsão pelos relatos:** projeção do término a partir dos relatos atuais;
  não é medição nem substitui o plano aprovado.
