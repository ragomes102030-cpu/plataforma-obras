import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLlmGateway } from "../../llm-provider-gateway";
import {
  extractJsonObject,
  GatewayArquimedesProvider,
} from "./gateway-provider";

vi.mock("../../llm-provider-gateway", () => ({
  invokeLlmGateway: vi.fn(),
}));

const mockedGateway = vi.mocked(invokeLlmGateway);

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
