import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Um `.mjs` que começa com `#` SOLTO — sem exclamação — falha neste ambiente
// com `SyntaxError: Invalid or unexpected token`, e o erro aponta a primeira
// linha com o caret embaixo do `#`. Isso faz parecer problema de codificação
// quando é de sintaxe, e custou três passes de diagnóstico.
//
// Shebang (`#!`) NÃO é problema: `scripts/audit-schema.mjs` e
// `scripts/migrate-db.mjs` começam assim, os dois são copiados para o container
// e rodam em todo boot. Se shebang quebrasse, nenhum deploy passaria — e os
// deploys passam.
//
// A guarda é de leitura de arquivo: mais rápido que executar, e não depende de
// o Node estar disponível para o teste rodar.
const RAIZ = "scripts";

function primeiraLinhaSignificativa(caminho: string): string {
  for (const l of readFileSync(caminho, "utf-8").split(/\r?\n/)) {
    const t = l.trim();
    if (t.length > 0) return t;
  }
  return "";
}

/** Devolve a primeira linha quando ela é `#` que NÃO é shebang. */
function comecaComHashSolto(caminho: string): string | null {
  const primeira = primeiraLinhaSignificativa(caminho);
  if (primeira.startsWith("#!")) return null;
  if (primeira.startsWith("#")) return primeira.slice(0, 48);
  return null;
}

const arquivos = readdirSync(RAIZ).filter(f => f.endsWith(".mjs"));

describe("scripts .mjs", () => {
  it("há pelo menos um .mjs para checar", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it("nenhum começa com # solto — o Node 24.21 dá SyntaxError nisso", () => {
    const infratores: string[] = [];
    for (const f of arquivos) {
      const achado = comecaComHashSolto(join(RAIZ, f));
      if (achado) infratores.push(`${f}: ${achado}`);
    }
    expect(
      infratores,
      "um .mjs que começa com `#` solto falha com SyntaxError e o erro aponta " +
        "a primeira linha, o que faz parecer problema de codificação. " +
        "Use `//` ou `/* */`. Shebang `#!` é válido e não entra nesta regra."
    ).toEqual([]);
  });

  it("shebang é aceito — dois scripts de produção começam assim", () => {
    for (const f of ["migrate-db.mjs", "audit-schema.mjs"]) {
      expect(arquivos, `${f} sumiu de scripts/`).toContain(f);
      expect(
        comecaComHashSolto(join(RAIZ, f)),
        `${f} tem # solto na primeira linha`
      ).toBeNull();
    }
  });

  it("a própria guarda distingue # de #!", () => {
    // Autoteste. A primeira versão desta guarda rejeitava shebang e reprovava
    // com dois arquivos que funcionam em produção — o mesmo erro de "guarda que
    // nunca foi testada contra o defeito" que já aconteceu duas vezes aqui.
    const comShebang = join(RAIZ, "_autoteste-shebang.mjs");
    const comHash = join(RAIZ, "_autoteste-hash.mjs");
    try {
      writeFileSync(comShebang, "#!/usr/bin/env node\nconsole.log(1);\n", "utf-8");
      writeFileSync(comHash, "# comentario\nconsole.log(1);\n", "utf-8");
      expect(comecaComHashSolto(comShebang)).toBeNull();
      expect(comecaComHashSolto(comHash)).toBe("# comentario");
    } finally {
      for (const p of [comShebang, comHash]) {
        try {
          unlinkSync(p);
        } catch {
          // já não existe; nada a fazer
        }
      }
    }
  });
});
