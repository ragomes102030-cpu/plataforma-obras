# Codebase Memory MCP — Inteligência de Código

## O que é
MCP server que indexa o repositório em um grafo de conhecimento (tree-sitter + SQLite),
permitindo consultas estruturais sub-ms: call graphs, dependências, rotas, arquitetura.

- Pacote: `codebase-memory-mcp@0.11.0` (npm, MIT) — https://github.com/DeusData/codebase-memory-mcp
- Parser: tree-sitter (162 linguagens) | Storage: SQLite | Sem LLM

## Instalação
```bash
npm install -g codebase-memory-mcp@0.11.0
codebase-memory-mcp --version   # 0.11.0
```

## Indexação
```bash
codebase-memory-mcp cli --progress index_repository \
  --repo-path "C:/Users/Correta Engenharia/po-develop" --mode moderate
```

### Projetos indexados nesta máquina (2)

| Projeto | Root | Branch | Nós | Arestas | DB |
|---|---|---|---|---|---|
| `C-Users-Correta-Engenharia-po-develop` | `C:/Users/Correta Engenharia/po-develop` | develop-merge | **3.080** | **6.688** | 12,8 MB |
| `C-Users-Correta-Engenharia-po-seinfra` | `C:/Users/Correta Engenharia/po-seinfra` | fix/P4-seinfra-docs | **2.980** | **6.431** | — |

Índice em `~/.cache/codebase-memory-mcp/<nome-projeto>.db`. Tempo por indexação: ~7-12s.
Linguagens (po-develop): TypeScript 153, SQL 10, YAML 4, CSS 4, HTML 1.

Node labels: Variable 865, Function 656, Section 531, Type 303, File 233, Module 232,
EnvVar 69, Method 53, Interface 40, Folder 37, Table 36, Class 12, Route 11.

Edge types: DEFINES 2729, USAGE 1784, CALLS 996, IMPORTS 559, CONTAINS_FILE 233,
CONFIGURES 104, SEMANTICALLY_RELATED 73, FILE_CHANGES_WITH 42, WRITES 31, THROWS 15.

Hotspots: server.db.getDb (31), client.src.lib.utils.cn (22), client.src.main.fetch (22),
server.qa.complete-eap-qa-fixture.node (10), server.construction.eap-validator.validateEap (9).

## Tools (17)
index_repository, search_graph, query_graph, trace_path, get_code_snippet,
get_file_outline, get_graph_schema, compare_graphs, get_architecture, search_code,
list_projects, delete_project, index_status, check_index_coverage, detect_changes,
manage_adr, ingest_traces

## Uso via CLI
```bash
codebase-memory-mcp cli --json get_architecture \
  --project "C-Users-Correta-Engenharia-po-develop" --aspects all
codebase-memory-mcp cli --json list_projects
```

## Registro no Hermes (config.yaml)
```yaml
mcp_servers:
  codebase-memory:
    command: codebase-memory-mcp
    args: []
    description: Code intelligence - grafo do codigo (tree-sitter), 18 tools
    timeout: 180
    connect_timeout: 60
```
Validado: `hermes mcp test codebase-memory` -> Connected, 17 tools.

## Como o Arquimedes usa
| Necessidade | Ferramenta |
|---|---|
| "Quem chama esta função?" | trace_path |
| "Qual a arquitetura?" | get_architecture |
| "Onde está definido X?" | search_graph |
| "Ler o código de X" | get_code_snippet |
| "O que mudou no último commit?" | detect_changes |
| "Ler arquivo inteiro" | read_code_file (local) |

Read-only por natureza — indexa e serve, nunca modifica código.

## Limitações
1. Runtime nativo baixado no postinstall (requer `npm install-scripts approve`)
2. Índice local em `~/.cache/codebase-memory-mcp/` — no Render (Linux) exige reindexar
3. `auto_index = false` por padrão — rodar index_repository após mudanças estruturais
4. 7 arquivos com parse parcial (SQL do drizzle), best-effort
