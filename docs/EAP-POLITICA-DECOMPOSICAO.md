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

A sequência permanece:

**Escopo → EAP → Dicionário → Quantitativos → Orçamento → Atividades → Dependências → CPM → Baseline**

A EAP aprovada é a estrutura de referência das etapas seguintes.
