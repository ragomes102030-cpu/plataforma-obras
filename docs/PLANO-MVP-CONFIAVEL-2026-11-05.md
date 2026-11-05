# MVP confiável de planejamento assistido — 05/11/2026

## Objetivo e limite

Fechar o ciclo de planejamento da Escola (obra 25) e corrigir barreiras que também atingem novas obras. Critério de funcionamento: escopo → EAP aprovada → múltiplas atividades por pacote → dependências → CPM persistido → baseline congelada → consulta do cronograma e acompanhamento com dados confirmados.

Os dados da Escola são didáticos. Aprovar uma versão de teste não valida projetos, quantitativos, preços, licenças ou requisitos normativos de uma construção real. O sistema deve explicitar o que falta, sem substituir ausência de informação por zero.

## Diagnóstico comprovado

- Em produção `12e780d`, Escola possui 30 atividades e 39 dependências. Os vínculos existem.
- EAP v8 possui 37 nós e 27 folhas. Aprovação foi gravada e relida ao vivo; o cabeçalho continuou bloqueado por cache antigo de `planning.list`.
- O gate do coordenador procurava um código de erro que o validador da rede não emite. Redes inválidas podiam aparecer como válidas nesse resumo.
- A correção PR333 eliminava qualquer exclusão do pai que citasse um filho. Isso ocultava também contradições reais; a regra precisa ser retirada.
- A comparação da baseline podia reutilizar a mesma linha para duas atividades com código EAP igual.
- A baseline visual convertia índices usando início/calendário atuais, mudando a fotografia depois de uma reprogramação.
- Folhas do tipo `pacote` apareciam como Grupo; criação sequencial de atividades podia ser bloqueada após o primeiro fork.
- O dashboard da Escola exibia execução zero e desvio apesar de não haver lançamentos confirmados; valores didáticos apareciam como EV.

## Execução e critérios de aceite

1. **Coerência do fluxo:** invalidar todas as leituras afetadas por aprovação, vínculos e CPM. Próximo passo deriva do plano persistido. Aceite: EAP aprovada não continua pendente em outra aba; erro de consulta aparece como erro.
2. **Rede diagnosticável:** o gate e a aba Dependências usam o mesmo validador operacional do CPM, preservando exclusão de QA. Aceite: ciclo, referência ausente e rede desconectada não recebem estado verde.
3. **EAP utilizável em novas obras:** reconhecer pacotes terminais e permitir atividades sucessivas quando o escopo corrente for equivalente ao aprovado. Aceite: criar duas atividades sequenciais sem aceitar nós históricos ou escopo alterado.
4. **Baseline confiável:** matching um para um; capturar datas civis na mesma transação da fotografia, com evento auditável. Aceite: nova atividade não herda datas de outra; mudança posterior de início/calendário não move barras congeladas. Legado sem datas congeladas deve declarar indisponibilidade da sobreposição.
5. **Indicadores honestos:** sem produção confirmada não há realizado/desvio apurado; orçamento didático não habilita EV real. Aceite: Escola mostra claramente as faltas de dados; produção confirmada zero é distinguida de nenhuma medição.
6. **Homologação e publicação:** testes focados, suíte, TypeScript, build, CI e versão live; reler EAP/dependências/baseline após reload. Falha de build ou de fluxo interrompe a publicação para correção.

## Limite de lançamento

O aceite desta rodada é um MVP de planejamento assistido com controle dependente de dados confirmados. A cobertura financeira da Escola exige resolver as três atividades sem orçamento e substituir o rateio didático por quantitativos e preços rastreáveis. Essas pendências não serão apagadas pelo código nem apresentadas como custos reais.

## Evidência final

Registrar no fechamento o commit publicado, resultado dos testes, aprovação e baseline relidas, contagem de vínculos e pendências restantes de dados. Não declarar plataforma completa de controle de obra com pendências financeiras reais.
