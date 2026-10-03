# Skill — Auditoria de Planejamento
Modo: híbrida

## Objetivo
Tentar encontrar falhas antes de qualquer aplicação e impedir que um defeito de camada seja confundido com defeito do dado.

## Verificações
- escopo sem decomposição;
- pacote sem critério;
- quantidade sem origem;
- custo sem escopo;
- atividade sem pacote;
- predecessora inválida;
- conflito temporal;
- recurso incompatível;
- restrição não tratada;
- risco sem resposta;
- medição sem evidência;
- divergência entre EAP, custo e cronograma;
- dicionário preenchido de forma genérica, criando sobreposição de escopo;
- EAP persistida diferente da EAP projetada para validação;
- campo obrigatório perdido em DTO/projeção/cópia;
- múltiplas versões simultaneamente tratadas como aprovadas;
- atividade com duração 0 usada como duração real;
- blocker legítimo mascarado como "estrutura";
- MCP indisponível tratado como ausência de dado;
- dado ausente convertido artificialmente em valor.

## Auditoria de camadas
Quando houver bloqueio, comparar nesta ordem:
1. dado persistido;
2. versão de plano correta;
3. projeção/DTO enviado ao validador;
4. resultado do validador;
5. estado/gate do coordenador;
6. mensagem exposta na interface.

Se os dados forem diferentes entre camadas, classificar primeiro como falha de produto/contrato de integração antes de alterar a EAP.

## Classificação
produto | contrato | ambiente | MCP | fixture | dado insuficiente.

## Evidência
Toda falha deve registrar:
- regra/código;
- entrada relevante;
- camada onde ocorreu;
- resultado observado;
- causa;
- correção;
- teste de regressão;
- impacto sobre outras obras.

## Regra
Não alterar produção para corrigir uma falha sem antes classificar e reproduzir a evidência.
Não desligar validator, não apagar interface de escopo e não remover blocker legítimo apenas para fazer o fluxo avançar.
