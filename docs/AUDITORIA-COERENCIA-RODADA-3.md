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
| **R2-01** | Obra cuja **descrição** não nomeia o sistema desligava a regra 2 INTEIRA: o item que contradiz a obra passava sem ser visto. | Quando a descrição é omissa, o sistema passa a ser **inferido da maioria dos itens da EAP** (`inferirSistemaDosItens`), e a mensagem declara que a base foi inferida. Itens `indefinido`/`mista` não votam. |
| **R3-03** | Item chamado apenas `"Estrutura"` não casava com nenhum radical específico (`pilar`, `viga`, `laje`, `sapata`…) e a checagem de fck era **pulada** — o falso negativo era silencioso no item mais estrutural da EAP. | Radical genérico `estrutur` entrou em `RADICAIS_ESTRUTURAIS` (cobre `estrutura`, `estruturas`, `superestrutura`). O alargamento é contido pela 2ª condição da regra, que continua exigindo que a composição cite concreto. |
| **R4-01** | A banda de preço era **simétrica em torno da razão 1,0** — isto é, centrada em BDI = 0% **em silêncio**. Um BDI de 25%, rotina em obra pública, virava ERROR em massa. | O esperado passou a ser `(1 + BDI DECLARADO da obra)`, com a banda de 10% em torno dele. O chamador passa `bdiDeclarado`; a mensagem cita o valor usado. **Sem BDI declarado o achado é WARNING de conferência, nunca error.** |

Testes de regressão: `server/construction/coerencia-engenharia.test.ts` — **12
testes novos** (4 de R4-01/BDI, 3 de R1-03, 3 de R2-01, 2 de R3-03).

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
**Sem descrição e com itens neutros, a regra segue silenciosa — não inventa
sistema** (há teste para isso).

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
  é usada** nesta obra. Sem efeito. (Só muda obra de descrição omissa.)
- **Regras 1 e 3:** só mudam se a AURORA tiver composições/itens que passem a casar
  o vocabulário ampliado. O blast radius da regra 1 é limitado por exigir radical de
  **execução no item** além do termo de escritório na composição.

## 4. Evidência

- Reprodutor `scripts/auditar-coerencia-engenharia.mts`: **27/27 cenas
  CONFIRMADAS** (era 17/25 na rodada 2, com 8 defeitos ainda reproduzindo).
  As 8 cenas de defeito foram convertidas em cenas de **comportamento corrigido**
  (o flip está registrado em `docs/AUDITORIA-COERENCIA-RODADA-2.md`).
  Cenas novas: **R4-04** (BDI declarado, desvio de 60% → continua ERROR),
  **R4-05** (sem BDI declarado → WARNING).
- `npx vitest run`: **76 arquivos, 651 testes passando, 8 pulados**.
- `npx tsc --noEmit`: **limpo**. Typecheck isolado do validador e do reprodutor: limpo.
- O reprodutor ganhou o campo opcional `severidade` na cena, para travar
  "warning de conferência" como comportamento esperado e não como ausência de achado.

## 5. O que continua aberto (por decisão, não por esquecimento)

| Item | Situação |
| --- | --- |
| **R1-04** | Composição de execução que cita "projeto executivo" segue acusada. Prerequisito: negativo que separe "o projeto" de "projetar". |
| **R2-02** | Cobertura metálica sobre estrutura de concreto segue acusada — não é incoerência por si. |
| **R4-02** | Item com `somaComponentes = 0` (R$ 1,4 milhão sem lastro) não é acusado: a regra pula `soma <= 0`. |
| **R5-01** | Composição com 1 de 50 componentes com preço não é acusada, ainda que a soma seja inútil. |
| **R6-02** | Piso de 60% do CUB sem calibração. Prerequisito (área) já corrigido em `b2f36f1`; a solução acordada é **CUB declarado por obra**. |
| residual | O chamador ainda passa `compositionUnitCost: null` ao validador (`server/routers.ts:4172`); o campo saiu do contrato, então a propriedade é ignorada. 1 linha, baixo risco, não tocada para manter o diff focado. |

## 6. Como reproduzir

```bash
npx tsx scripts/auditar-coerencia-engenharia.mts        # 27/27
npx vitest run server/construction/coerencia-engenharia.test.ts
npx tsc --noEmit
```
