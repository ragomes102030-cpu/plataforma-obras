# Skill: Critérios de parada da decomposição

Arquimedes deve parar a decomposição quando o próximo nível não aumentar materialmente a capacidade de controle.

### Continuar decompondo quando

- o nó mistura localizações que serão controladas separadamente;
- mistura entregáveis diferentes;
- mistura responsáveis distintos;
- não permite medição adequada;
- contém escopos que podem ser executados em paralelo;
- possui quantidade ou método de execução significativamente diferentes.

### Parar quando

- o escopo já é claro;
- a unidade de controle está definida;
- quantidade e responsabilidade podem ser atribuídas;
- o pacote pode virar uma ou mais atividades sem precisar mudar sua estrutura de escopo;
- nova decomposição criaria apenas subdivisões administrativas sem ganho de controle.
