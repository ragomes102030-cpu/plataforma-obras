# Auditoria da coerência de engenharia — rodada 3

**Escopo:** fechar os achados que continuavam ABERTOS na rodada 2 e que **não
dependem de banco**. Decisão do lead: `b2f36f1` (revisão 3) já corrigiu R8-03,
R6-03, R6-04 e o caso degenerado; esta rodada implementa **R1-03, R2-01, R3-03 e
R4-01**.

Base: `origin/develop` @ `b2f36f1`. Branch: `fix/coerencia-regras-abertas`. Sem push.
**Nenhum dado da AURORA foi tocado.**

## 1. O que foi corrigido

| Cena | Defeito (rodada 2) | Correção |
| --- | --- | --- |
| **R1-03** | Composição de projeto puro não era reconhecida: a lista de escritório só tinha `"projeto executivo"` e `"projeto básico"`, então `"ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO"` passava batido — falso negativo silencioso na regra 1. | `RADICAIS_ESCRITORIO` ampliado com `elaborac`, `anteprojet`, `servico tecnic`, `sem execuc`, `sondag`, `ensai`, `laudo`, `consultoria`, `supervis`, `fiscalizac`, `plotagem`, `impress`, `projetist`. |
| **R2-01** | Obra cuja **descrição** não nomeia o sistema desligava a regra 2 INTEIRA: o item que contradiz a obra passava sem ser visto. | Quando a descrição é omissa, o sistema passa a ser **inferido da maioria dos itens da EAP** (`inferirSistemaDosItens`), e a mensagem declara que a base foi inferida. Itens `indefinido`/`mista` não votam. Se **nem** a descrição **nem** os itens declararem sistema, a regra emite `eng_sistema_construtivo_nao_avaliavel` (warning) — ela **avisa que não pôde avaliar** em vez de ficar silenciosa. |
| **R3-03** | Item chamado apenas `"Estrutura"` não casava com nenhum radical específico (`pilar`, `viga`, `laje`, `sapata`…) e a checagem de fck era **pulada** — o falso negativo era silencioso no item mais estrutural da EAP. | Radical genérico `estrutur` entrou em `RADICAIS_ESTRUTURAIS` (cobre `estrutura`, `estruturas`, `superestrutura`). O alargamento é contido pela 2ª condição da regra, que continua exigindo que a composição cite concreto. |
| **R4-01** | A banda de preço era **simétrica em torno da razão 1,0** — isto é, centrada em BDI = 0% **em silêncio**. Um BDI de 25%, rotina em obra pública, virava ERROR em massa. | O esperado passou a ser `(1 + BDI DECLARADO da obra)`, com a banda de 10% em torno dele. O chamador passa `bdiDeclarado`; a mensagem cita o valor usado. **Sem BDI declarado o achado é WARNING de conferência, nunca error.** |

Testes de regressão: `server/construction/coerencia-engenharia.test.ts` — **14
testes novos** (4 de R4-01/BDI, 3 de R1-03, 5 de R2-01, 2 de R3-03).

## 2. Decisões de projeto (e as alternativas recusadas)

**R1-03 — `"projeto"` puro NÃO entrou na lista.** O achado era literalmente
"`projeto` sozinho não está na lista", mas `"projeto"` também casa
`"INSTALACAO DE AGUA FRIA - EXECUCAO INCLUSIVE PROJETO EXECUTIVO E AS BUILT"` — composição
de **EXECUÇÃO** que menciona o projeto como parte do escopo (cena **R1-04**, falso
positivo conhecido). O texto não distingue *"o projeto"* (assunto) de *"projetar"*
(serviço); não há negativo textual que separe os dois casos (`"drenagem"` aparece
tanto em `CADASTRO DE REDE DE DRENAGEM`, que é escritório, quanto em composições
de execução). Por isso o caso real foi coberto por `elaborac` / `servico tecnic` /
`sem execuc` — que atingem a cena R1-03 sem piorar R1-04. **R1-04 continua aberto**;
o pré-requisito para adicionar `"projeto"` é um negativo que separe os dois
sentidos. Há teste travando essa decisão.

**R2-01 — inferir dos itens, não criar campo declarado.** Poderíamos ter
adicionado `obra.sistemaConstrutivo` declarado (como o BDI), mas **não há fonte no
app para preenchê-lo** — viraria exatamente o vício de "campo declarado e nunca
alimentado" (o mesmo de `custoDireto`/`compositionUnit`, achado R6-04). A EAP é um
dado real da obra, então ela é a fonte. Não há circularidade útil em exigir
maioria: um item isolado contra a maioria é exatamente o que a regra deve apontar.

**Sem descrição e com itens neutros, a regra AVISA que não pôde avaliar**
(`eng_sistema_construtivo_nao_avaliavel`, warning) — pedido explícito do lead.
Uma regra que não roda em silêncio é indistinguível de uma obra coerente: a
ausência de achado seria lida como aprovação. O aviso é **warning**, nunca error:
falta de dado não bloqueia a obra, mas também não passa por verificação. Há testes
para os três estados: declarado na descrição, inferido dos itens, e não-avaliável.

**R4-01 — WARNING, não "skip", quando o BDI não é declarado.** A leitura literal
de "mesma lógica do CUB declarado" seria não rodar a regra sem BDI. Optei por
**rodar e classificar como conferência (warning)** porque a recomendação da rodada
1 era "`warning` de conferência, nunca `error`" — mantém o sinal no painel sem
bloquear a obra por um parâmetro que ninguém declarou. Se o lead preferir silenciar
de todo, é uma linha.

## 3. Efeito esperado na AURORA (NÃO medido — não toquei no dado)

- **Regra 4:** se a obra AURORA não declara BDI, **todo** achado de
  `eng_preco_sem_lastro` passa a `warning` e **sai do `valorEmRisco`** (que só conta
  `error` + domínio orçamento). O número `R$ 2.347.741,30` **deve cair** — a queda é
  a própria evidência de que a métrica misturada saiu. Declarar o BDI da obra
  transforma esses achados de volta em verificação.
- **Regra 2:** a AURORA declara `concreto armado` na descrição → a inferência **não
  é usada** nesta obra, e o aviso de não-avaliável **também não dispara**. Sem
  efeito. (Só muda obra de descrição omissa.)
- **Regras 1 e 3:** só mudam se a AURORA tiver composições/itens que passem a casar
  o vocabulário ampliado. O blast radius da regra 1 é limitado por exigir radical de
  **execução no item** além do termo de escritório na composição.

## 4. Evidência

- Reprodutor `scripts/auditar-coerencia-engenharia.mts`: **28/28 cenas
  CONFIRMADAS** (era 17/25 na rodada 2, com 8 defeitos ainda reproduzindo; **hoje** o
  reprodutor está em **34/34 cenas + cobertura 3/3** — este número é o da rodada 3).
  As 8 cenas de defeito foram convertidas em cenas de **comportamento corrigido**
  (o flip está registrado em `docs/AUDITORIA-COERENCIA-RODADA-2.md`).
  Cenas novas: **R2-04** (regra 2 não-avaliável → WARNING), **R4-04** (BDI
  declarado, desvio de 60% → continua ERROR), **R4-05** (sem BDI declarado →
  WARNING).
- `npx vitest run`: **76 arquivos, 653 testes passando, 8 pulados**. O arquivo do
  validador foi de 38 para 52 testes (**+14**).
- `npx tsc --noEmit`: **limpo**. Typecheck isolado do validador e do reprodutor: limpo.
- O reprodutor ganhou o campo opcional `severidade` na cena, para travar
  "warning de conferência" como comportamento esperado e não como ausência de achado.

## 5. O que continua aberto (por decisão, não por esquecimento)

| Item | Situação |
| --- | --- |
| **R1-04** | Composição de execução que cita "projeto executivo" segue acusada. Prerequisito: negativo que separe "o projeto" de "projetar". |
| **R2-02** | Cobertura metálica sobre estrutura de concreto segue acusada — não é incoerência por si. |
| **R4-02** | **FECHADO** — item cuja composição não dá base de soma **é** acusado, com achado NOMEADO e valor por item. Entregue em duas partes: `ab047ae` (impacto em R$ por item, publicado em `dc436f8`) e o delta `b39f840` (live): o motivo `"soma de componentes indisponivel"` **saiu** — agora `null` → `soma de componentes nao medida` e `<= 0` → `composicao soma zero: sem base de custo` — e a mensagem cita **item + composição + valor** (`1.13.1 (R$ 282.438,00) [composicao C0095]`). Medido na UI real pelo lead: 11 itens, **R$ 2.729.564,58**, e "indisponivel" **não aparece mais**. Continua `warning` e não entra no `valorEmRisco` — o número no risco exige BDI declarado (R6-02). **O código do achado NÃO foi renomeado** (`eng_item_custo_nao_conferivel`): ele já estava em produção e é fiel às duas causas, enquanto `sem_base_de_preco` descreveria o zero e mentiria no `null`. |
| **R5-01** | **FECHADO** — composição com 1 de 50 componentes com preço **é** acusada: `cobertura < LIMIAR_COBERTURA` → `eng_composicao_preco_incompleto` (`coerencia-engenharia.ts:893`); sem nenhum preço → `eng_composicao_sem_preco` (`:872`). Testes vivos em `coerencia-engenharia.test.ts:646` e `:657`. Confirmado na UI real pelo lead (1 composição: C3270). **Registro honesto:** esta linha afirmou o contrário do código desde a rodada 2, que já dizia "corrigido" — a lista de abertos foi lida como estado atual e induziu a fila ao erro. |
| **R6-02** | **ENTREGUE** e publicado (`510da5b`): CUB declarado por obra (valor + UF + mês) como entrada, com tela, e BDI declarado registrado como NOTA da regra 4. O piso de 60% passou a ser heurística sobre o CUB declarado, na mensagem. |
| residual | O chamador ainda passa `compositionUnitCost: null` ao validador (`server/routers.ts:4172`); o campo saiu do contrato, então a propriedade é ignorada. 1 linha, baixo risco, não tocada para manter o diff focado. |

As linhas marcadas **FECHADO** e **ENTREGUE** ficam na tabela por registro, não por
pendência: o que continua aberto de fato é **R1-04 e R2-02**.

**Registro honesto (segunda vez nesta tabela):** a linha do R4-02 afirmou por duas rodadas
que o item com `somaComponentes = 0` não era acusado, e continuou afirmando isso depois de
o achado já estar em produção. Foi corrigida só **depois** de o `b39f840` existir — uma
linha não pode citar o hash do próprio commit que a torna verdadeira, e escrever antes
faria o doc mentir outra vez.

## 6. Como reproduzir

```bash
npx tsx scripts/auditar-coerencia-engenharia.mts        # 34/34 cenas + cobertura 3/3
npx vitest run server/construction/coerencia-engenharia.test.ts
npx tsc --noEmit
```
