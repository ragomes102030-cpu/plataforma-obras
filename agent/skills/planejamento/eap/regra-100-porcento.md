# Skill: Regra dos 100%

A EAP deve representar 100% do trabalho necessário para entregar o escopo definido, sem incluir trabalho fora desse escopo.

## Aplicação

A regra vale em cada nível:
- os filhos representam 100% do escopo do pai;
- não pode existir trabalho relevante fora da EAP;
- não pode haver dupla contagem entre irmãos.

## Validação

A regra dos 100% tem três verificações diferentes e não deve ser confundida:

1. **Cobertura de escopo:** os filhos precisam representar todo o escopo do pai, sem deixar trabalho relevante fora e sem incluir trabalho externo.
2. **Exclusividade:** irmãos precisam ser mutuamente exclusivos; duplicação ou sobreposição representa dupla contagem de escopo.
3. **Quantitativos comparáveis:** quando pai e filhos usam a mesma unidade e o critério de medição permite consolidação, comparar o pai com a soma dos filhos.

O sistema deve diferenciar prova determinística de julgamento de escopo. Hierarquia sozinha não prova 100%: a cobertura precisa de evidência textual, inclusões/exclusões e, quando necessário, revisão técnica.

Quando houver quantitativos comparáveis:
- comparar pai e soma dos filhos;
- verificar unidade e critério de medição;
- apontar diferenças como alerta quando houver arredondamento ou escopo ainda não quantificado;
- bloquear quando houver evidência objetiva de duplicação ou incompatibilidade.

A regra de cobertura não significa que todo nó precise ter quantidade própria imediatamente; níveis intermediários podem ser estruturais e os quantitativos podem existir somente nos pacotes/folhas controláveis.
