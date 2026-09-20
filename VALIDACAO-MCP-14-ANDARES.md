# Validação MCP — Obra fictícia de 14 andares

**Data da validação:** 20/09/2026 UTC  
**Objetivo:** exercitar o fluxo EAP → cronograma → CPM → baseline → Curva S → Linha de Balanço → Gantt, usando os três MCPs públicos da Plataforma Obras, sem misturar dados com uma obra real.

## Identificação da obra de validação

```text
project_id MCP: obra-validacao-14-andares-limpa-20260919
Nome: Torre Residencial Fictícia - 14 Andares
Local lógico: TORRE-FICTICIA
Unidades repetitivas: Pavimento 01 até Pavimento 14
```

O primeiro identificador utilizado (`obra-validacao-14-andares-20260919`) foi abandonado após a auditoria encontrar uma tentativa de EAP com múltiplas raízes e tipos inconsistentes. Ele deve ser considerado apenas um registro de tentativa com falha, não uma base válida para continuar.

## MCPs utilizados

| MCP | Endpoint | Versão observada | Papel |
|---|---|---:|---|
| EAP | `https://mcp-eap-server.onrender.com` | 1.29.1 | Estrutura Analítica do Projeto |
| Cronograma | `https://mcp-cronograma-server.onrender.com` | 1.29.1 | Atividades, dependências, CPM, baseline e Curva S |
| Gantt/LOB | `https://mcp-gantt-lob-server.onrender.com` | 4.0.3 | Linha de Balanço e exportação Gantt XLSX |

## EAP criada

A obra foi criada com uma única raiz, conforme exigência do MCP de EAP:

```text
1 Torre Residencial Fictícia - 14 Andares
├── 1.1 Implantação e canteiro
├── 1.2 Fundação
├── 1.3 Estrutura dos 14 pavimentos
├── 1.4 Vedação e instalações
├── 1.5 Acabamentos
└── 1.6 Comissionamento e entrega
```

A chamada `validar_estrutura` retornou:

```text
total_nos: 7
total_problemas: 0
total_avisos: 11
arvore_valida: true
```

Os 11 avisos são de qualidade de cadastro, não erros estruturais. O MCP apontou que os filhos possuem tipos diferentes do tipo da raiz e que não foi informado responsável para as folhas. Isso indica o próximo aprimoramento necessário: responsáveis por pacote e vocabulário de tipos no editor da EAP.

## Cronograma criado

Foram criadas sete atividades vinculadas aos nós da EAP:

| Atividade | EAP | Duração |
|---|---:|---:|
| Mobilização e canteiro | 1.1 | 14 dias |
| Fundação e contenções | 1.2 | 28 dias |
| Estrutura dos 14 pavimentos | 1.3 | 98 dias |
| Alvenaria dos 14 pavimentos | 1.4 | 84 dias |
| Instalações prediais | 1.4 | 70 dias |
| Acabamentos e áreas comuns | 1.5 | 70 dias |
| Comissionamento e entrega | 1.6 | 12 dias |

Foram criadas seis dependências término-início (`TI`) em cadeia. A auditoria retornou:

```text
total_dependencias: 6
total_problemas: 0
rede_valida: true
```

O CPM calculou duração total de **376 dias**. Todas as sete atividades ficaram no caminho crítico, com folga total zero, porque a validação usou uma cadeia linear deliberadamente simples.

IDs retornados pelo MCP de cronograma:

```text
atv-aed3f2925d16  Mobilização e canteiro
atv-2a4d47e4d344  Fundação e contenções
atv-8b80e9889b26  Estrutura dos 14 pavimentos
atv-5f819757758b  Alvenaria dos 14 pavimentos
atv-df5ce94f68ed  Instalações prediais
atv-e3ef74b15198  Acabamentos e áreas comuns
atv-be730ce21e90  Comissionamento e entrega
```

## Baseline e Curva S

Foi salva a baseline:

```text
Nome: Baseline de validação - 14 andares
ID: bl-29320097bb29
Atividades congeladas: 7
```

Depois foram simulados avanços para validar o realizado:

```text
Mobilização: 100%
Fundação: 65%
Estrutura: 18%
```

A Curva S passou a retornar realizado acumulado diferente de zero. No marco da estrutura, por exemplo:

```text
Planejado acumulado: 37,2340%
Realizado acumulado: 13,2553%
```

Esse resultado confirma que o MCP consegue separar planejado e realizado, embora o sistema da Plataforma Obras ainda precise conectar seus lançamentos de produção física a esse percentual.

## Linha de Balanço

Foi calculada a Linha de Balanço com seis atividades e 14 unidades repetitivas:

```text
total_atividades: 6
total_unidades: 14
unidades: Pavimento 01 ... Pavimento 14
data inicial: 2026-10-01
```

O MCP identificou risco de interferência em:

```text
Alvenaria
Instalações
```

O balanceamento recomendou acelerar a predecessora usando duas equipes em determinados pontos. A chamada de dimensionamento também retornou:

```text
tempo unitário: 4 dias
ritmo desejado: 3 dias
equipes necessárias: 2
```

Esse é exatamente o tipo de diagnóstico que a futura tela de produção deve apresentar ao usuário, em vez de apenas desenhar barras estáticas.

## Gantt

O MCP Gantt gerou o arquivo profissional:

```text
Torre_Residencial_Fictícia_-_14_Andares_gantt.xlsx
```

O artefato foi copiado para:

`artefatos/obra-validacao-14-andares-gantt.xlsx`

## Fluxo validado

```text
[OK] Inicializar os três MCPs
[OK] Criar uma obra fictícia isolada
[OK] Criar raiz única da EAP
[OK] Criar seis pacotes de trabalho
[OK] Auditar estrutura EAP
[OK] Criar sete atividades
[OK] Criar seis dependências TI
[OK] Validar a rede
[OK] Calcular CPM e caminho crítico
[OK] Salvar baseline
[OK] Calcular Curva S planejado x realizado
[OK] Calcular Linha de Balanço para 14 pavimentos
[OK] Detectar interferências de ritmo
[OK] Dimensionar equipes
[OK] Gerar Gantt XLSX
```

## Pontos encontrados

A primeira tentativa confirmou que o MCP rejeita tipos de frente fora do vocabulário fechado e que uma EAP com múltiplas raízes é inválida para esse servidor. A segunda tentativa corrigiu o fluxo usando uma raiz única e tipos aceitos.

A validação também mostrou uma diferença importante de arquitetura: o MCP de Gantt/LOB é stateless e recebe dados já calculados no payload, enquanto os MCPs de EAP e cronograma mantêm estado por `project_id`. A Plataforma Obras deverá persistir seus dados no banco e enviar ao MCP somente um contexto normalizado e auditável.

## Ponto de retomada

O próximo trabalho deve ser feito no código da Plataforma Obras, nesta ordem:

1. Criar um editor de EAP com raiz única, tipos de frente válidos, responsável, unidade e quantidade.
2. Criar o editor de atividades vinculado ao nó EAP.
3. Criar dependências e validar ciclos antes de permitir a aprovação.
4. Adicionar a ação **Aprovar baseline**.
5. Só depois liberar o cadastro de frentes, equipes e unidades.
6. Converter lançamentos diários de quantidade em progresso físico de atividades.
7. Enviar o cronograma e o realizado ao MCP de CPM/Curva S.
8. Enviar atividades repetitivas e unidades ao MCP de Linha de Balanço.
9. Mostrar risco de interferência e recomendação de equipes no painel de produção.
10. Gerar e anexar o Gantt aprovado à obra.

A obra MCP fictícia não deve ser tratada como uma obra real da aplicação. Ela é uma massa de teste externa para validar contratos, regras, respostas e integração.

## Arquivos de evidência locais

Os logs completos da execução foram mantidos no ambiente de validação:

```text
/home/ubuntu/obra-validation-eap-fix-log.json
/home/ubuntu/obra-validation-schedule-log.json
/home/ubuntu/obra-validation-outputs-log.json
/home/ubuntu/obra-validation-progress-log.json
```
