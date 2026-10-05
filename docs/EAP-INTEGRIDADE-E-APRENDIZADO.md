# Controle de integridade da EAP e aprendizado do Arquimedes

Última atualização: 2026-10-05

## Objetivo
Documento obrigatório antes de avançar da EAP para Atividades. Registra os incidentes da AURORA TESTE (OB-PUPOCN) e transforma cada falha em regra permanente, teste de regressão e critério de liberação.

> Nunca considerar uma EAP aprovada apenas porque existe uma versão estruturalmente válida no banco. A validação deve usar uma única versão de planejamento válida e explicitamente identificada.

## 1. Fluxo oficial da EAP
1. Escopo da obra
2. Proposta de EAP
3. Revisão pelo engenheiro
4. Validação estrutural
5. Revisão de dicionário e cobertura
6. Aprovação explícita da versão
7. Aplicação/seleção da versão aprovada
8. Revalidação da mesma versão
9. Só então liberar Atividades
10. Depois: duração/quantitativos/produtividade → dependências → CPM → calendário/baseline → Gantt/LOB.

Não criar atividades antes de existir uma EAP aprovada e revalidada.

## 2. Regra de versionamento
wbs_nodes é versionado por project_plan_versions.id.

Consultas de EAP não podem usar somente wbs_nodes.projectId = X quando existem múltiplas versões. A consulta correta deve primeiro determinar a versão de planejamento aplicável e depois filtrar wbs_nodes.projectId = X AND wbs_nodes.versionId = VERSION_ID.

Quando a operação exige EAP aprovada, deve usar a versão aprovada válida, não uma versão histórica.

### Regra de ouro
Nunca executar validateEap() com todos os nós do projeto quando existem múltiplas versões.

## 3. Incidente Aurora: 69 falsos erros de duplicidade
### Sintoma
A interface mostrou 138 nós, 106 folhas, 69 bloqueios estruturais e códigos EAP duplicados.

### Diagnóstico
A Aurora possuía duas versões contendo a mesma EAP: versão 3 com 69 nós/53 folhas e versão 5 com 69 nós/53 folhas. O validador recebeu as duas versões simultaneamente. Assim, 69 + 69 = 138 nós, 53 + 53 = 106 folhas e cada código apareceu duas vezes.

A EAP da versão atual não estava corrompida. A consulta estava incorreta.

### Correção permanente
A rota validateWbsStructure passou a verificar acesso, determinar a versão de planejamento atual, carregar somente os wbs_nodes dessa versão e executar validateEap() somente nesse conjunto.

Commit relacionado: f00df4b3e2d171491439cecf79bf5e2e6176a762.

Também foi corrigido o estado da Aurora para que a versão histórica anterior não permaneça como outra versão aprovada concorrente.

## 4. Regra de não mistura de histórico
Toda rotina que lê EAP, atividades ou dependências por projeto deve declarar explicitamente o escopo de versão.

Isso vale para validação da EAP, árvore EAP, snapshot de planejamento, atividades, dependências, geração de atividades, validações do agente, relatórios, indicadores e qualquer getEapTree ou fonte equivalente.

Proibido: consultas equivalentes a where projectId = projectId quando a tabela possui versionId e existem versões de planejamento.

Obrigatório: resolver a versão uma vez e reutilizar o mesmo versionId no conjunto de dados da operação.

## 5. Validação estrutural
A validação deve verificar, no mínimo:
- uma raiz;
- hierarquia coerente;
- ausência de ciclos;
- códigos EAP únicos dentro da versão;
- ausência de irmãos duplicados;
- folhas sem filhos;
- nós intermediários com filhos;
- tipo de nó coerente;
- níveis coerentes;
- pacotes de trabalho identificados corretamente;
- campos obrigatórios do dicionário conforme a regra de negócio.

Ausência de responsável, localização, quantitativo ou produtividade não deve virar automaticamente erro estrutural. Deve ser classificada como bloqueio, alerta, pendência de cobertura ou dado ainda não informado, conforme o estágio.

O sistema não deve fabricar valores para deixar a validação verde.

## 6. EAP aprovada não significa cronograma pronto
Após aprovação: EAP → Atividades → Duração → Dependências → CPM.

Uma folha da EAP não precisa necessariamente virar exatamente uma atividade. Um pacote como Alvenaria de vedação pode originar marcação, execução, vergas/contravergas, encunhamento e inspeção.

A atividade só pode ser criada quando houver duração informada ou quando duração puder ser calculada por quantidade + produtividade válida.

Não usar duração padrão artificial de 1 dia.

## 7. Guardas já implementadas
O backend deve bloquear criação/geração de atividades quando:
- não existe EAP aprovada;
- a versão aprovada é estruturalmente inválida;
- os nós usados não pertencem à versão aprovada;
- a duração não foi fornecida nem pode ser calculada por quantidade + produtividade.

A geração a partir da EAP também deve selecionar somente os nós da versão aprovada.

## 8. Regressão obrigatória da Aurora
A regressão scripts/regression-aurora-eap.mjs deve permanecer no repositório.

Critérios mínimos:
- obra AURORA TESTE;
- versão aprovada explicitamente localizada;
- 69 nós;
- 53 folhas/pacotes;
- 1 raiz;
- 15 grupos de nível 2;
- códigos únicos;
- nenhum irmão duplicado;
- folhas sem filhos;
- campos essenciais do dicionário presentes;
- nenhuma atividade antes da etapa de planejamento de atividades;
- nenhuma dependência antes dessa etapa.

A regressão é somente leitura. Não alterar a obra para fazer o teste passar.

## 9. Critério de passagem para Atividades
Todos devem ser verdadeiros:
- versão correta identificada;
- versão aprovada;
- nós isolados por versionId;
- 0 bloqueios estruturais;
- códigos únicos na versão;
- árvore coerente;
- 1 raiz;
- folhas sem filhos;
- dicionário conforme regra do estágio;
- regressão automatizada;
- UI e backend mostram o mesmo estado.

Não avançar para Atividades se UI e backend discordarem.

## 10. Protocolo de aprendizado do Arquimedes
Todo incidente de homologação deve virar quatro coisas:
1. registro do incidente: sintoma, causa raiz, impacto e correção;
2. regra permanente;
3. teste de regressão;
4. barreira no produto.

O Arquimedes não deve apenas lembrar que houve um erro. O conhecimento precisa estar codificado em documentação + teste + regra de execução.

## 11. Histórico desta homologação
### Incidente A — versões históricas misturadas
Causa: leitura por projectId sem versionId.
Efeito: 138 nós e 69 falsos bloqueios de código duplicado.
Correção: validação version-scoped.
Lição: histórico nunca entra automaticamente na validação operacional.

### Incidente B — atividades criadas sem duração válida
Causa: geração de atividades a partir da EAP sem duração fundamentada.
Efeito: atividades inválidas e necessidade de limpeza.
Correção: remoção das atividades inválidas da versão de teste e guarda de duração no backend.
Lição: EAP aprovada não autoriza cronograma artificial.

### Incidente C — versão draft concorrente
Causa: existência de versão draft duplicada após ciclos de teste.
Correção: remoção da versão draft sem uso e manutenção da versão aprovada válida.
Lição: versões de planejamento precisam de estado explícito e uma regra clara de versão corrente/aprovada.

### Incidente D — obras de teste aparecendo junto da Aurora
Causa: estado de soft-delete e consulta da lista de obras não estavam alinhados com a intenção da homologação.
Correção: somente Aurora permanece ativa; demais obras de teste foram para a lixeira, sem exclusão física.
Lição: exclusão deve ser reversível por padrão e a lista ativa deve filtrar deletedAt IS NULL.

## 12. Checklist obrigatório antes de qualquer próxima etapa
- identificar projectId;
- identificar versionId;
- confirmar status da versão;
- contar nós somente daquela versão;
- contar folhas somente daquela versão;
- validar códigos somente daquela versão;
- validar estrutura;
- comparar backend × UI;
- executar regressão;
- registrar resultado;
- somente então avançar.

## 13. Regra para futuros agentes
Se aparecerem números inesperados como 138 em vez de 69, 106 em vez de 53, duplicidades exatamente iguais ao tamanho de uma versão ou histórico aparecendo na versão corrente, não corrigir os dados primeiro.

Primeiro verificar o escopo da consulta.

Pergunta obrigatória: "Estou lendo uma única versão de planejamento ou estou misturando histórico?"

Essa regra impede que o Arquimedes altere uma EAP correta para corrigir um erro causado pelo próprio leitor.

## Estado em 2026-10-05
AURORA TESTE: EAP estruturalmente sem bloqueios na interface.

Próxima etapa: somente após confirmação automatizada e backend/UI alinhados, iniciar definição de Atividades.

Não alterar a estrutura da Aurora para mascarar falhas de leitura ou validação.
