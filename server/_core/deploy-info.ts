/**
 * Identificacao do deploy que esta no ar, para o `/healthz` responder.
 *
 * POR QUE ISTO EXISTE
 *
 * Em producao o `/healthz` respondia `commit: "local"`. "local" e indistinguivel
 * de "rodei na minha maquina": nao diz se o deploy falhou, se o deploy nao
 * aconteceu, ou se o codigo novo esta no ar. Foi essa a confusao central do
 * incidente de 12/10 — o deploy parecia nao subir enquanto o codigo novo ja
 * estava publicado, e nao havia como perguntar ao servico qual commit ele era.
 *
 * DOIS ERROS DE METODO QUE ESTE MODULO NAO REPETE
 *
 * 1. NAO ADIVINHAR O NOME DA VARIAVEL DE AMBIENTE. A versao anterior listava
 *    `RENDER_GIT_COMMIT`, `RAILWAY_GIT_COMMIT_SHA` e `VERCEL_GIT_COMMIT_SHA`.
 *    A plataforma de hoje e o DockHosting: nenhuma das tres existe, e o
 *    endpoint voltou a dizer "local". Adivinhar o nome funciona ate mudar de
 *    plataforma, e a falha e silenciosa.
 *
 *    Aqui a busca e por PADRAO de NOME (`*_COMMIT`, `*_COMMIT_SHA`, `*_GIT_SHA`,
 *    `SOURCE_VERSION`, ...), com os nomes ja conhecidos testados primeiro. Um
 *    nome de plataforma que nunca vimos continua sendo encontrado.
 *
 *    O padrao cobre o FORMATO generico (`*_COMMIT`), nao uma lista de formatos
 *    plausiveis. A primeira versao listava `GIT_COMMIT|COMMIT_SHA|...` e nao
 *    pegava um `*_COMMIT` qualquer: o nome real do DockHosting, `SOURCE_COMMIT`,
 *    so foi encontrado porque estava na lista de nomes conhecidos. Se tivesse
 *    vindo de outra plataforma, teria falhado.
 *
 * 2. NAO CONFIAR EM UM VALOR SO PORQUE O NOME PARECE CERTO. So aceitamos o que
 *    PARECE o que diz ser: commit tem de ser hexadecimal de 7 a 40 digitos,
 *    branch tem de parecer um nome de branch, e assim por diante. Sem essa
 *    validacao, uma variavel homonima qualquer entraria na resposta de um
 *    endpoint publico.
 *
 * QUANDO NADA E ENCONTRADO
 *
 * A resposta diz `commit: "desconhecido"` e `commitSource: "nao-encontrado"` —
 * em vez de inventar "local". `commitSource` traz o NOME da variavel que
 * forneceu o dado, entao a resposta tambem serve para descobrir como a
 * plataforma se identifica: se um dia vier `commitSource: "SEI_LA_O_QUE"`,
 * esse e o nome a respeitar, sem precisar de documentacao.
 *
 * Tambem e possivel preencher no build da imagem, sem depender do ambiente:
 *
 *   docker build --build-arg GIT_COMMIT=$(git rev-parse HEAD) ...
 */

export type OrigemDeploy = {
  /** Commit curto (7 chars) ou `"desconhecido"` — nunca `"local"`. */
  commit: string;
  /** Nome da variavel que forneceu o commit, ou `"nao-encontrado"`. */
  commitSource: string;
  branch: string | null;
  deployId: string | null;
  environment: string | null;
};

type Ambiente = Record<string, string | undefined>;

/** Commit: hexadecimal de 7 a 40 digitos. */
const PARECE_COMMIT = /^[0-9a-f]{7,40}$/i;
/** Branch: o que o git aceita em nome de branch, com tamanho sensato. */
const PARECE_BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
/** Id de deploy/instancia: identificador sem espaco. */
const PARECE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
/** Ambiente: rotulo curto, sem espaco (`production`, `staging`, ...). */
const PARECE_AMBIENTE = /^[A-Za-z0-9._:-]{1,40}$/;

/**
 * Nomes ja conhecidos, na ordem de prioridade. O `GIT_COMMIT` generico vem
 * primeiro porque e o que o proprio `Dockerfile` preenche via `--build-arg`, e
 * um valor do build e mais especifico do que um valor do ambiente.
 */
const NOMES_DE_COMMIT = [
  "GIT_COMMIT",
  "GIT_SHA",
  "COMMIT_SHA",
  // Nome VERIFICADO em producao: e a variavel que o DockHosting injeta. Ficou
  // aqui para nao depender do padrao no unico nome que sabemos ser real. Foi
  // por estar nesta lista que ele foi encontrado no primeiro deploy — o padrao,
  // na epoca, NAO cobria um `*_COMMIT` generico, ou seja, teria falhado
  // justamente no caso real.
  "SOURCE_COMMIT",
  "SOURCE_VERSION",
  "RENDER_GIT_COMMIT",
  "RAILWAY_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
];
const PADRAO_COMMIT = /(^|_)(COMMIT|GIT_COMMIT|GIT_SHA|COMMIT_SHA|SOURCE_VERSION|REVISION)$/i;

const NOMES_DE_BRANCH = [
  "GIT_BRANCH",
  "GIT_REF",
  "SOURCE_BRANCH",
  "RENDER_GIT_BRANCH",
  "RAILWAY_GIT_COMMIT_BRANCH",
  "VERCEL_GIT_COMMIT_REF",
];
const PADRAO_BRANCH = /(^|_)(GIT_BRANCH|GIT_REF|COMMIT_REF|SOURCE_BRANCH)$/i;

const NOMES_DE_DEPLOY = [
  "DEPLOYMENT_ID",
  "DEPLOY_ID",
  "INSTANCE_ID",
  "RENDER_INSTANCE_ID",
  "RAILWAY_DEPLOYMENT_ID",
  "VERCEL_DEPLOYMENT_ID",
];
const PADRAO_DEPLOY = /(^|_)(DEPLOYMENT|DEPLOY|INSTANCE)_ID$/i;

const NOMES_DE_AMBIENTE = ["APP_ENV", "ENVIRONMENT", "NODE_ENV"];
const PADRAO_AMBIENTE = /(^|_)(ENV|ENVIRONMENT)$/i;

type Encontrado = { valor: string; nome: string };

/**
 * Procura um valor no ambiente: primeiro pelos nomes conhecidos, depois por
 * padrao de nome. Um valor so e aceito se passar no `valida`, e um valor vazio
 * nunca e aceito — `${VAR}` nao preenchida vira string vazia, nao `undefined`.
 */
function procurar(
  env: Ambiente,
  conhecidos: string[],
  padrao: RegExp,
  valida: (valor: string) => boolean
): Encontrado | null {
  for (const nome of conhecidos) {
    const bruto = env[nome];
    const valor = bruto?.trim();
    if (valor && valida(valor)) return { valor, nome };
  }
  const jaVistos = new Set(conhecidos);
  for (const [nome, bruto] of Object.entries(env)) {
    if (jaVistos.has(nome)) continue;
    const valor = bruto?.trim();
    if (!valor) continue;
    if (!padrao.test(nome)) continue;
    if (valida(valor)) return { valor, nome };
  }
  return null;
}

/** Monta a identificacao do deploy a partir de um ambiente (por padrao, o atual). */
export function origemDeploy(env: Ambiente = process.env): OrigemDeploy {
  const commit = procurar(env, NOMES_DE_COMMIT, PADRAO_COMMIT, v => PARECE_COMMIT.test(v));
  const branch = procurar(env, NOMES_DE_BRANCH, PADRAO_BRANCH, v => PARECE_BRANCH.test(v));
  const deployId = procurar(env, NOMES_DE_DEPLOY, PADRAO_DEPLOY, v => PARECE_ID.test(v));
  const ambiente = procurar(env, NOMES_DE_AMBIENTE, PADRAO_AMBIENTE, v => PARECE_AMBIENTE.test(v));

  return {
    commit: commit ? commit.valor.slice(0, 7).toLowerCase() : "desconhecido",
    commitSource: commit ? commit.nome : "nao-encontrado",
    branch: branch ? branch.valor : null,
    deployId: deployId ? deployId.valor : null,
    environment: ambiente ? ambiente.valor : null,
  };
}
