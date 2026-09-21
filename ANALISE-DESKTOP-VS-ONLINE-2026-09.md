# Análise desktop versus online — Plataforma Obras

**Data da análise:** 21 de setembro de 2026  
**Commit auditado:** `0ac3647`  
**Repositório:** `ragomes102030-cpu/plataforma-obras`  
**Serviço principal:** `plataforma-obras-api` no Render  
**Documento de continuidade considerado:** plano da Fase 4 fornecido pelo usuário

## Conclusão executiva

A recomendação é **não transformar a Plataforma Obras em um aplicativo desktop puro neste momento**. O sistema deve continuar online, mas não deve permanecer no desenho operacional atual baseado em serviços gratuitos, chamadas síncronas para MCPs remotos e execução do agente dentro do mesmo processo web.

Como o sistema ainda está em construção, **não recomendo pagar infraestrutura agora**. O Render Free e o Aiven Free podem continuar sendo usados para desenvolvimento, homologação e testes, desde que o banco tenha backup e que as limitações de disponibilidade sejam consideradas normais desse estágio. A troca para recursos sempre ativos deve acontecer somente quando houver uso real em produção, necessidade de disponibilidade ou risco operacional que justifique o custo.

A melhor direção técnica de médio prazo é uma **arquitetura híbrida e local-first**:

1. **O online continua como fonte central de colaboração, autenticação, auditoria e sincronização.**
2. **O desktop passa a ser uma camada de operação local**, inicialmente para rascunho offline, EAP, atividades, dependências, CPM, Gantt e exportações.
3. **O agente, os MCPs e as mutações coordenadas permanecem protegidos no backend online** até que as fases de governança, versionamento, transação e sincronização estejam concluídas.

Em termos práticos: **não recomendo um rewrite desktop agora**. Recomendo primeiro estabilizar a implantação online e, em seguida, criar um piloto desktop sem duplicar a fonte de verdade. A Fase 4 do plano pode continuar online, porque ela trata de estados, gates, versões e auditoria. O desktop deve entrar depois como acelerador da operação local, não como substituto imediato da plataforma central.

## O que foi auditado

A implementação atual é uma aplicação web em React/Vite com backend Express/tRPC. O banco principal usa Drizzle com `mysql2` e MySQL. O agente usa um gateway compatível com Chat Completions. A integração com os três MCPs ocorre por HTTP/Streamable HTTP, com sessões MCP, catálogo de ferramentas, retries e circuit breaker.

O Render mostra um serviço web principal no plano gratuito, em uma única instância na região da Virgínia. Os três MCPs também estão no plano gratuito. EAP e Cronograma estão na Virgínia; Gantt/LOB está no Oregon. Os serviços MCP publicados no Render não têm `healthCheckPath` configurado no recurso, embora o código exponha `/healthz`. O arquivo `render.yaml` do serviço principal confirma `plan: free`, `numInstances: 1` e o build que executa migrações antes de compilar a aplicação. [1]

A aplicação principal não possui um banco local no sentido de banco embarcado no computador do usuário. O plano chama o MySQL do Aiven de banco existente e fonte canônica da aplicação. Os MCPs têm domínios separados: EAP e Cronograma podem usar SQLite local quando executados sem variáveis Turso, enquanto em produção utilizam Turso/libSQL para evitar perda de dados no filesystem efêmero do Render. Gantt/LOB é majoritariamente stateless e usa seu banco apenas para histórico de exportações. [2] [3] [4]

## Evidências objetivas dos gargalos atuais

### A aplicação responde, mas a rede já impõe atraso perceptível

Foram feitas chamadas diretas ao serviço público depois do deploy `0ac3647`. O resultado foi:

| Endpoint | Resultado observado |
| --- | --- |
| `/healthz` | HTTP 200 em aproximadamente 2,53–3,27 s |
| `/` | HTTP 200 em aproximadamente 3,48–4,45 s; resposta HTML de 368.430 bytes |
| `/api/trpc/projects.list` sem sessão | HTTP 401 em aproximadamente 2,62–2,92 s |

Esses números não provam que toda a demora venha de um único componente, porque a medição atravessa a rede pública e a instrumentação HTTP do Render retornou séries vazias. Eles provam, porém, que uma operação básica de saúde, sem consulta de obra, já não é imediata. O usuário percebe esse custo antes de chegar ao CPM ou ao agente.

### Os MCPs estão falhando por disponibilidade, não por cálculo

Nos logs do Render, a verificação de status registrou:

- MCP Cronograma: erro 502 depois de **7.392 ms**.
- MCP EAP: erro 502 depois de **7.481 ms**.
- Catálogo de ferramentas: erros 502 para EAP e Cronograma.
- Uma execução do agente terminou como `dados_incompletos` porque a resposta final não cumpriu o contrato de leitura exigido.

O código tenta reduzir o impacto com retries, circuit breaker e fallback para dados locais. Isso é uma boa proteção, mas também confirma que o caminho crítico do agente depende de serviços remotos que podem estar dormindo ou indisponíveis. O plano gratuito do Render suspende um web service após 15 minutos sem tráfego e leva cerca de um minuto para reativá-lo quando chega uma nova requisição. A documentação do Render recomenda o plano gratuito para testes e protótipos, não para aplicações de produção. [5] [6]

O Aiven Free também pode desligar serviços sem atividade contínua. O Aiven para MySQL Free não é coberto pelo SLA de 99,99%, e a documentação informa que serviços gratuitos podem ser desligados por inatividade e religados posteriormente. O próprio plano de continuidade já registrou que o desligamento do MySQL causou o erro `ENOTFOUND`. [7]

### O agente tem um caminho crítico longo e síncrono

A execução do agente começa carregando o catálogo dos três MCPs. Depois chama o LLM e pode fazer até quatro iterações. Dentro de cada iteração, as chamadas de ferramentas são realizadas em sequência. O gateway pode tentar até três provedores configurados, com timeout padrão de 60 segundos por chamada. A execução total tem timeout padrão de 120 segundos.

O navegador não recebe uma resposta progressiva do agente. Ele inicia uma execução, recebe um `requestId` e consulta o status a cada segundo até uma situação terminal. No backend, a execução é disparada no mesmo processo Node que atende a aplicação. Se o processo reiniciar durante a execução, não existe um worker durável que retome automaticamente o trabalho; os registros persistidos ajudam a diagnosticar, mas não transformam a execução em uma fila recuperável.

### O carregamento inicial é maior do que precisa ser

A validação local produziu um bundle JavaScript principal de aproximadamente **1,44 MB** antes da compressão. O build também emitiu avisos para chunks superiores a 500 kB. Entre os maiores arquivos estão Mermaid, Cytoscape, WebAssembly, linguagens de syntax highlighting e o bundle principal.

Isso não é resolvido automaticamente por transformar o sistema em desktop. Um desktop elimina parte do custo de transporte depois da instalação, mas ainda carregará e executará o mesmo bundle. A correção imediata é dividir o código por módulo e carregar sob demanda o Gantt/LOB, diagramas, editor avançado e componentes que não pertencem à primeira tela.

### A base de dados e os MCPs ainda não formam um único domínio transacional

A aplicação principal possui seu MySQL. O MCP de EAP possui seu domínio próprio. O MCP de Cronograma possui outro domínio e registra a referência da EAP como uma string (`eap_ref`), sem validar em tempo real se o nó correspondente existe no MCP de EAP. Gantt/LOB recebe dados no payload e não é a fonte principal do planejamento.

Essa separação pode ser correta do ponto de vista de responsabilidade dos domínios, mas aumenta a necessidade de versionamento, identificadores externos, reconciliação e auditoria. Um aplicativo desktop não elimina essa complexidade. Se cada desktop passar a ter seu próprio banco e seus próprios dados, o risco passa a ser divergência entre cópias locais, conflitos e sincronizações incompletas.

## O que um desktop resolveria e o que não resolveria

| Gargalo ou requisito | Efeito de um desktop local | Tratamento recomendado |
| --- | --- | --- |
| Abertura da interface e navegação do Gantt | Pode melhorar após a instalação, se os módulos e dados estiverem em cache local | Fazer code splitting agora; depois empacotar a operação local |
| CPM, validadores e cálculos determinísticos | Pode ficar praticamente imediato e funcionar sem internet | Extrair e executar o núcleo determinístico localmente |
| Banco MySQL distante | Pode ser substituído por SQLite local para rascunhos | Introduzir sincronização explícita e versionada; não criar duas fontes canônicas sem regra |
| 502 e cold start dos MCPs | Não resolve se o desktop continuar chamando os MCPs no Render | Manter MCPs online always-on, co-localizar regiões ou embarcar apenas cálculos locais |
| Latência do LLM | Não resolve enquanto o LLM continuar em provedor externo | Fila durável, streaming, cache de contexto e respostas locais quando possível |
| Login GitHub, colaboração e auditoria | Desktop exige fluxo OAuth próprio e ainda precisa de servidor central | Manter autenticação e auditoria no online |
| Trabalho em canteiro com internet instável | Resolve bem para dados locais e cálculos já sincronizados | Criar piloto local-first com outbox e reconciliação depois da Fase 4 |
| Chaves de IA, MCP e acesso administrativo | Empacotar segredos no desktop seria inseguro | Manter credenciais exclusivamente no backend |

O ponto decisivo é que os gargalos mais graves identificados são **serviços remotos adormecidos ou distribuídos**, não a capacidade do computador do usuário. Um desktop só resolveria esses gargalos se também levasse para o computador o banco, os MCPs e, eventualmente, o modelo de IA. Isso seria uma mudança de produto e de segurança muito maior do que simplesmente empacotar a tela React.

## Avaliação das três alternativas

### Permanecer online exatamente como está

Esta opção é a menos recomendada. O código está funcional e os testes passam, mas o ambiente gratuito não oferece previsibilidade suficiente para uma plataforma que pretende ser fonte operacional de obras. O custo de cold start aparece no primeiro acesso e os MCPs adicionam pontos independentes de falha. A execução síncrona do agente aumenta a sensação de travamento.

### Migrar tudo para desktop

Também não recomendo agora. O desktop melhoraria o modo offline e os cálculos locais, mas criaria problemas novos: distribuição e atualização do aplicativo, armazenamento local, backup por máquina, login, sincronização multiusuário, conflitos de versão e proteção das credenciais. Além disso, os MCPs atuais foram pensados como servidores HTTP separados. Para obter um desktop realmente independente, seria necessário empacotar ou reescrever esses processos e definir a migração de seus bancos SQLite/Turso.

### Continuar online e adicionar uma camada local-first

Esta é a alternativa recomendada. Ela preserva o que faz sentido ser centralizado e desloca para o cliente local aquilo que se beneficia de baixa latência e funcionamento offline.

A aplicação online deve continuar sendo responsável por usuários, projetos compartilhados, versões aprovadas, decisões, auditoria, sincronização e mutações controladas. O desktop pode manter rascunhos locais, executar EAP e CPM determinísticos, permitir edição de atividades e gerar uma proposta de sincronização. A sincronização deve ser explícita, idempotente e vinculada a uma versão do plano. Ela não deve ser liberada antes dos gates previstos no plano atual.

## Arquitetura recomendada

```text
                         ┌───────────────────────────┐
                         │ Online central             │
                         │ API + MySQL always-on      │
                         │ Auth + auditoria + versões │
                         │ Agente + MCP gateway       │
                         └──────────────┬────────────┘
                                        │ sincronização explícita
                         ┌──────────────▼────────────┐
                         │ Desktop local-first        │
                         │ React empacotado           │
                         │ SQLite local               │
                         │ EAP + atividades + CPM     │
                         │ Gantt + exportação         │
                         │ Outbox versionado          │
                         └───────────────────────────┘
```

O desktop não deve conectar diretamente ao MySQL principal nem possuir as chaves dos provedores de IA ou dos MCPs. Ele deve operar sobre um banco local de rascunho e enviar uma proposta de alteração para o backend. O backend valida a versão, os gates e as permissões antes de aceitar qualquer sincronização.

Tauri seria uma opção adequada para o empacotamento porque permite uma camada desktop mais leve do que um navegador completo, mas a escolha entre Tauri e Electron deve ocorrer somente depois de o contrato local-first estar definido. A decisão de empacotamento não deve conduzir a modelagem de dados.

## Plano de ação recomendado

### Etapa 1 — estabilizar o online antes de adicionar desktop

Enquanto o sistema estiver em desenvolvimento, a prioridade é **conviver conscientemente com os limites gratuitos e reduzir os gargalos no código**, sem contratar infraestrutura. O Render principal, os três MCPs e o MySQL podem permanecer nos serviços atuais para testes. O banco deve continuar sendo o que contém as obras, com backup antes de mudanças e sem criar uma nova base vazia para contornar desligamentos temporários.

Quando o sistema entrar em produção para usuários que dependem dele diariamente, a primeira decisão de infraestrutura será retirar apenas os componentes críticos dos limites gratuitos. Isso pode começar pelo banco e pelos MCPs que apresentarem maior indisponibilidade, em vez de pagar por tudo de uma vez.

Também é necessário configurar `/healthz` como health check dos três MCPs, registrar duração por chamada, status HTTP, nome da ferramenta e `requestId`, e medir p50/p95 por endpoint. A API de saúde do serviço principal não deve ser usada como substituta de uma medição real de `projects.list`, `activities`, `wbs` e das consultas do agente.

### Etapa 2 — reduzir latência sem mudar o produto

O frontend deve carregar o agente, Mermaid, Cytoscape, WebAssembly e componentes de relatório sob demanda. O catálogo de ferramentas MCP deve continuar em cache, mas o cache precisa ter diagnóstico de idade e uma estratégia de fallback que não bloqueie a tela principal. As consultas de obra devem usar payloads mínimos e invalidações específicas.

O agente deve ser convertido em uma execução durável. Uma opção compatível com o schema existente é usar `agent_runs` como registro de execução com lease, heartbeat, tentativas e recuperação após reinício. Em uma etapa posterior, pode-se adotar uma fila dedicada. O navegador deve receber eventos ou fazer polling com backoff, em vez de consultar o status a cada segundo durante toda a execução.

### Etapa 3 — concluir a Fase 4 do plano atual

A Fase 4 deve continuar sendo implementada antes de qualquer escrita coordenada nos MCPs. O backend precisa impedir transições inválidas, associar EAP, atividades e dependências a uma versão do plano e invalidar aprovações dependentes quando a estrutura mudar.

Essa etapa é especialmente importante para a futura sincronização desktop. Sem uma versão coerente do plano, não há como decidir se uma alteração local pode ser aplicada, se deve gerar conflito ou se deve reabrir um gate.

### Etapa 4 — fazer um piloto desktop pequeno

O primeiro piloto não deve tentar embarcar todos os MCPs. Ele deve incluir somente:

- cache e rascunho local da obra;
- EAP e atividades;
- dependências e validadores;
- CPM determinístico;
- Gantt e exportação;
- fila local de alterações ainda não sincronizadas;
- indicador claro de sincronizado, pendente, conflitante ou bloqueado por gate.

Consultas MCP, agente IA e ações de escrita continuam online. Assim, o piloto testa o benefício real do desktop sem transformar a sincronização em um problema de infraestrutura antes da hora.

### Etapa 5 — decidir se o desktop vira principal

Depois do piloto, a decisão deve ser baseada no uso. Se o principal problema for internet instável no canteiro, o desktop pode se tornar a interface operacional primária, com o online como central de sincronização. Se o principal uso for coordenação entre escritório, fiscalização, planejamento e produção em locais diferentes, a interface web deve continuar primária e o desktop deve ser um acelerador opcional.

## Critérios para aceitar a mudança de arquitetura

A adoção do desktop local-first só deve avançar quando houver:

1. uma fonte canônica declarada para cada domínio;
2. versionamento do plano e regra de conflito;
3. backup e restauração testados;
4. sincronização idempotente e auditável;
5. execução local dos cálculos determinísticos validada contra o backend;
6. nenhuma chave secreta distribuída no aplicativo;
7. uma forma de continuar trabalhando quando os MCPs estiverem indisponíveis;
8. testes de isolamento entre obras e usuários;
9. telemetria que diferencie erro local, erro de rede, erro de MCP e erro de LLM.

## Estado da qualidade do código auditado

Após instalar as dependências pelo lockfile, a validação local apresentou:

| Verificação | Resultado |
| --- | --- |
| `pnpm check` | passou |
| `pnpm test --run` | passou — 15 arquivos e 61 testes |
| `pnpm build` | passou |
| `git diff --check` | passou |

Isso reforça a conclusão de que os gargalos percebidos são principalmente de **topologia, disponibilidade, latência, tamanho do frontend e execução distribuída**, e não uma razão suficiente para abandonar o produto web ou iniciar uma reescrita integral.

## Decisão final

**Continuar online, mas mudar a arquitetura operacional para híbrida e local-first.**

Para a fase atual, a decisão financeira é: **continuar usando o gratuito enquanto o sistema está sendo construído**. O trabalho agora deve se concentrar em Fase 4, testes, backups, redução de latência e um eventual piloto local-first. O pagamento de infraestrutura fica condicionado à entrada em produção ou a uma necessidade concreta de disponibilidade.

A ordem recomendada é:

1. manter o gratuito durante o desenvolvimento, com backups e monitoramento;
2. corrigir a disponibilidade e a co-localização dos serviços quando houver necessidade técnica, sem obrigação de contratar agora;
3. reduzir o bundle e tornar o agente durável;
4. terminar a Fase 4 de governança e versionamento;
5. criar um piloto desktop para operação offline e cálculos locais;
6. pagar apenas pelos componentes necessários quando começar o uso real em produção;
7. só então decidir se o desktop será a interface principal do canteiro.

A decisão de hoje, portanto, não é “desktop ou online”. É: **online como núcleo confiável e desktop como camada local de desempenho e continuidade**. Essa escolha resolve os gargalos certos sem perder colaboração, auditoria, segurança e evolução futura.

## Referências

[1]: https://dashboard.render.com/web/srv-dandr7jbc2fs73e2qobg "Render service dashboard da Plataforma Obras"
[2]: https://github.com/ragomes102030-cpu/plataforma-obras "Repositório Plataforma Obras"
[3]: https://github.com/ragomes102030-cpu/mcp-eap-server "Repositório MCP EAP Server"
[4]: https://github.com/ragomes102030-cpu/mcp-cronograma-server "Repositório MCP Cronograma Server"
[5]: https://render.com/docs/free "Render free instance limitations"
[6]: https://render.com/docs/faq "Render FAQ sobre lentidão de serviços gratuitos"
[7]: https://aiven.io/docs/products/mysql/concepts/mysql-free-tier "Aiven for MySQL free tier"
[8]: https://aiven.io/docs/platform/concepts/service-power-cycle "Aiven power cycle e restauração de serviços"
[9]: https://github.com/ragomes102030-cpu/mcp-gantt-lob-server "Repositório MCP Gantt e Linha de Balanço"

Durante o desenvolvimento, “estabilizar o online” significa melhorar o código e os testes sem contratar recursos: cache, fallback, timeouts, logs, carregamento sob demanda, testes locais dos MCPs e backups. Não significa migrar imediatamente para planos pagos.
