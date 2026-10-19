import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `develop` é espelho de `main` — não é branch de trabalho.
 *
 * Em 15/10 a `main` ficou 1.258 commits atrás da `develop` e o deploy puxava da
 * `main`: produção rodava código velho enquanto todo mundo achava que o merge
 * tinha sido feito. A regra agora é automática (`.github/workflows/sync-develop.yml`),
 * e este teste existe para o dia em que alguém "simplificar" o workflow e, sem
 * querer, transformar o espelho em uma máquina de apagar trabalho alheio.
 */

const wf = readFileSync(".github/workflows/sync-develop.yml", "utf8");

describe("o espelho main -> develop", () => {
  it("roda a cada push em main", () => {
    expect(wf).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[\s*main\s*\]/);
  });

  it("tem permissao de escrita, senao o push falha em silencio", () => {
    expect(wf).toContain("contents: write");
  });

  it("nunca forca o push (so fast-forward)", () => {
    // `git fetch --force` é legitimo; `git push --force` apagaria commit alheio.
    const pushes = wf.split("\n").filter((l) => l.includes("git push"));
    expect(pushes.length).toBeGreaterThan(0);
    for (const linha of pushes) {
      expect(linha, `push forçado em: ${linha}`).not.toMatch(/--force(?!-with-lease)/);
    }
  });

  it("falha em vez de sobrescrever develop divergente", () => {
    expect(wf).toContain("origin/main..origin/develop");
    expect(wf).toMatch(/exit 1/);
    expect(wf).toContain("::error::");
  });

  it("confere no fim que os dois commits sao iguais", () => {
    expect(wf).toMatch(/origin\/develop\)/);
    expect(wf).toMatch(/!= "\$DEV"|"\$MAIN" != "\$DEV"/);
  });

  it("nao roda em push para develop (evita loop)", () => {
    expect(wf).not.toMatch(/branches:\s*\[[^\]]*develop/);
  });
});
