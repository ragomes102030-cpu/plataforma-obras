# QA — Proposta de escopo estruturado e EAP candidata

- **Obra:** `OB-ZP1H2K — QA EAP SCOPE 2026-10-08`
- **Data:** 2026-10-09
- **Status:** proposta de trabalho; **não aprovada e não aplicada ao banco**
- **Fonte operacional:** snapshot local lido no teste live de 2026-10-09
- **Proteção:** não editar `OB-PUPOCN — AURORA TESTE`; não criar atividades, dependências, orçamento, baseline, projeto externo ou vínculo MCP nesta etapa.

## 1. Fatos confirmados

| Campo | Valor confirmado | Evidência / limite |
|---|---|---|
| Identificador | `OB-ZP1H2K` | Código da obra de QA |
| Tipologia declarada | Edificação residencial | Contexto de QA previamente declarado |
| Número de pavimentos | Seis pavimentos | Informação declarada; a convenção de contagem ainda precisa ser confirmada (por exemplo, se térreo, subsolo ou cobertura entram nessa contagem) |
| Escopo textual declarado | Fundações/contenções, estrutura de concreto armado, vedações/alvenarias, instalações elétricas e hidrossanitárias, revestimentos/acabamentos, áreas externas, comissionamento, documentação e entrega | Itens presentes na descrição textual do escopo; ainda precisam ser delimitados e rastreados a pacotes/itens de escopo estruturados |
| EAP local atual | 9 nós: 1 raiz + 8 folhas | Snapshot canônico live de 2026-10-09 |
| Estado dos nós | Todos em rascunho | Snapshot canônico live |
| Atividades / dependências | 0 / 0 | Estado persistido consultado |
| Versões de orçamento / baselines | 0 / 0 | Estado persistido consultado |
| Vínculo com MCP EAP | Não configurado | Não confundir saúde do serviço MCP com existência/vínculo de projeto externo |

## 2. Dados ainda desconhecidos — não preencher por inferência

Até confirmação, manter como **desconhecido**: área construída; quantidade e tipologia de unidades; composição e nome dos pavimentos; existência de subsolo, garagem, elevadores e cobertura técnica; padrão/especificação dos acabamentos; método e tipologia de fundação; detalhamento da estrutura de concreto armado e das alvenarias; limites e composição exata das áreas externas; quais projetos, licenças e liberações estão no contrato; sistemas adicionais como gás, incêndio, telecomunicações, climatização e energia solar; restrições de terreno/acesso; quantitativos; orçamento; datas; produtividade; calendário e equipe/responsáveis. A descrição declara instalações elétricas e hidrossanitárias, mas não detalha seus subsistemas, padrões, equipamentos ou quantitativos.

Não converter esses desconhecidos em premissas silenciosas. Uma hipótese necessária deve ser identificada como hipótese, ter responsável por confirmar e não entrar como escopo aprovado.

## 3. Perguntas mínimas para fechar a base do escopo

1. **Contagem dos seis pavimentos:** quais pavimentos compõem os seis? Há subsolo, térreo, pavimentos tipo, cobertura ou outros níveis?
2. **Programa:** quantas unidades e quais áreas comuns/áreas de apoio estão declaradas? Se ainda não definido, registrar explicitamente “a definir”.
3. **Limites físicos:** a descrição já declara contenções e áreas externas; quais elementos exatos estão incluídos (por exemplo, escavação, muros, urbanização e ligações externas)? Garagem faz parte do escopo?
4. **Soluções técnicas:** a descrição declara estrutura de concreto armado, alvenarias, instalações elétricas e hidrossanitárias; quais especificações/projetos estão aprovados e quais sistemas adicionais (incêndio, gás, telecomunicações, climatização, energia solar etc.) realmente se aplicam?
5. **Fronteira contratual:** projetos, licenças, ligações definitivas, comissionamento, documentação “as built” e entrega ao usuário estão incluídos?
6. **Critério de conclusão:** quais entregáveis e critérios objetivos serão usados para aceitar a obra e seus pacotes?

As respostas podem ser parciais. O que não for conhecido deve permanecer como lacuna explícita.

## 4. EAP candidata — decomposição inicial por fases

A estrutura abaixo é **um roteiro para revisão de engenharia**, não uma afirmação de que todos os serviços se aplicam. Os itens marcados como condicionais só entram na EAP aprovada quando o escopo, projetos e fronteiras contratuais confirmarem sua aplicabilidade. Os códigos são provisórios para discussão, não IDs persistidos.

- **1.0 Edificação residencial — seis pavimentos declarados**
  - **1.1 Planejamento, projetos e liberações** — confirmar se elaboração/compatibilização de projetos, licenças e liberações estão no escopo executado ou são apenas pré-requisitos externos.
  - **1.2 Preparação e implantação do canteiro** — delimitar mobilização, instalações provisórias, segurança e logística conforme contrato.
  - **1.3 Terreno, escavações e contenções** — a descrição inclui contenções; detalhar os serviços e limites físicos, sem presumir que todo tipo de escavação ou muro esteja contratado.
  - **1.4 Fundações** — a descrição inclui fundações; definir solução e elementos somente com sondagem/projeto, sem presumir fundação específica.
  - **1.5 Estrutura em concreto armado** — sistema declarado; decompor por elemento e/ou pavimento depois de confirmar projeto e a convenção dos seis níveis.
  - **1.6 Vedações e alvenarias** — sistema declarado; confirmar materiais, interfaces e limites com esquadrias/instalações.
  - **1.7 Cobertura e impermeabilização (a confirmar)** — a configuração da cobertura, áreas molhadas, reservatórios e os serviços de impermeabilização precisam ser confirmados; não inferir cobertura técnica.
  - **1.8 Instalações elétricas e hidrossanitárias** — sistemas declarados; abrir subárvores conforme projetos e delimitar equipamentos, pontos, prumadas, testes e interfaces. Incêndio, gás, telecomunicações, climatização e energia solar permanecem não confirmados.
  - **1.9 Revestimentos e acabamentos** — itens declarados; detalhar por ambiente/sistema somente após confirmar programa, memorial e padrão, evitando duplicidade de interfaces. Esquadrias precisam ser confirmadas como parte do escopo.
  - **1.10 Áreas externas** — item declarado; detalhar limites, urbanização, drenagem, muros e ligações definitivas conforme escopo contratado.
  - **1.11 Comissionamento, documentação e entrega** — itens declarados; confirmar documentos exigidos, sistemas a testar, treinamento, pendências e critérios objetivos de aceite.

### Como decompor cada fase após confirmação

Cada pacote de trabalho deverá ter escopo exclusivo e verificável, com:
- descrição orientada a resultado;
- inclusões e exclusões explícitas;
- critério de aceitação mensurável;
- responsável definido antes da aprovação;
- unidade e quantitativo somente quando tecnicamente sustentados;
- localização/frente quando fizer sentido;
- base de decomposição e rastreabilidade para os itens de escopo;
- interfaces identificadas para impedir lacunas e dupla contagem.

A decomposição por pavimento, ambiente, sistema ou frente deve ser escolhida conforme a natureza do trabalho. Não criar um padrão único para todos os pacotes se isso distorcer a medição ou esconder interfaces.

## 5. Regra dos 100% e critério de decisão

**Estado atual: indecidível, não “aprovado”.** A validação live registrou ausência de itens estruturados de escopo e de vínculos escopo↔EAP; portanto, não há denominador confiável para calcular cobertura percentual. A existência de 9 nós e a ausência de bloqueios estruturais, isoladamente, não demonstram cobertura do escopo.

Antes de afirmar cobertura:
1. registrar itens de escopo rastreáveis a requisitos, projetos, contrato ou decisão explícita;
2. definir limites e exclusões;
3. vincular cada item de escopo a um ou mais pacotes EAP, com justificativa para relações muitos-para-muitos;
4. verificar que todo o escopo autorizado está coberto e que nenhum pacote adiciona escopo não autorizado;
5. revisar sobreposições, lacunas e interfaces;
6. executar a validação determinística e guardar sua evidência.

Não somar quantidades de unidades incompatíveis. Métricas de dicionário incompleto, quantitativos ausentes e responsáveis pendentes devem aparecer como pendências de cobertura/prontidão, sem serem silenciosamente convertidas em “escopo ausente” nem ignoradas para baseline.

## 6. Gates antes de avançar

- [ ] Confirmar composição dos seis pavimentos e programa da edificação.
- [ ] Delimitar inclusões/exclusões contratuais e sistemas aplicáveis.
- [ ] Vincular itens de escopo a pacotes candidatos e testar a regra dos 100%.
- [ ] Revisar exclusividade, interfaces e ausência de dupla contagem.
- [ ] Completar dicionário dos pacotes que precisem estar prontos para aprovação.
- [ ] Revisão humana de engenharia e aprovação explícita da EAP.
- [ ] Só depois da aprovação, derivar atividades rastreáveis; não gerar atividades ou baseline nesta etapa.

## 7. Evidência e regressão

A execução live de 2026-10-09 leu a árvore local de `OB-ZP1H2K`: 9 nós (raiz + 8 folhas), todos em rascunho; 0 atividades; 0 dependências; 0 versões de orçamento; 0 baselines. A regra dos 100% retornou `indecidivel`, com cobertura `null`, pois não existem itens estruturados de escopo e vínculos escopo↔EAP. A leitura foi somente-leitura e não alterou a obra.

Regressões obrigatórias para a próxima etapa:
- ausência de área/unidades/sistemas não gera números ou itens fictícios;
- cobertura dos 100% permanece indecidível sem denominador e vínculos;
- uma EAP estruturalmente válida não é tratada como EAP aprovada;
- a proposta não escreve nós na base nem cria atividades, orçamento ou baseline;
- nenhuma operação desta tarefa altera `OB-PUPOCN — AURORA TESTE`.

## 8. Decisão proposta

Usar este documento como **base de oficina de escopo**. A EAP candidata deve ser ajustada a partir das respostas e evidências de projeto/contrato; depois, gerar uma proposta formal versionada para revisão humana. Até lá, preservar a EAP atual em rascunho e manter bloqueados aprovação, cronograma e baseline.
