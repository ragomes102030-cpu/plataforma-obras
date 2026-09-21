# Relatório de validação ponta a ponta — Plataforma Obras

**Data:** 21 de setembro de 2026  
**Repositório:** `ragomes102030-cpu/plataforma-obras`  
**Commit publicado:** `35463550755c5535afa006e719f4722d9cfc9521` (`docs: detail continuation roadmap`)  
**Serviço:** [`plataforma-obras-api.onrender.com`](https://plataforma-obras-api.onrender.com)  
**Deploy Render:** `dep-daokjnff3r2c73f0aki0` — `live`

## Conclusão executiva

A fundação técnica está **publicada e saudável**, e o fluxo determinístico de leitura, CPM, Gantt/Linha de Balanço, integrações MCP e agente somente leitura passou nas verificações automatizadas disponíveis. O CI do GitHub e o último deploy do Render também estão verdes.

Ainda não é possível declarar o sistema **operacional de ponta a ponta para uma obra persistida** porque a validação autenticada não foi concluída nesta sessão. O navegador autenticado não ficou conectado ao My Browser e a aplicação permaneceu em **Área pública**, sem uma sessão GitHub válida. Consequentemente, não foi possível criar uma obra fictícia, confirmar sua persistência no banco e executar as operações protegidas de orçamento, EAP, cronograma e produção.

## Matriz de validação

| Camada | Verificação | Resultado | Evidência |
|---|---|---:|---|
| Código | `pnpm check` | **Passou** | TypeScript sem erros |
| Testes | `pnpm test --run` | **Passou** | 16 arquivos, 66 testes |
| Homologação | `pnpm e2e:fictitious` | **Passou** | 4 nós EAP, 3 atividades, 2 dependências, CPM de 65 dias |
| Agente | `pnpm phase1:battery` | **Passou** | 6 casos somente leitura, todos respondidos com fontes e lacunas |
| Build | `pnpm build` | **Passou** | Vite e esbuild concluídos; apenas alerta de chunks grandes |
| Qualidade | `git diff --check` | **Passou** | Nenhum erro de whitespace |
| Render | Deploy do commit atual | **Passou** | Serviço em estado `live` |
| Saúde HTTP | `GET /healthz` | **Passou** | HTTP 200, `ok: true` |
| Saúde tRPC | `system.health` com timestamp | **Passou** | HTTP 200, `ok: true` |
| Sessão pública | `auth.me` sem cookie | **Passou** | HTTP 200, usuário `null` |
| Proteção de dados | `projects.list` sem login | **Passou** | HTTP 401 `UNAUTHORIZED`, conforme esperado |
| Logout | `POST auth.logout` | **Passou** | HTTP 200, `success: true` |
| UI pública | Carregamento da página inicial | **Passou** | HTML/React renderizados sem erro visual; módulos visíveis |
| MCP EAP | Status e homologação somente leitura | **Passou** | Online; 18 ferramentas descobertas |
| MCP Cronograma | Status e homologação somente leitura | **Passou** | Online; 13 ferramentas descobertas |
| MCP Gantt/LOB | Status e homologação somente leitura | **Passou** | Online; 6 ferramentas descobertas |
| CI GitHub | Workflow `CI` do commit atual | **Passou** | [Execução 35617599327](https://github.com/ragomes102030-cpu/plataforma-obras/actions/runs/35617599327) |

## Resultado dos fluxos funcionais automatizados

A bateria fictícia validou a montagem de uma obra de teste com três nós de EAP, três atividades e duas dependências. O cálculo determinístico identificou o caminho crítico `e2e-atv-1 → e2e-atv-2`, com duração total de 65 dias. Uma referência EAP inválida foi rejeitada corretamente.

A homologação ao vivo consultou os três servidores MCP configurados. Todos responderam online. A EAP e o cronograma retornaram vazios para os identificadores fictícios, o que foi tratado como resultado válido da consulta, sem nenhuma escrita externa. O servidor Gantt/LOB retornou os temas disponíveis.

A bateria do agente executou seis cenários de leitura: revisão da EAP, atividades e dependências, CPM, baseline, Linha de Balanço e auditoria de dados incompletos. Todos respeitaram o contrato de resposta, apresentaram fontes, lacunas, impacto de aprovação e próxima decisão, sem executar gravações.

## Bloqueio restante para o E2E autenticado

A página pública carregou corretamente, mas exibiu zero obras porque as rotas de dados são protegidas. Isso é coerente com o comportamento de segurança observado: sem sessão, `auth.me` retorna `null` e `projects.list` retorna `401`. A aplicação oferece o botão **Entrar**, porém a sessão de navegador usada neste teste não permaneceu autenticada após o OAuth do GitHub.

Para fechar o aceite operacional da Etapa 9 e do fluxo completo, ainda é necessário executar com uma sessão autenticada:

1. criar uma obra fictícia;
2. confirmar que a obra foi persistida no banco;
3. inicializar EAP, atividades e dependências;
4. calcular CPM e aprovar uma baseline;
5. lançar e confirmar produção;
6. abrir os indicadores e verificar planejado versus realizado;
7. confirmar que o isolamento por usuário/obra impede acesso indevido;
8. consultar o histórico da operação e encerrar removendo a obra fictícia, se a política do ambiente permitir.

## Observações técnicas

O build do Render apresenta apenas o aviso de chunks JavaScript maiores que 500 kB; isso não impediu o deploy nem o carregamento da aplicação. A otimização por divisão de código pode ser tratada depois da validação funcional autenticada.

O repositório permaneceu limpo após os testes; os relatórios JSON gerados pelas baterias foram restaurados para não criar alterações de trabalho. Nenhuma alteração de código foi enviada ao GitHub nesta rodada.

## Próximo passo recomendado

Conectar uma sessão autenticada do navegador do usuário e repetir somente a parte protegida da matriz. Se essa etapa confirmar persistência, o próximo desenvolvimento do plano é a **Etapa 9 — Indicadores de prazo, produtividade e custo**, começando pelo painel físico planejado versus realizado e pela rastreabilidade da fonte e da data de corte.


## Evidências autenticadas adicionais — sessão GitHub

Após habilitar o My Browser e concluir o OAuth do GitHub, a aplicação retornou autenticada como `ragomes102030-cpu · workspace`. O banco carregou duas obras persistidas, incluindo `Obra Homologação MCP — Ciclo Completo 2026-09-20` (`OB-9WYPZ1`).

O teste protegido foi executado nesta obra existente para evitar criar uma terceira obra de teste:

| Fluxo autenticado | Resultado observado |
|---|---|
| Carregamento do portfólio | 2 obras persistidas, banco sincronizado |
| EAP | 61 itens persistidos; grupos, pacotes e entregas renderizados |
| Orçamento — nova versão | Versão `V1`, `E2E Validação Orçamento 2026-09-21`, criada e carregada após gravação |
| Orçamento — novo serviço | Código `1.1-E2E`, quantidade `10 m³`, preço unitário `R$ 125,50`, total persistido `R$ 1.255,00` |
| Cronograma — CPM | 44 atividades, duração de projeto de 581 dias, 7 atividades críticas e sequência persistida `1 → 2 → 3 → 4 → 5 → 6 → 7` |
| Cronograma — baseline | `E2E Baseline 2026-09-21` capturada, ativa, com 44 atividades |
| Produção — rascunho | Lançamento de 10 m² salvo com frente, equipe, unidade e atividade vinculadas |
| Produção — confirmação | Lançamento confirmado e exibido como `confirmada` nos últimos lançamentos |
| Planejado versus realizado | A atividade exibiu `10,000 realizado de 0,000`; o percentual global continuou em 0% porque não existe quantidade planejada cadastrada para essa atividade, uma lacuna de dados do cenário, não uma falha de persistência |

Com isso, a autenticação, autorização, leitura, criação, atualização e persistência do fluxo principal foram verificadas contra o ambiente publicado. O teste alterou deliberadamente dados de homologação já identificados como E2E; não houve alteração de dados de produção real.
