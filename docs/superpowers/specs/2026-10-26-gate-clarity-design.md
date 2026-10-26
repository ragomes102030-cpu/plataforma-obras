# Clareza do status de planejamento — desenho

## Intenção

Evitar que a faixa global de fluxo na aba Baseline pareça liberar a captura
quando a versão da EAP ainda está em rascunho.

## Escopo

Na aba Baseline, quando a versão de plano retornada pelo coordenador não está
aprovada, a faixa deve informar que a baseline está bloqueada pela aprovação
da EAP. O fluxo geral e seus gates não serão alterados.

## Fora de escopo

Não aprovar EAP, não criar baseline, não recalcular CPM, nem mudar regras de
servidor ou persistência.

## Abordagens

1. Alterar gates do servidor: descartada; o gate de CPM está correto.
2. Ajustar a mensagem contextual da aba Baseline: escolhida; esclarece a
   condição real sem mudar o fluxo do coordenador.

## Verificação

Um teste de interface estático garante que a aba Baseline possui a cópia de
bloqueio explícita; a verificação ao vivo confirma a mensagem em AURORA TESTE.
