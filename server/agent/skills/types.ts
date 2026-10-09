/**
 * Tipos para skills executáveis.
 * Cada skill tem execute(input, context) → output validado.
 */
export interface SkillContext {
  projectId?: number;
  userId?: number;
  db?: unknown;
  mcpClients?: Record<string, unknown>;
}

export interface SkillInput {
  [key: string]: unknown;
}

export interface SkillOutput {
  success: boolean;
  data?: unknown;
  errors?: string[];
  warnings?: string[];
}

export interface Skill<TInput = SkillInput, TOutput = SkillOutput> {
  id: string;
  version: string;
  description: string;
  execute(input: TInput, context: SkillContext): Promise<TOutput>;
}
