import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLlmGateway } from "../../llm-provider-gateway";
import { getDb } from "../../db";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  extractJsonObject,
  GatewayArquimedesProvider,
} from "./gateway-provider";

vi.mock("../../llm-provider-gateway", () => ({
  invokeLlmGateway: vi.fn(),
}));
vi.mock("../../db", () => ({ getDb: vi.fn() }));

const mockedGateway = vi.mocked(invokeLlmGateway);
const mockedDb = vi.mocked(getDb);

describe("extractJsonObject", () => {
  it("encontra JSON depois de texto e ignora chaves dentro de strings", () => {
    const json =
      'Aqui está a proposta: {"basis":["a}b"],"assumptions":[],"missingInformation":[],"nodes":[]} fim';

    expect(extractJsonObject(json)).toBe(
      '{"basis":["a}b"],"assumptions":[],"missingInformation":[],"nodes":[]}'
    );
  });

  it("aceita JSON embrulhado em proposta", () => {
    const json = JSON.stringify({
      result: {
        basis: ["escopo"],
        assumptions: [],
        missingInformation: [],
        nodes: [],
      },
    });

    expect(extractJsonObject(json)).toBe(json);
  });
});

describe("GatewayArquimedesProvider", () => {
  beforeEach(() => {
    mockedGateway.mockReset();
    mockedDb.mockReset();
  });

  it("limita a consulta inicial da EAP à versão corrente", async () => {
    const clauses: Array<{ kind: string; sql: string; params: unknown[] }> = [];
    const dialect = new PgDialect();
    const fakeDb = {
      select: (fields: Record<string, unknown>) => {
        const kind = "nodeType" in fields ? "eap" : "name" in fields ? "project" : "versions";
        return {
          from: () => ({
            where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
              const query = dialect.sqlToQuery(condition);
              clauses.push({ kind, sql: query.sql, params: query.params });
              return {
                limit: async () => kind === "versions" ? [{ id: 22 }] : [{ id: 25, name: "Escola" }],
                orderBy: () => kind === "versions"
                  ? { limit: async () => [{ id: 22 }] }
                  : Promise.resolve([{ id: 501, code: "1.1", name: "Pacote", parentId: null, level: 1, nodeType: "pacote" }]),
              };
            },
          }),
        };
      },
    };
    mockedDb.mockResolvedValue(fakeDb as never);
    mockedGateway.mockResolvedValueOnce({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: '{"basis":[],"assumptions":[],"missingInformation":[],"nodes":[]}' } }],
      provider: "deepseek",
      attempts: 1,
    });

    await new GatewayArquimedesProvider().complete({
      system: "Revise a EAP.", user: "Analise a obra.", skills: [],
      databaseContext: { projectId: 25 },
    });

    const eapQuery = clauses.find(clause => clause.kind === "eap");
    expect(eapQuery?.sql).toContain('"versionId"');
    expect(eapQuery?.params).toContain(22);
    const messages = mockedGateway.mock.calls[0]?.[0].messages ?? [];
    expect(messages.at(-1)?.content).toContain('"versionId":22');
  });

  it("aumenta o orçamento na recuperação de uma resposta truncada", async () => {
    mockedGateway
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "length",
            message: {
              role: "assistant",
              content: '{"basis":[],"nodes":[',
            },
          },
        ],
        provider: "deepseek",
        attempts: 1,
      })
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: '{"basis":[],"assumptions":[],"missingInformation":[],"nodes":[]}',
            },
          },
        ],
        provider: "deepseek",
        attempts: 1,
      });

    const provider = new GatewayArquimedesProvider();
    const result = await provider.complete({
      system: "Responda somente JSON.",
      user: "gere uma proposta",
      skills: [],
      maxTokens: 4096,
    });

    expect(result).toContain('"nodes":[]');
    expect(mockedGateway).toHaveBeenCalledTimes(2);
    expect(mockedGateway.mock.calls[0]?.[0].maxTokens).toBe(4096);
    expect(mockedGateway.mock.calls[1]?.[0].maxTokens).toBe(8192);
  });

  it("usa reasoning_content quando o provedor não preenche content", async () => {
    mockedGateway.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: null,
            reasoning_content:
              'Vou estruturar a resposta. {"basis":[],"assumptions":[],"missingInformation":[],"nodes":[]}',
          },
        },
      ],
      provider: "deepseek",
      attempts: 1,
    });

    const provider = new GatewayArquimedesProvider();
    const result = await provider.complete({
      system: "Responda em json.",
      user: "gere uma proposta",
      skills: [],
      maxTokens: 4096,
    });

    expect(result).toContain('"nodes":[]');
    expect(mockedGateway).toHaveBeenCalledTimes(1);
  });
});
