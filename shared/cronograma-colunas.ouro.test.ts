import XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALENDARIO_CORRIDO,
  linhaDoCronograma,
  type EntradaDaLinha,
} from "./cronograma-colunas";

/**
 * O teste-ouro: a planilha profissional contra o motor.
 *
 * POR QUE LER UM ARQUIVO .XLSX NUM TESTE DE UNIDADE
 *
 * Este projeto nasceu da promessa de que a regra mora no motor e a planilha é
 * só a interface. Essa promessa é verificável de um jeito que nenhuma asserção
 * escrita à mão verifica: abrindo a planilha de referência e comparando linha a
 * linha o que o motor produz com o que a planilha diz.
 *
 * Sem isso, o motor e a planilha podem divergir em silêncio. Foi exatamente o
 * que aconteceu quatro vezes nesta semana, em quatro camadas diferentes: o
 * `updatedAt` que não andava, a contagem de nós que dava zero, o `/healthz` que
 * dizia "local", a tela que dizia "Carregando". Nenhum deles era um cálculo de
 * cronograma — e era por isso que nenhuma suite os via. O que faltava era a
 * comparação com a fonte, não mais asserção sobre o próprio código.
 *
 * A PLANILHA COMO INPUT, E O MOTOR COMO ESPERADO
 *
 * A coluna `Fim` da planilha está vazia em todas as linhas de referência,
 * porque quem preenche a planilha não a preenche: ela é derivada. A fórmula está
 * escrita no cabeçalho da aba: `Duracao = (Fim - Inicio) + 1`. Então a planilha
 * NÃO traz o valor esperado de `Fim` — ela traz a REGRA. O que este teste
 * afirma é que o motor aplica a regra escrita no cabeçalho dela.
 *
 * `Fim = Inicio + Duracao - 1` é o mesmo que `Duracao = (Fim - Inicio) + 1`,
 * reescrito com o zero-indexado do motor: o dia 0 é o início.
 *
 * O QUE ESTE TESTE NÃO AFIRMA
 *
 * Não afirma que a engine de fórmulas do Excel produz exatamente estes valores.
 * Não carrega o Excel, não roda VBA, e `xlsx` lê a planilha sem recalcular nada.
 * As células `% Planej.`, `% Real.` e `Status` vêm vazias da planilha, do
 * mesmo jeito que `Fim` vem. O que se compara aqui é a LINHA CRUA — código,
 * atividade, frente, início, duração, quantidade, unidade — contra o que o
 * motor produz a partir dela. A fórmula escrita no cabeçalho é o contrato, e o
 * cabeçalho é lido do arquivo, não copiado para o teste.
 */

const PLANILHA =
  "C:/Users/Correta Engenharia/Desktop/obracopilot_excel/Relatorio_Progresso_Obra_PROFISSIONAL.xlsx";

/** A fórmula está escrita no cabeçalho da aba. Lemos, não reescrevemos. */
function formulaDoCabecalho(): string {
  const linhas = ler("CRONOGRAMA");
  return String(linhas[1]?.[0] ?? "");
}

function ler(aba: string): unknown[][] {
  const wb = XLSX.readFile(PLANILHA);
  return XLSX.utils.sheet_to_json(wb.Sheets[aba], {
    header: 1,
    blankrows: false,
    defval: null,
  }) as unknown[][];
}

/** O número de série que o Excel usa: dias desde 1899-12-30. */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);
function serialParaIso(serial: number): string {
  const ms = EPOCA_EXCEL + serial * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

type LinhaCrua = {
  codigo: string;
  atividade: string;
  frente: string;
  pavimento: string;
  inicio: number;
  duracao: number;
  quantidade: number | null;
  unidade: string;
};

/**
 * As linhas do CRONOGRAMA, pulando cabeçalho, a linha em branco e o TOTAL.
 * Os indices 0-based: 0 titulo, 1 formula, 2 cabecalho, 3+ dados.
 */
function linhasDoCronograma(): LinhaCrua[] {
  const linhas = ler("CRONOGRAMA");
  return linhas
    .slice(3)
    .filter(l => l[0] && typeof l[0] === "string" && l[0] !== "TOTAL")
    .map(l => ({
      codigo: String(l[0]),
      atividade: String(l[1]),
      frente: String(l[2]),
      pavimento: l[3] == null ? "" : String(l[3]),
      inicio: Number(l[4]),
      duracao: Number(l[6]),
      quantidade: l[7] == null ? null : Number(l[7]),
      unidade: String(l[8] ?? ""),
    }));
}

/** O executado, por código, somando a aba PRODUCAO como o SUMIF faz. */
function executadoPorCodigo(): Map<string, number> {
  const producao = ler("PRODUCAO");
  const mapa = new Map<string, number>();
  for (const l of producao.slice(3)) {
    const codigo = l[1];
    const qtd = l[2];
    if (typeof codigo !== "string" || codigo === "TOTAL") continue;
    if (typeof qtd !== "number") continue;
    mapa.set(codigo, (mapa.get(codigo) ?? 0) + qtd);
  }
  return mapa;
}

function entradaDe(cruda: LinhaCrua, executado: number): EntradaDaLinha {
  return {
    codigo: cruda.codigo,
    atividade: cruda.atividade,
    frente: cruda.frente,
    pavimento: cruda.pavimento || null,
    inicio: serialParaIso(cruda.inicio) as EntradaDaLinha["inicio"],
    duracao: cruda.duracao,
    quantidade: cruda.quantidade,
    unidade: cruda.unidade || null,
    executado,
  };
}

// A planilha de referência fica no Desktop, que nao viaja com o repositorio.
// Sem o arquivo, o teste nao falha: ele se declara pulado, e o motivo fica
// escrito. Um teste que reprova por "arquivo ausente" no CI treinaria o time a
// ignorar a propria suite.
const temPlanilha = existsSync(PLANILHA);
const suite = temPlanilha ? describe : describe.skip;

if (!temPlanilha) {
  // eslint-disable-next-line no-console
  console.warn(
    "[teste-ouro] planilha de referencia ausente em " +
      PLANILHA +
      " — a comparacao com a fonte foi pulada."
  );
}

suite("o motor reproduz a planilha de referência", () => {
  it("a planilha de referencia existe e tem as abas que o motor reproduz", () => {
    const wb = XLSX.readFile(PLANILHA);
    expect(wb.SheetNames, "abas da planilha").toEqual(
      expect.arrayContaining(["CRONOGRAMA", "PRODUCAO"])
    );
  });

  it("a planilha escreve a regra que o motor aplica", () => {
    // Se um dia a planilha mudar a fórmula, este teste reprova dizendo que o
    // contrato mudou. E a hora de decidir: o motor ou a planilha.
    const formula = formulaDoCabecalho();
    expect(formula, "a formula sumiu do cabecalho da planilha").toContain(
      "Duracao = (Fim - Inicio) + 1"
    );
    expect(formula).toContain("Produtividade = Quantidade / Duracao");
  });

  it("cada linha da planilha tem inicio e duracao, e a duracao e entrada", () => {
    const linhas = linhasDoCronograma();
    expect(linhas.length, "linhas de dados na planilha").toBeGreaterThan(10);
    for (const l of linhas) {
      expect(Number.isFinite(l.inicio), `${l.codigo} inicio`).toBe(true);
      expect(l.duracao, `${l.codigo} duracao`).toBeGreaterThan(0);
    }
  });

  it("Fim = Inicio + Duracao - 1, em dias corridos, para toda linha", () => {
    // A formula da planilha reescrita: `Duracao = (Fim - Inicio) + 1` vira
    // `Fim = Inicio + Duracao - 1`. E o `-1` e o que o dia 0 do motor exige:
    // sem ele, toda linha terminaria um dia depois.
    for (const cruda of linhasDoCronograma()) {
      const e = entradaDe(cruda, 0);
      const linha = linhaDoCronograma(CALENDARIO_CORRIDO, e.inicio, e);
      const esperado = serialParaIso(
        cruda.inicio + cruda.duracao - 1
      );
      expect(
        linha.fim,
        `${cruda.codigo} (${cruda.atividade}) fim`
      ).toBe(esperado);
    }
  });

  it("Produtividade = Quantidade / Duracao, e nunca o inverso", () => {
    // A ordem importa e a planilha a escreve: a quantidade e o planejado, a
    // duracao e o TEMPO. Dividir ao contrario daria "m3 por dia" virando "dias
    // por m3", que e um numero sem significado em obra.
    for (const cruda of linhasDoCronograma()) {
      if (cruda.quantidade == null || cruda.quantidade <= 0) continue;
      const e = entradaDe(cruda, 0);
      const linha = linhaDoCronograma(CALENDARIO_CORRIDO, e.inicio, e);
      expect(
        linha.produtividade,
        `${cruda.codigo} produtividade`
      ).toBeCloseTo(cruda.quantidade / cruda.duracao, 6);
    }
  });

  it("% Real = SUMIF da PRODUCAO dividido pela quantidade planejada", () => {
    // A planilha diz, na aba PRODUCAO: "O CRONOGRAMA le esta aba por SUMIF".
    // Entao o executado NAO vem da linha do cronograma: vem de lancamentos.
    const executado = executadoPorCodigo();
    for (const cruda of linhasDoCronograma()) {
      const e = entradaDe(cruda, executado.get(cruda.codigo) ?? 0);
      const linha = linhaDoCronograma(CALENDARIO_CORRIDO, e.inicio, e);
      const esperado =
        cruda.quantidade && cruda.quantidade > 0
          ? Math.min(1, (executado.get(cruda.codigo) ?? 0) / cruda.quantidade)
          : 0;
      expect(
        linha.pctReal,
        `${cruda.codigo} (${cruda.atividade}) % real`
      ).toBeCloseTo(esperado, 6);
    }
  });

  it("atividade com 100% executado e Concluido, mesmo se atrasada", () => {
    // A planilha decide pela QUANTIDADE, nao pela data:
    // `=IF(L>=1,"Concluido",IF(L>0,"Em andamento",IF(HOJE>F,"Atrasado",...)))`.
    // `03.02` tem 1080 de 2400 executados (45%) e `02.01` tem 3200 de 3200.
    const executado = executadoPorCodigo();
    const hoje = serialParaIso(47000); // bem depois do fim de toda a planilha
    const concluida = linhasDoCronograma().find(l => l.codigo === "02.01")!;
    const parcial = linhasDoCronograma().find(l => l.codigo === "03.02")!;
    expect(
      linhaDoCronograma(
        CALENDARIO_CORRIDO,
        hoje as EntradaDaLinha["inicio"],
        entradaDe(concluida, executado.get("02.01") ?? 0)
      ).status,
      "100% executado e Concluido, nao Atrasado"
    ).toBe("Concluido");
    expect(
      linhaDoCronograma(
        CALENDARIO_CORRIDO,
        hoje as EntradaDaLinha["inicio"],
        entradaDe(parcial, executado.get("03.02") ?? 0)
      ).status,
      "45% executado e Em andamento, mesmo com a data vencida"
    ).toBe("Em andamento");
  });

  it("o motor le a planilha inteira sem perder nenhuma linha", () => {
    // Guarda de integridade: se o leitor perder a ultima linha ou pular a
    // segunda, os testes acima passam e o motor so conhece parte da obra.
    const codigos = linhasDoCronograma().map(l => l.codigo);
    expect(codigos.length).toBe(14);
    expect(new Set(codigos).size, "codigos repetidos").toBe(codigos.length);
    expect(codigos[0]).toBe("01.01");
    expect(codigos.at(-1)).toBe("07.01");
  });
});

describe("a planilha de referencia nao esta no repositorio", () => {
  it("o caminho esta escrito no teste, e o motivo da ausencia e conhecido", () => {
    // Se este teste rodar e a planilha estiver presente, o `describe` de cima
    // deixa de ser pulado. Se estiver ausente, ele se declara pulado. Em
    // nenhum dos casos o time precisa adivinhar o que aconteceu.
    const fonte = readFileSync(join("shared", "cronograma-colunas.ouro.test.ts"), "utf-8");
    expect(fonte).toContain("PLANILHA");
    expect(PLANILHA).toMatch(/obracopilot_excel/);
  });
});
