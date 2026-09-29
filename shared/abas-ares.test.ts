import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ABAS_DO_ARES,
  ROTULO_DO_MODULO,
  VISOES_LATERAIS,
  ehAbaDeTrabalho,
  indiceParaAtalho,
} from "./abas-ares";

/**
 * Trava as decisões da casca do ARES.
 *
 * A ordem das abas é contrato com quem já usa a planilha
 * (`CONTINUAR_ARES.md` §4: "ordem das abas canônica — não mudar"). Ela não pode
 * depender de um componente: se viver dentro do TSX, a barra inferior, o
 * atalho de teclado e qualquer leitura de dados passam a ter cópias diferentes,
 * e a primeira a quebrar é justamente a ordem.
 *
 * E o ponto honesto: aba pendente NÃO pode renderizar tela falsa. Foi
 * exatamente a estrutura de mentira do `seedStarterPlan` que produziu "EAP:
 * Concluído" sem nenhuma EAP. Aqui a ausência é explícita.
 */

const casca = readFileSync(join("client", "src", "components", "AresWorkspace.tsx"), "utf-8");
const visao = readFileSync(join("client", "src", "components", "VisaoLateral.tsx"), "utf-8");

describe("as 18 abas, na ordem canônica da planilha", () => {
  it("são 18", () => {
    expect(ABAS_DO_ARES).toHaveLength(18);
  });

  it("têm os rótulos na ordem do ARES 2.0", () => {
    expect(ABAS_DO_ARES.map(a => a.rotulo)).toEqual([
      "DASHBOARD",
      "CADASTRO",
      "FRENTES",
      "EAP",
      "SERVIÇOS",
      "ORÇAMENTO",
      "PLANEJAMENTO",
      "REDE",
      "CAMINHO CRÍTICO",
      "GANTT",
      "RECURSOS",
      "PRODUÇÃO",
      "MEDIÇÃO",
      "CONTROLE",
      "INDICADORES",
      "GRÁFICOS",
      "FÓRMULAS",
      "CONFIGURAÇÕES",
    ]);
  });

  it("têm id único e único", () => {
    const ids = ABAS_DO_ARES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("aba pendente declara o que falta", () => {
  it("toda aba que não está pronta diz o que falta", () => {
    for (const aba of ABAS_DO_ARES) {
      if (aba.status === "pronta") {
        expect(aba.falta, `${aba.rotulo} está pronta, então não deve cobrar nada`).toBeUndefined();
      } else {
        expect(aba.falta, `${aba.rotulo} sem "falta" some da tela sem explicação`).toBeTruthy();
        expect(aba.falta!.length, `${aba.rotulo} com "falta" genérica`).toBeGreaterThan(30);
      }
    }
  });

  it("a casca não desenha tela para aba pendente", () => {
    // Desenhar seria a estrutura de mentira de novo, só que na casca.
    expect(casca).toMatch(/status === "pendente"/);
    expect(casca).toMatch(/AbaVazia/);
  });
});

describe("a casca não calcula nada de planejamento", () => {
  // A auditoria mediu 6 constantes de ms-por-dia, 3 Date.now() e 3
  // defaultCalendar() no navegador. A regra principal proíbe isso; a casca é
  // onde a violação seria mais fácil de reincidir.
  //
  // O código é verificado SEM COMENTÁRIO. Sem isso o teste accuse a própria
  // frase que documenta o defeito — `Date.now()` e `defaultCalendar` estão
  // escritos no cabeçalho deste arquivo de propósito, e um teste que casa
  // comentário se desativa sozinho. Foi o que aconteceu na primeira versão.
  const PROIBIDOS: Array<[RegExp, string]> = [
    [/86400000/, "constante de ms-por-dia"],
    [/86_400_000/, "constante de ms-por-dia (com separador)"],
    [/\bDate\s*\.\s*now\s*\(/, "relógio do cliente"],
    [/\bdefaultCalendar\s*\(/, "calendário padrão no cliente"],
    [/\bnew\s+Date\s*\(/, "data construída no cliente"],
    [/\belapsedWorkingDays\s*\(/, "contagem de dias úteis no cliente"],
  ];

  function semComentario(fonte: string): string {
    return fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\/\/.*$/gm, "");
  }

  for (const arquivo of [
    ["AresWorkspace.tsx", casca],
    ["VisaoLateral.tsx", visao],
  ] as const) {
    const codigo = semComentario(arquivo[1]);
    for (const [padrao, rotulo] of PROIBIDOS) {
      it(`${arquivo[0]} não usa ${rotulo}`, () => {
        expect(codigo, `${arquivo[0]} calcula no navegador`).not.toMatch(padrao);
      });
    }
  }
});

describe("as visões de tela cheia ficam na lateral", () => {
  it("são Gantt, Linha de Balanço e Curva-S", () => {
    expect(VISOES_LATERAIS.map(v => v.rotulo)).toEqual([
      "Gantt",
      "Linha de Balanço",
      "Curva-S",
    ]);
  });

  it("a Linha de Balanço não reaproveita a versão do navegador", () => {
    // A existente é calculada no cliente e é por ATIVIDADE; a da planilha é
    // por SERVIÇO e depende de GAP-02. Mostrar a primeira seria levar a
    // matemática para dentro da interface e chamar de linha de balanço.
    expect(visao).toMatch(/ainda não pode ser calculada/);
    expect(visao).toMatch(/SERVIÇO/);
  });

  it("Gantt e Curva-S reaproveitam as telas que já existiam", () => {
    expect(visao).toMatch(/GanttView/);
    expect(visao).toMatch(/GraficosView/);
  });
});

describe("reaproveitamento e honestidade de navegação", () => {
  it("as abas reaproveitam módulos existentes, sem inventar componente", () => {
    for (const aba of ABAS_DO_ARES) {
      if (aba.status === "pronta") {
        expect(
          ROTULO_DO_MODULO[aba.id],
          `${aba.rotulo} está pronta e precisa dizer qual componente a serve`
        ).toBeTruthy();
      }
    }
  });

  it("aba parcial sem componente é declarada no registro, não descoberta na tela", () => {
    // `parcial` + sem componente = a casca cai em `ModuleView` com um nome que
    // não existe e a tela fica em branco. Ou o registro diz qual componente é,
    // ou a aba tem que ser `pendente`.
    for (const aba of ABAS_DO_ARES) {
      if (aba.status !== "parcial") continue;
      expect(
        ROTULO_DO_MODULO[aba.id],
        `${aba.rotulo} é parcial mas não diz qual componente a serve`
      ).toBeTruthy();
    }
  });

  it("funções do sistema não viram aba de pasta de trabalho", () => {
    // Catálogo é fonte de preço, Agente é assistente, Configurações é do
    // sistema, Portfólio é a lista de obras. Nenhum tem aba na planilha.
    for (const nav of ["Portfólio", "Catálogo", "Agente IA", "Configurações"]) {
      expect(ehAbaDeTrabalho(nav), `${nav} não pode ser aba de trabalho`).toBe(false);
    }
    for (const nav of ["EAP", "Orçamento", "Produção", "Cronogramas"]) {
      expect(ehAbaDeTrabalho(nav), `${nav} é aba de trabalho`).toBe(true);
    }
  });

  it("Ctrl+1..9 e Ctrl+0 seguem a convenção da planilha", () => {
    expect(indiceParaAtalho(0)).toBe("1");
    expect(indiceParaAtalho(8)).toBe("9");
    expect(indiceParaAtalho(9)).toBe("0");
  });
});
