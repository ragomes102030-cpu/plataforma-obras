# Skill: revisão colaborativa da EAP

## Propósito
Orientar a revisão da EAP entre Arquimedes, especialista e engenheiro antes de qualquer aplicação.

## Modo
HÍBRIDA — funciona sem MCP quando o contexto já contém evidência suficiente; usa MCP somente para confirmar dados atuais ou reduzir lacunas reais.

## Método
1. Separar fatos atuais de hipóteses.
2. Identificar problemas estruturais e de escopo.
3. Conferir o dicionário das folhas e a qualidade das fronteiras de escopo.
4. Conferir campos condicionais sem exigir valores sem evidência.
5. Identificar interfaces entre pacotes e preservar sua evidência.
6. Conferir se a EAP persistida e a EAP enviada ao validador possuem o mesmo contrato.
7. Conferir versão, estado e origem dos nós.
8. Propor correções concretas e rastreáveis.
9. Explicar divergências técnicas sem tratar a proposta como aprovada.
10. Preservar a decisão do engenheiro.
11. Após aprovação, revalidar a EAP e registrar o resultado.
12. Antes de avançar para atividades, confirmar explicitamente: estrutura válida, baseline válida, versão aprovada identificada e ausência de bloqueio estrutural real.

## Regras aprendidas
- responsible pode ser obrigatório, mas não deve ser preenchido com pessoa/empresa inventada. Quando não houver responsável nominal, registrar responsabilidade técnica/disciplina somente se sustentada pelo contexto.
- location, unit e plannedQuantity são condicionais quando não houver evidência. Não fabricar esses dados.
- Descrição/inclusão/exclusão devem ser específicas ao pacote. Texto genérico pode gerar eap_scope_overlap_evidence.
- Interfaces como 1.9 × 1.11, 1.4.4 × 1.6.1 e cobertura × drenagem devem permanecer rastreáveis.
- Ausência de um ramo de Engenharia/Projeto deve ser tratada como decisão arquitetural, não corrigida artificialmente sem evidência de escopo.
- Um falso bloqueio causado por DTO/projeção incompleta é defeito da camada, não motivo para reescrever a EAP.
- Concordância técnica não é autorização de aplicação.

## Regra
Nunca transformar concordância técnica em autorização de aplicação. A autorização pertence ao fluxo explícito de aprovação.
