import { describe, it, expect } from "vitest";
import { validateResponse, createStructuredResponse, ArquimedesResponseSchema } from "./response-schema";

describe("validateResponse", () => {
  it("deve aceitar resposta válida", () => {
    const valid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "respondido" as const,
      evidence: [],
      findings: [],
      actions: [],
      planUsed: true,
      toolsConsulted: ["validar_estrutura"],
    };
    const result = validateResponse(valid);
    expect(result.success).toBe(true);
  });

  it("deve rejeitar resposta sem taskId", () => {
    const invalid = {
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "respondido",
    };
    const result = validateResponse(invalid);
    expect(result.success).toBe(false);
  });

  it("deve rejeitar status inválido", () => {
    const invalid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "invalid_status",
    };
    const result = validateResponse(invalid);
    expect(result.success).toBe(false);
  });

  it("deve rejeitar iterations negativo", () => {
    const invalid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: -1,
      readOnly: true,
      status: "respondido",
    };
    const result = validateResponse(invalid);
    expect(result.success).toBe(false);
  });

  it("deve aceitar evidências com source válida", () => {
    const valid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "respondido" as const,
      evidence: [
        { source: "local_db" as const, confidence: "high" as const },
        { source: "mcp_eap" as const, toolName: "get_eap_tree", confidence: "medium" as const },
      ],
      findings: [],
      actions: [],
      planUsed: false,
      toolsConsulted: [],
    };
    const result = validateResponse(valid);
    expect(result.success).toBe(true);
  });

  it("deve rejeitar source inválida", () => {
    const invalid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "respondido" as const,
      evidence: [
        { source: "invalid_source" },
      ],
      findings: [],
      actions: [],
      planUsed: false,
      toolsConsulted: [],
    };
    const result = validateResponse(invalid);
    expect(result.success).toBe(false);
  });

  it("deve aceitar findings com severidade válida", () => {
    const valid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "respondido" as const,
      evidence: [],
      findings: [
        {
          category: "EAP",
          description: "Estrutura válida",
          severity: "info" as const,
          evidence: [],
        },
      ],
      actions: [],
      planUsed: false,
      toolsConsulted: [],
    };
    const result = validateResponse(valid);
    expect(result.success).toBe(true);
  });

  it("deve aceitar actions com tipo válido", () => {
    const valid = {
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      status: "respondido" as const,
      evidence: [],
      findings: [],
      actions: [
        {
          type: "none" as const,
          target: "nenhum",
          description: "Nenhuma ação necessária",
          requiresConfirmation: false,
        },
      ],
      planUsed: false,
      toolsConsulted: [],
    };
    const result = validateResponse(valid);
    expect(result.success).toBe(true);
  });
});

describe("createStructuredResponse", () => {
  it("deve criar resposta estruturada com toolsConsulted extraído do audit", () => {
    const response = createStructuredResponse({
      taskId: "task-123",
      content: "Análise concluída.",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      audit: [
        { event: "tool_call", toolName: "validar_estrutura", status: "success" },
        { event: "tool_call", toolName: "listar_atividades", status: "success" },
        { event: "tool_call", toolName: "validar_estrutura", status: "success" }, // duplicado
        { event: "tool_call", toolName: "get_eap_tree", status: "error" },
      ],
      planUsed: true,
    });

    expect(response.taskId).toBe("task-123");
    expect(response.content).toBe("Análise concluída.");
    expect(response.status).toBe("respondido");
    expect(response.planUsed).toBe(true);
    expect(response.toolsConsulted).toEqual(["validar_estrutura", "listar_atividades"]);
    // Ferramenta com erro não deve ser incluída
    expect(response.toolsConsulted).not.toContain("get_eap_tree");
  });

  it("deve deduplicar ferramentas consultadas", () => {
    const response = createStructuredResponse({
      taskId: "task-456",
      content: "Resposta",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 5,
      readOnly: false,
      audit: [
        { event: "tool_call", toolName: "tool_a", status: "success" },
        { event: "tool_call", toolName: "tool_a", status: "success" },
        { event: "tool_call", toolName: "tool_b", status: "success" },
      ],
    });

    expect(response.toolsConsulted).toEqual(["tool_a", "tool_b"]);
  });

  it("deve funcionar com audit vazio", () => {
    const response = createStructuredResponse({
      taskId: "task-789",
      content: "Resposta simples",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 1,
      readOnly: true,
      audit: [],
    });

    expect(response.toolsConsulted).toEqual([]);
    expect(response.iterations).toBe(1);
  });

  it("deve marcar planUsed corretamente", () => {
    const withPlan = createStructuredResponse({
      taskId: "task-1",
      content: "Com plano",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      audit: [],
      planUsed: true,
    });
    expect(withPlan.planUsed).toBe(true);

    const withoutPlan = createStructuredResponse({
      taskId: "task-2",
      content: "Sem plano",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 3,
      readOnly: true,
      audit: [],
    });
    expect(withoutPlan.planUsed).toBe(false);
  });
});

describe("ArquimedesResponseSchema", () => {
  it("deve ter defaults para arrays", () => {
    const minimal = {
      taskId: "task-min",
      content: "Mínimo",
      model: "gpt-5-mini",
      provider: "openai",
      iterations: 1,
      readOnly: true,
      status: "respondido" as const,
    };
    const result = ArquimedesResponseSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evidence).toEqual([]);
      expect(result.data.findings).toEqual([]);
      expect(result.data.actions).toEqual([]);
      expect(result.data.toolsConsulted).toEqual([]);
      expect(result.data.planUsed).toBe(false);
    }
  });
});
