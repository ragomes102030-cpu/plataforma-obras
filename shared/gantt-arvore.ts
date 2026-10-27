import type { EntradaDaLinha } from "./cronograma-colunas";
import type { IsoDate } from "./work-calendar";
import { diasEntre } from "./painel-obra";

/**
 * Uma linha da tabela do Gantt. Nó com filhos é etapa (linha de resumo, como no
 * Project): início, fim, duração e avanço são agregados das atividades dentro.
 */
export type NoDoGantt = {
  /** Chave estável na árvore: o próprio código da EAP. */
  chave: string;
  codigo: string;
  nome: string;
  /** 0 = raiz. Usado para indentar e para o nível do "recolher tudo". */
  profundidade: number;
  filhos: NoDoGantt[];
  /** Presente só quando o código existe como atividade de verdade. */
  linha: EntradaDaLinha | null;
  inicio: IsoDate;
  fim: IsoDate;
  /** Duração do intervalo coberto (não a soma das durações), como no Project. */
  duracao: number;
  /** Avanço 0..100, ponderado pela quantidade planejada das atividades-folha. */
  progresso: number;
  critica: boolean;
  temFilhos: boolean;
  /** Marco: data única. Desenha losango, não barra. */
  marco: boolean;
};

function somarDias(iso: IsoDate, dias: number): IsoDate {
  const meiaNoite = Date.parse(`${iso}T00:00:00Z`);
  return new Date(meiaNoite + dias * 86_400_000).toISOString().slice(0, 10) as IsoDate;
}

function compararPorCodigo(a: NoDoGantt, b: NoDoGantt): number {
  return a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
}

/**
 * Monta a árvore da EAP a partir do código de cada atividade: "1.13.2" é filho de
 * "1.13", que é filho de "1". Códigos intermediários que não existem como
 * atividade viram etapas agregadas pelos filhos — é isso que dá o "recolher" do
 * Project.
 *
 * `codigosCriticos` são os códigos que o CPM marcou como caminho crítico.
 */
export function montarArvore(
  linhas: EntradaDaLinha[],
  codigosCriticos: ReadonlySet<string> = new Set(),
  finsCalculados: Readonly<Record<string, string>> = {}
): NoDoGantt[] {
  const raizes: NoDoGantt[] = [];
  const porChave = new Map<string, NoDoGantt>();

  const novoNo = (codigo: string, profundidade: number): NoDoGantt => ({
    chave: codigo,
    codigo,
    nome: "",
    profundidade,
    filhos: [],
    linha: null,
    inicio: "" as IsoDate,
    fim: "" as IsoDate,
    duracao: 0,
    progresso: 0,
    critica: false,
    temFilhos: false,
    marco: false,
  });

  for (const linha of linhas) {
    const codigo = (linha.codigo || "").trim() || "sem-codigo";
    const partes = codigo.split(".");
    let pai: NoDoGantt | null = null;
    let acumulado = "";
    for (let nivel = 0; nivel < partes.length; nivel++) {
      acumulado = acumulado ? `${acumulado}.${partes[nivel]}` : partes[nivel];
      let no = porChave.get(acumulado);
      if (!no) {
        no = novoNo(acumulado, nivel);
        porChave.set(acumulado, no);
        if (pai) pai.filhos.push(no);
        else raizes.push(no);
      }
      pai = no;
    }
    if (pai) {
      pai.linha = linha;
      pai.nome = linha.atividade;
    }
  }

  const folhas = (no: NoDoGantt): NoDoGantt[] =>
    no.filhos.length ? no.filhos.flatMap(folhas) : [no];

  const preparar = (no: NoDoGantt): void => {
    no.filhos.forEach(preparar);
    if (no.filhos.length) {
      no.temFilhos = true;
      if (!no.nome) no.nome = `Etapa ${no.codigo}`;
      return;
    }
    const linha = no.linha;
    if (!linha) return;
    no.inicio = linha.inicio;
    // Marco é ponto: começa e termina no mesmo dia, mesmo que a planilha tenha
    // lançado duração (o banco exige >= 1).
    no.marco = Boolean(linha.marco);
    const fimOficial = finsCalculados[no.codigo];
    // Quando existe, o término do motor (calendário de trabalho, feriados e
    // dependências) é a autoridade. Não reconstituir o fim com dias corridos.
    const fimValido = typeof fimOficial === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(fimOficial) &&
      Number.isFinite(Date.parse(fimOficial+"T00:00:00Z")) &&
      fimOficial >= linha.inicio;
    no.fim = no.marco ? linha.inicio :
      fimValido ? fimOficial as IsoDate :
      somarDias(linha.inicio, Math.max(1, linha.duracao) - 1);
    // Duração é o número de dias de trabalho armazenado, não o intervalo civil.
    no.duracao = no.marco ? 1 : Math.max(1, linha.duracao);
    const quantidade = Number(linha.quantidade) || 0;
    const executado = Number(linha.executado) || 0;
    no.progresso = quantidade > 0 ? Math.max(0, Math.min(100, (executado / quantidade) * 100)) : 0;
    no.critica = codigosCriticos.has(no.codigo);
  };

  const agregar = (no: NoDoGantt): void => {
    no.filhos.sort(compararPorCodigo);
    no.filhos.forEach(agregar);
    const descendentes = folhas(no).filter(item => item.linha);
    if (!descendentes.length) return;
    no.inicio = descendentes.reduce<IsoDate>(
      (menor, item) => (item.inicio && item.inicio < menor ? item.inicio : menor),
      "9999-12-31" as IsoDate
    );
    no.fim = descendentes.reduce<IsoDate>(
      (maior, item) => (item.fim > maior ? item.fim : maior),
      "0000-01-01" as IsoDate
    );
    const intervalo = diasEntre(no.inicio, no.fim);
    no.duracao = Math.max(1, (intervalo ?? 0) + 1);
    let peso = 0;
    let soma = 0;
    for (const item of descendentes) {
      const quantidade = Number(item.linha?.quantidade) || 1;
      peso += quantidade;
      soma += item.progresso * quantidade;
    }
    no.progresso = peso > 0 ? soma / peso : 0;
    no.critica = descendentes.some(item => item.critica);
  };

  raizes.forEach(preparar);
  raizes.sort(compararPorCodigo);
  raizes.forEach(agregar);
  return raizes;
}

/** Achata a árvore no que está visível, respeitando as etapas recolhidas. */
export function linhasVisiveis(arvore: NoDoGantt[], recolhidas: ReadonlySet<string>): NoDoGantt[] {
  const lista: NoDoGantt[] = [];
  const andar = (no: NoDoGantt) => {
    lista.push(no);
    if (!recolhidas.has(no.chave)) no.filhos.forEach(andar);
  };
  arvore.forEach(andar);
  return lista;
}
