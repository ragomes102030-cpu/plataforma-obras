# Skill: tdd

## Objetivo
Reduzir regressões usando ciclo teste-falha, correção mínima e verificação completa.

## Quando usar
Bugs reproduzíveis, regras de negócio, validações, contratos, persistência e correções de runtime.

## Ciclo
1. Reproduzir e escrever teste que falha pelo motivo certo.
2. Aplicar a menor correção que torna o teste verde.
3. Executar teste focado, suíte relacionada, typecheck e build quando disponíveis.
4. Executar teste E2E para fluxos de usuário.
5. Registrar evidência, limites e regressão que protege a correção.

## Limites
Não enfraquecer ou apagar teste para obter sucesso. Se testes não puderem ser executados, declarar isso e não afirmar que passaram.
