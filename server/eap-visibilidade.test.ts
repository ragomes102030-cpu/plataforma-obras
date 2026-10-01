import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrato de criação de obra:
 * a obra nasce com a descrição do cliente e uma versão de plano em rascunho,
 * mas SEM uma EAP genérica pré-preenchida. A primeira estrutura deve ser
 * proposta pelo Arquimedes e revisada pelo engenheiro.
 */
const router = readFileSync(join("server", "routers.ts"), "utf-8");
const home = readFileSync(join("client", "src", "pages", "Home.tsx"), "utf-8");
const abaEap = readFileSync(join("client", "src", "components", "AbaEap.tsx"), "utf-8");
const catalogView = readFileSync(
  join("client", "src", "components", "CatalogView.tsx"),
  "utf-8"
);

function corpoDoCreate(): string {
  const inicio = router.indexOf("\n    create: protectedProcedure");
  expect(inicio, "projects.create não existe").toBeGreaterThan(-1);
  const fim = router.indexOf("\n    createDemoGantt:", inicio);
  return router.slice(inicio, fim === -1 ? inicio + 9000 : fim);
}

describe("nova obra começa sem EAP genérica", () => {
  it("projects.create não chama o seeder da EAP", () => {
    expect(corpoDoCreate()).not.toMatch(/semearEapDoCatalogo\s*\(/);
    expect(corpoDoCreate()).not.toMatch(/seedStarterPlan\s*\(/);
  });

  it("projects.create mantém a descrição do cliente para o planejamento", () => {
    expect(corpoDoCreate()).toMatch(/descricao:\s*input\.descricao/);
  });

  it("projects.create cria a versão inicial do plano em rascunho", () => {
    expect(corpoDoCreate()).toMatch(/status:\s*"draft"/);
    expect(corpoDoCreate()).toMatch(/EAP_PROPOSTA/);
  });
});

describe("a EAP vazia prioriza Arquimedes", () => {
  it("oferece proposta do Arquimedes antes do template genérico", () => {
    expect(abaEap).toMatch(/analisarEapComArquimedes/);
    expect(abaEap).toMatch(/Gerar proposta com Arquimedes/);
    expect(abaEap).toMatch(/Usar estrutura-base/);
  });

  it("não aplica a proposta automaticamente", () => {
    expect(abaEap).toMatch(/NÃO APLICADA/i);
    expect(abaEap).toMatch(/proposta é somente uma recomendação técnica/i);
  });

  it("mantém o caminho manual para o engenheiro", () => {
    expect(abaEap).toMatch(/Montar manualmente/);
    expect(abaEap).toMatch(/createWbsNode/);
  });
});

describe("a ausência de base é visível e diz o caminho", () => {
  it("a aba EAP mostra o caminho quando a obra não tem estrutura", () => {
    // O caminho é: importar a planilha da SEINFRA no Catálogo e gerar a EAP
    // daqui. A tela nomeia os dois passos, em vez de oferecer um botão que
    // nada faz.
    expect(abaEap).toMatch(/catálogo[\s\S]*não define sozinho/i);
    expect(abaEap).toMatch(/Catálogo/);
  });

  it("a aba EAP oferece gerar do catálogo, com seletor de tipo", () => {
    expect(abaEap).toMatch(/generateEapFromCatalog/);
    expect(abaEap).toMatch(/Refazer|Gerar/i);
    expect(abaEap).toMatch(/generateEapFromCatalog/);
  });

  it("o Catálogo é alcançável pela barra de título", () => {
    // Onde o caminho é offering precisa existir. A versão anterior apontava
    // `setActiveNav("Catálogo")`, que era o despacho de módulo; agora o
    // destino é um botão da barra de título.
    expect(home).toMatch(/destino === "catalogo"/);
    expect(home).toMatch(/>\s*Catálogo\s*</);
  });
});

describe("o Catálogo se explica em termos do que destrava", () => {
  it("o onboarding cita a planilha oficial e a consequência de não importar", () => {
    expect(catalogView).toMatch(/Planos de Serviços/);
    expect(catalogView).toMatch(/sem ela, a obra é criada sem EAP/i);
  });

  it("o texto do formulário de fonte não afirma que a importação é futura", () => {
    // Dizia "Importação CSV/XLSX entra na próxima evolução" ao lado de um
    // formulário de upload já funcional: a tela se contradizia.
    expect(catalogView).not.toMatch(/entra na próxima evolução/i);
  });
});

describe("a importação diz qual dos tres arquivos da SEINFRA chegou", () => {
  /**
   * Trecho do `catalog.importPriceSheet`: da procedure até a próxima.
   * Janela fixa de caracteres não serve — a mutation tem ~90 linhas e o
   * `aviso` do fim ficava fora dela. E não pode ser `indexOf("Procedure")`:
   * o nome da procedure está logo no início da busca.
   */
  function corpoDoImport(): string {
    const inicio = router.indexOf("importPriceSheet");
    expect(inicio, "importPriceSheet nao existe no router").toBeGreaterThan(-1);
    const resto = router.slice(inicio);
    const proxima = resto.slice(1).search(/\n {4}\w+: (protected|public)Procedure/);
    return proxima === -1 ? resto : resto.slice(0, proxima + 1);
  }

  it("reconhece a planilha antes de decidir o que fazer com ela", () => {
    expect(corpoDoImport()).toMatch(/reconhecerPlanilhaSeinfra/);
  });

  it("recusa o arquivo de Composicoes dizendo o que ele e", () => {
    // Antes devolvia "cabecalho nao identificado": verdadeiro e inutil, porque
    // aquele arquivo nao e uma tabela de precos, e um relatorio de composicoes.
    expect(corpoDoImport()).toMatch(/planilha === "composicoes"/);
    expect(corpoDoImport()).toMatch(/Planos-de-Servi/);
  });

  it("a Tabela de Insumos importa, mas avisa que nao gera EAP", () => {
    // Os 11.828 itens entram corretos e nao ha nenhum servico: sem este aviso o
    // usuario fica achando que a obra vai nascer com estrutura.
    expect(corpoDoImport()).toMatch(/planilha === "insumos"/);
    expect(corpoDoImport()).toMatch(/aviso:/);
  });

  it("a UI mostra o aviso da importacao", () => {
    expect(catalogView).toMatch(/importResult\.aviso/);
  });
});
