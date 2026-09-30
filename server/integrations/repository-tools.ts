import { ENV } from "../_core/env";

type GitHubContentResponse = {
  type: string;
  encoding?: string;
  content?: string;
  sha: string;
  path: string;
  html_url?: string;
};

type GitHubSearchCodeItem = {
  name: string;
  path: string;
  sha: string;
  html_url?: string;
  text_matches?: Array<{
    fragment?: string;
  }>;
};

type GitHubSearchResponse = {
  total_count: number;
  items: GitHubSearchCodeItem[];
};

const GITHUB_API = "https://api.github.com";

const EDITABLE_PREFIXES = [
  "server/",
  "client/src/",
  "shared/",
  "scripts/",
  "mcp-server/",
];

const BLOCKED_PATH_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)secrets?\b/i,
  /(^|\/)credentials?\b/i,
  /(^|\/)node_modules\//i,
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
];

function headers() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "arquimedes-obras-agent",
    ...(ENV.arquimedesGithubToken
      ? { Authorization: `Bearer ${ENV.arquimedesGithubToken}` }
      : {}),
  };
}

function repoParts() {
  const [owner, repo] = ENV.arquimedesCodeRepository.split("/");
  if (!owner || !repo || ENV.arquimedesCodeRepository.split("/").length !== 2) {
    throw new Error(
      "ARQUIMEDES_CODE_REPOSITORY deve estar no formato owner/repository."
    );
  }
  return { owner, repo };
}

async function githubJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers(),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub respondeu ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 500)}`
    );
  }
  return body ? (JSON.parse(body) as T) : ({} as T);
}

function decodeContent(value: string) {
  return Buffer.from(value.replace(/\n/g, ""), "base64").toString("utf8");
}

function isAllowedEditPath(path: string) {
  const normalized = path.replace(/^\//, "");
  return (
    EDITABLE_PREFIXES.some(prefix => normalized.startsWith(prefix)) &&
    !BLOCKED_PATH_PATTERNS.some(pattern => pattern.test(normalized))
  );
}

export function repositoryInfo() {
  return {
    repository: ENV.arquimedesCodeRepository,
    branch: ENV.arquimedesCodeBranch,
    selfEditEnabled: ENV.arquimedesSelfEditEnabled,
    writeCredentialConfigured: Boolean(ENV.arquimedesGithubToken),
    editablePrefixes: EDITABLE_PREFIXES,
  };
}

export async function readRepositoryFile(path: string, ref = ENV.arquimedesCodeBranch) {
  const { owner, repo } = repoParts();
  const normalized = path.replace(/^\//, "");
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(normalized).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`;
  const result = await githubJson<GitHubContentResponse>(url);
  if (result.type !== "file" || !result.content) {
    throw new Error(`O caminho ${normalized} não é um arquivo de texto disponível.`);
  }
  return {
    repository: ENV.arquimedesCodeRepository,
    branch: ref,
    path: normalized,
    sha: result.sha,
    content: decodeContent(result.content),
    url: result.html_url ?? null,
  };
}

export async function searchRepositoryCode(query: string, topK = 8) {
  const { owner, repo } = repoParts();
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("A busca de código não pode ser vazia.");
  const limit = Math.min(Math.max(Math.floor(topK), 1), 20);
  const q = encodeURIComponent(`${cleanQuery} repo:${owner}/${repo}`);
  const url = `${GITHUB_API}/search/code?q=${q}&per_page=${limit}`;
  const result = await githubJson<GitHubSearchResponse>(url);
  return {
    repository: ENV.arquimedesCodeRepository,
    query: cleanQuery,
    total: result.total_count,
    items: result.items.map(item => ({
      path: item.path,
      sha: item.sha,
      url: item.html_url ?? null,
      matches: (item.text_matches ?? []).map(match => match.fragment).filter(Boolean),
    })),
  };
}

export async function updateRepositoryFile(input: {
  path: string;
  content: string;
  message: string;
  expectedSha: string;
}) {
  if (!ENV.arquimedesSelfEditEnabled) {
    throw new Error(
      "A auto-correção do repositório está desabilitada. Ative ARQUIMEDES_SELF_EDIT_ENABLED=true para permitir edição controlada."
    );
  }
  if (!ENV.arquimedesGithubToken) {
    throw new Error(
      "Nenhuma credencial ARQUIMEDES_GITHUB_TOKEN está configurada para editar o repositório."
    );
  }
  if (ENV.arquimedesCodeBranch === "main" || ENV.arquimedesCodeBranch === "master") {
    throw new Error(
      "O Arquimedes não pode editar diretamente a branch principal. Use uma branch de trabalho."
    );
  }

  const normalized = input.path.replace(/^\//, "");
  if (!isAllowedEditPath(normalized)) {
    throw new Error(
      `Caminho não autorizado para auto-correção: ${normalized}. O agente pode editar apenas código da aplicação e scripts de desenvolvimento.`
    );
  }
  if (!input.expectedSha.trim()) {
    throw new Error("expectedSha é obrigatório para evitar sobrescrever alterações concorrentes.");
  }
  if (!input.message.trim()) {
    throw new Error("Uma mensagem de commit é obrigatória.");
  }
  const bytes = Buffer.byteLength(input.content, "utf8");
  if (bytes > 1_500_000) {
    throw new Error("O arquivo é grande demais para uma auto-correção segura.");
  }

  const { owner, repo } = repoParts();
  const encodedPath = encodeURIComponent(normalized).replace(/%2F/g, "/");
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`;
  const body = {
    message: input.message,
    content: Buffer.from(input.content, "utf8").toString("base64"),
    branch: ENV.arquimedesCodeBranch,
    sha: input.expectedSha,
  };

  const result = await githubJson<GitHubContentResponse>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return {
    repository: ENV.arquimedesCodeRepository,
    branch: ENV.arquimedesCodeBranch,
    path: normalized,
    commitSha: result.sha,
    url: result.html_url ?? null,
  };
}
