import { describe, expect, it } from "vitest";
import { COORDINATOR_STAGES } from "../../shared/construction-stages";
import { describeStageGate, type StageGateEvidence } from "./stage-gates";

/**
 * O gate que aprova estrutura vazia é o defeito que importa.
 *
 * Regra do projeto: o sistema recusa dado faltando em vez de desenhá-lo. Um
 * gate que responde "cronograma válido" para atividades sem duração é a mesma
 * estrutura que parece pronta que o seeder criava — agora com zero dia em vez
 * de cinco inventados.
 *
 * Antes, `activityCount > 0` bastava. Existence e planejamento viraram campos
 * separados, e o gate diz quantas atividades faltam, não só que faltam.
 */

function evidencia(over: Partial<StageGateEvidence> = {}): StageGateEvidence {
  return {
    hasDescription: true,
    eapNodeCount: 40,
    eapValid: true,
    activityCount: 7,
    activitiesPlanned: 7,
    activitiesWithoutQuantity: 0,
    dependenciesValid: true,
    cpmValid: true,
    blockerCount: 0,
    costCoverageValid: true,
    ...over,
  };
}

/**
 * Os checks do gate do estágio `alvo`.
 *
 * `describeStageGate` devolve os checks do PRÓXIMO estágio, então o gate de
 * `CPM_VALIDADO` é pedido passando `DEPENDENCIAS_PROPOSTA`, que é o estágio
 * imediatamente anterior na ordem de `COORDINATOR_STAGES`.
 */
function checksDo(alvo: string, evidence: StageGateEvidence) {
  const estagios = COORDINATOR_STAGES;
  const i = estagios.indexOf(alvo as (typeof estagios)[number]);
  if (i < 0) throw new Error(`estágio desconhecido: ${alvo}`);
  const anterior = estagios[i - 1]!;
  return describeStageGate(anterior, evidence).checks;
}

/** Os checks do gate de CPM_VALIDADO, que é onde o prazo passou a importar. */
function checksCpm(evidence: StageGateEvidence) {
  return checksDo("CPM_VALIDADO", evidence);
}

function checagem(
  checks: ReturnType<typeof describeStageGate>["checks"],
  code: string
) {
  const c = checks.find(x => x.code === code);
  if (!c) {
    throw new Error(
      `gate "${code}" não existe. Disponíveis: ${checks.map(x => x.code).join(", ")}`
    );
  }
  return c;
}

describe("gates — existir não é o mesmo que estar planejado", () => {
  it("o gate de CPM reprova com atividade sem duração, mesmo com CPM 'válido'", () => {
    // Uma cadeia de atividades com duração zero tem CPM trivialmente válido:
    // caminho crítico de sete atividades com zero dia. O gate antigo aprovava.
    const checks = checksCpm(evidencia({ activitiesPlanned: 0, cpmValid: true }));
    expect(checagem(checks, "cpm_valid").valid).toBe(true);
    expect(checagem(checks, "activities_planned").valid).toBe(false);
    expect(describeStageGate("DEPENDENCIAS_PROPOSTA", evidencia({ activitiesPlanned: 0 })).canAdvance).toBe(
      false
    );
  });

  it("reprova quando parte das atividades não tem prazo", () => {
    // Reprovar aqui é deliberado: cronograma com 7 linhas e 3 sem duração não
    // tem caminho crítico que signifique algo. A regra é não apresentar número
    // parcial como se fosse completo.
    const checks = checksCpm(evidencia({ activitiesPlanned: 3 }));
    expect(checagem(checks, "activities_planned").valid).toBe(false);
  });

  it("aprova quando todas as atividades têm duração", () => {
    const checks = checksCpm(evidencia());
    expect(checagem(checks, "activities_planned").valid).toBe(true);
  });

  it("o gate diz quantas atividades faltam, e não só que falta", () => {
    // "A obra possui atividades cadastradas" é verdadeiro e inútil. O rótulo
    // precisa dizer o que fazer, com o número.
    const checks = checksCpm(evidencia({ activitiesPlanned: 3 }));
    const c = checagem(checks, "activities_planned");
    expect(c.label).toMatch(/duração/i);
    expect(c.detail).toMatch(/4 de 7/);
  });

  it("o detalhe é vazio quando o gate passa", () => {
    const checks = checksCpm(evidencia());
    expect(checagem(checks, "activities_planned").detail).toBe("");
  });

  it("o detalhe concorda no singular", () => {
    const checks = checksCpm(evidencia({ activityCount: 1, activitiesPlanned: 0 }));
    const detail = checagem(checks, "activities_planned").detail ?? "";
    expect(detail).toMatch(/^1 de 1 atividade sem dura/);
    // Concordância de verdade: no plural é "atividades", e o erro seria escrever
    // "1 de 1 atividades" ou "4 de 7 atividade".
    expect(detail).not.toMatch(/1 de 1 atividades/);
    const plural = checagem(
      checksCpm(evidencia({ activityCount: 7, activitiesPlanned: 3 })),
      "activities_planned"
    ).detail;
    expect(plural).toMatch(/^4 de 7 atividades sem dura/);
  });

  it("quantidade ausente NÃO reprova o gate de cronograma", () => {
    // Medir é trabalho de campo. Reprovar o cronograma por isso seria obrigar
    // a inventar número antes de planejar — o defeito inverso, e pior: leva a
    // quantia medida a ser preenchida com estimativa.
    const checks = checksCpm(evidencia({ activitiesWithoutQuantity: 7 }));
    expect(checagem(checks, "activities_planned").valid).toBe(true);
  });

  it("obra sem nenhuma atividade reprova, e o detalhe não inventa fração", () => {
    const checks = checksCpm(evidencia({ activityCount: 0, activitiesPlanned: 0 }));
    expect(checagem(checks, "activities_exist").valid).toBe(false);
    expect(checagem(checks, "activities_planned").valid).toBe(false);
    expect(checagem(checks, "activities_planned").detail).toBe("");
  });

  it("o gate de prazo existe nos dois estágios que dependem dele", () => {
    for (const alvo of ["DEPENDENCIAS_PROPOSTA", "CPM_VALIDADO"]) {
      const tem = checksDo(alvo, evidencia()).some(c => c.code === "activities_planned");
      expect(tem, `estágio ${alvo} ficou sem o gate de prazo`).toBe(true);
    }
  });
  it("o gate de DEPENDENCIAS_PROPOSTA também exige prazo, não só existência", () => {
    // A mutação por `replace` de string troca só a primeira ocorrência, e os
    // dois gates tinham a mesma expressão. Cobrir só o segundo deixava o
    // primeiro mutando em silêncio — foi o que a verificação por mutação
    // pegou.
    const comPrazo = checksDo("DEPENDENCIAS_PROPOSTA", evidencia());
    expect(checagem(comPrazo, "activities_exist").valid).toBe(true);
    expect(checagem(comPrazo, "activities_planned").valid).toBe(true);

    const semPrazo = checksDo(
      "DEPENDENCIAS_PROPOSTA",
      evidencia({ activitiesPlanned: 0 })
    );
    expect(checagem(semPrazo, "activities_planned").valid).toBe(false);
    expect(checagem(semPrazo, "activities_planned").detail).toMatch(/7 de 7/);
  });
});
