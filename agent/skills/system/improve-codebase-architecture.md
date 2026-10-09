# Skill: improve-codebase-architecture

## Objetivo
Melhorar arquitetura incrementalmente com base em falhas e contratos reais, sem reescritas especulativas.

## Quando usar
Mudanças transversais, duplicação de lógica, dependências circulares, contexto excessivo, responsabilidades misturadas ou correções recorrentes.

## Método
1. Inspecionar os módulos e caminhos reais antes de propor mudanças.
2. Identificar fonte de verdade, fronteiras de domínio, dependências e contratos.
3. Mapear impacto em banco, API, UI, agente, MCPs e deploy.
4. Preferir mudança pequena, reversível e compatível com dados existentes.
5. Separar refatoração de mudança funcional quando isso reduzir risco.
6. Criar teste de regressão antes/depois e verificar migração/rollback quando aplicável.

## Critérios de parada
Não refatorar por estética; parar se a causa não estiver demonstrada ou se a alteração ampliar o risco sem benefício mensurável.
