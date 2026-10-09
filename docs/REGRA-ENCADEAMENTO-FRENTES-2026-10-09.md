# Regra de encadeamento entre frentes de obra

**Autor:** AionUi Butler (Equipe Arquimedes) · **Data:** 2026-10-09 · **Base:** worktree `po-develop` @ `dcc8626`
**Motivo:** a obra AURORA TESTE (`OB-PUPOCN`, projectId 7) tem 53 atividades e 64 dependências distribuídas em **8 cadeias isoladas** — cada frente encadeia dentro de si, nenhuma ligação entre frentes. O CPM está aritmeticamente correto e enganoso: o caminho crítico reportado (12 atividades, folga 0) é **um dos 8 componentes**, não o prazo da obra. O validador `disconnected_network` **detecta e bloqueia** esse sintoma; ele não sabe a resposta, porque a resposta não é de código — é de planejamento.

> Escopo deste documento: **definir a regra que um engenheiro de planejamento usa** para decidir se existe vínculo entre duas atividades/frentes, com que tipo e com que lag. Não é proposta de automação; a seção 8 diz apenas o que o sistema pode legitimamente derivar, uma vez declarada a premissa.

---

## 1. Princípio: a EAP é escopo, não sequência

A Estrutura Analítica do Projeto é uma **decomposição de escopo**. A numeração `1.2 → 1.3 → 1.4` informa *o que* existe e *a que pacote pertence* — **nunca em que ordem se executa**. Sequência é um modelo distinto: a **rede de precedências**.

No PMBOK/PDM, os vínculos de precedência se classificam por origem:

| Origem | Natureza | Exemplo |
|---|---|---|
| **Obrigatória / mandatória (hard)** | Restrição física, técnica ou contratual. Não é escolha. | Estrutura antes da alvenaria; cura do concreto antes da desforma. |
| **Discricionária (soft)** | Preferência da equipe sobre uma ordem possível entre outras. **Precisa ser declarada e justificada.** | "Preferimos concluir o pavimento 1 antes de subir o 2". |
| **Externa** | Depende de terceiro/marco fora do controle da obra. | Licença de supressão vegetal; desligamento de concessionária. |

Consequência prática: derivar vínculo da EAP é um erro de categoria. Foi esse o erro que produziu as 8 cadeias da AURORA.

---

## 2. Regra de decisão

Para um par de grupos de trabalho **A** (frente/pacote *i*) e **B** (frente/pacote *j*):

> **Existe vínculo A→B se e somente se ao menos UMA das cinco condições abaixo for verdadeira.**

### (a) Precedência física/técnica no mesmo local — hard
B **não pode fisicamente** iniciar antes de A concluir, ou antes de A atingir um marco parcial.

- Sequência típica de serviços no mesmo local: `limpeza/desobstrução → demolição → escoramento/reforço quando aplicável → estrutura → alvenaria → instalações → acabamento`.
- **A direção do vínculo depende do método executivo, não da EAP.** Em intervenção em edificação existente, o **escoramento precede a demolição**; em área livre, a **limpeza precede a demolição**. Duas obras com a mesma EAP têm ordens opostas. É por isso que nenhuma inferência automática a partir da árvore pode acertar.

### (b) Fluxo de equipe/equipamento — discricionária de recurso
Se **a mesma equipe ou o mesmo equipamento** executa A e B, existe vínculo entre os setores por onde esse recurso passa:

- `SS + lag`, com **lag = ritmo (takt)** — a equipe inicia o setor seguinte mantendo o ritmo;
- `FS` — quando o recurso **precisa concluir** o setor para se deslocar (equipamento de grande porte, içamento, mob-demob intermediária).

Se são **equipes distintas**, **não existe vínculo por esse motivo** — e as frentes podem ser paralelas legitimamente.

### (c) Interface / handoff entre pacotes — hard no ponto de entrega
Existe vínculo `FS` **no ponto de entrega de A para B**, com **critério de aceitação explícito**: "área entregue limpa e desobstruída, cotas conferidas, medido, liberado para a equipe seguinte".

- É exatamente o caso de **`1.2.2 Limpeza` → `1.2.3 Demolições`**: a limpeza **entrega** o local para a demolição. Hoje `1.2.3` não tem antecessora **nem dentro da própria frente 1.2** — o handoff intra-frente está ausente.
- Interface sem critério de aceitação é vínculo frágil: a aceitação é o que define o *ponto* do vínculo.

### (d) Restrição legal / contratual / externa
Marco de terceiro que condiciona o início ou a liberação: licença ambiental, desligamento de água/energia, entrega de projeto executivo, liberação de órgão fiscalizador, marco de medição/faturamento. Vínculo com o **marco** (FS ou SS+lag).

### (e) Dependência de informação — é restrição, não vínculo de rede
"Preciso do projeto executivo de instalações antes de cotar/furar."

- No Last Planner, isto é uma **restrição (constraint)** — condição de prontidão a ser resolvida antes do compromisso da tarefa.
- **Não** deve virar vínculo `FS` da rede física: isso contamina o caminho crítico com tempo de escritório e produz folga falsa.

### Se nenhuma das cinco for verdadeira

**Não criar vínculo.** Frentes em locais distintos, com equipes distintas, sem interface de entrega e sem marco comum são **legitimamente paralelas**. "Multi-raiz é válido" — o defeito da AURORA não é ter 8 raízes, é **não ter premissa declarada** (e nem o esqueleto contratual da seção 3).

---

## 3. Esqueleto contratual — obrigatório mesmo com frentes independentes

Toda obra tem **um início** e **um fim**:

- **início:** mobilização/canteiro (na AURORA, `1.1.1 Mobilização e canteiro`, ES = 0);
- **fim:** desmobilização/entrega.

Toda frente, **inclusive as paralelas**, deve estar **ancorada a esses dois marcos**:

```
1.1.1 Mobilização ──► [início da frente n] ──► ... ──► [término da frente n] ──► Entrega/Desmobilização
```

Isso **não é invenção de lógica**: é o contrato. Sem esse frame, o prazo da obra não é o resultado do sequenciamento — é o **máximo das cadeias paralelas**. Na AURORA esse frame não existe: as 8 cadeias não se ligam nem a `1.1.1` nem à entrega, e é por isso que os "16 meses" não emergem do CPM.

---

## 4. Tipo de vínculo e lag

Escolhido o vínculo (seção 2), define-se **tipo** e **lag**. O tipo errado é defeito tão grave quanto o vínculo ausente.

| Tipo | Significado | Quando usar |
|---|---|---|
| `FS` | B exige A **concluída**. | Liberação total da área; handoff completo. |
| `SS + lag` | B inicia quando A atinge um ponto. | **Tipo dominante em obra civil**: alvenaria inicia com a 1ª laje desformada; elétrica acompanha a alvenaria de um pavimento. |
| `FF (+lag)` | B fecha junto/com A. | Pintura fecha após o reboco **do mesmo ambiente/pavimento**; acabamento acompanha a estrutura. |
| `SF` | B só termina quando A inicia. | Praticamente inexistente em obra. **Não usar.** |

**Lags técnicos são duração física, não folga.** Precisam ser explícitos e justificados pelo método/norma:

- cura do concreto: 7 dias (desforma parcial) / 28 dias (resistência de projeto, protensão);
- desforma de lajes e vigas, remoção de escoramento;
- cura de argamassa de assentamento e de revestimento;
- secagem de reboco/contrapiso antes de revestimento final;
- estabilização/adensamento de aterro e compactação em camadas;
- tempo de pega/endurecimento de impermeabilização antes da proteção mecânica.

> **Defeito simétrico a vigiar:** forçar `FS` onde caberia `SS` **infla o prazo** e falsifica o caminho crítico. A AURORA erra por *falta* de vínculo; o erro oposto (serializar o que pode ser sobreposto) mente igual, só que para o outro lado.

---

## 5. A formalização: matriz LOCAL × SERVIÇO (setor × trade)

O encadeamento entre frentes se resolve com duas definições de planejamento — **não** com a EAP:

1. **Setorização** — a partição física do empreendimento: bloco, pavimento, eixo, trecho, ambiente.
2. **Plano de ataque / alocação de recursos** — quais equipes e equipamentos existem e **como percorrem os setores**.

Com (1) e (2) declarados, os vínculos **derivam** de forma determinística:

| Relação | Regra | Tipo |
|---|---|---|
| Mesmo setor, serviços em sequência (trade sequencing) | matriz fixa de serviços: limpeza → demolição → estrutura → alvenaria → instalações → acabamento | `FS` (ou `SS` quando a prestação libera área parcial) |
| Mesmo serviço, setores consecutivos, **mesma equipe** | fluxo (linha de balanço / takt) | `SS + lag = takt`, ou `FS` se o recurso precisa concluir para deslocar |
| Mesmo serviço, setores não consecutivos, **equipes distintas** | independência total | **sem vínculo** |
| Marcos (mobilização, entrega, licenças, medição) | esqueleto contratual e externos | `FS` / `SS+lag` sobre o marco |

Corolário: uma obra com **uma equipe por serviço** percorrendo A→B→C **gera naturalmente** a cadeia que falta na AURORA. Uma obra com **equipe dedicada por setor** não gera cadeia nenhuma — **e está correta assim**.

---

## 6. Fontes de verdade (de onde a premissa sai)

O sistema não pode inventar a premissa; pode **cobrar e registrar** a fonte:

1. **Memorial descritivo / especificação técnica** — sequência executiva obrigatória.
2. **Projeto executivo e suas notas** — é onde mora a ordem contraintuitiva (ex.: escoramento antes da demolição).
3. **Método executivo / plano de ataque** — nº de equipes, nº de frentes simultâneas, ordem de ataque.
4. **Restrições ambientais, legais e de concessionárias**.
5. **Cronograma contratual / marcos de medição**.
6. **Composições SINAPI/TCPO** — revelam precedências embutidas na composição do serviço.
7. **Alocação de equipes e equipamentos** — determina o fluxo (seção 5).

---

## 7. Aplicado à AURORA

As 8 raízes cobrem as frentes `1.1`, `1.2`, `1.6`, `1.7`, `1.9` e `1.13.1-3` — e `1.2.3` não tem antecessora **nem dentro da própria frente**, onde `1.2.2 Limpeza` existe.

**Duas perguntas ao engenheiro — e só elas — fecham o caso:**

- **Q1 — Qual é a setorização?** O que é "frente" nesta obra: bloco, pavimento, eixo ou trecho?
- **Q2 — Quantas equipes/equipamentos por serviço existem e como percorrem os setores?**

Com Q1 e Q2 respondidas, derivam-se:

- **intra-frente:** `1.2.2 Limpeza → 1.2.3 Demolições` por handoff com critério de aceitação (seção 2c);
- **inter-frente:** `1.2 → 1.3 → 1.4` por fluxo de equipe (seção 2b) — `SS+lag=takt` ou `FS`, conforme o recurso precise ou não concluir para deslocar;
- **esqueleto:** `1.1.1 → frentes → entrega` (seção 3);
- **sem vínculo:** frentes com equipes distintas e locais distintos.

Sem Q1 e Q2, **qualquer ligação é chute** — e chutar `FS` é pior que deixar paralelo, porque finge precisão no caminho crítico.

---

## 8. Regra de produto (o que o sistema pode e não pode derivar)

1. **Exigir a premissa declarada** antes de liberar o cronograma: setorização, alocação de equipes/equipamentos e método executivo onde a ordem é contraintuitiva.
2. **Derivar vínculos da premissa** (matriz local×serviço + fluxo + marcos + handoffs) — **nunca** da numeração da EAP.
3. **Marcar todo vínculo não-hard como PROVISÓRIO**: autor, data, premissa textual e "revisar quando". Visível no Gantt e no relatório de vínculos; promovido a firme quando a premissa é confirmada.
4. **Sem informação suficiente: não criar e pedir a premissa.** É exatamente o comportamento que o `disconnected_network` agora força — bloquear, não adivinhar.
5. **Vigiar o defeito inverso**: `FS` falso alonga prazo e esconde sobreposição legítima.
6. **Conectividade PDM é consequência, não objetivo**: fora os terminais, cada atividade deve ter ao menos uma predecessora e uma sucessora — mas conexões sintéticas para "fechar" a rede são o erro que este documento existe para evitar.

## 9. Critério de aceitação de um vínculo (checklist por ligação)

Um vínculo só é legítimo se puder ser justificado por **uma** destas frases, com a fonte:

- "B não pode fisicamente iniciar antes de A concluir" → **(2a)**, fonte: método/especificação.
- "A entrega a área para B, com critério de aceitação X" → **(2c)**, fonte: plano de ataque/qualidade.
- "É a mesma equipe/equipamento, e o deslocamento/ritmo impõe a ordem" → **(2b)**, fonte: alocação de recursos.
- "O marco M (terceiro/contrato) condiciona B" → **(2d)**, fonte: contrato/licença.
- "Depende de informação, não de execução" → **(2e) → restrição, não vínculo de rede.**

Faltando a frase, o vínculo **não existe** — e a lacuna deve aparecer como pendência de premissa, não ser preenchida por automatismo.
