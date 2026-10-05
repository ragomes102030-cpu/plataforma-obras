import { describe, expect, it } from "vitest";
import { runCompleteEapQaSuite } from "./complete-eap-qa-suite";

describe("complete EAP QA suite", () => {
  it("passa pelo fluxo determinístico completo de escopo, orçamento e cronograma", () => {
    const result = runCompleteEapQaSuite();

    expect(result.status).toBe("passed");
    expect(result.passedCount).toBe(result.total);
    expect(result.counts.eapNodes).toBeGreaterThan(0);
    expect(result.counts.packages).toBeGreaterThan(0);
    expect(result.counts.activities).toBeGreaterThan(0);
  });
});
