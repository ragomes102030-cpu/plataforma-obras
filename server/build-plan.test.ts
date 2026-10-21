import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { versaoSuficiente, MIN_NODE } from "../scripts/check-node.mjs";

/**
 * ATENCAO: o deploy de producao hoje e por **Docker** (`./Dockerfile`), nao por
 * Nixpacks (ver docs/DEPLOY.md). Este arquivo continua existindo porque ja houve
 * um periodo em que o DockHosting montava a imagem por Nixpacks, e porque o
 * `nixpacks.toml` segue como plano B de build.
 *
 * O que se perdeu naquele periodo foi caro o bastante para ficar registrado: o
 * `nixpacks.toml` e o `package.json` sao dois arquivos capazes de derrubar o
 * build sem aparecer em nenhum type-check. Ja perdemos um deploy inteiro porque o
 * `nixpacks.toml` pedia o pacote `pnpm-10_x`, que nao existe no nixpkgs (o nome
 * canonico e `pnpm_10`). O `nix-env -iA` falha antes de instalar qualquer coisa e
 * o log so mostra "attribute not found" — nenhuma pista de que veio do nosso
 * arquivo.
 *
 * Estes testes leem o arquivo como texto (nao temos parser de TOML no projeto)
 * e travam as decisoes que, se mudarem sem cuidado, quebram o build.
 */

const toml = readFileSync("nixpacks.toml", "utf8");

/**
 * O arquivo sem os comentarios. Os comentarios falam justamente do que NAO pode
 * aparecer (`pnpm-10_x`, `corepack`, `[start] cmd` como texto), entao as
 * verificacoes negativas e o parse de secoes tem que olhar so o codigo.
 */
const codigo = toml
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("#"))
  .join("\n");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
};

/** Valores de um array TOML de strings, na secao indicada. */
function arrayDaSecao(secao: string, chave: string): string[] {
  const bloco = new RegExp(`\\[${secao.replace(/\./g, "\\.")}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(codigo)?.[1];
  if (!bloco) return [];
  const array = new RegExp(`${chave}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(bloco)?.[1];
  if (!array) return [];
  return [...array.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** Valor de uma chave TOML de string simples, na secao indicada. */
function textoDaSecao(secao: string, chave: string): string | undefined {
  const bloco = new RegExp(`\\[${secao.replace(/\./g, "\\.")}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(codigo)?.[1];
  if (!bloco) return undefined;
  return new RegExp(`${chave}\\s*=\\s*"([^"]*)"`).exec(bloco)?.[1];
}

const nixPkgs = arrayDaSecao("phases.setup", "nixPkgs");
const aptPkgs = arrayDaSecao("phases.setup", "aptPkgs");
const instalar = arrayDaSecao("phases.install", "cmds");
const construir = arrayDaSecao("phases.build", "cmds");
const start = textoDaSecao("start", "cmd");

describe("o plano do Nixpacks", () => {
  it("fixa o Node 22 no setup", () => {
    expect(nixPkgs).toContain("nodejs_22");
  });

  it("usa so nomes canonicos de pacote, sem alias com hifen", () => {
    // `nodejs-18_x` e `pnpm-10_x` sao a forma antiga. Se o nixpkgs nao expoe o
    // alias, o build morre no setup sem dizer que o problema esta aqui.
    for (const nome of [...nixPkgs, ...aptPkgs]) {
      expect(nome, `pacote "${nome}" nao esta na forma canonica`).toMatch(/^[a-z0-9+_]+$/);
    }
  });

  it("nao repete o erro do pnpm-10_x", () => {
    expect(codigo).not.toMatch(/pnpm-\d+_x/);
    expect(nixPkgs.filter((n) => n.startsWith("pnpm"))).toEqual([]);
  });

  it("checa a versao do Node antes de instalar qualquer coisa", () => {
    expect(instalar[0]).toBe("node scripts/check-node.mjs");
  });

  it("instala o pnpm na versao exata do packageManager", () => {
    const versao = /^pnpm@(.+)$/.exec(pkg.packageManager ?? "")?.[1];
    expect(versao, "packageManager precisa fixar a versao do pnpm").toBeTruthy();
    const comando = instalar.find((c) => c.includes("pnpm@"));
    expect(comando).toBeTruthy();
    expect(comando).toContain(`pnpm@${versao}`);
  });

  it("nao depende do corepack", () => {
    expect(codigo.toLowerCase()).not.toContain("corepack");
  });

  it("instala com lockfile congelado e forca as devDependencies", () => {
    // Com NODE_ENV=production (build-arg do Coolify) o pnpm omite as
    // devDependencies por padrao, e vite/esbuild vivem la: sem `--prod=false`
    // o install passa e o build morre logo depois.
    expect(instalar.at(-1)).toBe(
      "PATH=/opt/pnpm/bin:$PATH pnpm install --frozen-lockfile --prod=false",
    );
  });

  it("constroi com o script de build do repositorio", () => {
    expect(construir).toEqual(["PATH=/opt/pnpm/bin:$PATH pnpm run build"]);
  });

  it("nao confia no prefixo global do npm", () => {
    // O Coolify passa NPM_CONFIG_PRODUCTION=true como build-arg. Nesse modo o
    // `npm install -g` instala o pacote mas grava o binario num prefixo que nao
    // esta no PATH, e o comando seguinte morre com "pnpm: command not found"
    // (exit 127) — foi o que travou o deploy do #133.
    const globais = instalar.filter((c) => c.includes("npm install -g"));
    expect(globais.length).toBeGreaterThan(0);
    for (const comando of globais) {
      expect(comando, "npm install -g precisa de --prefix explicito").toContain(
        "--prefix /opt/pnpm",
      );
    }
  });

  it("passa o PATH do pnpm na mesma linha de cada comando", () => {
    // Variavel de ambiente nao atravessa camada de Docker: exportar num RUN e
    // usar no seguinte nao funciona. O PATH tem que ir na propria linha.
    const comPnpm = [...instalar, ...construir].filter((c) => /(^|\s)pnpm /.test(c));
    expect(comPnpm.length).toBeGreaterThan(0);
    for (const comando of comPnpm) {
      expect(comando.startsWith("PATH=/opt/pnpm/bin:$PATH ")).toBe(true);
    }
  });

  it("sobe o servidor Express, nao o Caddy estatico do Nixpacks", () => {
    // O padrao do Nixpacks para Vite e `caddy run` servindo `dist`: o site
    // apareceria sem API, /healthz sem JSON e o banco nunca migraria.
    expect(start).toBe("npm start");
    expect(start).not.toContain("caddy");
    expect(pkg.scripts?.start).toContain("migrate-pg.mjs");
  });

  it("nao usa campos fora do schema do Nixpacks", () => {
    // Se o schema nao conhece o campo, o Nixpacks recusa o arquivo inteiro.
    expect(codigo).not.toMatch(/^\s*(paths|cacheDirectories)\s*=/m);
  });
});

describe("a guarda de versao do Node", () => {
  it("aceita 22 e superiores", () => {
    expect(MIN_NODE).toBe(22);
    expect(versaoSuficiente("22.12.0")).toBe(true);
    expect(versaoSuficiente("v22.12.0")).toBe(true);
    expect(versaoSuficiente("24.1.0")).toBe(true);
    expect(versaoSuficiente("26.0.0")).toBe(true);
  });

  it("recusa o Node 18 que o Nixpacks escolhia", () => {
    expect(versaoSuficiente("18.20.4")).toBe(false);
    expect(versaoSuficiente("v20.19.0")).toBe(false);
  });

  it("recusa versao ilegivel em vez de assumir que esta tudo bem", () => {
    expect(versaoSuficiente("")).toBe(false);
    expect(versaoSuficiente("node")).toBe(false);
  });

  it("concorda com o engines.node do package.json", () => {
    expect(pkg.engines?.node).toBe(`${MIN_NODE}.x`);
  });
});
