# Skill: agent-browser

## Objetivo
Validar fluxos reais pela interface com automação de navegador, priorizando Playwright autenticado quando disponível.

## Quando usar
Toda correção que afete interface, navegação, formulários, persistência, chat do agente ou fluxo completo do usuário.

## Procedimento
1. Registrar ambiente, obra de teste e estado inicial.
2. Reproduzir pelo caminho de usuário, não apenas chamar API.
3. Capturar console, erros de rede, estados de carregamento e resultado visível.
4. Conferir persistência após recarregar e comparar estado canônico antes/depois.
5. Nunca usar uma obra protegida/real como fixture destrutiva; usar QA dedicado.
6. Repetir o teste após deploy live e registrar commit/deploy.

## Saída
Passos executados, evidências observadas, resultado esperado vs. real e limitações.

## Limites
Não alegar Playwright executado sem resultado observável. Não contornar autorização, gates ou confirmação de exclusão.
