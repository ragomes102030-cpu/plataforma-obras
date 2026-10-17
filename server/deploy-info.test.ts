import { describe, expect, it } from "vitest";
import { origemDeploy } from "./_core/deploy-info";

/** Um sha plausivel (40 hex). */
const SHA = "850b9cf1a2b3c4d5e6f708192a3b4c5d6e7f8091";

describe("origemDeploy", () => {
  it("nunca responde 'local': sem variavel nenhuma, diz que nao encontrou", () => {
    // `commit: "local"` e indistinguivel de "rodei na minha maquina" — nao diz
    // se o deploy falhou, se nao aconteceu, ou se o codigo novo esta no ar. Foi
    // essa a confusao central do incidente de 12/10.
    const r = origemDeploy({});
    expect(r.commit).not.toBe("local");
    expect(r.commit).toBe("desconhecido");
    expect(r.commitSource).toBe("nao-encontrado");
    expect(r.branch).toBeNull();
    expect(r.deployId).toBeNull();
  });

  it("usa o GIT_COMMIT que o Dockerfile injeta no build", () => {
    const r = origemDeploy({ GIT_COMMIT: SHA });
    expect(r.commit).toBe("850b9cf");
    expect(r.commitSource).toBe("GIT_COMMIT");
  });

  it("ainda reconhece os nomes das plataformas antigas", () => {
    expect(origemDeploy({ RENDER_GIT_COMMIT: SHA }).commitSource).toBe("RENDER_GIT_COMMIT");
    expect(origemDeploy({ RAILWAY_GIT_COMMIT_SHA: SHA }).commitSource).toBe(
      "RAILWAY_GIT_COMMIT_SHA"
    );
    expect(origemDeploy({ VERCEL_GIT_COMMIT_SHA: SHA }).commitSource).toBe(
      "VERCEL_GIT_COMMIT_SHA"
    );
  });

  it("encontra por padrao um nome de plataforma que nunca vimos", () => {
    // Este e o ponto da mudanca: nao depende de adivinhar como o DockHosting
    // chama a variavel. Se ele usar um nome novo, ele e encontrado.
    const r = origemDeploy({ DOCKHOSTING_GIT_COMMIT: SHA });
    expect(r.commit).toBe("850b9cf");
    expect(r.commitSource).toBe("DOCKHOSTING_GIT_COMMIT");
  });

  it("nao confia em valor so porque o nome parecia certo", () => {
    // Sem esta validacao, qualquer variavel de nome parecido entraria na
    // resposta de um endpoint publico.
    expect(origemDeploy({ GIT_COMMIT: "producao" }).commit).toBe("desconhecido");
    expect(origemDeploy({ GIT_COMMIT: "abc" }).commit).toBe("desconhecido");
    expect(origemDeploy({ GIT_COMMIT: "<hash>" }).commit).toBe("desconhecido");
    expect(origemDeploy({ GIT_COMMIT: "" }).commitSource).toBe("nao-encontrado");
  });

  it("cai para o proximo candidato quando o primeiro esta vazio", () => {
    // `${VAR}` nao preenchida vira string vazia, nao `undefined`: e a armadilha
    // que faria o primeiro nome "vencer" com um valor vazio.
    const r = origemDeploy({ GIT_COMMIT: "", SOURCE_VERSION: SHA });
    expect(r.commitSource).toBe("SOURCE_VERSION");
    expect(r.commit).toBe("850b9cf");
  });

  it("prefere o nome conhecido ao padrao, independente da ordem no ambiente", () => {
    const r = origemDeploy({ ZZZ_GIT_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", GIT_COMMIT: SHA });
    expect(r.commitSource).toBe("GIT_COMMIT");
  });

  it("le branch, id de deploy e ambiente", () => {
    const r = origemDeploy({
      GIT_BRANCH: "main",
      DEPLOYMENT_ID: "abc-123",
      NODE_ENV: "production",
    });
    expect(r.branch).toBe("main");
    expect(r.deployId).toBe("abc-123");
    expect(r.environment).toBe("production");
  });

  it("descarta branch e id com espaco", () => {
    const r = origemDeploy({ GIT_BRANCH: "nao e branch", DEPLOYMENT_ID: "id com espaco" });
    expect(r.branch).toBeNull();
    expect(r.deployId).toBeNull();
  });

  it("nao expoe nada alem dos campos esperados", () => {
    // Endpoint publico: o ambiente tem senha de banco e JWT secret. Nada disso
    // pode aparecer, nem por acidente de um nome parecido.
    const r = origemDeploy({ GIT_COMMIT: SHA, SEGREDO: "senha-do-banco", JWT_SECRET: "troque-me" });
    expect(Object.keys(r).sort()).toEqual([
      "branch",
      "commit",
      "commitSource",
      "deployId",
      "environment",
    ]);
    const serializado = JSON.stringify(r);
    expect(serializado).not.toContain("senha-do-banco");
    expect(serializado).not.toContain("troque-me");
  });
});
