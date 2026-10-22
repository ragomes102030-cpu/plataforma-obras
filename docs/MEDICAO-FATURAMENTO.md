# Medição, faturamento e curva de desembolso

Como transformar serviço executado em receita e custo lançado em previsão de
caixa. É o fim do ciclo: **planeja → executa → mede → recebe**.

Duas contas, duas perguntas — e elas **não** são a mesma coisa:

| Pergunta | Onde responder | Base do número |
| --- | --- | --- |
| Quanto posso cobrar deste período? | Medição | quantidade **executada confirmada** − já medido |
| Quando o dinheiro sai, e quanto vai sair até o fim? | Desembolso | planejado por dia útil + `cost_entries` + CPI |

Erro comum de quem vem de planilha: usar o % do Gantt para faturar. Peso e curva
S são instrumentos de **previsão**; contrato e nota fiscal falam em
**quantidade**. Aqui o sistema não deixa misturar.

---

## 1. Medição

### O que o sistema calcula

Para cada item do orçamento aprovado (a maior versão com status `aprovado`):

```
já medido antes  = soma dos itens de medições não canceladas
                   com period_end < início do período
produzido acum.  = soma da produção CONFIRMADA até o fim do período
                   (atividade → budget_item_id)
a medir agora    = produzido acum. − já medido antes
valor            = a medir agora × preço unitário
```

Depois: `bruto` = soma dos valores, `retenção` = bruto × % retenção,
`líquido` = bruto − retenção.

O único dado humano é o **período** e a **retenção**. Valor não se digita.

### Passo a passo (AURORA TESTE)

1. Aba **Orçamento** → seção **Medição e faturamento**.
2. Escolha o início e o fim do período (padrão: mês corrente).
3. Informe a retenção técnica, se o contrato tiver (0 se não tiver).
4. Clique em **Conferir**. Nada foi gravado: é a prévia.
5. Confira os cartões e a tabela de itens.
6. Se fechar com a obra, clique em **Gravar medição**. A nota nasce em
   **Rascunho**.

Antes de gravar, o sistema bloqueia o que daria retrabalho:

- período com fim antes do início;
- período que se sobrepõe a uma medição já existente (cancela não conta);
- nenhum item com produção nova.

### Status da nota

```
rascunho ──► em_aprovacao ──► aprovada ──► faturada ──► paga
   │              │              │
   └──────────────┴──────────────┴──────► cancelada
```

- **Rascunho → Aprovada** direto é permitido. Obra pequena não tem dupla
  aprovação, e obrigar a inventar um aprovador faz o usuário largar o recurso.
- **Aprovada → Faturada** é o marco para emitir a nota fiscal (grava `invoiced_at`).
- **Faturada → Paga** é o marco de dinheiro recebido (grava `paid_at`).
- **Paga** e **Cancelada** são terminais. Não existe "descancelar": o número da
  nota fica com o histórico, e números nunca são reaproveitados.

### Avisos que a prévia pode dar

| Aviso | O que significa | O que fazer |
| --- | --- | --- |
| `já medido (X) passa do produzido (Y)` | A soma das notas anteriores é maior que a produção registrada | Conferir lançamento de produção faltando ou nota emitida errada. O sistema **não** cobra negativo. |
| `sem preço unitário` | O item do orçamento está com preço 0 | Corrigir o orçamento; produção existe mas não é valorizável |
| `acima do contratado` | O acumulado passou da quantidade contratada | Aditivo contratual ou erro de produção — decidir antes de faturar |
| `Nada novo produzido no período` | Não há diferença a medir | Ou o período está errado, ou a produção não foi lançada |

---

## 2. Curva de desembolso

### O que entra

- **Planejado:** cada atividade espalha o seu valor (`quantidade planejada ×
  preço do item`) pelos seus **dias úteis**, usando o calendário da obra. Uma
  atividade de 5 dias que começa numa quinta divide R$ 1.000 em R$ 200 por dia e
  cai R$ 400 no mês velho e R$ 600 no novo. Isso é o que faz o degrau aparecer
  no lugar certo.
- **Realizado:** `cost_entries` com status `confirmado` até a data de referência,
  agrupados por **mês de competência**.
- **Projetado:** meses passados = realizado; meses futuros = planejado corrigido
  pelo CPI.

### A correção pelo CPI

CPI = `EV / AC`. Já o `AC` é dinheiro que saiu (`cost_entries`).

```
CPI 1,00  → no orçamento        → futuro = planejado
CPI 0,80  → cada R$1 entregue custou R$1,25
          → futuro = planejado ÷ 0,80  (+25%)
CPI 1,25  → gastou menos que o previsto
          → futuro = planejado ÷ 1,25  (−20%)
```

A projeção é **divisão**. Multiplicar inverteria o sinal e mostraria obra
estourada como economia — o tipo de erro que só aparece quando o caixa já
acabou.

Proteções:

- **CPI sem arredondar.** O cartão do EVM mostra 2 casas; para projetar dinheiro
  usa-se `ev / ac` cru, senão o erro se espalha por todo o futuro.
- **Piso de 0,20.** CPI 0,05 projetaria 20× o orçamento; isso é dado quebrado
  (quase nenhum custo lançado contra muito valor ganho), não tendência.
- **Sem CPI, sem invenção.** Se não há custo lançado, o futuro é o próprio
  planejado e o painel diz "não existe CPI" e "só planejamento".
- **Atividade sem item de orçamento** não vira custo zero: o painel avisa quantas
  ficaram de fora, porque a curva planejada está subestimada.

### Como ler o gráfico

Três barras por mês:

| Cor | Barra | Leitura |
| --- | --- | --- |
| cinza | planejado | o que o orçamento previa para o mês |
| verde | realizado | o que efetivamente saiu |
| âmbar | projetado | realizado nos meses passados; planejado ÷ CPI no futuro |

Se o âmbar está acima do cinza, o ritmo atual de custo não fecha o orçamento. O
cartão **Desvio projetado** dá o número: `projetado total − BAC`.

**Avisos:**

- `mês X N% acima do planejado` — desembolso real muito acima do previsto;
- `N atividade(s) sem item de orçamento` — curva subestimada;
- `não existe CPI` — projeção sem correção de tendência.

---

## 3. O que ainda não entra

Para não confundir ausência de dado com zero:

- **Custo não tem centro de custo obrigatório** — só entra no `AC` o que estiver
  ligado a atividade/item dentro do escopo. O que não está é reportado como não
  alocado e fica fora do CPI.
- **Medição não gera nota fiscal** — ela marca o status `faturada` e a data. A
  emissão é no sistema fiscal da empresa.
- **Não há retenção por item**, só por nota (percentual único). Contratos com
  retenção diferente por serviço precisam de duas notas.
- **Não há reajuste/medição de aditivo** — o aditivo entra como nova versão do
  orçamento; a medição usa sempre a maior versão aprovada.

---

## 4. Onde está o código

| Arquivo | Papel |
| --- | --- |
| `drizzle/schema.ts` | `measurements`, `measurement_items`, `measurements_status` |
| `drizzle/0017_medicoes.sql` | DDL aplicada em 21/10/2026 |
| `server/financeiro/medicao.ts` | conta da medição + máquina de estados (puro) |
| `server/financeiro/medicao-dados.ts` | leitura: produção, medido anterior, baseline |
| `server/financeiro/desembolso.ts` | curva, projeção por CPI (puro) |
| `server/financeiro/desembolso-dados.ts` | leitura: pesos, calendário, `cost_entries` |
| `server/routers.ts` → `financeiro` | `medicoes`, `simularMedicao`, `criarMedicao`, `avancarStatus`, `desembolso` |
| `client/src/components/PainelMedicao.tsx` | painel na aba Orçamento |

Testes: `server/financeiro/*.test.ts` (71 casos), incluindo os CHECKs do banco
aplicados em PGlite.
