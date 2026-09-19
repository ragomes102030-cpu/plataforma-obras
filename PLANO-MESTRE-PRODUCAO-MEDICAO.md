# Plano mestre da Plataforma Obras

## Direção do produto

A Plataforma Obras será um sistema multiobras para **planejamento, produção e medição**. O produto deve transformar o planejamento em uma rotina operacional simples: definir o que será executado, organizar a sequência, acompanhar o realizado, medir a produção, identificar desvios e orientar a próxima decisão.

A referência metodológica principal será o planejamento e controle de obras de **Aldo Dórea Mattos**. O sistema não tentará substituir o engenheiro, o mestre ou o responsável pela medição. Ele deve organizar dados, aplicar cálculos determinísticos e usar o agente de IA para explicar situações, reunir evidências e orientar ações.

> **Princípio do produto:** a plataforma deve responder rapidamente a três perguntas: o que estava planejado, o que foi realizado e o que precisa ser decidido agora.

## Resultado esperado

Ao abrir uma obra, o usuário deverá compreender em poucos segundos o prazo, o avanço, os principais desvios, as frentes em risco e as medições pendentes. A interface não deve exigir que o usuário conheça todos os conceitos técnicos para iniciar uma operação. Os detalhes de EAP, cronograma, produtividade e Linha de Balanço devem aparecer progressivamente, conforme a necessidade.

A IA será o **agente de contexto e orquestração**. Ela poderá consultar o banco local, os três MCPs de EAP, Cronograma e Gantt/LOB, os documentos da obra e a memória autorizada. Ela não poderá inventar cálculo, executar escrita sem confirmação ou esconder que uma fonte está indisponível.

## Modelo operacional da obra

A unidade principal do sistema é a obra. Cada obra possui planejamento, produção, medição, documentos, riscos, restrições, responsáveis, decisões e histórico.

O fluxo operacional será:

```text
Obra
  ↓
EAP e pacotes de trabalho
  ↓
Cronograma e sequência executiva
  ↓
Baseline aprovada
  ↓
Frentes, equipes e produção
  ↓
Medições e avanço real
  ↓
Comparação planejado × realizado
  ↓
Análise de desvios
  ↓
Ação corretiva e nova previsão
```

## Módulos prioritários

### 1. Painel da obra

O painel será a entrada principal. Ele mostrará avanço físico, prazo consumido, prazo restante, atividades críticas, produção da semana, medições pendentes, restrições abertas e alertas de desvio.

O usuário não deverá precisar interpretar gráficos para descobrir que uma frente está atrasada. Cada indicador deve possuir uma frase de interpretação e uma ação sugerida.

### 2. EAP

A EAP organizará o escopo em níveis, pacotes de trabalho, serviços, frentes e unidades de produção. Cada item poderá ter responsável, unidade de medição, quantidade planejada, quantidade realizada, custo de referência e vínculo com atividades.

A EAP será a estrutura comum entre planejamento, produção e medição. Nenhuma atividade importante deve ficar sem vínculo com um item de EAP.

### 3. Cronograma

O cronograma conterá atividades, durações, calendários, predecessoras, sucessoras, restrições, responsáveis, avanço, datas planejadas e datas reais. O sistema calculará caminho crítico, folgas, datas antecipadas e atrasadas de maneira determinística.

A IA poderá explicar o caminho crítico, mas o cálculo permanecerá em código e nos MCPs especializados.

### 4. Produção

Produção será o centro de uso diário. O usuário deverá registrar de forma rápida:

- frente de serviço;
- equipe responsável;
- unidade produzida;
- quantidade executada;
- data e turno;
- localização;
- ocorrência ou impedimento;
- observação de campo;
- evidência fotográfica, quando disponível.

O sistema calculará produtividade real, produtividade planejada, rendimento da equipe, ritmo por frente e tendência de conclusão.

A tela de produção deve permitir lançamento rápido pelo celular. Campos obrigatórios devem ser poucos; dados complementares poderão ser adicionados depois.

### 5. Medição

A medição será baseada em quantidade executada, unidade de medição, critério de aceitação e vínculo com EAP, atividade e contrato quando aplicável.

O fluxo recomendado é:

```text
Medição em rascunho
  ↓
Conferência de quantidade e evidência
  ↓
Validação do responsável
  ↓
Medição aprovada
  ↓
Integração com avanço e relatório
```

A medição aprovada não deve ser apagada fisicamente. Correções devem gerar estorno, revisão ou nova versão, preservando a trilha de auditoria.

### 6. Gantt e Linha de Balanço

O Gantt mostrará a sequência temporal. A Linha de Balanço mostrará o ritmo das equipes e a continuidade das frentes por unidade, pavimento, trecho ou setor.

O sistema deverá destacar interferências, espera, cruzamento de equipes, perda de ritmo e frente sem continuidade. A Linha de Balanço será mais importante para obras repetitivas, como edifícios, conjuntos habitacionais, pavimentos, fachadas e instalações seriadas.

### 7. Restrições e riscos

Cada restrição terá responsável, data necessária, estado, impacto, origem e ação. O sistema poderá vincular a restrição a uma atividade, frente, medição, documento ou decisão.

A IA deverá responder quais restrições ameaçam o caminho crítico e quais precisam de ação antes da próxima janela de produção.

### 8. Documentos

Documentos serão vinculados a uma obra e versionados. O sistema deve suportar, por etapas, contrato, projeto, diário de obra, orçamento, composição, relatório, medição, foto e ata.

Quando a IA usar um documento, deverá indicar o documento, a versão e a página ou trecho utilizado. Documento novo não substitui automaticamente documento anterior sem registro de versão.

## Produção e medição como experiência principal

A rotina diária deve ter uma entrada chamada **Hoje na obra**. Ela reunirá as tarefas que precisam de ação no dia:

- registrar produção;
- conferir atividade crítica;
- resolver restrição vencida;
- validar medição;
- revisar equipe abaixo do ritmo;
- atualizar avanço;
- responder recomendação do agente.

O usuário deve conseguir lançar uma produção em menos de um minuto quando já souber a obra, a frente e a atividade. A plataforma poderá preencher automaticamente unidade, equipe, serviço e unidade de produção a partir do último lançamento.

A tela de medição deverá separar claramente três estados: **a lançar**, **em conferência** e **aprovado**. Essa separação reduz o risco de tratar uma quantidade informada em campo como uma medição oficialmente validada.

## Agente de IA da obra

O agente será acessado por uma barra lateral persistente. Ele receberá a obra atual, a aba ativa e o contexto necessário, mas não lerá a tela por captura visual.

```text
Barra lateral
  ↓
Context Builder
  ├── Banco local
  ├── EAP
  ├── Cronograma
  ├── Produção
  ├── Medições
  ├── Gantt/LOB
  ├── Documentos
  └── Memória da obra
        ↓
LLM Provider Gateway
        ↓
Agent Orchestrator
        ↓
MCPs e ferramentas allowlisted
```

O agente terá três modos de uso:

| Modo | Objetivo | Permissão inicial |
|---|---|---|
| Perguntar | Responder sobre a obra | Consulta |
| Analisar | Comparar planejado, realizado e tendência | Consulta |
| Preparar ação | Montar rascunho de lançamento, medição ou correção | Prévia, sem execução automática |

Perguntas que o agente deverá responder bem:

- “O que preciso acompanhar hoje?”
- “Quais frentes estão abaixo do ritmo?”
- “Qual medição está pendente de conferência?”
- “Qual atraso ameaça a entrega?”
- “O que causou a queda de produtividade?”
- “Quais restrições preciso resolver antes de liberar a equipe?”
- “Compare o planejado desta semana com o realizado.”
- “Prepare um rascunho da medição desta frente.”

## Arquitetura técnica

### Camadas

A aplicação será organizada em seis camadas:

1. **Interface:** páginas, abas, painel de produção, medição e barra lateral do agente.
2. **API de aplicação:** autenticação, autorização, validação, mutations, queries e contratos tRPC.
3. **Domínio:** regras de obra, EAP, cronograma, produção, medição, baseline e auditoria.
4. **Orquestração:** Agent Orchestrator, Context Builder, memória de sessão e catálogo de ferramentas.
5. **Integrações:** MCP EAP, MCP Cronograma, MCP Gantt/LOB, provedores LLM e documentos.
6. **Persistência:** banco local, arquivos, versões, auditoria e vínculos externos.

### Fontes de verdade

O banco local será a fonte de verdade da operação do usuário. Os MCPs serão serviços especializados para cálculos, estruturas e análises que o sistema integrar. O vínculo entre uma obra local e cada projeto externo será explícito.

Quando um MCP estiver indisponível, a obra continuará operando localmente. A sincronização será marcada como pendente e nunca será feita silenciosamente.

### LLM Provider Gateway

O gateway permite trocar entre DeepSeek, Gemini, OpenRouter, Groq, Cerebras, OpenCode Zen e API própria sem alterar o agente. O modelo deve ser avaliado por suporte a tool calling, estabilidade, limites e custo, não apenas pela qualidade da conversa.

## Fluxo de produção diário

```text
1. Usuário abre Hoje na obra
2. Sistema mostra plano do dia e restrições
3. Usuário registra produção por frente
4. Sistema calcula avanço e produtividade
5. Usuário anexa evidência quando necessário
6. Responsável confere ocorrências
7. Agente analisa desvios e sugere ações
8. Cronograma recebe atualização controlada
9. Painel mostra tendência e próximos riscos
```

A alteração de datas, baseline ou medição aprovada exige confirmação e auditoria. O agente poderá preparar a mudança, mas não executá-la sozinho.

## Roadmap executável

### Fase 0 — base já existente

A plataforma já possui banco, autenticação em evolução, projetos, atividades, cálculo CPM, integração inicial com os três MCPs, Agent Orchestrator somente leitura e gateway multi-provedor.

### Fase 1 — contexto e navegação do agente

Criar a barra lateral, compartilhar obra e aba ativa com o agente, implementar o Context Builder inicial e retornar fontes consultadas. O primeiro contexto será composto por projeto, atividades locais, indicadores e status dos MCPs.

### Fase 2 — operação diária de produção

Criar entidades de frente, equipe, unidade de produção, lançamento diário e ocorrência. Implementar a tela Hoje na obra e os indicadores de produtividade planejada e real.

### Fase 3 — medição versionada

Criar rascunho, conferência, aprovação, estorno, evidências e trilha de auditoria. Integrar medição ao avanço da EAP e das atividades sem misturar lançamento de campo com aprovação oficial.

### Fase 4 — EAP integrada ao planejamento

Completar a EAP operacional, vincular pacotes a atividades e unidades de medição e eliminar registros de atividade sem vínculo de escopo.

### Fase 5 — Gantt, baseline e desvios

Conectar o Gantt a dados reais, permitir baseline aprovada, comparar datas e avanço e destacar atividades críticas e tendência de atraso.

### Fase 6 — Linha de Balanço e ritmo

Integrar unidades repetitivas, equipes, ritmo planejado, ritmo real, espera e interferências. Expor recomendações de balanceamento sem executar redistribuição automaticamente.

### Fase 7 — memória e documentos

Persistir sessões, decisões, restrições e fatos aprovados por obra. Adicionar documentos versionados, busca contextual e respostas com evidência.

### Fase 8 — ações assistidas

Permitir que o agente prepare lançamentos locais, rascunhos de medição, novas restrições e planos de ação. Toda execução exigirá prévia, confirmação, idempotência e auditoria.

### Fase 9 — sincronização MCP

Sincronizar EAP, cronograma e análises com os MCPs após existir vínculo externo, reconciliação e tratamento de conflitos. Escritas externas continuam bloqueadas até os testes de contrato estarem concluídos.

## Critérios de sucesso do piloto

O piloto será considerado útil quando uma equipe conseguir acompanhar uma obra de teste por pelo menos uma semana e responder, com evidência, às seguintes perguntas:

- O que estava planejado para o período?
- O que foi produzido?
- Qual foi a produtividade real?
- O que está atrasado?
- Qual atividade é crítica?
- Qual medição aguarda conferência?
- Qual restrição precisa de ação?
- Qual frente ameaça o próximo marco?
- O que o agente consultou para chegar à resposta?

## Regras que não serão negociadas

- Cálculos de CPM, produtividade, quantidades e Linha de Balanço serão determinísticos.
- A LLM não poderá inventar uma medição, data, custo ou avanço.
- O banco local continuará disponível quando MCP ou LLM estiver offline.
- Toda escrita relevante exigirá confirmação e auditoria.
- Medição aprovada será versionada, nunca apagada sem rastreabilidade.
- Cada obra terá isolamento de dados, contexto e memória.
- O usuário verá quando uma fonte estiver indisponível.
- A interface mostrará primeiro a decisão necessária e depois o detalhe técnico.

## Referências

[1]: https://www.ofitexto.com.br/planejamento-e-controle-de-obras-2ed/p "Planejamento e Controle de Obras — Aldo Dórea Mattos"
[2]: https://hermes-agent.nousresearch.com/docs/developer-guide/architecture "Hermes Agent — Architecture"
[3]: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp "Hermes Agent — MCP e filtragem de ferramentas"
[4]: https://api-docs.deepseek.com/guides/tool_calls "DeepSeek API — Tool Calls"
