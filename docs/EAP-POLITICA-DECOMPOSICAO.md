# Política de decomposição da EAP — Arquimedes

## Decisão

A EAP do Arquimedes é uma árvore hierárquica de escopo com **profundidade adaptativa**.

Não existe regra fixa de:

`fase → disciplina → subdivisão → serviço`

nem obrigação de quatro níveis.

A decomposição continua enquanto o detalhamento acrescentar capacidade real de **definir, estimar, programar, executar e controlar** o escopo.

## Regras permanentes

1. **Regra dos 100%**  
   Os filhos de cada nó devem representar todo o escopo do pai, sem trabalho faltante e sem trabalho fora do pai.

2. **Profundidade variável**  
   Dois ramos da mesma EAP podem terminar em níveis diferentes. Um ramo pode terminar em 2 níveis e outro em 4 ou mais, desde que ambos sejam suficientemente controláveis.

3. **Pacote de trabalho é terminal**  
   `pacote` não pode possuir filhos. Se ainda houver trabalho relevante para decompor, ele ainda é um grupo/estrutura de escopo.

4. **Entrega terminal**  
   `entrega` não recebe filhos na EAP.

5. **Critério de decomposição explícito**  
   Cada nível de irmãos deve ter uma base coerente, como `phase`, `system`, `discipline`, `location`, `component` ou `deliverable`.

6. **Não misturar critérios sem justificativa**  
   Misturar, no mesmo conjunto de irmãos, critérios como localização e sistema é alerta de qualidade. O sistema não deve bloquear automaticamente, porque pode existir uma justificativa de engenharia, mas o engenheiro precisa revisar.

7. **Parada por controle, não por profundidade**  
   O Arquimedes deve parar a decomposição quando o elemento puder ser tratado como pacote de trabalho controlável. Não deve criar níveis artificiais apenas para padronizar a aparência.

8. **Localização é dimensão, não obrigação de nível**  
   Pavimento, bloco, torre, trecho ou setor podem ser parte da EAP quando isso for a melhor forma de controlar o escopo. Caso contrário, devem permanecer como atributo/dimensão de planejamento.

9. **EAP não é cronograma**  
   Duração, datas e dependências não definem a hierarquia da EAP. Elas entram em Atividades e Dependências.

10. **EAP não é orçamento**  
    Quantidade, composição e preço não devem ser usados para inventar ou forçar a árvore. O orçamento deve consumir a EAP aprovada.

## Como o Arquimedes deve decidir onde parar

Para cada nó candidato a folha, o agente deve perguntar internamente:

- O escopo está suficientemente claro?
- O pacote possui fronteiras de inclusão/exclusão?
- É possível atribuir responsabilidade?
- É possível medir/estimar o trabalho posteriormente?
- É possível transformar o pacote em atividades sem precisar criar outra camada de escopo?
- A decomposição adicional realmente melhora o controle?

Se a resposta for sim para o controle do pacote, **para**.

Se ainda houver dois ou mais trabalhos distintos que precisarão ser controlados separadamente, **decompõe**.

## Obrigatório na criação e consolidação de uma EAP

O Arquimedes não deve parar na macroestrutura quando o fluxo pedir uma EAP completa. Depois de propor os grupos principais, deve expandir os ramos até folhas controláveis, respeitando o limite e a evidência do escopo.

Antes de dizer que uma EAP está consolidada, o Arquimedes deve:

1. Revisar cada folha da árvore, não apenas contar nós ou preencher o dicionário.
2. Identificar títulos e descrições que agrupam entregáveis, componentes ou locais controláveis separadamente.
3. Converter o pai em `grupo` e criar filhos quando houver fronteiras claras e cobertura integral do pai.
4. Manter como folha provisória aquilo que não pode ser separado sem uma decisão de projeto; registrar o dado faltante e por que impede a decomposição.
5. Confirmar que grupos têm filhos, pacotes e entregas são terminais, e que irmãos não deixam lacunas nem duplicam escopo.
6. Reabrir visualmente a árvore após gravar: remover filtros de busca e expandir os grupos para que a revisão mostre os filhos recém-criados.

**Validação estrutural não equivale a consolidação técnica.** “0 bloqueios”, dicionário completo ou contagem de folhas não provam cobertura integral nem controle adequado. O relatório final deve distinguir estrutura validada, conteúdo revisado e pendências de projeto.

Decomposição provisória é aceitável quando o próprio escopo nomeia os entregáveis, mas o projeto ainda não define suas soluções. Nesses casos, os filhos registram apenas os limites conhecidos e ficam explicitamente pendentes. Não criar sistemas típicos, materiais, métodos, pavimentos, quantidades ou critérios de aceitação que o escopo não sustenta.

## Falha de síntese depois de uma operação

Uma resposta final vazia do modelo não desfaz nem invalida o resultado de uma ferramenta. O runtime deve fazer uma única tentativa adicional de síntese, sem ferramentas. Se ela também não produzir texto:

1. Para aplicação de EAP, informar sucesso somente quando o retorno confirmar a gravação e a releitura persistida; usar contagens e validação desse retorno.
2. Se a persistência não foi confirmada ou a ferramenta retornou erro, dizer isso com clareza e orientar a recarregar a EAP antes de repetir, para evitar duplicidade.
3. Nunca repetir automaticamente uma mutação por causa de resposta vazia do modelo.
4. Manter aprovação da EAP e criação de baseline fora da síntese automática.

Esse comportamento permite ao engenheiro continuar o planejamento mesmo quando o provedor não redige a conclusão, sem transformar uma falha de linguagem em sucesso presumido ou em uma segunda gravação.

## Exemplo correto

```text
1. Estrutura
├── 1.1 Fundação
│   ├── 1.1.1 Blocos
│   │   ├── 1.1.1.1 Forma
│   │   ├── 1.1.1.2 Armadura
│   │   └── 1.1.1.3 Concretagem
│   └── 1.1.2 Baldrames
│       └── 1.1.2.1 Concretagem
└── 1.2 Estrutura superior
    ├── 1.2.1 Pilares
    ├── 1.2.2 Vigas
    └── 1.2.3 Lajes
```

O ramo de Blocos foi decomposto mais profundamente porque a execução e o controle justificam a separação. Pilares, Vigas e Lajes podem terminar antes.

## Exemplo incorreto

```text
1. Estrutura
└── 1.1 Fundação
    └── 1.1.1 Fundação
        └── 1.1.1.1 Fundação
```

Criar níveis sem acrescentar uma nova fronteira de escopo é decomposição artificial.

## Responsabilidade do Arquimedes

O Arquimedes pode **propor** a árvore e explicar o critério utilizado.

O engenheiro pode editar, mover ou aprofundar a EAP.

A aprovação deve ocorrer somente depois da validação estrutural e da revisão das alertas de cobertura/sobreposição.

## Regra de passagem

O encadeamento de governança da EAP é:

**Escopo → proposta da EAP → revisão/dicionário → validação → aprovação da versão → revalidação da versão aprovada.**

A EAP aprovada é a estrutura de referência do planejamento detalhado. Depois dela, quantitativos e custos são associados aos pacotes aplicáveis; atividades são definidas para programar a execução; duração pode ser fundamentada diretamente ou calculada com quantidade e produtividade válida. Dependências e CPM fecham a rede de prazo. Essas frentes são integradas e podem ser refinadas em ciclos; não há uma regra universal de que o orçamento inteiro precise preceder a definição de atividades ou o contrário. A baseline do cronograma só é capturada depois de revisar a rede e calcular um CPM consistente. A EAP aprovada não é, por si só, baseline do cronograma.
