# Skill: aprendizado e regressão da EAP

## Propósito
Transformar falhas e descobertas da EAP em conhecimento reutilizável sem permitir que uma observação isolada altere o comportamento global.

## Modo
INDEPENDENTE — não depende de MCP. Pode receber evidência produzida por validadores locais, QA, MCPs ou revisão humana.

## Ciclo
observação -> evidência -> candidato -> validação -> regra validada -> regressão.

## O aprendizado deve registrar
- problema observado;
- causa classificada;
- correção;
- evidência;
- escopo;
- confiança;
- teste de regressão;
- status.

## Regra
Fixture defeituosa não é automaticamente defeito de produção. Antes de criar uma regra, separar produto, contrato, ambiente, MCP e fixture.


## Regressão QA — proposta EAP com contrato parcial (2026-10-08)
- **Problema observado:** ao abrir uma obra QA sem EAP e clicar em “Gerar proposta com Arquimedes”, a interface caiu no ErrorBoundary com `Cannot read properties of undefined (reading 'filter')`.
- **Causa classificada:** contrato de UI permissivo demais para o retorno de `eapArquimedesReview/analisarEapComArquimedes`; a proposta pode existir sem algumas coleções opcionais e o componente tratava `nodes` e outras listas como sempre definidas.
- **Correção:** normalizar `nodes`, `basis`, `assumptions`, `missingInformation` e `validation.issues` para listas vazias antes de usar `length`, `map` ou `filter`.
- **Evidência:** reprodução determinística em QA via Playwright; stack apontou o componente `AbaEap`, função de cálculo de estatísticas da proposta, durante `useMemo`.
- **Escopo:** somente interface da proposta inicial da EAP; não altera dados da AURORA.
- **Teste de regressão:** reproduzir geração da proposta com payload parcial e verificar ausência de erro de página/ErrorBoundary; depois validar proposta completa e fluxo de aprovação.
- **Status:** correção commitada na branch `develop`; aguardando publicação no ambiente oficial para regressão E2E.
