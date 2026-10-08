# REG-QA-EAP-001 — proposta inicial de EAP subdecomposta

- Data: 2026-10-08
- Obra de teste: TESTE-QA-2026-10-08
- Severidade: HIGH
- Tipo: planejamento / funcional
- Estado: correção em validação

## Evidência

Em uma obra residencial multifamiliar de 6 pavimentos, a ação "Gerar proposta com Arquimedes" produziu somente um nó raiz chamado "Escopo da obra". Isso não era suficiente para uma revisão de engenharia: a proposta não separava fundações, estrutura, vedações, instalações, acabamentos e entrega.

## Causa raiz

A procedure eap.analisarEapComArquimedes não estava analisando o escopo. Ela construía uma proposta fixa contendo apenas a raiz quando a EAP estava vazia. Portanto, o defeito não era do modelo de linguagem nem de uma falha de interpretação do usuário; era uma regra de geração insuficiente no servidor.

## Correção

A regra de proposta inicial foi extraída para server/construction/eap-proposal.ts.

Para escopos reconhecidos como edificações, a proposta agora cria uma raiz e fases macro coerentes com a sequência física da obra:
1. Serviços preliminares e implantação
2. Fundações e contenções
3. Estrutura de concreto
4. Vedações e alvenarias
5. Instalações prediais
6. Revestimentos e acabamentos
7. Áreas externas e urbanização
8. Comissionamento, documentação e entrega

Para tipologias não identificadas como edificação, é usado um fallback macro conservador, sem fingir precisão que o escopo não fornece.

## Regra aprendida

Não confundir "raiz válida" com "EAP suficientemente decomposta para revisão". A regra de raiz única resolve a hierarquia superior, mas não satisfaz o planejamento quando o escopo já contém frentes construtivas identificáveis.

A profundidade detalhada por pavimento, sistema e serviço continua sendo decisão de engenharia e deve ocorrer na revisão da proposta.

## Regressão

server/eap-proposal-scope-regression.test.ts verifica:
- edificação residencial complexa gera 9 nós iniciais (raiz + 8 fases);
- as fases ficam filhas da raiz;
- tipologia não edificante usa fallback;
- obra que já possui EAP não recebe nós duplicados.

## Nota de engenharia

O objetivo não é impor uma quantidade mínima de nós. A decomposição deve responder ao escopo identificado e produzir uma estrutura útil para a revisão, orçamento e posterior transformação das folhas em atividades.