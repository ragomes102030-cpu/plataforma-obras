# Contraste de texto — 15 telas, computador e celular

Medição de contraste da WCAG 2.1 nas 15 telas do sistema, em duas larguras
(1440x900 e 390x844), com a cor de fundo efetiva de cada texto (composta a
partir dos fundos translúcidos).

- Texto normal precisa de **4,5:1**; texto grande (>=24px, ou >=18,66px em
  negrito) precisa de **3:1**. Elemento desabilitado é isento pela própria norma.

## Resultado

| | reprovados | avaliados | taxa |
|---|---|---|---|
| antes | 1.097 | 2.953 | 37,1% |
| depois | **0** | 2.953 | **0%** |

Os arquivos:

- `antes.json` — leitura com as folhas de correção desligadas. É a **entrada** de
  `scripts/gerar-legibilidade.mjs`, por isso fica versionado.
- `relatorio.json` e `depois.json` — leitura do depois. Saída de medição, não
  versionada: qualquer um regera.

## O que estava errado

Dois defeitos, nenhum deles de "gosto":

1. **Barra lateral em dois temas.** O histórico mostra a barra clara original
   (`1d1bc00`) e depois uma passagem de "linguagem visual profissional ao shell"
   (`f279091`) que a pintou de escuro. Como `planilha.css` é importado antes de
   `eap.css`, o fundo escuro escapou (seletor mais específico) e todo o texto não
   — o nome da obra ficava `#24343c` sobre `#101923`, **1,38:1**, praticamente
   invisível, e os 420 rótulos de navegação ficavam em 2,84:1. Corrigido em
   `client/src/barra-lateral.css`, voltando à paleta escura que a própria
   `planilha.css` já descrevia.
2. **Escala de cinza secundária clara demais.** Legendas, rótulos de grupo e
   cabeçalhos de coluna entre 2,1:1 e 4,4:1. Corrigido por
   `client/src/legibilidade-gerada.css`, gerado a partir desta medição: cada cor
   antiga vira **uma** cor nova, com matiz e saturação preservados (só a
   luminosidade muda), calculada para passar em **todos** os fundos em que a
   cor aparece.

## Como refazer

```powershell
# 1. medir o antes, com as folhas de correcao desligadas
#    (comentar os imports de barra-lateral.css e legibilidade-gerada.css em main.tsx)
npm run build
node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/antes.json

# 2. religar os imports, npm run build

# 3. gerar a folha a partir da medicao do antes
node scripts/gerar-legibilidade.mjs tests/contraste/antes.json

# 4. medir o depois
node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/depois.json
```

Ferramentas de apoio:

- `node scripts/contraste.mjs "#64798c" "#101923"` — contraste de uma cor sobre um
  fundo, com sugestão de cor que passa. Serve para não escrever número de cabeça.
- `node scripts/listar-reprovados.mjs` — quem ainda reprova, com cor, fundo,
  fonte, caminho e texto.
- `node scripts/explicar-legibilidade.mjs "pl-atividades-filtros"` — por que um
  lugar virou (ou não virou) regra.
- `node scripts/onde-aparece-a-cor.mjs "rgb(36, 52, 60)"` — todos os fundos em que
  uma cor aparece. Foi assim que se confirmou que `#24343c` vive tanto no painel
  escuro quanto no `<h1>` da tela EAP, sobre branco.
- `node scripts/diagnosticar-barra-lateral.mjs` — o que a barra lateral renderiza,
  estado por estado.
