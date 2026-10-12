# Auditoria — R6-02: CUB declarado e BDI declarado pela obra

**Data:** 2026-10-09
**Branch:** `fix/coerencia-cub-bdi-declarados` (base `origin/develop` = 59dd298)
**Escopo fechado pelo lead** (mensagem após a integração da cobertura, 59dd298).

---

## 1. O problema: o sistema inventava o parâmetro de custo

A regra 6 ("custo por m² abaixo da referência") comparava o custo direto por m² com um piso
**calculado dentro do validador**:

```ts
const PISO_CUB = 2500 * 0.6; // 60% do CUB comercial de referencia — HEURISTICA
```

R$ 2.500/m² não era um número da obra: era um CUB **inventado pelo sistema**. O efeito prático
já estava documentado na auditoria anterior — dava falso alarme em galpão (custo por m²
legitimamente baixo) e, pior, o engenheiro não tinha onde corrigir: o parâmetro não era dele.

A regra 4 ("preço sem lastro") tinha o problema simétrico: o campo `bdiDeclarado` já existia no
tipo, mas **o chamador nunca o preenchia** (`routers.ts`), então a regra vivia em conferência
permanente (warning) — conferência que nunca vira verificação é aviso que o engenheiro aprende a
ignorar.

**A decisão do lead:** CUB e BDI são a MESMA coisa — parâmetro de custo que a obra **declara**;
o sistema não inventa. Expor um sem o outro deixaria a regra 4 em conferência para sempre.

---

## 2. O que mudou

| Antes | Depois |
| --- | --- |
| CUB fixo `R$ 2.500/m² * 0,6` dentro do código | CUB **declarado pela obra**: `cubValor` + `cubUf` + `cubMes` |
| Regra 6 rodava sempre que havia área | Regra 6 **só roda com CUB declarado**; sem ele, a cobertura nomeia o motivo |
| Sem `bdiDeclarado` no caminho | `bdiDeclarado` declarado na obra, persistido e passado ao validador |
| Regra 4 sempre warning | Com BDI declarado → `error` (verificação); sem → warning (conferência), **como já estava** |
| Valores numéricos sem tela | CUB e BDI declarados no formulário **Escopo inicial** da obra |

---

## 3. "CUB declarado" é UMA declaração, não três campos soltos

`cubValor`, `cubUf` e `cubMes` são representados como **campos separados** — e não como um objeto
opaico — de propósito: o **estado parcial precisa ser representável** para poder ser **nomeado**.

- os três preenchidos → é referência; a regra 6 roda e a mensagem cita valor, UF e mês;
- nenhum preenchido → `obra nao declarou CUB`;
- um ou dois preenchidos → `declaracao de CUB incompleta (falta mes de referencia)`, etc.

Tratar parcial como "não declarado" esconderia metade da causa e mandaria o engenheiro procurar o
problema no lugar errado. Valor sem UF/mês **não é referência**: não dá para dizer de onde o número
veio. Valor zero ou negativo também conta como não declarado.

---

## 4. `motivo` x `nota`: por que o BDI não entra em `motivos[]`

`CoberturaRegra` ganhou um campo novo:

```ts
/** Qualificador do ALCANCE que nao e exclusao de item. `null` na maioria. */
nota: string | null;
```

Motivo:

- **CUB (regra 6):** sem ele a regra **não roda**. Todos os itens ficam **fora** → motivo de
  exclusão, cabe em `motivos[]`: `obra nao declarou CUB`.
- **BDI (regra 4):** sem ele a regra **roda sim**. Os itens são conferidos — só não há parâmetro
  declarado. Dizer `item fora por nao declarar BDI` seria **mentir sobre itens que foram
  avaliados**. Por isso o BDI vira **nota da regra**:

  > `obra nao declarou BDI — a comparacao de preco assume BDI 0% e vale como CONFERENCIA, nao como verificacao`

`motivo` = item fora. `nota` = parâmetro que muda a **natureza** do que foi conferido. Misturar os
dois faria a cobertura repetir, um nível abaixo, exatamente o pecado que ela veio corrigir.

### Como fica no painel

A nota é renderizada na mesma linha do alcance da regra, em itálico:

```
4. preço sem lastro       conferiu 18 de 53 itens · 35 fora por sem composicao vinculada
                          obra nao declarou BDI — a comparacao de preco assume BDI 0% e vale
                          como CONFERENCIA, nao como verificacao
```

---

## 5. Mensagem da regra 6 com CUB declarado

Com CUB declarado, a mensagem cita **valor, UF e mês**, e continua declarando que o piso de 60% é
**heurística** — o CUB é a referência declarada pela obra, mas o corte de 60% é decisão do
validador:

> Custo direto por m2 e R$ 1.000,00 (… / 100 m2 …). Abaixo do piso de R$ 1.500,00/m2 = 60% do CUB
> declarado pela obra (R$ 2.500,00/m2 — SP, referencia 2026-09). O piso de 60% e heuristica sobre
> o CUB declarado: confirme antes de concluir subestimacao.

---

## 6. Dado e tela

- **Colunas** (`projects`): `cubValor numeric(12,2)`, `cubUf varchar(2)`, `cubMes varchar(7)`,
  `bdiDeclarado numeric(8,6)`. Todas **nullable** — não declarar é um estado válido.
- **Migração:** `drizzle/0012_project_cub_bdi_declarados.sql` + entrada no
  `drizzle/meta/_journal.json` (`idx` 12, `when` 1790834400000 > último). Guardas de
  `server/migrations.test.ts` respeitadas.
- **Mutation:** `projects.updateScope` — input Zod estendido (cada campo **independente** e
  nullable, para o parcial ser salvável), `.set()` com coluna numeric em string, `.returning()`
  com os campos novos.
- **Tela:** `EscopoInicial` em `client/src/pages/Home.tsx` — a mesma tela onde o engenheiro já
  declara `location`/`tipoDeObra`/`descricao`. **`projects` nao ganhou campo sem tela.**
  A leitura mostra o estado em linguagem de engenheiro, inclusive o parcial
  ("Declaração incompleta (2 de 3 campos) — a conferência só roda com valor, UF e mês").
- O chamador (`routers.ts`) normaliza numeric-string do driver para `number|null` com
  `numOuNull`: **NaN não pode virar parâmetro** — silenciaria a regra em vez de declará-la.

---

## 7. Testes por estado

`server/construction/coerencia-engenharia.test.ts`: 86 → **94** testes (+8). Cobrem:

| Estado | O que trava |
| --- | --- |
| CUB não declarado | regra 6 não roda; motivo `obra nao declarou CUB`; nenhum achado |
| CUB parcial (falta UF) | motivo `declaracao de CUB incompleta (falta UF)`; não roda |
| CUB valor inválido (≤ 0) | conta como campo `valor` não declarado |
| CUB completo que acusa | mensagem contém R$ 2.500 · SP · 2026-09 · "heuristica" |
| CUB completo compatível | silêncio; 1 item avaliado |
| BDI não declarado | **nota** na cobertura (conferência), `avaliados=1`, `fora=0` |
| BDI declarado | **sem** nota; conferência vira verificação |

Invariante de shape: todo `cobertura[]` tem `nota` (`null` ou `string`).

---

## 8. Evidência

```
npx tsx scripts/auditar-coerencia-engenharia.mts
  Hipoteses confirmadas: 30/30     (era 28/28; +R6-05 sem CUB, +R6-06 CUB parcial)
  Cobertura confirmada:  3/3

npx vitest run
  Test Files  76 passed (76)
  Tests       696 passed | 8 skipped (704)
  (coerencia-engenharia.test.ts: 86 -> 94)

npx tsc --noEmit      limpo
npx vite build        built in 7.34s
```

---

## 9. Efeito na AURORA (honestidade)

A AURORA **não declara CUB nem BDI**. Consequência direta do escopo — a regra 6 **para de rodar**
nela e passa a declarar `obra nao declarou CUB` na cobertura. **Não toquei no dado da AURORA.**
A regra 4 na AURORA não muda de severidade (continua warning, pois não há BDI): só ganha a nota na
cobertura. Se a regra 6 hoje emite achado na AURORA, a contagem cai — não medi sem DSN, mas o
efeito é esse e está registrado aqui.

---

## 10. O que isto NÃO faz

- Não muda severidade de nada além do previsto (regra 4 com BDI declarado → error).
- Não promove cobertura a achado.
- Não toca no dado da AURORA.
- Não valida o CUB contra uma fonte externa (SINAPI/CUB oficial): o CUB é **declarado**; conferir
  a veracidade do número declarado é decisão de PRODUTO, não do validador.
