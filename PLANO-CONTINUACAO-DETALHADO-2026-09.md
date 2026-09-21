# Plano detalhado de continuação — Plataforma Obras

**Data:** 21 de setembro de 2026  
**Status:** roteiro de execução para as próximas etapas  
**Objetivo:** transformar a fundação atual em um sistema profissional de orçamento, planejamento, produção, medição e controle de obras.

## 1. Direção do produto

A Plataforma Obras não deve continuar crescendo apenas por telas isoladas. O próximo ciclo precisa conectar os dados em um fluxo único:

> **Orçamento → serviços → EAP → planejamento → recursos e frentes → produção → medição → indicadores → decisões.**

O sistema será considerado evoluído quando uma obra conseguir percorrer esse fluxo sem depender de planilhas externas para controlar quantidade, prazo, produção e desvio.

A interface profissional continua sendo prioridade. Entretanto, cada melhoria visual deve representar uma operação real persistida. O objetivo não é apenas deixar o sistema mais bonito, mas fazer com que o usuário entenda o estado da obra e saiba qual ação deve executar em seguida.

## 2. Estado atual após as Etapas 1 a 8

| Etapa | Entrega | Situação |
|---|---|---|
| 1 | Fundação da interface profissional | Concluída |
| 2 | Orçamento e serviços | Concluída em núcleo inicial |
| 3 | Catálogo de preços e composições | Concluída em núcleo inicial |
| 4 | Aplicação de composição e planejamento quantitativo | Concluída em núcleo inicial |
| 5 | Recursos, atividades e rede de precedências | Concluída |
| 6 | CPM, folgas e caminho crítico | Concluída |
| 7 | Gantt, baseline e Linha de Balanço | Concluída em primeira versão |
| 8 | Medição, avanço e planejado versus realizado | Concluída em primeira versão |

As etapas concluídas formam uma fundação funcional. Ainda não representam o nível de maturidade de um sistema completo de controle de obras porque algumas regras permanecem simplificadas. Os principais exemplos são calendário de trabalho, aprovação formal, custo realizado, curva S, medição contratual e histórico de alterações.

## 3. Prioridade imediata

A prioridade seguinte deve ser **transformar os dados existentes em informação gerencial confiável**. Para isso, a sequência recomendada é:

1. corrigir e estabilizar o ambiente de deploy;
2. melhorar o controle planejado versus realizado;
3. criar indicadores de prazo, produtividade e custo;
4. consolidar medições por período;
5. comparar baseline com replanejamento;
6. reforçar governança, aprovação e auditoria;
7. melhorar importação e integração com catálogos de preços;
8. só depois ampliar automações com agente e integrações MCP.

Não recomendo iniciar agora uma nova tela grande sem terminar o ciclo de controle dos dados já lançados.

## 4. Etapa 9 — Indicadores de prazo, produtividade e custo

### Objetivo

Criar o primeiro painel gerencial real da obra. Ele deverá responder se a obra está adiantada ou atrasada, se está produzindo na produtividade esperada e se o custo está dentro do planejado.

### Funcionalidades

O painel deverá apresentar avanço físico planejado e realizado, desvio acumulado, atividades críticas em atraso, atividades sem medição recente, produtividade por equipe, produtividade por frente, utilização de recursos e previsão de término.

Na parte financeira, deverá apresentar custo planejado, custo realizado quando houver apropriação disponível, custo comprometido e saldo do orçamento. O sistema deverá separar claramente quantidade, preço unitário e custo total.

### Dados necessários

Será necessário relacionar itens de orçamento, atividades, medições, produção, recursos, equipes, frentes e períodos de controle. Cada indicador deverá informar sua fonte e a data de corte.

### Critérios de aceite

A etapa será aceita quando o usuário puder selecionar uma obra e um período de corte, visualizar os indicadores com unidade e fonte, abrir o detalhe de uma variação e chegar até as atividades ou medições que formaram o número.

## 5. Etapa 10 — Períodos de controle e boletim de medição

### Objetivo

Separar definitivamente produção diária de medição consolidada. A produção registra o que aconteceu no campo. A medição consolida o que será reconhecido em um período contratual ou gerencial.

### Modelo funcional

O sistema deverá possuir períodos com data inicial, data final, situação e responsável. Um boletim deverá conter itens medidos, quantidade do período, acumulado anterior, acumulado atual, saldo e observações.

O fluxo recomendado será:

1. período aberto;
2. boletim em elaboração;
3. itens conferidos;
4. boletim submetido;
5. boletim aprovado ou devolvido;
6. período encerrado.

A aprovação não deverá apagar ou sobrescrever valores. Uma correção deverá gerar uma nova versão ou um evento de ajuste.

### Critérios de aceite

O usuário deverá conseguir abrir um período, selecionar itens do orçamento ou serviços da obra, informar quantidades, anexar observações, submeter o boletim, aprovar e consultar o acumulado histórico.

## 6. Etapa 11 — Baseline versus replanejamento

### Objetivo

Usar o baseline criado na Etapa 7 para explicar mudanças no plano e não apenas armazenar um snapshot.

### Funcionalidades

A comparação deverá mostrar, por atividade, a variação do início, término, duração, caminho crítico e quantidade planejada. O usuário deverá conseguir filtrar atividades adiantadas, atrasadas, alteradas e incluídas após a aprovação.

O sistema deverá apresentar também uma visão consolidada da variação do prazo da obra. Quando uma predecessora crítica for alterada, o sistema deverá apontar quais sucessoras podem ser afetadas.

### Critérios de aceite

Ao comparar um baseline com o plano atual, o usuário deverá identificar quais atividades mudaram, quanto mudaram, quem alterou o plano e quando a alteração ocorreu.

## 7. Etapa 12 — Calendário de trabalho e datas reais

### Objetivo

Substituir o uso exclusivo de dias relativos por datas operacionais confiáveis.

### Funcionalidades

A obra deverá ter calendário padrão, dias úteis, feriados, jornadas e exceções. Equipes ou frentes poderão possuir calendários diferentes quando necessário.

O CPM deverá continuar determinístico, mas deverá converter os offsets em datas reais. O Gantt e a Linha de Balanço deverão usar as mesmas regras de calendário.

### Critérios de aceite

Uma atividade iniciada na sexta-feira, com duração em dias úteis, não deverá avançar como se sábado e domingo fossem dias de produção quando o calendário da obra não os considerar úteis.

## 8. Etapa 13 — Recursos, capacidade e produtividade

### Objetivo

Fazer com que o planejamento de recursos deixe de ser apenas cadastro e passe a explicar capacidade, sobrecarga e produtividade.

### Funcionalidades

O sistema deverá permitir disponibilidade por período, equipe alocada, capacidade diária, produtividade esperada e custo diário. O usuário deverá visualizar conflitos entre atividades que usam o mesmo recurso.

A produtividade realizada deverá ser calculada por período e comparada com a referência da composição ou do planejamento. A variação deverá ser classificada como ganho, perda ou ausência de dados.

### Critérios de aceite

Quando duas atividades usarem mais capacidade do que o recurso possui no mesmo período, o sistema deverá informar a sobrecarga e permitir remanejamento ou justificativa.

## 9. Etapa 14 — Curva S, valor agregado e relatórios

### Objetivo

Criar gráficos executivos rastreáveis para acompanhamento de prazo e custo.

### Gráficos prioritários

A primeira versão deverá conter Curva S física, Curva S de custo, planejado versus realizado, produtividade por período, evolução da medição, histograma de recursos, Gantt com baseline e Linha de Balanço com realizado.

Cada gráfico deverá ter período, unidade, filtro, data de corte e origem dos dados. Nenhum gráfico deverá exibir um percentual sem permitir que o usuário abra o detalhe que formou o cálculo.

### Valor agregado

Depois que orçamento, medição e produção estiverem consistentes, poderão ser calculados valor planejado, valor agregado, custo real, índice de desempenho de prazo e índice de desempenho de custo. Esses indicadores devem ser introduzidos somente quando houver dados suficientes para não criar uma falsa precisão.

## 10. Etapa 15 — Governança e auditoria

### Objetivo

Transformar alterações, aprovações e decisões em parte formal do sistema.

### Funcionalidades

O sistema deverá registrar usuário, data, ação, entidade alterada, valor anterior, valor novo e justificativa. Aprovações de orçamento, baseline, medição e replanejamento deverão ter histórico.

A reabertura de um plano aprovado deverá exigir justificativa. A alteração não deverá apagar o estado anterior.

Os gates do agente deverão ser ligados a fatos persistidos. O agente poderá explicar o estado da obra e sugerir ações, mas não deverá substituir a aprovação humana de orçamento, medição ou baseline.

## 11. Etapa 16 — Importação de SINAPI, SEINFRA e bases próprias

### Primeira versão recomendada

A integração deverá começar por importação controlada de CSV ou XLSX, sem depender de uma API externa. Cada importação deverá guardar fonte, competência, UF, data, arquivo, usuário e versão.

O catálogo deverá manter separados código externo, descrição normalizada, unidade, preço, composição e origem. Uma atualização de preço deverá criar uma nova referência e não alterar silenciosamente um orçamento aprovado.

### Fluxo de aplicação

O usuário deverá importar a referência, revisar divergências, comparar preços, selecionar os itens que deseja aplicar e criar uma nova versão de orçamento. O sistema deverá mostrar o impacto total antes da confirmação.

### Evolução posterior

Depois da importação estável, poderão ser criados adaptadores para fontes oficiais que ofereçam acesso autorizado e tecnicamente estável. A plataforma deverá verificar condições de uso e redistribuição antes de automatizar qualquer coleta.

## 12. Melhorias de interface que devem acompanhar todas as etapas

A interface deverá evoluir de forma consistente, sem criar uma tela diferente para cada módulo. Cada módulo deverá possuir cabeçalho contextual, indicador de estado, ação principal, tabela ou gráfico operacional, mensagens de erro claras e indicação da fonte dos dados.

As telas deverão diferenciar visualmente:

- informação planejada;
- informação realizada;
- informação aprovada;
- informação em rascunho;
- informação calculada;
- informação ausente ou desatualizada.

A navegação deverá sempre responder três perguntas: onde estou, qual é o estado da obra e qual é a próxima ação recomendada.

## 13. Regras de qualidade para cada entrega

Cada etapa deverá seguir o mesmo ciclo:

1. auditar o código atual e o contrato do domínio;
2. implementar schema e backend;
3. construir a interface do fluxo real;
4. validar permissões e isolamento por obra;
5. executar TypeScript, testes, build e `git diff --check`;
6. criar um arquivo MD da etapa;
7. fazer commit com mensagem específica;
8. enviar ao GitHub;
9. confirmar o deploy no Render;
10. registrar limitações e próximo passo.

O banco não deverá receber alterações destrutivas sem backup ou estratégia de compatibilidade. O comando de deploy deve permanecer idempotente. O ambiente de desenvolvimento continuará usando o plano gratuito enquanto o sistema estiver em construção.

## 14. Critério final de sistema operacional

A plataforma estará pronta para uma primeira operação profissional quando uma obra nova conseguir:

1. cadastrar orçamento e serviços;
2. importar ou criar composições;
3. vincular serviços à EAP;
4. gerar atividades quantitativas;
5. calcular durações por produtividade;
6. distribuir atividades por frente e recurso;
7. criar precedências e calcular CPM;
8. aprovar uma baseline;
9. lançar e confirmar produção;
10. abrir e aprovar medições;
11. comparar planejado, realizado e baseline;
12. analisar prazo, produtividade, custo e tendência;
13. registrar restrições, decisões e ações corretivas;
14. consultar o histórico de alterações.

Enquanto esse fluxo não estiver completo, novas funções de inteligência artificial devem permanecer subordinadas aos dados operacionais. O agente poderá acelerar análise e explicação, mas a fonte de verdade deverá continuar sendo o banco e os registros aprovados.

## 15. Próximo passo concreto

O próximo desenvolvimento recomendado é a **Etapa 9 — Indicadores de prazo, produtividade e custo**. Ela deve começar pelo painel de controle físico, porque os dados de produção confirmada e planejado versus realizado já existem.

A primeira entrega da Etapa 9 deverá criar uma visão executiva simples, mas rastreável. Depois dela, será possível identificar quais indicadores exigem novos campos, quais dependem de medição contratual e quais já podem ser calculados com os dados atuais.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-08-MEDICAO-AVANCO-E-CONTROLE.md "Etapa 8 — Medição, avanço e controle"

[3]: ./ETAPA-07-GANTT-BASELINE-LINHA-DE-BALANCO.md "Etapa 7 — Gantt, baseline e Linha de Balanço"

[4]: ./ROADMAP-CORRECOES-PRODUTO-OBRAS.md "Roadmap de correções e evolução funcional"
