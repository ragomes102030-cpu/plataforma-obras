# Skills do Arquimedes

As Skills são conhecimento profissional versionado do agente. Elas não são memória de uma obra específica.

## Skills transversais do agente (`system/`)

O runtime seleciona até quatro skills por execução a partir das últimas mensagens do usuário; não injeta o catálogo inteiro. As skills são carregadas dos arquivos versionados e permanecem consultivas — não concedem permissões, não substituem validadores e não fazem mutações por si só.

- `find-skills`: descoberta e seleção crítica de capacidades.
- `dev-experts`: perspectivas de arquitetura, domínio, QA e segurança.
- `planning-experts`: método de planejamento de obras.
- `prompt-engineering`: instruções claras, fontes de verdade e controle de truncamento.
- `grill-me`: teste de premissas sem questionários desnecessários.
- `improve-codebase-architecture`: mudanças arquiteturais incrementais.
- `agent-browser`: Playwright e validação E2E autenticada.
- `tdd`: teste de regressão antes da correção.
- `self-improving-agent`: aprendizado validado e rastreável.
- `frontend-design`: UX profissional e responsiva para engenharia.
- `handoff`: continuidade entre sessões.
- `skill-authoring`: padrão para novas skills.

## Estrutura

- `planejamento/`: métodos de planejamento e controle.
- `engenharia-civil/`: conhecimento de métodos construtivos.
- `quantitativos/`: medições e unidades.
- `produtividade/`: produção, equipes e rendimentos.
- `matematica/`: modelos matemáticos utilizados pelo planejamento.

Cada Skill deve declarar:
- objetivo;
- quando usar;
- entradas necessárias;
- regras;
- critérios de parada;
- saídas esperadas;
- limites e pontos de aprovação.

A Skill orienta o raciocínio. Ela não substitui o validador nem executa alterações diretamente no banco.

As competências transversais de desenvolvimento e operação do agente ficam em `agent/skills/agent-workflows/skills.md` e são resumidas no bootstrap do cérebro. O catálogo de capacidades em `server/agent/capability-registry.ts` expõe os métodos no sistema; o catálogo não é prova de que uma ferramenta externa (por exemplo, navegador) esteja conectada.
