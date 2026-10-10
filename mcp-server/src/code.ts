/**
 * Fase 2: Acesso ao código-fonte
 * 
 * Permite que o Arquimedes leia, edite e crie arquivos no projeto
 * sem depender de ferramentas externas.
 * 
 * Segurança:
 * - Apenas arquivos do projeto (path traversal bloqueado)
 * - Whitelist de diretórios permitidos
 * - Tamanho máximo de arquivo: 1MB
 */

import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_DEPTH = 5;

const ALLOWED_DIRS = [
  "server",
  "client",
  "shared",
  "docs",
  "agent",
  "scripts",
  "tests",
  "drizzle",
  "mcp-server",
];

const ALLOWED_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".sql", ".yaml", ".yml",
];

function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(PROJECT_ROOT, filePath);
  if (!resolved.startsWith(PROJECT_ROOT)) return false;
  const relative = path.relative(PROJECT_ROOT, resolved);
  const dir = relative.split(path.sep)[0];
  if (!ALLOWED_DIRS.includes(dir)) return false;
  const ext = path.extname(resolved);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return false;
  return true;
}

export function registerCodeTools(server: any) {
  // Read file
  server.tool(
    "read_code_file",
    "Lê o conteúdo de um arquivo do projeto",
    {
      path: z.string().describe("Caminho relativo do arquivo (ex: server/orchestrator.ts)"),
    },
    async ({ path: filePath }: { path: string }) => {
      try {
        if (!isPathSafe(filePath)) {
          return { content: [{ type: "text", text: `Error: Path '${filePath}' is not allowed` }] };
        }
        const resolved = path.resolve(PROJECT_ROOT, filePath);
        const stat = await fs.stat(resolved);
        if (stat.size > MAX_FILE_SIZE) {
          return { content: [{ type: "text", text: `Error: File '${filePath}' is too large (${stat.size} bytes)` }] };
        }
        const content = await fs.readFile(resolved, "utf-8");
        return { content: [{ type: "text", text: content }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  // Write file
  server.tool(
    "write_code_file",
    "Cria ou sobrescreve um arquivo no projeto",
    {
      path: z.string().describe("Caminho relativo do arquivo"),
      content: z.string().describe("Conteúdo do arquivo"),
    },
    async ({ path: filePath, content }: { path: string; content: string }) => {
      try {
        if (!isPathSafe(filePath)) {
          return { content: [{ type: "text", text: `Error: Path '${filePath}' is not allowed` }] };
        }
        const resolved = path.resolve(PROJECT_ROOT, filePath);
        const dir = path.dirname(resolved);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        return { content: [{ type: "text", text: `File '${filePath}' written successfully` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  // List files
  server.tool(
    "list_code_files",
    "Lista arquivos de um diretório do projeto",
    {
      dir: z.string().describe("Diretório relativo (ex: server/agent)"),
      recursive: z.boolean().default(false).describe("Listar recursivamente"),
    },
    async ({ dir, recursive }: { dir: string; recursive: boolean }) => {
      try {
        const resolved = path.resolve(PROJECT_ROOT, dir);
        if (!resolved.startsWith(PROJECT_ROOT)) {
          return { content: [{ type: "text", text: "Error: Invalid directory" }] };
        }
        const files: string[] = [];
        
        async function walk(current: string, depth: number) {
          if (depth > MAX_DEPTH) return;
          const entries = await fs.readdir(current, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(current, entry.name);
            const relative = path.relative(PROJECT_ROOT, full);
            if (entry.isDirectory()) {
              if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
              if (recursive) await walk(full, depth + 1);
            } else {
              files.push(relative);
            }
          }
        }
        
        await walk(resolved, 0);
        return { content: [{ type: "text", text: JSON.stringify({ dir, count: files.length, files }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  // Search code
  server.tool(
    "search_code",
    "Busca um padrão no código-fonte do projeto",
    {
      pattern: z.string().describe("Padrão de busca (regex ou string simples)"),
      file_glob: z.string().optional().describe("Filtro de arquivos (ex: *.ts)"),
      max_results: z.number().default(50).describe("Máximo de resultados"),
    },
    async ({ pattern, file_glob, max_results }: { pattern: string; file_glob?: string; max_results: number }) => {
      try {
        const results: Array<{ file: string; line: number; text: string }> = [];
        const regex = new RegExp(pattern, "i");
        
        async function walk(current: string, depth: number) {
          if (depth > MAX_DEPTH || results.length >= max_results) return;
          const entries = await fs.readdir(current, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= max_results) return;
            const full = path.join(current, entry.name);
            const relative = path.relative(PROJECT_ROOT, full);
            if (entry.isDirectory()) {
              if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
              await walk(full, depth + 1);
            } else {
              if (file_glob && !relative.includes(file_glob.replace(/\*/g, ""))) continue;
              const ext = path.extname(full);
              if (!ALLOWED_EXTENSIONS.includes(ext)) continue;
              try {
                const content = await fs.readFile(full, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    results.push({ file: relative, line: i + 1, text: lines[i].trim().slice(0, 200) });
                    if (results.length >= max_results) return;
                  }
                }
              } catch {}
            }
          }
        }
        
        await walk(PROJECT_ROOT, 0);
        return { content: [{ type: "text", text: JSON.stringify({ pattern, count: results.length, results }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  // Create skill
  server.tool(
    "create_skill",
    "Cria uma nova skill do Arquimedes",
    {
      name: z.string({ description: "Nome da skill (kebab-case)" }),
      content: z.string({ description: "Conteúdo da skill (markdown)" }),
    },
    async ({ name, content }: { name: string; content: string }) => {
      try {
        const skillPath = `agent/skills/${name}/SKILL.md`;
        if (!isPathSafe(skillPath)) {
          return { content: [{ type: "text", text: "Error: Invalid skill path" }] };
        }
        const resolved = path.resolve(PROJECT_ROOT, skillPath);
        const dir = path.dirname(resolved);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        return { content: [{ type: "text", text: `Skill '${name}' created successfully` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
