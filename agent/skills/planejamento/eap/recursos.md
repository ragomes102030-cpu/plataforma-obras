# Skill: Recursos

Recurso é o que consome tempo e custo para produzir o serviço: mão de obra, material e equipamento.
A ligação entre serviço e recurso vem da composição, não da intuição.

## Origem do recurso

Na plataforma, recursos vêm de `composition_components`, classificado por `componentType`:

- `mao_de_obra` — equipe, encargos, horas;
- `material` — insumo aplicado, com perdas;
- `equipamento` — máquina/ferramenta, com produtividade e disponibilidade.

O coeficiente do componente é a quantidade de recurso por **uma** unidade do serviço. Multiplicar
pelo quantitativo do item e depois pelo número de repetições na obra dá o recurso total.

## Alocação

1. Recurso é alocado na atividade que o consome, com data (não só com total do projeto).
2. Um recurso pode atender várias atividades, mas não pode ter a mesma hora contada duas vezes no
   mesmo período — conflito de alocação precisa aparecer.
3. Equipe alocada acima da disponibilidade é erro de planejamento, não detalhe.
4. Equipamento crítico (grua, bomba, munck) é restrição: sua indisponibilidade muda a sequência,
   não só o custo.

## Curva de recursos

- Histograma por período é o teste de viabilidade do cronograma: picos e vales mostram o que o
  canteiro não sustenta.
- Nivelamento (nivelar sem alongar o prazo) e compressão (antecipar recurso para reduzir prazo)
  são decisões diferentes — dizer qual está sendo aplicada.
- Pico de mão de obra concentrado em poucos dias costuma ser artefato de cronograma mal
  sequenciado, não realidade de obra.

## Limite do modelo atual

`componentType` não tem a opção "serviço", então composição composta por outra composição não se
desdobra em recursos automaticamente. Nesse caso, registrar a lacuna em vez de assumir o recurso.

## Sinais de alerta

- atividade com duração e sem nenhum recurso associado;
- recurso sem preço/custo unitário;
- equipe maior que o efetivo disponível;
- mesmo equipamento em duas frentes no mesmo dia;
- curva de recursos com pico isolado sem justificativa;
- material lançado sem perda nem unidade coerente.

## Saída esperada

Por atividade e período: recurso, tipo, quantidade, unidade, custo unitário, custo total, fonte do
índice e conflitos detectados.
