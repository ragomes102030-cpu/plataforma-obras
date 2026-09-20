# Plano de evolução executável — Plataforma Obras

**Marco:** correção técnica e preparação para operação  
**Data:** 20 de setembro de 2026

## Decisão arquitetural

A recomendação é **não migrar agora para Supabase e Vercel**. O sistema já está publicado no Render, o serviço principal passa CI, typecheck, testes e build, e os três MCPs estão vivos. A migração neste momento acrescentaria troca de banco, autenticação, deploy, variáveis secretas e contratos de rede antes de o produto ter sua persistência homologada.

| Abordagem | Trade-offs | Custo | Complexidade |
| --- | --- | --- | --- |
| **Manter GitHub + Render e corrigir** | Menor risco e reaproveita o deploy existente; exige decidir MySQL e alinhar probes/branches | Menor mudança imediata | Baixa a média |
| Migrar frontend para Vercel e banco para Supabase | Boa experiência para frontend e PostgreSQL gerenciado; exige adaptar Drizzle, driver, auth, migrations e rede dos MCPs | Pode aumentar custo e dependências | Alta |
| Hospedar somente o serviço principal em uma plataforma com banco compatível | Reduz a fragmentação de infraestrutura; pode exigir mover os MCPs ou manter dois provedores | Variável | Média |

A migração para Supabase/Vercel só deve ser reavaliada depois de existir uma razão objetiva, como necessidade de PostgreSQL, autenticação nativa, storage de documentos, escalabilidade do frontend ou limitações comprovadas do Render. Ela não é necessária para corrigir os erros atuais.

## O que foi corrigido neste ciclo

O serviço principal passou a normalizar `ssl-mode` antes de entregar a conexão ao `mysql2`, usando a opção TLS nativa do driver. O logout e o callback do GitHub deixaram de enviar `maxAge` para `clearCookie`, removendo a depreciação do Express. Foram adicionados testes de regressão para a normalização da conexão.

O MCP EAP passou a reconhecer o comportamento do `libsql-client==0.3.1` que pode retornar `KeyError('result')` depois de executar DDL sem linhas. O caso não é mais registrado como falha falsa de migração. Também foi adicionado um teste específico e mantido o tratamento idempotente de colunas já existentes.

Os três MCPs passaram a expor `GET /healthz`, separado de `POST /mcp`. O Cronograma também teve o lint `F541` corrigido e seu teste de atividade sem duração foi alinhado ao contrato atual: a criação rejeita a atividade inválida antes do cálculo.

## Fases de evolução

### Fase 0 — Publicar e estabilizar a base

Publicar as correções nos repositórios correspondentes e aguardar o CI de cada branch. No Render, configurar `/healthz` como healthcheck dos três MCPs. Alinhar o serviço Gantt/Linha de Balanço para acompanhar a branch `main`, ou manter explicitamente uma estratégia de espelhamento documentada até que essa configuração seja ajustada.

**Critério de aceite:** os quatro serviços ficam live no SHA publicado, os healthchecks retornam HTTP 200 e os logs não registram o falso erro `KeyError('result')` como migração não aplicada.

### Fase 1 — Persistência real da aplicação

Escolher MySQL compatível com o código atual para o primeiro ambiente persistente. Configurar `DATABASE_URL`, executar `pnpm db:push` de forma controlada e validar criação de usuário, criação de obra, atualização, leitura após reinício e isolamento por usuário.

O PostgreSQL já provisionado no Render não deve ser ligado ao serviço enquanto o projeto continuar usando `drizzle-orm/mysql2`. Se a equipe preferir PostgreSQL, abrir uma migração específica com novo dialeto, driver, schema, migrations e testes de equivalência.

**Critério de aceite:** uma obra criada por sessão autenticada reaparece depois de redeploy e não pode ser lida por outro usuário sem permissão.

### Fase 2 — Homologação dos contratos MCP

Executar `initialize`, `tools/list` e uma leitura representativa em cada MCP. Usar timeout de conexão separado do timeout de operação. Aplicar retry somente a leituras idempotentes; nunca repetir automaticamente uma mutação. Registrar `requestId`, servidor, ferramenta, latência, status e erro sanitizado.

**Critério de aceite:** um MCP fora do ar degrada apenas seu domínio, enquanto a tela e os demais domínios continuam disponíveis.

### Fase 3 — Importação segura do planejamento

Homologar a obra de teste com os vínculos externos da EAP, Cronograma e Gantt. Executar primeiro o preview local. Depois importar EAP, atividades, dependências e caminho crítico, preservando IDs externos, referências `eap_ref` e idempotência. A operação deve ser repetível sem duplicar registros.

**Critério de aceite:** o plano local exibe os mesmos nós, atividades, dependências e datas dos MCPs, com reconciliação registrada.

### Fase 4 — Operação de produção

Liberar baseline, comparação de desvios, progresso, curva S e Linha de Balanço. Cada escrita externa exige prévia, confirmação e chave idempotente. Exclusões permanecem bloqueadas até existir recuperação e auditoria suficientes.

**Critério de aceite:** uma obra repetitiva apresenta ritmo por unidade, risco de interferência e alternativas de equipe sem alterar dados sem confirmação.

### Fase 5 — Agente e documentos

Expandir o agente para responder com dados reais por obra. O agente deve usar o orquestrador do backend, nunca chamar URLs MCP diretamente do navegador. Ferramentas de leitura podem ser automáticas; criações, alterações e baseline exigem aprovação. Documentos devem ser versionados por obra e as respostas devem apontar arquivo, página, aba ou trecho de origem.

**Critério de aceite:** cada resposta operacional pode ser auditada até a obra, ferramenta, usuário e fonte usada.

## Regras que não mudam

O banco é a fonte de verdade da aplicação local. Os MCPs continuam separados por domínio. Cálculos de CPM, datas, quantitativos e Linha de Balanço permanecem determinísticos. O modelo de linguagem interpreta e coordena, mas não substitui esses cálculos. Nenhum token deve aparecer no GitHub, frontend ou logs.

## Ordem prática de execução

1. Publicar e verificar os três MCPs e o serviço principal.
2. Configurar os healthchecks no Render.
3. Corrigir a branch do serviço Gantt/Linha de Balanço no Render.
4. Configurar e testar o MySQL compatível do serviço principal.
5. Executar a homologação somente leitura dos três MCPs.
6. Executar a importação da obra de teste com preview e reconciliação.
7. Liberar baseline, progresso e Linha de Balanço.
8. Evoluir agente, memória e documentos após a persistência estar comprovada.

## Definição de “sistema funcionando”

O sistema estará pronto para iniciar operação quando houver login funcional, banco persistente compatível, criação e leitura de obras, isolamento por usuário, CI verde, quatro serviços live, healthchecks HTTP 200, contratos MCP homologados e importação idempotente de uma obra de teste. Até esse ponto, novos recursos visuais devem ficar subordinados à correção da base.


## Marco concluído — fluxo operacional e interface viva (8c06c51)

A interface principal deixou de depender de métricas e alertas fixos: avanço consolidado, atividades críticas, próximo marco, foco semanal, usuário, workspace e sincronização agora são derivados do banco e da obra selecionada. O módulo **Cronogramas** passou a abrir o Gantt real, com filtragem, edição e persistência das atividades; os módulos de Restrições e Relatórios passaram a refletir as atividades carregadas em vez de exibir cartões genéricos.

Uma nova obra criada pela interface agora recebe automaticamente o plano inicial e o catálogo operacional, deixando EAP, cronograma e produção prontos para uso. No painel de integrações, cada MCP mostra endpoint, vínculo externo, estado pendente/homologado, teste de conexão, latência e quantidade de ferramentas. Salvar um `project_id` não marca mais o servidor como pronto antes da homologação; a homologação somente leitura continua sendo a confirmação operacional.

O commit foi publicado em `main`, o CI passou com typecheck, testes e build, e os quatro endpoints públicos retornaram HTTP 200: serviço principal, MCP EAP, MCP Cronograma e MCP Gantt/LOB.

**Próximo marco:** autenticar uma sessão de cliente, criar uma obra real, vincular os `project_id` externos e executar a homologação somente leitura seguida do preview de importação. A execução deve usar um projeto externo separado da obra de teste até que a reconciliação seja aprovada.
