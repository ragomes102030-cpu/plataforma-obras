import { describe, expect, it } from "vitest";
import { extrairTrilha, parseSeinfraRows } from "./seinfra";

/**
 * A hierarquia do `Planos-de-Servicos-028---ENC.-SOCIAIS-114,15.xls` é a
 * informação que faz a EAP sair com as peças na ala certa. Sem ela o motor
 * classifica pela palavra solta da descrição e erra (ver `eap-hierarquia`).
 *
 * As linhas abaixo reproduzem a estrutura real da planilha 028, com os nomes de
 * capítulo, subgrupo e serviço copiados dela.
 */
const TRECHO_DO_PLANOS_DE_SERVICOS: unknown[][] = [
  [null, null, "TABELA UNIFICADA SEINFRA"],
  [null, null, "028 - ENC. SOCIAIS 114,15%", "BDI: 0,00%"],
  ["ITEM", "CÓDIGO", "DESCRIÇÃO", null, null, "UNIDADE", "PREÇO UNITÁRIO"],
  ["1", "SERVICOS PRELIMINARES", null, null, null, null, 130764.04],
  ["1.1", "SONDAGENS", null, null, null, null, 6269.76],
  ["1.1.1", "C2820", "EXECUÇÃO DE SONDAGEM ELÉTRICA VERTICAL AB/2 ATÉ 150m - SEV", null, null, "UN", 623.05],
  ["1.1.2", "C2818", "EXECUÇÃO DE SONDAGEM ELÉTRICA VERTICAL AB/2 >150m a 500m-SEV", null, null, "UN", 797.17],
  ["6", "FUNDAÇÕES E  ESTRUTURAS", null, null, null, null, 0],
  ["6.1", "TUBULÕES A CÉU ABERTO", null, null, null, null, 0],
  ["6.1.1", "C0825", "CONCRETAGEM DE BASE DE TUBULÃO À CÉU ABERTO", null, null, "M3", 1687.25],
  ["6.5", "FORMAS", null, null, null, null, 0],
  ["6.5.1", "C4158", "FORMA METÁLICA P/ PILAR", null, null, "M2", 198.82],
  ["16", "INSTALAÇÕES HIDRÁULICAS", null, null, null, null, 0],
  ["16.3", "TUBOS E CONEXÕES DE PVC", null, null, null, null, 0],
  ["16.3.1", "C1525", "JOELHO 90 PVC SOLD./ROSCA. D= 20mmX1/2\"", null, null, "UN", 12.0],
  ["30", "SERVIÇOS DIVERSOS", null, null, null, null, 0],
  ["30.2", "LIMPEZA FINAL", null, null, null, null, 0],
  ["30.2.1", "C1625", "LIMPEZA DE PISOS E REVESTIMENTOS", null, null, "M2", 41.0],
];

describe("hierarquia da planilha oficial", () => {
  const r = parseSeinfraRows(TRECHO_DO_PLANOS_DE_SERVICOS, "Planos-de-Servicos-028.xls");

  it("lê a coluna CÓDIGO, e não a numeração hierárquica da coluna ITEM", () => {
    // A coluna ITEM é "1.1.1" e não existe no catálogo. Ler ela como código
    // fazia o serviço não casar com `C...` e a EAP nascer vazia mesmo com a
    // base importada.
    const codigos = r.records.map(x => x.code);
    expect(codigos).toEqual(["C2820", "C2818", "C0825", "C4158", "C1525", "C1625"]);
  });

  it("as linhas de agrupamento viram hierarquia, e não item ignorado", () => {
    // "1", "1.1", "6", "6.1"... são capítulo e subgrupo. Antes elas eram
    // descartadas como "ignoradas", e o serviço ficava sem nenhum contexto.
    expect(r.skipped).toBe(0);
  });

  it("grava a trilha completa em cada serviço", () => {
    const porCodigo = new Map(r.records.map(x => [x.code, x]));
    expect(extrairTrilha(porCodigo.get("C2820")!.notes)).toEqual([
      "SERVICOS PRELIMINARES",
      "SONDAGENS",
    ]);
    expect(extrairTrilha(porCodigo.get("C0825")!.notes)).toEqual([
      "FUNDAÇÕES E  ESTRUTURAS",
      "TUBULÕES A CÉU ABERTO",
    ]);
    expect(extrairTrilha(porCodigo.get("C1525")!.notes)).toEqual([
      "INSTALAÇÕES HIDRÁULICAS",
      "TUBOS E CONEXÕES DE PVC",
    ]);
  });

  it("a descrição fica limpa, para o nome da folha ser legível na EAP", () => {
    // Prefixar o capítulo na descrição resolveria a classificação, mas sujaria
    // o nome que o usuário lê na árvore com "SONDAGENS - EXECUÇÃO DE SONDAGEM".
    const porCodigo = new Map(r.records.map(x => [x.code, x]));
    expect(porCodigo.get("C2820")!.description).toBe(
      "EXECUÇÃO DE SONDAGEM ELÉTRICA VERTICAL AB/2 ATÉ 150m - SEV"
    );
  });

  it("a trilha sobrevive à ida-e-volta pelo banco", () => {
    // O `notes` é a única coluna de texto livre de `price_items`, e foi o que
    // evitou uma migração só para levar a taxonomia oficial até o motor.
    const porCodigo = new Map(r.records.map(x => [x.code, x]));
    const notas = porCodigo.get("C1525")!.notes!;
    expect(notas).toContain("item 16.3.1");
    expect(extrairTrilha(notas)).toEqual([
      "INSTALAÇÕES HIDRÁULICAS",
      "TUBOS E CONEXÕES DE PVC",
    ]);
  });

  it("extrairTrilha tolera notes de outros formatos", () => {
    expect(extrairTrilha(null)).toEqual([]);
    expect(extrairTrilha(undefined)).toEqual([]);
    expect(extrairTrilha("")).toEqual([]);
    // Formato antigo, quando `notes` só guardava o item.
    expect(extrairTrilha("item 1.1.1")).toEqual([]);
  });

  it("o serviço classifica como serviço, com preço e unidade", () => {
    const porCodigo = new Map(r.records.map(x => [x.code, x]));
    const c2820 = porCodigo.get("C2820")!;
    expect(c2820.itemType).toBe("servico");
    expect(c2820.unit).toBe("UN");
    expect(c2820.unitPrice).toBeCloseTo(623.05, 2);
  });
});
