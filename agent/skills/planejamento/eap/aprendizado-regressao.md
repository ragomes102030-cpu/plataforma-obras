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
