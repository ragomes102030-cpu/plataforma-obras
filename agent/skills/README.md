# Skills do Arquimedes

As Skills são conhecimento profissional versionado do agente. Elas não são memória de uma obra específica.

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
