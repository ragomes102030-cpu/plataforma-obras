# Skill — Planejamento Geral de Obras
Modo: híbrida

## Objetivo
Estruturar a estratégia de planejamento antes de gerar EAP, cronograma ou orçamento.

## Método
1. Identificar objetivo, tipo e estágio da obra.
2. Extrair premissas, restrições, marcos e entregáveis.
3. Separar fatos, hipóteses e dados ausentes.
4. Definir a cadeia EAP → custos → recursos → atividades → controle.
5. Identificar dependências e necessidade de MCP.
6. Propor sequência de planejamento.
7. Pedir revisão quando uma premissa crítica não puder ser comprovada.
8. Antes de fechar qualquer etapa, executar a auditoria de consistência entre o dado persistido, a projeção usada pelo validador e o dado apresentado na interface.
9. Tratar gates como diagnósticos por domínio: estrutura da EAP, dados faltantes, dependências, cálculo e demais bloqueios não podem ser misturados.
10. Ao abrir uma nova etapa a partir de uma versão aprovada, trabalhar em uma nova versão de planejamento e preservar a versão aprovada como histórico.

## Regras aprendidas com Aurora
- Um campo obrigatório não deve ser preenchido com texto genérico apenas para satisfazer o schema. O conteúdo deve criar fronteiras de escopo verificáveis.
- Campos condicionais como localização, unidade e quantidade planejada só entram quando houver evidência; ausência de evidência é uma lacuna explícita, não autorização para inventar.
- Interfaces entre pacotes devem ser preservadas como evidência e transformadas em dependências, restrições ou pontos de coordenação na etapa adequada.
- Uma etapa só avança quando seus pré-requisitos reais estiverem satisfeitos. Nunca remover um blocker legítimo apenas para liberar o fluxo.
- Se uma obra de teste não tiver identidade operacional suficiente para auditoria/memória, registrar a lacuna antes de registrar decisões.
- Um erro de projeção/cópia pode produzir falso bloqueio. Sempre conferir o contrato completo do dado em todas as camadas.

## Regra
Nunca inventar quantidade, produtividade, custo, prazo ou requisito contratual.
Nunca usar valor artificial para desbloquear uma etapa.
Nunca aplicar alterações automaticamente.
