# Documentação

Índice dos documentos do projeto. Se você está chegando agora, leia nesta ordem:
**stack → arquitetura → setup → deploy**.

## Comece aqui

| Documento | Para quê |
| --- | --- |
| [STACK-ATUAL.md](STACK-ATUAL.md) | Onde o sistema roda hoje: GitHub + DockHosting + Supabase, URLs, banco, o que **não** usamos mais |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Como o código está organizado (front, API, tRPC, banco) |
| [SETUP.md](SETUP.md) | Rodar localmente, variáveis de ambiente, primeiros passos |
| [DEPLOY-DOCKHOSTING.md](DEPLOY-DOCKHOSTING.md) | Build, deploy, migrações em produção, runbook de incidente |
| [AGENTS.md](AGENTS.md) | Regras para agentes de IA trabalhando no repositório |

## Decisões e histórico técnico

| Documento | Para quê |
| --- | --- |
| [DECISIONS.md](DECISIONS.md) | Decisões de arquitetura e o porquê, incluindo as plataformas que ficaram pelo caminho (Render, Vercel, Aiven, MySQL) |
| [IMPROVEMENTS.md](IMPROVEMENTS.md) | Registro cronológico de melhorias |
| [CHANGELOG_AI.md](CHANGELOG_AI.md) | Mudanças feitas com apoio de IA |
| [SINCRONIZACAO-MAIN-DEVELOP.md](SINCRONIZACAO-MAIN-DEVELOP.md) | Relação entre `main` e `develop` |

## Dados e banco

| Documento | Para quê |
| --- | --- |
| [DATA_MODEL.md](DATA_MODEL.md) | Modelo de dados (36 tabelas de domínio) |
| [INCIDENTE-2026-10-12-MIGRACOES-NAO-APLICADAS.md](INCIDENTE-2026-10-12-MIGRACOES-NAO-APLICADAS.md) | O incidente que originou a guarda de migração pendente |

## Planejamento, EAP e motor de cálculo

| Documento | Para quê |
| --- | --- |
| [PLANO-EXPANSAO-PLANEJAMENTO.md](PLANO-EXPANSAO-PLANEJAMENTO.md) | Estado e próximos passos do sistema de planejamento (EAP/Gantt/CPM) |
| [PLANNING_ENGINE.md](PLANNING_ENGINE.md) | Como o motor de planejamento funciona |
| [CPM-NATIVO.md](CPM-NATIVO.md) | Caminho crítico nativo |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Regras de negócio da obra |
| [EAP-POLITICA-DECOMPOSICAO.md](EAP-POLITICA-DECOMPOSICAO.md) | Política de decomposição da EAP |
| [EAP-INTEGRIDADE-E-APRENDIZADO.md](EAP-INTEGRIDADE-E-APRENDIZADO.md) | Integridade e aprendizado da EAP |
| [ARQUIMEDES-MATRIZ-MESTRA-PLANEJAMENTO.md](ARQUIMEDES-MATRIZ-MESTRA-PLANEJAMENTO.md) | Matriz mestra do planejamento |
| [ARQUIMEDES-MOTOR-CALCULO-BENCHMARK.md](ARQUIMEDES-MOTOR-CALCULO-BENCHMARK.md) | Benchmark do motor de cálculo |
| [MATRIZ_COMPARATIVA_3_PLANILHAS.md](MATRIZ_COMPARATIVA_3_PLANILHAS.md) | Comparativo das três planilhas de referência |

## Qualidade e cobertura

| Documento | Para quê |
| --- | --- |
| [QA_BASELINE.md](QA_BASELINE.md) | Baseline de QA (retrato de uma data) |
| [VALIDACAO_FUNCIONAL.md](VALIDACAO_FUNCIONAL.md) | Roteiro de validação funcional |
| [AUDITORIA-COBERTURA-POR-REGRA.md](AUDITORIA-COBERTURA-POR-REGRA.md) | Cobertura de testes por regra de negócio |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Problemas conhecidos e contornos |
| [ROADMAP.md](ROADMAP.md) | O que está previsto |

## Auditorias datadas

São retratos de um momento, não instruções. `AUDITORIA-*`, `PLANO-CORRECAO-LACUNAS-2026-10-11.md`,
`REGRA-ENCADEAMENTO-FRENTES-2026-10-09.md`, `AURORA-TESTE-*`, `AUDITORIA-ESTADO-ARQUIMEDES-2026-10-09.md`.

## Agentes e skills

| Documento | Para quê |
| --- | --- |
| [AGENT-COORDINATOR-ARCHITECTURE.md](AGENT-COORDINATOR-ARCHITECTURE.md) | Arquitetura do coordenador de agentes |
| [AGENT-PLANNING-SKILL.md](AGENT-PLANNING-SKILL.md) | Skill de planejamento |
| [CODEBASE-MEMORY-MCP.md](CODEBASE-MEMORY-MCP.md) | MCP de memória do código |
| [AI_CONTEXT.md](AI_CONTEXT.md) | Contexto para IA |
| [ARQUIMEDES-CEREBRO-MESTRE.md](ARQUIMEDES-CEREBRO-MESTRE.md) / [ARQUIMEDES-CEREBRO-BOOTSTRAP.md](ARQUIMEDES-CEREBRO-BOOTSTRAP.md) | Cérebro do produto |

## Importação

| Documento | Para quê |
| --- | --- |
| [IMPORTADOR-SEINFRA-CE.md](IMPORTADOR-SEINFRA-CE.md) | Importador de planilhas SEINFRA-CE |

## Sobre documentos antigos

Muitos arquivos datados (raiz do repositório e `docs/`) foram escritos quando a
stack era outra: **Render**, **Vercel**, **Aiven** e **MySQL**. Eles continuam no
repositório porque registram decisões e medições da época, e agora levam um aviso
no topo dizendo isso. A stack de hoje está em [STACK-ATUAL.md](STACK-ATUAL.md) —
na dúvida, é ela que vale.

Configuração de MCP servers não vive no repositório (fica na configuração do
cliente). O único MCP deste projeto é `mcp-server/`.
