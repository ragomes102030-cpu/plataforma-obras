# Cronograma Operacional Integrado — desenho do MVP

## Intenção

Transformar o cronograma de um conjunto de telas de consulta em um ambiente de
trabalho diário para o engenheiro de planejamento. A tabela, o Gantt, a Linha de
Balanço, o CPM, a baseline e a produção continuam usando as mesmas fontes do
motor; o que muda é a maneira de revisar, editar e explicar a situação da obra.

O resultado deve permitir responder, sem trocar repetidamente de aba:

- o que deveria estar acontecendo agora;
- o que realmente foi executado;
- o que está crítico, atrasado, bloqueado ou sem informação;
- qual vínculo, atividade ou dado deve ser corrigido;
- como a alteração afeta datas, folgas, baseline e locais físicos.

## Objetivos

1. Criar uma aba **Cronograma** como centro operacional da obra.
2. Sincronizar tabela de atividades e linha do tempo na mesma superfície.
3. Tornar atividade, vínculo, baseline e realizado inspecionáveis e acionáveis.
4. Corrigir a legibilidade da Rede de Dependências e do Gantt.
5. Separar claramente avanço físico, avanço financeiro e disponibilidade dos
   dados, sem tratar ausência como zero.
6. Preservar as validações existentes: versão, EAP, dependências, CPM,
   baseline, isolamento entre obras e rastreabilidade.
7. Tornar cada bloqueio didático: explicar o problema, por que impede a etapa,
   como corrigir, onde corrigir e qual evidência comprova a resolução.

## Não objetivos desta fase

- reproduzir integralmente Primavera P6 ou Microsoft Project;
- implementar nivelamento automático de recursos;
- permitir arrastar livremente barras e gravar datas desconectadas da rede;
- inventar quantitativos, produtividades, equipes, responsáveis ou custos;
- substituir as abas técnicas existentes antes de validar o novo fluxo;
- declarar controle financeiro disponível sem orçamento real aprovado.

## Antiobjetivos

- criar um segundo cronograma ou cache de datas concorrente;
- usar cor como único indicador de estado;
- esconder pendências para a apresentação parecer completa;
- permitir que uma edição visual quebre o CPM silenciosamente;
- misturar avanço físico, valor agregado e desembolso num único percentual.

## Abordagens consideradas

### 1. Correção cosmética

Aumentar a Rede, trocar textos e ajustar cores. É barata, mas mantém o trabalho
fragmentado e não transforma Gantt e LOB em ferramentas operacionais.

### 2. Cronograma Operacional Integrado — escolhida

Reúne grade editável, tempo, inspeção e ações orientadas numa aba Cronograma,
reutilizando os motores atuais. Entrega valor operacional sem introduzir a
complexidade prematura de um clone do P6.

### 3. Editor completo estilo P6/Project

Inclui arraste de barras, recursos e múltiplos layouts. É uma evolução futura;
agora ampliaria demais a superfície de erro e criaria atalhos perigosos sobre a
rede lógica.

## Estrutura da interface

### 1. Barra de contexto

Exibe versão do plano, estado da EAP, CPM, baseline vigente, data de posição e
qualidade das fontes. Cada estado tem texto, ícone e ação de correção.

### 2. Faixa de decisão

Quatro leituras curtas:

- término atual e desvio contra a baseline;
- atividades críticas/atrasadas/bloqueadas;
- produção confirmada e data da última medição;
- prontidão financeira, separada do avanço físico.

### 3. Grade + linha do tempo

Uma superfície dividida e redimensionável:

- **grade:** EAP, atividade, duração, início, fim, folga, progresso e estado;
- **tempo:** barras atuais, baseline, marcos, realizado e dependências;
- seleção, filtro e expansão são compartilhados;
- cabeçalhos e primeira coluna permanecem visíveis durante a rolagem;
- a URL preserva filtros, seleção e modo de visualização quando viável.

Cada atividade usa `activityId` como identidade primária. O código WBS organiza
e agrupa, mas não identifica uma atividade: várias atividades podem pertencer ao
mesmo pacote. Na Escola, as 30 atividades devem permanecer individualmente
visíveis e selecionáveis mesmo existindo apenas 27 códigos de folha.

Na primeira fase, edições críticas abrem o inspetor. Não haverá arraste livre de
datas. Duração e vínculos passam pela validação do servidor e exigem recálculo
do CPM antes de atualizar o estado oficial.

### 4. Inspetor da atividade

Painel lateral aberto pela seleção de uma linha ou barra:

- identificação, EAP e local físico;
- planejado atual, baseline e realizado;
- duração, calendário, predecessoras, sucessoras e folga;
- produção confirmada, saldo e restrições;
- ações: editar atividade, abrir dependências, recalcular CPM, lançar produção
  e consultar a Linha de Balanço.

Restrições são consultadas pela fonte de lookahead/controle, com corte pela data
de posição e somente estados que ainda bloqueiam a execução. Elas não serão
inferidas a partir de texto, atraso ou ausência de produção.

### 5. Modos de leitura

- **Cronograma:** tabela e Gantt sincronizados;
- **Fluxo por local:** Linha de Balanço com os mesmos filtros e seleção;
- **Rede:** lista de vínculos em largura total, pesquisável e sem limite visual
  artificial de 205 px.

Gantt e LOB deixam de ser destinos isolados e passam a ser perspectivas da
mesma população operacional.

## Rede de Dependências

O formulário de criação fica numa faixa compacta superior. A Rede atual ocupa a
largura completa abaixo dele e oferece:

- pesquisa por código ou nome;
- contagem de vínculos;
- filtro por tipo e caminho crítico;
- cabeçalho fixo, linhas com altura legível e texto expandível;
- remoção explícita apenas em versão editável;
- confirmação antes de remover vínculo, com mensagem que identifica as duas
  atividades afetadas;
- resumo de órfãs, ciclos e conectividade no topo.

## Linguagem do orçamento e do avanço

“Orçamento sem régua validada” será removido.

Estados propostos:

- **Avanço físico ainda não apurado:** não existe produção confirmada ou peso
  físico confiável;
- **Avanço financeiro indisponível:** falta orçamento de referência aprovado,
  rastreável e com cobertura das atividades que possuem custo;
- **Valor agregado disponível:** orçamento válido + baseline + produção
  confirmada na data de posição.

O painel mostra a lista exata do que falta e um botão direto para o módulo capaz
de resolver cada item. Orçamento didático permanece identificado como teste.

O avanço físico agregado usa somente pesos físicos explícitos, definidos e
aprovados pelo engenheiro. Sem esses pesos, o sistema mostra progresso por
atividade e informa que o agregado ainda não é calculável. Orçamento é base do
EVM, não peso físico implícito.

## Orientação didática e bloqueios

Todo bloqueio de etapa usa o mesmo contrato de orientação:

- **O que aconteceu:** fato observável, sem código interno;
- **Por que bloqueia:** consequência para a próxima etapa ou indicador;
- **Como resolver:** passos concretos e ordenados;
- **Onde resolver:** botão que abre diretamente a aba e, quando possível, o
  item afetado;
- **Como confirmar:** evidência que muda o estado para resolvido;
- **O que foi preservado:** informação de que nenhum dado aprovado ou baseline
  foi perdido quando isso for verdade.

Uma etapa bloqueada não oferece ação primária de avanço. A ação principal passa
a ser “Resolver pendência”. Alertas secundários não bloqueantes permanecem
identificados como recomendações. Mensagens técnicas, IDs e detalhes de erro
ficam numa área expansível “Detalhes técnicos”, nunca como explicação principal.

## Linguagem visual

Direção: **instrumento técnico de sala de planejamento** — claro, denso, sóbrio
e legível, com hierarquia semelhante a uma prancha de controle, não a um
dashboard decorativo.

Paleta semântica inicial:

- planejado atual: azul petróleo;
- caminho crítico/atraso confirmado: vermelho-terra;
- executado confirmado: verde;
- baseline: grafite;
- alerta ou dado pendente: âmbar;
- marco: dourado;
- grupo/resumo: cinza-azulado.

Regras:

- todo estado tem cor + texto/ícone/padrão;
- linha de hoje é sólida, fina e rotulada;
- início da obra só aparece quando distinto e recebe rótulo no cabeçalho;
- grade mensal é discreta; fim de semana usa faixa leve;
- dependências gerais ficam atenuadas e as da atividade selecionada ganham
  destaque;
- foco por teclado é sempre visível;
- controles têm rótulos acessíveis e mudanças assíncronas usam `aria-live`.

## Fontes únicas de dados

- EAP e dicionário: versão de trabalho/aprovada existente;
- atividades e dependências: `planning.list`;
- datas e folgas: CPM persistido;
- baseline: snapshot vigente, nunca o planejamento atual;
- produção: lançamentos confirmados até a data de posição;
- restrições: fonte operacional do lookahead/controle, filtrada por atividade,
  data de posição e estado aberto/em andamento;
- local físico e distribuição: vínculos da EAP/LOB;
- orçamento e EVM: somente versão financeira aprovada e rastreável.

Nenhum componente visual calcula ou grava uma data oficial paralela.

## Comportamento de edição

1. Usuário seleciona a atividade.
2. Inspetor mostra evidências e campos permitidos para a versão atual.
3. Alteração é validada e salva pelo endpoint existente ou por endpoint estreito.
4. O sistema marca CPM como pendente/desatualizado quando aplicável.
5. Usuário recalcula; somente resultado válido atualiza as datas oficiais.
6. Grade, Gantt, LOB, dashboard, lookahead e baseline são revalidados juntos.
7. A baseline vigente permanece congelada e passa a mostrar o desvio.

## Critérios de aceite

### Rede

- com 39 vínculos, a tabela não pode ficar comprimida ou truncada sem recurso de
  inspeção;
- formulário e tabela permanecem utilizáveis a 1366 px e 1024 px;
- busca e filtros não alteram os vínculos;
- ciclo, autodependência e projeto cruzado continuam bloqueados.

### Gantt

- cada linha visual tem significado identificável na legenda ou no cabeçalho;
- não existem linhas pontilhadas órfãs;
- planejado, baseline, realizado e crítico são distinguíveis também sem cor;
- selecionar uma atividade destaca suas relações e abre o inspetor;
- duração ou vínculo alterado só muda datas após recálculo válido do CPM;
- baseline antiga não se move quando o plano muda.
- `activityId`, e não WBS, identifica linha, seleção e dependência; as 30
  atividades da Escola continuam distintas mesmo quando compartilham código.

### Cronograma operacional

- filtros, seleção e expansão afetam grade e tempo juntos;
- atividade mostra planejado, baseline, real, saldo e restrições quando os dados
  existem;
- ausência de produção aparece como “sem dado”, nunca como 0%;
- ações levam diretamente ao ponto de correção;
- Gantt e LOB usam a mesma população operacional e deixam explícitos itens
  excluídos ou sem local.
- seleção compartilhada entre modos usa `activityId`; pacote e local são apenas
  agrupamentos.

### Dashboard e orçamento

- a expressão “régua validada” não aparece;
- avanço físico e avanço financeiro têm estados independentes;
- o painel explica exatamente qual dado falta e como resolver;
- dado didático não habilita EVM real.

### Qualidade

- testes de unidade e regressão cobrem rede, CPM, baseline, ausência de produção,
  orçamento incompleto e sincronização entre vistas;
- navegação por teclado, foco visível, rótulos de formulário e avisos assíncronos
  são verificados;
- validação ao vivo usa a Escola e não altera outras obras.
- listas acima de 50 linhas usam renderização otimizada; cenários de 500 e 2.000
  atividades têm teste de responsividade e interação sem congelar a tela.
- o inspetor mantém foco preso enquanto aberto, fecha com Escape e restaura o
  foco na atividade; contraste de texto e controles atende WCAG AA.

## Sequência de entrega

1. Rede legível e nova linguagem do dashboard.
2. Tokens visuais e limpeza semântica do Gantt.
3. Cronograma integrado com seleção e inspetor.
4. Sincronização com produção, baseline e LOB.
5. Testes de causa → efeito, regressão, deploy e validação ao vivo.

## Decisões deixadas ao implementador

- composição exata dos componentes React, preservando os contratos atuais;
- estratégia de URL para filtros sem adicionar dependência desnecessária;
- virtualização apenas quando a população superar o limite de desempenho;
- migração gradual da navegação, mantendo rotas existentes durante a validação.
