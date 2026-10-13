# Tipografia — um piso de 12,5px e uma escala de oito degraus

O sistema escrevia rótulo de tabela, código de linha e etiqueta com **7px**,
**8px** e **9px**. Não era hierarquia: 7px, 7,5px e 9,8px não são degraus de
escala nenhuma — é ruído que sobrou de folhas escritas em momentos diferentes.
Acima do piso havia outro sintoma, mais difícil de nomear: **15 tamanhos** acima
de 12,5px (12,5 / 13 / 13,5 / 14 / 15 / 16 / 17 / 18 / 19 / 20 / 21 / 22 / 24 /
25 / 26) com um salto relativo médio de 5,4%. Abaixo de ~8% o olho não separa
dois degraus: 13, 13,5 e 14 eram três números para o mesmo tamanho aparente.

A correção não é uma regra universal de `font-size`. Em `font-size`, o `1em`
vale o tamanho do **pai**, então `font-size: max(12,5px, 1em)` **encolhe** todo
texto maior que o pai. Medido antes de escolher o caminho: os títulos de página
h1 (21px) e h2 (20px) caíam para 16px. Uma regra universal achataria a escala
inteira para caber no piso.

O que existe agora são **duas camadas geradas**, uma para cada contexto de uso.

| Camada | Arquivo | Escopo | O que faz |
| --- | --- | --- | --- |
| Campo (celular) | `client/src/campo-tipografia.css` | `max-width: 900px` **e** `pointer: coarse` | piso |
| Mesa (desktop) | `client/src/tipografia-desktop.css` | `min-width: 621px` | piso **e** escala |

O piso é o mesmo nos dois, e o número mora em um lugar só:
`--texto-min`, em `client/src/theme-tokens.css` — que é também o primeiro degrau
da escala. Quem aprende a ler o sistema no celular no canteiro reencontra a
mesma escala na mesa.

Por que gerar e não escrever à mão: são 612 seletores na camada de campo e 700
na de mesa (650 no piso + 50 no encaixe da escala). O gerador lê o CSS na **ordem
do bundle** e decide por par (seletor, contexto de `@media`), usando a **última**
declaração — porque em especificidade igual quem vence é a última. Depois repete
o mesmo seletor na mesma condição de `@media`: especificidade igual, declaração
depois, última vence. Um número grande declarado por **outro** seletor não é
alcançado.

O `!important` é **espelhado, nunca forçado**. Forçar `!important` fazia o
override vencer também regras mais específicas que apontavam para um tamanho
maior — medido: 6 botões (`.scopo-btn.secondary`, `.pl-atividades-btn.secondary`)
caíam de 16px para 12,5px.

## Medições

Roteiro: build local, `ferramentas/servir-local.ps1` em `PORT=4599`,
`node scripts/auditar-campo.mjs http://localhost:4599 <largura> <altura>`.
A mesma sessão foi medida com o import da camada de mesa comentado em
`main.tsx` ("DESLIGADO PARA MEDIR O ANTES").

### Desktop 1440×900 — 15 telas

| Leitura | Antes | Depois |
| --- | --- | --- |
| texto abaixo de 12,5px | **1359** | **0** |
| conteúdo cortado na horizontal | 0 | 0 |
| transbordo vertical | 24 | 24 |
| excesso horizontal | 0px | 0px |
| erros de console | 0 | 0 |

O maior salto medido é 7px → 12,5px (`.eap-rownum`, `.eap-grupo-label`).

### Nada encolheu

`node scripts/verificar-encolhimento.mjs http://localhost:4599 1440 900`
desliga em tempo de execução toda declaração de `font-size` que usa o token e
compara, elemento por elemento, na mesma carga de página:

```
regras de fonte desligadas em cada tela: 37
1468 elementos cresceram
   0 elementos encolheram
maior salto: 5.5px
```

O controle positivo são os 1468 que cresceram: se o medidor estivesse quebrado,
ele diria 0 cresceram. 1468 crescendo e 0 encolhendo é a prova.

### Celular 390×844 — inalterado

| Leitura | Valor |
| --- | --- |
| texto abaixo de 12,5px | 0 |
| alvo de toque abaixo de 44px | 0 |
| cortados / cortados verticais | 0 / 0 |
| transbordo vertical / excesso horizontal | 0 / 0px |
| encolhimento | 1123 cresceram, 0 encolheram |

### Contraste — inalterado

Aumentar a fonte muda o limiar da WCAG (texto grande tem limiar menor). Como
nenhum tamanho subiu para 18,66px em negrito ou 24px, o limiar continua 4,5:1.
Confirmado com a bateria completa:

```
node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/regressao.json 1
resumo: 0 textos reprovados de 2953 avaliados (0.0%)
```

## Escala tipográfica: oito degraus

Os degraus ficam nomeados pelo papel em `client/src/theme-tokens.css`:

| Token | Valor | Papel |
| --- | --- | --- |
| `--texto-min` | 12,5px | piso, legenda e tabela densa |
| `--texto-corpo` | 14px | corpo de tabela, rótulo, botão de barra |
| `--texto-forte` | 16px | corpo em destaque, rótulo de campo |
| `--texto-sub` | 18px | subtítulo, título de cartão pequeno |
| `--texto-secao` | 20px | título de seção |
| `--texto-titulo` | 22px | título de aba e h1 de tela |
| `--texto-pagina` | 24px | título de página e valor de indicador |
| `--texto-heroi` | 26px | número em destaque, título de janela |

**A escala não foi escolhida de fórmula: foi tirada dos valores do próprio app.**
O degrau de 22 existe só para que 21 não precise pular para 24 (+14%). Com isso o
maior deslocamento ao encaixar um valor fora da escala é **+7,7%** (13 → 14, em
27 seletores).

O encaixe é **sempre para o degrau de cima**. Encaixar para o de baixo encolheria
texto, que é exatamente o defeito que o piso veio corrigir.

| Valor no CSS | Vai para | Deslocamento | Seletores |
| --- | --- | --- | --- |
| 13px | 14px | +7,7% | 27 |
| 13,5px | 14px | +3,7% | 5 |
| 15px | 16px | +6,7% | 4 |
| 17px | 18px | +5,9% | 8 |
| 19px | 20px | +5,3% | 2 |
| 21px | 22px | +4,8% | 2 |
| 25px | 26px | +4,0% | 2 |

Nada ficou acima do último degrau, então o gerador não precisou inventar degrau.

### Medição: o que o usuário vê

`node scripts/retratar-escala.mjs http://localhost:4599 1440 900` percorre as 15
telas e conta os **tamanhos de fonte distintos** de todo texto visível. As flags
`--sem-escala` e `--sem-piso` desligam cada camada em tempo de execução, na mesma
carga de página, sem rebuild.

| Desktop 1440×900 | Tamanhos distintos | Fora da escala | Abaixo do piso |
| --- | --- | --- | --- |
| Antes | **21** | 16 | 11 |
| Só com o piso | 10 | 5 | 0 |
| Com piso **e** escala | **7** | **0** | **0** |

Os sete que sobraram são degraus da escala: **12,5 / 14 / 16 / 18 / 20 / 22 /
26**. Os degraus de 15, 17, 19 e 24 existem na escala mas nenhum texto *visível*
nas 15 telas os usa (o 24 aparece no CSS, mas o `.xl-cartao-valor` que o usava era
declarado duas vezes, em 24px e 25px, e vale o último: 25 → 26).

### Nada encolheu (com a escala incluída)

`node scripts/verificar-encolhimento.mjs http://localhost:4599 1440 900` desliga
em tempo de execução toda regra que use `--texto-` ou `--campo-fonte-min`:

```
regras de fonte desligadas em cada tela: 43
1533 elementos cresceram
   0 elementos encolheram
maior salto: 5.5px        (7px -> 12,5px, o caso do piso)
```

A 768×1024: 1263 cresceram, **0 encolheram**. A 390×844: 1123 cresceram, **0
encolheram** (a escala não age no celular — é `min-width: 621px`).

### Guardas de layout e contraste: inalterados

| | 1440×900 | 768×1024 | 390×844 |
| --- | --- | --- | --- |
| cortados horizontais | 0 | 0 | 0 |
| transbordo vertical | 24 | 24 | 0 |
| excesso horizontal | 0px | 0px | 0px |
| erros de console | 0 | 0 | 0 |

```
node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/regressao.json 1
resumo: 0 textos reprovados de 2953 avaliados (0.0%)
```

Nenhum tamanho cruzou o limiar de "texto grande" da WCAG (24px, ou 18,66px em
negrito): 21→22 continua normal, 25→26 já era grande.

## Um defeito que apareceu no caminho: a barra de título entre 621 e 900px

A camada de mesa começa em **621px**, e não em 901px, de propósito: um portátil
do Windows a 150% de escala entrega ~853px de largura CSS — é mesa, e ficaria de
fora de 901. O corte em 621 também é seguro: o app **não declara nenhum tamanho
de fonte** em `@media` acima de 620px (os 18 que existem estão em 600, 620, 560
e 500), então de 621 para cima só a raiz governa.

Ao medir a faixa que passou a ser atendida, apareceu um defeito que já existia:

```
node scripts/medir-barra-titulo.mjs http://localhost:4599 768 1024
```

Antes: `.xl-titlebar-obras` com **0px** de largura (as obras abertas ficavam
invisíveis e inalcançáveis) e os botões de destino cortados — 115px de conteúdo
dentro de 104px de caixa. Causa: `mobile.css` traz, para `max-width: 900px`,
um `flex: 1 1 100%` no grupo de ações que foi escrito para o **celular**, onde a
barra de título quebra em linhas (`planilha.css`, `@media max-width: 600px`) e o
`flex-basis: 100%` vira uma linha inteira. Entre 601 e 900px a barra **não**
quebra, então o mesmo `flex-basis: 100%` não cria linha nova: apenas absorve
toda a folga. Não era falta de ajuste fino — só o grupo de ações ocupava 444px
dos 740px úteis.

Depois: `.xl-titlebar-obras` com 186px, os destinos no menu "Mais" (o mesmo
caminho que o celular já usa até 600px; o menu tem Planejamento, Catálogo,
Arquimedes, Central de Comando, Lixeira e Sair), e **0 cortados** nas 15 telas.

| 768×1024 | Antes da tipografia | Só com a tipografia | Com a barra corrigida |
| --- | --- | --- | --- |
| texto abaixo de 12,5px | 1179 | 0 | 0 |
| conteúdo cortado | 45 | 60 | **0** |

Ou seja: a correção da barra deixou a faixa **melhor do que estava antes** de
qualquer mudança de tipografia.

## Como refazer

```powershell
# 1. ler o CSS e ver o resumo (não escreve nada)
node scripts/gerar-tipografia-campo.mjs
node scripts/gerar-tipografia-desktop.mjs

# 2. escrever as duas folhas
node scripts/gerar-tipografia-campo.mjs --gerar
node scripts/gerar-tipografia-desktop.mjs --gerar

# 3. build + servidor local
npm run build
# ferramentas/servir-local.ps1 (PORT=4599) em outro terminal

# 4. medir
node scripts/auditar-campo.mjs http://localhost:4599 1440 900      # mesa
node scripts/auditar-campo.mjs http://localhost:4599 390 844       # campo
node scripts/auditar-campo.mjs http://localhost:4599 768 1024      # a faixa do defeito
node scripts/verificar-encolhimento.mjs http://localhost:4599 1440 900
node scripts/listar-cortados.mjs http://localhost:4599 768 1024
node scripts/listar-cortados.mjs http://localhost:4599 768 1024 --sem-piso   # o antes, sem rebuild
node scripts/medir-barra-titulo.mjs http://localhost:4599 768 1024

# 5. a escala como o usuário vê (as flags mostram o antes sem rebuild)
node scripts/retratar-escala.mjs http://localhost:4599 1440 900
node scripts/retratar-escala.mjs http://localhost:4599 1440 900 --sem-escala
node scripts/retratar-escala.mjs http://localhost:4599 1440 900 --sem-escala --sem-piso
```

`scripts/diagnosticar-fontes.mjs` responde à pergunta que decide o desenho das
camadas: quantas declarações de tamanho estão na raiz e quantas dentro de
`@media`.

`scripts/diagnosticar-escala.mjs` mostra todos os valores que o app usa, com
frequência, salto relativo em relação ao degrau anterior e os maiores usuários de
cada um. Foi ele que revelou os 15 tamanhos acima do piso e o salto médio de 5,4%.

`scripts/retratar-fontes.mjs tests/contraste/<leitura>.json praca 10` lê uma
medição de contraste e mostra quais tamanhos aparecem, do menor para o maior.

## O que ficou de fora

- A faixa **601 a 620px com ponteiro fino** não tem camada: fica entre o corte
  de 621 da camada de mesa e os `@media` de 620/600 que a camada de campo
  espelha. Só acontece numa janela de navegador estreitada à mão com mouse —
  nenhum aparelho real entrega essa largura com ponteiro fino.
- A escala vale da raiz para cima: ela **encaixa** os valores fora de degrau, mas
  não reescreve o CSS-fonte para usar os tokens. Quem editar `planilha.css` amanhã
  deve preferir `var(--texto-corpo)` a `font-size: 13px`; se escrever 13px, o
  gerador corrige no próximo `--gerar`, mas o certo é não escrever.
- Os degraus de 15, 17, 19 e 24 estão na escala e hoje ninguém os usa. Ficam
  porque a escala precisa ser contínua — retirar um degrau do meio só faria o
  próximo valor pular mais longe.
- Não há camada de mesa para **alvo de toque**: com mouse a WCAG 2.5.8 pede
  24px, não 44px, e o app já passa.
