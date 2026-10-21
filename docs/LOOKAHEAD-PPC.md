# Lookahead de 4 semanas e PPC

O Valor Ganho responde *“a obra está indo bem?”*. O lookahead responde *“o que
fazemos na segunda-feira?”*. São perguntas diferentes, com donos diferentes: o
EVM interessa ao dono e ao banco; o lookahead interessa ao mestre de obras e ao
planejador.

Esta é a implementação do **Last Planner System** no pedaço que dá resultado
rápido: janela de 4 semanas, restrições e PPC.

## O que existe hoje

| Peça | Onde |
|---|---|
| Conta (janela, prontidão, PPC, causas, tendência) | `server/construction/lookahead.ts` — puro, sem banco |
| Leitura do banco (datas em dia útil, corte por data) | `server/construction/lookahead-dados.ts` |
| Endpoints | `server/routers.ts` → `planning.lookahead`, `planning.restricoes`, `planning.criarRestricao`, `planning.removerRestricao`, `planning.salvarCompromisso`, `planning.avaliarCompromisso` |
| Tabelas | `planning_constraints`, `weekly_commitments` (migração `0016`) |
| Tela | `client/src/components/PainelLookahead.tsx`, montada na aba **Produção** |

## As duas tabelas

**`planning_constraints`** — o que trava a frente. Tipo (material, mão de obra,
equipamento, projeto, permissão, frente, segurança, outro), descrição, quem
resolve, prazo de remoção e situação (`aberta`, `em_andamento`, `removida`,
`cancelada`).

**`weekly_commitments`** — o que foi assumido para uma semana. Uma linha por
(atividade, semana): o índice único impede a mesma atividade de valer dois votos
no PPC. `weekStart` é sempre segunda-feira, garantido por CHECK no banco.

## As regras que fazem o número valer

1. **PPC só sobre avaliados.** `concluido` + `nao_concluido` é a base.
   Compromisso `planejado` ainda não aconteceu: aparece como *pendente*, e nunca
   como 0%.
2. **Semana sem avaliação é “—”, não 0%.** Um zero por ausência de dado faria a
   curva despencar sem nada ter piorado, e o time aprende a ignorar a curva.
3. **`cancelado` sai da conta.** Não foi falha, foi desistência — e desistência
   sem registro é o que o indicador existe para expor.
4. **Não cumprir exige motivo.** CHECK no banco (`weekly_commitments_reason_required`)
   e validação no endpoint. Sem motivo, o PPC mede clima, não causa.
5. **Restrição `em_andamento` ainda bloqueia.** Só `removida` e `cancelada`
   liberam a atividade. “Está sendo resolvida” é justamente o estado em que a
   frente continua parada.
6. **Tendência só com 5 pontos de diferença.** Duas semanas com 3 e 4
   compromissos produzem 60% e 80% sem nenhuma mudança real.

## PPC em quantidade

Além do PPC por compromisso (contagem), a tela mostra `ppcQuantidade`: soma do
executado sobre soma do planejado, **apenas nos compromissos que têm as duas
pontas**. Compromisso sem quantidade informada não entra — nem como zero, nem
como 100%.

## Datas: por que isso dá errado com facilidade

- As datas das atividades vêm do **offset em dias úteis** sobre o calendário da
  obra (`dateAt`), nunca de soma de dias corridos.
- `weekStart` é gravado como meia-noite **UTC** de segunda-feira. A leitura
  compara instantes (`gte`/`lte`) e converte com `toISOString` — `localIso`
  transformaria a segunda em domingo em qualquer servidor a oeste de Greenwich.
- O CHECK de segunda-feira usa `at time zone 'UTC'` pelo mesmo motivo.
- O navegador manda `hoje` no fuso do usuário. No Render o servidor é UTC: às
  22h do Brasil já seria “amanhã” lá, e a semana corrente mudaria de lugar.

## Como usar na obra

1. **Segunda, 30 min com o mestre de obras.** Abrir a aba Produção, escolher a
   semana corrente. A tela lista as atividades da janela e marca o que está
   pronto.
2. **Antes de comprometer, tirar restrição.** Restrição aberta aparece na linha
   da atividade; registrar com tipo, quem resolve e prazo.
3. **Comprometer o que dá para cumprir.** Botão *comprometer* na atividade. É
   assumir, não desejar.
4. **Sexta (ou segunda seguinte), avaliar.** ✓ cumpriu / ✗ não cumpriu + motivo.
5. **Ler as causas, não o número.** PPC de 70% com 80% das falhas em material
   tem uma ação; com 80% em projeto tem outra completamente diferente.

## O que ainda não existe

- Compromisso por equipe/frente (hoje é por atividade).
- Lookahead de 6 semanas para equipamentos de ciclo longo.
- Ligação automática entre não cumprimento e reprogramação do cronograma: o PPC
  mede, mas ainda não puxa a barra.
