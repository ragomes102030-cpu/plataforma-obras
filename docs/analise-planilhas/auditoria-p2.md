# Auditoria Individual — P2: `Planilha-de-Relatorio-de-Progresso-de-Obra(3).xlsx`

- **Arquivo**: 495.286 B · 4 abas · 933 fórmulas · template Microsoft de relatório de progresso
- **Obra-amostra**: PRÉDIO BEAUTY - ANDAR 1 · Construtora Budd · Ricardo Lanny Budd · início 17/09/2026
- **Natureza**: template genérico de relatório semanal/diário — **não é modelo relacional de domínio**

---

## 1. Visão geral das abas

| Aba | Dim (l×c) | Fórmulas | Papel | Estado |
|-----|-----------|----------|-------|--------|
| Cronograma em Gantt | 5000×520 | 933 | Gantt **diário** (8 semanas visíveis) | Contém `#REF!` |
| EAP Física - Serviços | 5000×52 | 0 | Catálogo **físico** de escopo (viabilidade→entrega) | Lista estática |
| EAP Orçamento - Serviços | 5000×52 | 0 | Catálogo **orçamentário** (códigos 4 dígitos) | Lista estática |
| Sobre | 45×21 | 0 | Metadados do template | **Aba protegida** (SHA-512), zoom 85 |

---

## 2. Cronograma em Gantt (aba principal)

### Estrutura
- Col A: instruções de template (leitor de tela, legenda, dica de uso)
- Col B–H: identificação (título, empresa, responsável, início, semana-exibição)
- Linha 4: **8 semanas** em colunas I→BL (`I4:BF4` / datas)
- Barras diárias sob cada semana (col I→…, 520 colunas totais)
- Formatação condicional: cores por status / progresso
- Destaque de **hoje** em `#AD3815`
- Fases (grupo) + TAREFA + ATRIBUÍDO PARA + PROGRESSO % + INÍCIO + TÉRMINO

### Escala
- **1 coluna = 1 dia** (diário)
- Janela rolável de **8 semanas**
- Progresso = `%` digitado (sem FK para produção/medição)

### Defeitos
- Presença de `#REF!` (referências quebradas no template)
- Fórmulas de template não avaliadas pelo leitor CLI (`#OCLI_NOTEVAL!`)

---

## 3. EAP Física - Serviços

### Estrutura
| Coluna | Conteúdo |
|--------|----------|
| Referência | Hierarquia decimal `1`, `1.1`, `1.1.1`… |
| Descrição | Texto livre da atividade |

### Escopo coberto (ciclo de vida completo)
1. Viabilidade  
2. Projeto  
3. Projeto Legal  
4. … (desenvolvimento → execução → entrega)

- **0 fórmulas** — lista de referência pura
- **Único entre as 3 planilhas** a cobrir **fase pré-obra** (viabilidade/projeto/legal)
- Não tem QTD, UN, preço, frente, local — é **checklist de escopo**, não WBS de execução

---

## 4. EAP Orçamento - Serviços

### Estrutura
| Coluna | Conteúdo |
|--------|----------|
| Código | 4 dígitos: `1`, `1001`, `2001`, `3001`… |
| Descrição | Categoria de custo |

### Grupos de custo (numeração estilo SIUC / CAU)
| Prefixo | Grupo |
|---------|-------|
| `1` / `1xxx` | DESPESAS INICIAIS |
| `2xxx` | SERVIÇOS TÉCNICOS |
| `3xxx` | INSTALAÇÕES PROVISÓRIAS |
| … | (demais grupos do catálogo) |

- **0 fórmulas** — taxonomia de custos, **não tem valores**
- **Não é WBS de escopo** — é agrupador orçamentário
- Não alinhada aos códigos `ORC-xxx` de P1

---

## 5. Sobre

- Metadados do template (versão, autor, instruções)
- **Proteção SHA-512** — conteúdo não extraível por leitura simples
- Zoom 85

---

## 6. Comparação com P1/P3

| Aspecto | P2 | P1 | P3 |
|---------|----|----|-----|
| Tipo | Template de relatório | Sistema LOB/CPM completo | Relatório executivo enxuto |
| Gantt | **Diário** (8 sem, hoje destacado) | Semanal | Mensal |
| EAP | Duas listas estáticas (física + orçamento) | WBS relacional 3 níveis | Não tem (atividades no cronograma) |
| Escopo pré-obra | **Sim** (viabilidade→legal) | Não | Não |
| Progresso | `%` manual por responsável | Produção/Medição estruturadas | Produção → %Real via SUMIF |
| Fórmulas | 933 (só na aba Gantt) | ~1.660 | 117 |

---

## 7. O que vale extrair para o produto

### Portar (UX / conteúdo)
- **Gantt diário** com janela de 8 semanas e destaque de hoje — referência de UX
- **EAP física de ciclo de vida** (viabilidade→entrega) — feature ausente no produto (fase pré-obra)
- **EAP orçamentária 4 dígitos** — vocabulário de categorias de custo a mapear para ORC/grupos P1
- Instruções de acessibilidade/leitor de tela do template
- Coluna ATRIBUÍDO PARA (responsável por tarefa)

### Não portar
- Proteção de aba (SHA-512)
- `#REF!` residual
- Fórmulas de template acopladas a ranges fixos
- Progresso manual sem trilha de auditoria (substituir por produção/medição)

---

## 8. Avaliação como referência

**Pontos fortes**
- Melhor **UX de Gantt diário** das três
- Única a cobrir **ciclo de vida pré-obra**
- Vocabulário orçamentário numérico pronto para classificação de custos
- Foco em **relatório semanal** (comunicação com cliente)

**Pontos fracos**
- Sem modelo relacional (sem IDs, FKs, validação)
- Progresso manual (não rastreável)
- Template com `#REF!` e proteção
- Não modela medição, recursos, precedências

**Veredito**: **referência de UX e de catálogos de fase/custo**; não serve como fonte de verdade de domínio relacional.
