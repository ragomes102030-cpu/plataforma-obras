# Skill: find-skills

## Objetivo
Encontrar e selecionar habilidades úteis para a tarefa atual sem instalar ou carregar tudo indiscriminadamente.

## Quando usar
Quando o usuário pedir novas skills, capacidades, ferramentas, especialistas ou melhorar as habilidades do agente.

## Procedimento
1. Traduzir o pedido em capacidades observáveis e critérios de sucesso.
2. Inventariar primeiro o que já existe no repositório e no runtime.
3. Comparar candidatos por relevância, manutenção, segurança, custo, dependências e licença/origem.
4. Adaptar princípios úteis ao domínio da Plataforma Obras; não copiar instruções incompatíveis nem introduzir dependência externa sem necessidade.
5. Separar skill documental, skill carregada em runtime e ferramenta executável: uma não implica a outra.
6. Ativar por roteamento contextual e limitar o número de skills por rodada.

## Saída
Tabela curta: capacidade, quando ativa, origem/implementação, teste e limitações.

## Limites
Não alegar que uma skill foi instalada/ativada se só foi documentada. Não permitir que skills autorizem gravações, ignorem validação ou contornem aprovação humana.
