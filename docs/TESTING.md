# Camada de testes do Arquimedes

A camada de QA do projeto tem três objetivos: impedir regressões estruturais, validar contratos entre componentes e separar testes determinísticos de homologações que dependem de serviços externos.

## Portas de qualidade

### 1. Determinísticos
Rodam sem LLM real, sem MCP real e sem alteração de banco produtivo.

Cobrem:
- EAP: árvore, pai/filho, órfãos, ciclos, códigos duplicados e regra dos 100% por cobertura de custo.
- Aurora: forma estrutural de referência com 69 nós, 53 pacotes-folha, 15 grupos de nível 2 e uma raiz.
- CPM: FS, SS, FF, SF, lag, ciclos e caminho crítico.
- Gates e versionamento do plano.
- Erros tRPC e isolamento entre obras.
- Provedor LLM: normalização de endpoint, fallback, timeouts e não vazamento de detalhes.
- Orquestrador: contrato de resposta, project_id por domínio, somente leitura, auditoria de falhas, resposta vazia e limite de iteração.
- MCP client: JSON-RPC, sessão, SSE, 429 e timeout.

### 2. Homologação externa
Não deve entrar no pnpm test como requisito de toda PR porque depende de infraestrutura externa.

As rotinas existentes de homologação devem ser executadas separadamente:
- pnpm phase1:battery
- pnpm e2e:fictitious
- pnpm test:aurora para a regressão estrutural determinística da Aurora.

A homologação externa deve ser somente leitura por padrão. Um MCP indisponível é uma condição de diagnóstico, não motivo para alterar dados da obra.

### 3. Gate de release
O comando abaixo reproduz o mesmo gate que o CI deve considerar obrigatório:

    pnpm test:gate

Ele executa:
1. pnpm check
2. pnpm test --run
3. pnpm build

Para investigar rapidamente contratos críticos:

    pnpm test:contracts

Para verificar a regressão estrutural da Aurora:

    pnpm test:aurora

## Regra para novas regressões

Toda falha reproduzível deve virar um teste determinístico antes da correção, sempre que possível.

O fluxo recomendado é:

falha real → caso mínimo reproduzível → teste vermelho → correção → teste verde → documentação

Quando a falha vier de LLM/MCP, o teste deve preferir uma resposta/modelo fake que reproduza o contrato quebrado. Não devemos transformar uma chamada de produção em dependência permanente da suíte unitária.

## Aurora: o que significa verde

A regressão determinística comprova a estrutura da árvore e a regra de cobertura de custo sobre um fixture equivalente ao diagnóstico da Aurora.

Isso não significa que os dados de uma obra real estão aprovados. A aprovação da obra continua dependendo de:
- evidência atual do banco;
- validação estrutural;
- cobertura de orçamento;
- decisão explícita do usuário;
- homologação dos MCPs quando forem necessários.

## Critério de bloqueio

Uma etapa posterior não pode usar um teste verde de componente para mascarar um bloqueio funcional.

Exemplos:
- EAP vazia não é aprovação.
- Validação estrutural válida com dados ausentes não é evidência suficiente.
- MCP offline não deve ser tratado como MCP consultado.
- Resposta textual válida não significa que uma escrita foi executada.
- Fallback de LLM não pode esconder que o provedor primário falhou; a auditoria deve preservar a ocorrência.

## CI

O workflow .github/workflows/ci.yml já executa typecheck, suíte Vitest e build. Os novos testes entram automaticamente na mesma suíte porque o vitest.config.ts inclui server/**/*.test.ts e shared/**/*.test.ts.

A próxima evolução da camada de QA deve adicionar testes de navegador para os fluxos críticos de UI quando a aplicação incorporar um runner de browser dedicado; enquanto isso, a API e os contratos de domínio são testados de forma determinística.