import { validateEap, validateEapScope, validateWbsCostCoverage } from "../construction/eap-validator";
import { validateEapForBaseline } from "../construction/eap-approval-validator";
import { COMPLETE_EAP_QA_FIXTURE } from "./complete-eap-qa-fixture";

export function runCompleteEapQaSuite() {
  const { eap, packages, schedule, expectedApprovalFlow } = COMPLETE_EAP_QA_FIXTURE;
  const structural = validateEap(eap);
  const scope = validateEapScope(eap, { requireDictionaryForLeaves: true });
  const baseline = validateEapForBaseline(eap);
  const packageCodes = new Set(packages.map(p => p.code));
  const scheduleCodes = new Set(schedule.map(a => a.wbsCode));
  const scheduleIds = new Set(schedule.map(a => a.id));
  const costRefs = packages.map(p => ({ wbsNodeId: eap.find(n => n.code === p.code)?.id ?? null }));

  const checks = [
    { id: "project.fixture", passed: COMPLETE_EAP_QA_FIXTURE.project.lifecycle === "draft" },
    { id: "eap.structural", passed: structural.valid && structural.issues.length === 0 },
    { id: "eap.scope", passed: scope.valid && !scope.issues.some(i => i.severity === "error") },
    { id: "eap.baseline", passed: baseline.readyForBaseline && baseline.valid },
    { id: "dictionary.all-leaves", passed: eap.filter(n => !eap.some(c => c.parentId === n.id)).every(n => ["description","inclusions","exclusions","responsible","acceptanceCriteria","decompositionBasis"].every(k => String((n as any)[k] ?? "").trim())) },
    { id: "budget.all-leaves-covered", passed: validateWbsCostCoverage(eap, costRefs).valid },
    { id: "budget.no-double-count", passed: !validateWbsCostCoverage(eap, costRefs).issues.some(i => i.code === "wbs_double_counted_cost") },
    { id: "package-schedule-coverage", passed: packageCodes.size === scheduleCodes.size && [...packageCodes].every(c => scheduleCodes.has(c)) },
    { id: "schedule-activity-ids-unique", passed: scheduleIds.size === schedule.length },
    { id: "schedule-predecessors-exist", passed: schedule.every(a => a.predecessors.every(p => scheduleIds.has(p))) },
    { id: "schedule-no-self-dependency", passed: schedule.every(a => !a.predecessors.includes(a.id)) },
    { id: "quantities-positive", passed: packages.every(p => p.quantity > 0 && p.unitCost > 0 && p.totalCost > 0) },
    { id: "approval-flow-explicit", passed: expectedApprovalFlow.join(">") === "draft>validated>under_review>approved>applied" },
    { id: "no-implicit-application", passed: COMPLETE_EAP_QA_FIXTURE.project.lifecycle === "draft" && expectedApprovalFlow.includes("approved") },
  ];
  const passed = checks.every(c => c.passed);
  return {
    suite: "COMPLETE_EAP_E2E_FIXTURE",
    status: passed ? "passed" : "failed",
    project: COMPLETE_EAP_QA_FIXTURE.project,
    counts: { eapNodes: eap.length, packages: packages.length, activities: schedule.length },
    checks,
    total: checks.length,
    passedCount: checks.filter(c => c.passed).length,
    totalBudget: packages.reduce((s,p)=>s+p.totalCost,0),
  };
}
