# Contraste de texto — 15 telas × 3 obras × 2 larguras

Medição de contraste da WCAG 2.1 nas 15 telas do sistema, em 1440x900 e 390x844,
com a cor de fundo efetiva de cada texto (composta a partir dos fundos
translúcidos, e também das paradas de cor quando o fundo é gradiente).

- Texto normal precisa de **4,5:1**; texto grande (>=24px, ou >=18,66px em
  negrito) precisa de **3:1**. Elemento desabilitado é isento pela própria norma.

## Resultado

| | reprovados | avaliados | taxa |
|---|---|---|---|
| antes (1 obra, 2 larguras) | 1.097 | 2.953 | 37,1% |
| depois (3 obras, 2 larguras) | **0** | 7.079 | **0%** |

As leituras versionadas:

- `antes.json` — primeira medição, com as folhas de correção desligadas. Entrada
  do gerador de regras por lugar.
- `producao.json` — medição em produção. Guardada porque producao roda outra obra
  e por isso revela estado que o local não tinha.

As demais leituras são saída de verificação e ficam fora do versionamento
(`relatorio.json`, `depois.json`, `depois-3obras.json`, `gradiente.json`).

## O que estava errado

Nada disso é questão de gosto; são três defeitos com causa própria.

### 1. Barra lateral em dois temas

O histórico mostra a barra clara original (`1d1bc00`) e depois uma passagem de
"linguagem visual profissional ao shell" (`f279091`) que a pintou de escuro,
reaplicada em `328fc82` ("restaurar folha completa") — alguém já tinha percebido
que o escuro se perdia.

Perdia por cascata: `planilha.css` é importado antes de `eap.css`, então onde as
duas empatam em especificidade a `eap.css` vence. O fundo do painel escapou
(seletor mais específico), todo o resto não:

```
nome da obra        #24343c sobre #101923    1,38:1   praticamente invisível
itens de navegação  #53636b sobre #101923    2,84:1   420 lugares
rótulo de grupo     #8a979d sobre #101923    3,93:1
botão de recolher   caixa branca sobre painel escuro
item ativo          pílula clara #eaf4f6 dentro de painel escuro
```

Corrigido em `client/src/barra-lateral.css`, voltando à paleta escura que a
própria `planilha.css` já descrevia. Das cores pretendidas, só uma reprovava, e
foi ajustada: rótulo de grupo de `#64798c` (3,93:1) para `#7b90a3` (5,37:1).

### 2. Escala de cinza secundária clara demais

Legendas, rótulos e dicas entre 1,66:1 e 4,49:1 — o tipo de texto que menos
importa e que por isso costuma passar batido. Corrigido **na origem**
(`eap.css`, `index.css`, `planilha.css`, `seletor-obra.css`): 43 cores trocadas
por `scripts/unificar-cinzas.mjs`, cada uma pelo valor mais próximo que passa,
preservando matiz e saturação.

A correção é na origem, e não numa folha de regras, porque o defeito é o mesmo
valor repetido em vários componentes: corrigir por lugar exige ter medido aquele
lugar, e lugar cujo conteúdo depende dos dados (estado vazio de uma obra em
planejamento, por exemplo) não aparece em toda medição.

A trava usada: uma cor pode ser texto sobre fundo claro **e** sobre fundo escuro;
escurecê-la para o fundo claro a destruiria no escuro. Então a troca só acontece
quando nenhuma leitura daquela cor tem fundo escuro. Duas cores caíram nesse caso
(`#24343c` e `#53636b`, as da barra lateral) e ficaram fora — resolvidas à mão em
`barra-lateral.css`.

### 3. Ponto cego de cobertura — o mais caro

Duas lições, as duas descobertas porque a verificação foi feita nos dois
ambientes e em mais de uma obra:

- **Uma obra só não basta.** O mesmo código mostra `.ok` na faixa de validação da
  EAP com os dados de uma obra e `.attention` (fundo âmbar) com os de outra.
  Medindo um ambiente só, a correção saiu incompleta e produção reprovou 18
  textos que o local aprovava. O auditor passou a varrer as primeiras obras do
  seletor do topo (3º argumento).
- **Gradiente não é "não medível".** As paradas de cor de um gradiente são as
  cores de fundo possíveis, e o texto precisa passar na **pior** delas. Antes
  essas leituras eram descartadas — e era justamente ali que estava escondido o
  subtítulo do pré-planejamento da EAP, em 3,72:1.

## Um erro que vale registrar

A primeira versão da correção por lugar também pegava as *variantes* do mesmo
elemento. A regra da base (`button`) derrubou o botão ativo (`button.ativo`), que
passava com 10,62:1, para 4,43:1: corrigir uma coisa criou outra. A defesa passou
a ser `:not()` com as classes que aparecem nas variantes **irmãs** do mesmo pai,
tiradas da própria medição e não de uma lista de nomes supostos.

## Como refazer

```powershell
# 1. medir, com as folhas de correção desligadas
#    (comentar os imports de barra-lateral.css e legibilidade-gerada.css em main.tsx)
npm run build
node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/antes.json 3

# 2. religar os imports, npm run build

# 3. corrigir os cinzas na origem (simula primeiro; --aplicar para valer)
node scripts/unificar-cinzas.mjs tests/contraste/antes.json tests/contraste/producao.json
node scripts/unificar-cinzas.mjs tests/contraste/antes.json tests/contraste/producao.json --aplicar
npm run build

# 4. medir de novo -- o alvo é zero
node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/depois-3obras.json 3
node scripts/auditar-contraste.mjs https://plataforma-obras.dockhosting.dev tests/contraste/producao.json 3
```

Ferramentas de apoio:

- `node scripts/contraste.mjs "#64798c" "#101923"` — contraste de uma cor sobre um
  fundo, com sugestão de cor que passa. Serve para não escrever número de cabeça.
- `node scripts/agrupar-reprovados.mjs depois.json` — quem reprova, agrupado por
  estilo, com quantas telas.
- `node scripts/explicar-legibilidade.mjs "pl-atividades-filtros"` — por que um
  lugar virou (ou não virou) regra.
- `node scripts/onde-aparece-a-cor.mjs "rgb(36, 52, 60)"` — todos os fundos em que
  uma cor aparece. Foi assim que se confirmou que `#24343c` vive tanto no painel
  escuro quanto no `<h1>` da tela EAP, sobre branco.
- `node scripts/diagnosticar-barra-lateral.mjs` — o que a barra lateral renderiza,
  estado por estado.

Ferramentas de geração (estas existem para o caso de lugar cujo valor certo é
específico daquele lugar, e não da cor):

- `node scripts/gerar-legibilidade.mjs antes.json [...]` escreve
  `client/src/legibilidade-gerada.css`.
- `node scripts/listar-reprovados.mjs` lista quem ainda reprova.
