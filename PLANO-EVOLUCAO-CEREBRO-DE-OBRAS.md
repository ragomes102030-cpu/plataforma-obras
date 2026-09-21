# Plano de evolução — Cérebro inteligente de obras

**Projeto:** Plataforma Obras  
**Repositório:** `ragomes102030-cpu/plataforma-obras`  
**Estado-base atual:** commit `6e40c0e` — `feat: provar agente em leitura`  
**Autor:** Manus AI  
**Data:** 20 de setembro de 2026

## 1. Objetivo

Este documento divide a construção do coordenador inteligente de obras em entregas independentes. Cada fase deve produzir um resultado utilizável, ter testes próprios, gerar um checkpoint versionado e registrar claramente onde a próxima execução deve continuar.

A estratégia é preservar o agente atual, o banco existente e os MCPs. O novo comportamento será introduzido atrás de contratos e flags, primeiro em leitura, depois em modo sombra e somente por último em operações de criação ou sincronização.

> **Regra de segurança:** banco local guarda a fonte canônica, backend calcula e valida, LLM interpreta e explica, e o usuário aprova mudanças.

## 2. Como retomar se a execução for interrompida

O saldo de créditos da conta não é visível para este agente e não será usado como premissa operacional. O trabalho foi dividido para que uma interrupção não perca o progresso.

Ao retomar, executar esta sequência:

```bash
cd /home/ubuntu/plataforma-obras
git status --short --branch
git log -5 --oneline
cat PLANO-EVOLUCAO-CEREBRO-DE-OBRAS.md
```

Depois, localizar a seção **“Próximo ponto de continuação”** no final deste documento. A execução deve começar pela primeira fase sem commit de conclusão, sem repetir fases já marcadas como concluídas e sem fazer deploy automaticamente.

Cada fase deve terminar com:

```bash
pnpm check
pnpm test
pnpm build
git diff --check
git status --short --branch
```

Se todos os comandos passarem, criar um commit com o formato:

```text
feat: <resultado pequeno e verificável da fase>
```

Não misturar duas fases no mesmo commit quando a segunda ainda não foi validada.

## 3. Estado preservado

A base aprovada possui execução assíncrona, `request_id`, polling, eventos, estados terminais, contrato de resposta somente leitura, bateria simulada e E2E de MCPs. Os pontos de retorno principais são:

| Checkpoint | Conteúdo |
|---|---|
| `b595566` | Execução observável e confiável do agente. |
| `6e40c0e` | Prova em leitura, contrato textual, bateria determinística e relatórios. |
| `TESTE-REAL-2026-09-20.md` | Teste autenticado real; EAP e Cronograma MCP retornaram HTTP 502. |

Nenhuma fase posterior deve remover os MCPs. O objetivo é fazer o banco local funcionar como fonte primária e deixar os MCPs como fallback, auditoria e sincronização.

## 4. Fases de implementação

### Fase 0 — Baseline e proteção

**Estado:** concluída.

A Fase 0 criou execução rastreável, persistência de runs e eventos, estados terminais explícitos, timeout total, limite de iterações, contrato de resposta e classificação de dados incompletos.

**Critério de conclusão:** commit `b595566`, testes, checagem TypeScript e build verdes.

---

### Fase 1 — Prova do agente em leitura

**Estado:** concluída.

A Fase 1 comprovou a leitura simulada em seis cenários, homologou os três MCPs públicos em leitura e adicionou o contrato de resposta com fontes, lacunas e decisão do cliente.

**Critério de conclusão:** commit `6e40c0e`, 37 testes verdes, bateria determinística aprovada e E2E fictício executado.

**Resultado real conhecido:** o teste autenticado terminou como `dados_incompletos` porque os MCPs EAP e Cronograma retornaram HTTP 502. Esse resultado deve continuar sendo tratado como falha operacional explícita, nunca como catálogo vazio silencioso.

---

### Fase 2 — Leitura local de EAP e Cronograma

**Objetivo:** permitir que o agente responda usando o banco local mesmo quando os MCPs estiverem indisponíveis.

**Escopo:**

1. Criar contratos comuns em `server/construction/domain-types.ts`.
2. Criar `LocalDatabaseEvidenceSource`.
3. Implementar leitura de `projects`, `wbs_nodes`, `schedule_activities` e `schedule_dependencies`.
4. Implementar as consultas locais equivalentes a:
   - `get_eap_tree`;
   - `get_eap_node`;
   - `validar_estrutura`;
   - `listar_atividades`;
   - `listar_dependencias`.
5. Criar `EvidenceSourceRouter` com modo `local_first`.
6. Manter o caminho MCP intacto como fallback.
7. Fazer o resultado declarar a fonte: `local_db`, `mcp` ou `local_db+mcp`.

**Fora do escopo:** criação de obra, mutações, baseline, sincronização e substituição do orquestrador inteiro.

**Testes obrigatórios:** obra vazia, obra com EAP, obra com atividades, dependência entre projetos diferentes, MCP indisponível e fallback local.

**Checkpoint:** `feat: adicionar fonte local de evidencias`.

**Retomada:** continuar no diretório `server/construction/`, revisar primeiro os tipos existentes em `drizzle/schema.ts` e só depois conectar o roteador ao orquestrador.

---

### Fase 3 — Validações determinísticas e CPM

**Objetivo:** retirar da LLM os cálculos de consistência, dependências e caminho crítico.

**Escopo:**

1. Criar `eap-validator.ts`.
2. Criar `dependency-validator.ts`.
3. Criar `cpm-calculator.ts`.
4. Validar referências EAP, órfãos, códigos duplicados, auto dependências, ciclos e vínculos entre projetos.
5. Calcular início e término mais cedo, início e término mais tarde, folga e caminho crítico.
6. Retornar advertências quando calendário, feriados ou duração estiverem incompletos.
7. Fazer a LLM apenas explicar o resultado calculado.

**Fora do escopo:** aprovação persistente, baseline e escrita externa.

**Testes obrigatórios:** grafo linear, grafo paralelo, ciclo, atividade sem duração, dependência FS/SS/FF/SF, `lag`, atividade sem EAP e cronograma vazio.

**Checkpoint:** `feat: adicionar validadores e calculo cpm`.

**Retomada:** começar pelos testes unitários dos calculadores. Não conectar o resultado à LLM antes de os testes de grafo passarem.

---

### Fase 4 — Governança, versões e gates da obra

**Objetivo:** impedir que o agente pule de um descritivo incompleto para um cronograma apresentado como aprovado.

**Escopo:**

1. Usar `agent_project_states` como base da máquina de estados.
2. Adicionar estados de rascunho e sincronização parcial em migração compatível.
3. Criar tabela `project_plan_versions`.
4. Relacionar proposta de EAP, atividades e dependências à versão do plano.
5. Persistir decisões em `agent_decisions` com escopo e impacto.
6. Bloquear avanço quando um gate obrigatório não estiver satisfeito.
7. Registrar premissas, fatos, hipóteses e lacunas em formato auditável.

**Estados mínimos:**

```text
DESCRITIVO
EAP_PROPOSTA
EAP_REVISAO
EAP_APROVADA
ATIVIDADES_PROPOSTA
DEPENDENCIAS_PROPOSTA
CPM_VALIDADO
CRONOGRAMA_PROPOSTO
CRONOGRAMA_APROVADO
GANTT_LOB_PROPOSTO
CONTROLE
```

**Testes obrigatórios:** aprovação parcial, rejeição, reabertura, alteração de EAP invalidando CPM, tentativa de pular etapa e isolamento por projeto/usuário.

**Checkpoint:** `feat: versionar planos e controlar gates da obra`.

**Retomada:** iniciar pela migração e pelo contrato de estado. Não alterar ainda as rotas de mutação MCP.

---

### Fase 5 — Pacote transacional de criação/importação

**Objetivo:** permitir que uma obra real seja criada como rascunho ou recebida como pacote completo, com validação cruzada antes do commit.

**Escopo:**

1. Criar `project_plan_import_runs`.
2. Definir `ProjectCreationPackage`.
3. Aceitar projeto, EAP, atividades e dependências no mesmo pacote.
4. Validar tudo em memória antes da gravação definitiva.
5. Gravar o pacote local em transação MySQL.
6. Usar idempotência para evitar duplicatas.
7. Permitir estado `PARTIAL` somente para sincronização externa, nunca para um commit local inconsistente.

**Regra:** se a validação local falhar, nenhuma parte do pacote deve ser considerada aprovada.

**Testes obrigatórios:** pacote válido, pacote com atividade sem EAP, dependência inexistente, ciclo, duplicidade, retry com mesma chave e rollback transacional.

**Checkpoint:** `feat: criar pacote transacional de planejamento`.

**Retomada:** começar pelo contrato do pacote e pelos testes de rollback. Não integrar o frontend antes de provar a transação no backend.

---

### Fase 6 — Outbox e fallback/sincronização MCP

**Objetivo:** manter o banco local como fonte canônica e sincronizar os três MCPs de forma coordenada e recuperável.

**Escopo:**

1. Criar `project_sync_outbox`.
2. Gerar eventos para EAP, Cronograma e Gantt/LOB após commit local.
3. Processar na ordem: projeto, EAP, atividades, dependências e Gantt/LOB.
4. Implementar retry com backoff e idempotência.
5. Registrar sucesso, erro, tentativa e próximo retry.
6. Exibir `SINCRONIZACAO_PARCIAL` quando um domínio falhar.
7. Manter os adaptadores MCP como fallback e auditoria.
8. Nunca mascarar HTTP 502 como lista vazia.

**Testes obrigatórios:** MCP indisponível, retry bem-sucedido, falha no segundo domínio, reprocessamento sem duplicidade, divergência local/MCP e recuperação parcial.

**Checkpoint:** `feat: adicionar outbox e sincronizacao coordenada`.

**Retomada:** começar pelo modelo de outbox e pelo worker em modo manual. Não criar job recorrente de produção antes de testar reprocessamento idempotente.

---

### Fase 7 — Skills e cérebro coordenador

**Objetivo:** organizar o conhecimento técnico da LLM sem transferir cálculos ou controle de segurança para o prompt.

**Skills previstas:**

- coordenador de obras;
- EAP;
- Cronograma e CPM;
- auditoria;
- produção e Linha de Balanço;
- documentos e evidências;
- governança e aprovação.

Cada skill deve declarar entradas, saídas, perguntas, bloqueios, fontes e exemplos. O coordenador seleciona a skill adequada com base no marco da obra.

**Critério de segurança:** a skill pode propor, mas não pode aprovar, gravar, calcular CPM ou ignorar um bloqueador retornado pelo backend.

**Testes obrigatórios:** descritivo incompleto, conflito entre documentos, EAP aprovada, cronograma com ciclo, pedido de mutação sem confirmação e MCP indisponível.

**Checkpoint:** `feat: adicionar skills do coordenador de obras`.

**Retomada:** começar pela skill coordenadora e pelos contratos de saída. As skills de domínio devem ser adicionadas uma por vez.

---

### Fase 8 — Modo sombra e ativação gradual

**Objetivo:** comparar o novo coordenador com o agente atual sem alterar a resposta principal nem os dados.

**Escopo:**

1. Adicionar `AGENT_COORDINATOR_MODE=legacy|shadow|local_read|production`.
2. Em `shadow`, executar o novo caminho sem expor sua resposta ao usuário.
3. Comparar fonte, marco, bloqueadores, ferramentas, latência e decisão sugerida.
4. Corrigir divergências.
5. Ativar primeiro para usuário administrador e obras de homologação.
6. Manter rollback pela flag.

**Critério de conclusão:** resultados consistentes em obras vazias, pequenas e completas, com MCP disponível e indisponível.

**Checkpoint:** `feat: ativar coordenador em modo sombra`.

**Retomada:** começar pela flag e pelo registro de comparação. Não alterar o caminho legado até a comparação ficar estável.

## 5. Ordem recomendada de execução

A ordem segura é:

```text
Fase 2 — leitura local
Fase 3 — cálculos determinísticos
Fase 4 — versões e gates
Fase 5 — pacote transacional
Fase 6 — outbox e MCP
Fase 7 — skills
Fase 8 — modo sombra
```

A ordem evita construir uma interface inteligente sobre dados ainda não validados. Também permite interromper o trabalho após a Fase 2 ou 3 e já obter benefício operacional contra a indisponibilidade dos MCPs.

## 6. Critérios gerais de não regressão

Nenhuma fase pode ser considerada concluída se:

- o agente voltar a ficar em spinner indefinido;
- uma falha MCP for convertida silenciosamente em catálogo vazio;
- uma resposta sem evidências for apresentada como sucesso;
- uma atividade for gravada sem vínculo EAP válido;
- uma dependência cruzar projetos;
- um cálculo for produzido pela LLM sem resultado determinístico correspondente;
- uma migração apagar dados existentes;
- uma repetição criar duplicatas;
- o caminho legado deixar de funcionar sem uma decisão explícita de ativação.

## 7. Próximo ponto de continuação

A próxima execução deve começar na **Fase 2 — Leitura local de EAP e Cronograma**.

Primeiro passo:

```text
Criar os tipos de evidência e uma implementação somente leitura de
LocalDatabaseEvidenceSource para wbs_nodes, schedule_activities e
schedule_dependencies, sem alterar ainda o fluxo principal do agente.
```

Primeiros arquivos previstos:

```text
server/construction/domain-types.ts
server/construction/local-database-source.ts
server/construction/evidence-source.ts
server/construction/local-database-source.test.ts
```

A implementação deve terminar com testes locais e um commit isolado. Depois disso, atualizar esta seção com:

- hash do commit;
- testes executados;
- limitações encontradas;
- próximo arquivo a alterar;
- próxima fase liberada.

## 8. Registro de retomadas

| Data | Fase | Commit | Resultado | Próximo passo |
|---|---|---|---|---|
| 20/09/2026 | Fase 0 | `b595566` | Observabilidade e estados terminais | Prova em leitura |
| 20/09/2026 | Fase 1 | `6e40c0e` | Bateria e contrato de leitura | Fonte local |
| 20/09/2026 | Teste real | — | MCP EAP/Cronograma retornaram 502; estado seguro `dados_incompletos` | Implementar Fase 2 |

## Referências

[1]: https://github.com/ragomes102030-cpu/plataforma-obras "Repositório da Plataforma Obras"
