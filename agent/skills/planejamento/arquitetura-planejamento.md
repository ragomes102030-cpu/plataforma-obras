# Skill — Arquitetura do Planejamento
Modo: independente

## Objetivo
Decidir quais componentes de planejamento precisam existir para uma obra e como eles se relacionam.

## Método
Mapear:
escopo → EAP → pacotes → quantitativos → custos → recursos → atividades → predecessoras → cronograma → medição → controle.

## Contratos que devem ser preservados
Para qualquer transição entre módulos, definir:
- identificador/versionamento da origem;
- campos obrigatórios e condicionais;
- evidências de cada valor;
- estado do dado;
- validações de entrada e saída;
- dependências;
- autoridade para aprovação;
- trilha de auditoria.

Ao projetar/copiar EAP, não usar projeções parciais para validação. Campos exigidos pelo padrão aprovado, incluindo decompositionBasis, devem atravessar API, serviço, Skill, MCP, armazenamento e interface.

## Versionamento
- Versão aprovada é histórica e não deve ser alterada diretamente.
- Nova etapa de trabalho deriva de uma versão aprovada em nova versão editável.
- Ao aprovar uma nova versão, versões aprovadas anteriores devem ser marcadas como superseded, preservando histórico e auditoria.
- A versão corrente deve ser determinada por regra explícita, não por uma suposição visual da interface.

## Gating
Não modelar um único "bloqueado por estrutura" para todos os problemas.
Separar, no mínimo:
- falha estrutural da EAP;
- dicionário/escopo incompleto;
- dado quantitativo ausente;
- duração/produtividade ausente;
- dependência/precedência inválida;
- cálculo não executável;
- integração/MCP indisponível;
- erro de ambiente/produto.

## Saída
Mapa de dependências, lacunas, dados necessários, validadores, módulos/MCPs requeridos e contratos entre as etapas.

## Regra
Uma tela, endpoint ou MCP não constitui planejamento completo. O domínio só é considerado coberto quando conhecimento, dados, validação, revisão, auditoria, versionamento e integração existirem.
