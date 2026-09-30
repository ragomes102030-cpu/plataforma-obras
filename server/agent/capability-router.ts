import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getConstructionMcpStatus, MCP_TOOL_POLICY } from "../integrations/construction-mcps";
import {
  getArquimedesCapabilitySnapshot,
  installArquimedesCapability,
  setArquimedesCapabilityEnabled,
  uninstallArquimedesCapability,
} from "./capability-manager";
import { ARQUIMEDES_PERMISSION_MATRIX } from "./capability-registry";

export const arquimedesCapabilitiesRouter = router({
  snapshot: adminProcedure.query(async ({ ctx }) => {
    const [capabilities, mcpStatus] = await Promise.all([
      getArquimedesCapabilitySnapshot(ctx.user.id),
      getConstructionMcpStatus("central-" + Date.now()),
    ]);

    const mcpDomains = Object.entries(mcpStatus.servers).map(([id, server]) => ({
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
      ...capabilities,
      generatedAt: mcpStatus.checkedAt,
      overallMcpStatus: mcpStatus.status,
      mcpDomains,
      permissions: ARQUIMEDES_PERMISSION_MATRIX,
      policy: {
        readOnlyTools: MCP_TOOL_POLICY.readOnly.size,
        confirmationTools: MCP_TOOL_POLICY.requiresConfirmation.size,
        destructiveTools: MCP_TOOL_POLICY.destructive.size,
      },
    };
  }),

  install: adminProcedure
    .input(z.object({ capabilityId: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) =>
      installArquimedesCapability(ctx.user.id, input.capabilityId)
    ),

  setEnabled: adminProcedure
    .input(
      z.object({
        capabilityId: z.string().min(1).max(120),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      setArquimedesCapabilityEnabled(
        ctx.user.id,
        input.capabilityId,
        input.enabled
      )
    ),

  uninstall: adminProcedure
    .input(z.object({ capabilityId: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) =>
      uninstallArquimedesCapability(ctx.user.id, input.capabilityId)
    ),
});
