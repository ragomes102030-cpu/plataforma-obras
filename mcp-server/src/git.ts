/**
 * Fase 3: Acesso ao Git (READ-ONLY)
 *
 * Permite que o Arquimedes VEJA o estado do repositório sem risco
 * de fazer commits ou push. Operações de escrita (commit, push,
 * branch) são feitas pelo engenherio/Hermes — nunca pelo agente.
 *
 * Segurança:
 * - Apenas operações read-only
 * - Timeout de 30s
 * - Sem acesso a credenciais
 */

import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const PROJECT_ROOT = process.cwd();
const GIT_TIMEOUT = 30000;

async function git(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args.join(" ")}`, {
      cwd: PROJECT_ROOT,
      timeout: GIT_TIMEOUT,
      encoding: "utf-8",
    });
    return { stdout, stderr };
  } catch (e: any) {
    return { stdout: e.stdout || "", stderr: e.stderr || e.message };
  }
}

export function registerGitTools(server: any) {
  // Git status
  server.tool(
    "git_status",
    "Mostra o status do repositório git",
    {},
    async () => {
      const { stdout, stderr } = await git(["status", "--short", "-b"]);
      return { content: [{ type: "text", text: stdout || stderr || "Clean working tree" }] };
    }
  );

  // Git diff
  server.tool(
    "git_diff",
    "Mostra as alterações no repositório",
    {
      staged: z.boolean().default(false).describe("Mostrar alterações staged"),
    },
    async ({ staged }: { staged: boolean }) => {
      const args = staged ? ["diff", "--cached"] : ["diff"];
      const { stdout, stderr } = await git(args);
      return { content: [{ type: "text", text: stdout || stderr || "No differences" }] };
    }
  );

  // Git log
  server.tool(
    "git_log",
    "Mostra o histórico de commits",
    {
      limit: z.number().default(10).describe("Número de commits"),
    },
    async ({ limit }: { limit: number }) => {
      const { stdout } = await git(["log", `--max-count=${limit}`, "--oneline", "--decorate"]);
      return { content: [{ type: "text", text: stdout || "No commits" }] };
    }
  );

  // Git commit — REMOVED (escrita: feita pelo engenheiro)
  // Git push — REMOVED (escrita: feita pelo engenheiro)
  // Git create branch — REMOVED (escrita: feita pelo engenheiro)

  // Git list branches
  server.tool(
    "git_list_branches",
    "Lista todas as branches do repositório",
    {},
    async () => {
      const { stdout } = await git(["branch", "-a"]);
      return { content: [{ type: "text", text: stdout || "No branches" }] };
    }
  );
}
