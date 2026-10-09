# Skill: self-improving-agent

## Objetivo
Transformar falhas e descobertas do Arquimedes em melhorias rastreáveis e regressões, sem autoalteração silenciosa das regras de produção.

## Quando usar
Após falha, contradição, resposta truncada, erro de ferramenta, resultado incorreto ou descoberta reutilizável.

## Ciclo obrigatório
observação -> evidência reproduzível -> classificação (produto/contrato/ambiente/MCP/fixture) -> hipótese de causa -> correção candidata -> teste de regressão -> revisão -> deploy -> verificação live -> aprendizado validado.

## Registro
Guardar data, obra/ambiente de QA, sintomas, causa confirmada ou hipótese, commit, teste, deploy, evidência, confiança e status.

## Limites
Uma observação isolada é candidata, não regra global. Não gravar aprendizados sensíveis da obra como conhecimento global. Nunca usar memória como estado atual ou autorização de mutação.
