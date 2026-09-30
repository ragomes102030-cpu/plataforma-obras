import { adminProcedure, router } from "../_core/trpc";
import { getConstructionMcpStatus, MCP_TOOL_POLICY } from "../integrations/construction-mcps";
import {
  ARQUIMEDES_ABILITIES,
  ARQUIMEDES_PERMISSION_MATRIX,
  ARQUIMEDES_SKILLS,
} from "./capability-registry";

export const arquimedesCapabilitiesRouter = router({
  snapshot: adminProcedure.query(async () => {
    const status = await getConstructionMcpStatus(`central-${Date.now()}`);
    const mcpDomains = Object.entries(status.servers).map(([id, server]) => ({
      id,
      name:
        id === "ganttLob"
          ? "Gantt / Linha de Balanço"
          : id === "cronograma"
            ? "Cronograma"
            : "EAP",
      status: server.status,
      latencyMs: server.latencyMs,
      toolCount: server.toolCount,
      tools: server.tools,
      lastError: server.lastError,
    }));
    return {
      generatedAt: status.checkedAt,
      overallStatus: status.status,
      mcpDomains,
      skills: ARQUIMEDES_SKILLS,
      abilities: ARQUIMEDES_ABILITIES,
      permissions: ARQUIMEDES_PERMISSION_MATRIX,
      policy: {
        readOnlyTools: MCP_TOOL_POLICY.readOnly.size,
        confirmationTools: MCP_TOOL_POLICY.requiresConfirmation.size,
        destructiveTools: MCP_TOOL_POLICY.destructive.size,
      },
    };
  }),
});
