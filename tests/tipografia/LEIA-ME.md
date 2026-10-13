# Piso tipográfico — nenhum texto abaixo de 12,5px

O sistema escrevia rótulo de tabela, código de linha e etiqueta com **7px**,
**8px** e **9px**. Não era hierarquia: 7px, 7,5px e 9,8px não são degraus de
escala nenhuma — é ruído que sobrou de folhas escritas em momentos diferentes.

A correção não é uma regra universal de `font-size`. Em `font-size`, o `1em`
vale o tamanho do **pai**, então `font-size: max(12,5px, 1em)` **encolhe** todo
texto maior que o pai. Medido antes de escolher o caminho: os títulos de página
h1 (21px) e h2 (20px) caíam para 16px. Uma regra universal achataria a escala
inteira para caber no piso.

O que existe agora são **duas camadas geradas**, uma para cada contexto de uso.

| Camada | Arquivo | Escopo | Piso |
| --- | --- | --- | --- |
| Campo (celular) | `client/src/campo-tipografia.css` | `max-width: 900px` **e** `pointer: coarse` | `12.5px` |
| Mesa (desktop) | `client/src/tipografia-desktop.css` | `min-width: 621px` | `12.5px` |

O piso é o mesmo nos dois, e o número mora em um lugar só:
`--texto-min`, em `client/src/theme-tokens.css`. Quem aprende a ler o sistema no
celular no canteiro reencontra a mesma escala na mesa.

Por que gerar e não escrever à mão: são 612 seletores na camada de campo e 650
na de mesa. O gerador lê o CSS na **ordem do bundle** e decide por par
(seletor, contexto de `@media`), usando a **última** declaração — porque em
especificidade igual quem vence é a última. Depois repete o mesmo seletor na
mesma condição de `@media`: especificidade igual, declaração depois, última
vence. Um número grande declarado por **outro** seletor não é alcançado.

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
```

`scripts/diagnosticar-fontes.mjs` responde à pergunta que decide o desenho:
quantas declarações de tamanho estão na raiz e quantas dentro de `@media`.

`scripts/retratar-fontes.mjs tests/contraste/<leitura>.json praca 10` lê uma
medição de contraste e mostra quais tamanhos aparecem, do menor para o maior.

## O que ficou de fora

- A faixa **601 a 620px com ponteiro fino** não tem camada: fica entre o corte
  de 621 da camada de mesa e os `@media` de 620/600 que a camada de campo
  espelha. Só acontece numa janela de navegador estreitada à mão com mouse —
  nenhum aparelho real entrega essa largura com ponteiro fino.
- O piso é um corte único, não uma escala. Acima de 12,5px a escala continua
  como estava (13, 14, 16, 18, 20, 21...). Se um dia a escala precisar de
  degraus com nome, o lugar é `--texto-min` e um `--texto-*` ao lado.
- Não há camada de mesa para **alvo de toque**: com mouse a WCAG 2.5.8 pede
  24px, não 44px, e o app já passa.
