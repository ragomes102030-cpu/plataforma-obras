import { createHash } from "node:crypto";
import { getDb } from "../db";
import { errorEvents } from "../../drizzle/schema";
import { origemDeploy } from "../_core/deploy-info";

/**
 * Observabilidade minima de erros de servidor.
 *
 * Decisao de projeto: nao depender de SaaS para enxergar 5xx. A tabela
 * `error_events` guarda o suficiente para diagnosticar e agrupar; o webhook
 * opcional (`ALERT_WEBHOOK_URL`) avisa Slack/Discord. Quando houver Sentry,
 * este modulo continua sendo a rede de seguranca barata — nao o contrario.
 */

export type OrigemErro = "http" | "trpc";

export interface EntradaErro {
  origem: OrigemErro;
  rota: string;
  metodo?: string | null;
  status?: number | null;
  codigo?: string | null;
  mensagem: string;
  stack?: string | null;
  userId?: number | null;
}

export interface RegistroErro {
  fingerprint: string;
  origem: OrigemErro;
  rota: string;
  metodo: string | null;
  status: number;
  codigo: string | null;
  mensagem: string;
  stack: string | null;
  userId: number | null;
  commitSha: string;
}

const LIMITE_ROTA = 300;
const LIMITE_MENSAGEM = 2000;
const LIMITE_STACK = 8000;
const JANELA_DEDUPE_MS = 30_000;
const JANELA_ALERTA_MS = 15 * 60_000;
const MAX_CHAVES_EM_MEMORIA = 500;

const vistos = new Map<string, number>();
const alertados = new Map<string, number>();

/** Remove query string (pode conter token) e normaliza o tamanho. */
export function normalizarRota(url: string | undefined | null): string {
  const semQuery = (url ?? "").split("?")[0].split("#")[0].trim();
  return (semQuery || "/desconhecida").slice(0, LIMITE_ROTA);
}

function limparStack(stack: string | null | undefined): string | null {
  if (!stack) return null;
  // Enderecos absolutos e numeros de linha mudam entre builds; se entrarem no
  // fingerprint, o mesmo erro vira um grupo novo a cada deploy.
  const normalizado = stack
    .replace(/\r\n/g, "\n")
    .replace(/:(\d+):(\d+)/g, ":0:0")
    .slice(0, LIMITE_STACK);
  return normalizado;
}

function linhaRelevante(stack: string | null, mensagem: string): string {
  if (!stack) return mensagem;
  const frame = stack
    .split("\n")
    .map(l => l.trim())
    .find(l => l.startsWith("at "));
  return frame ?? mensagem;
}

export function calcularFingerprint(
  origem: OrigemErro,
  rota: string,
  codigo: string | null,
  stack: string | null,
  mensagem: string
): string {
  const base = [origem, rota, codigo ?? "", linhaRelevante(limparStack(stack), mensagem)].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 64);
}

/** Funcao pura: tudo que o teste consegue afirmar sem banco. */
export function montarRegistro(entrada: EntradaErro): RegistroErro {
  const status = Number.isFinite(entrada.status) ? Number(entrada.status) : 500;
  const rota = normalizarRota(entrada.rota);
  const mensagem = (entrada.mensagem || "Erro sem mensagem").slice(0, LIMITE_MENSAGEM);
  const stack = limparStack(entrada.stack);
  const codigo = entrada.codigo ? entrada.codigo.slice(0, 80) : null;
  const metodo = entrada.metodo ? entrada.metodo.slice(0, 10) : null;

  return {
    fingerprint: calcularFingerprint(entrada.origem, rota, codigo, stack, mensagem),
    origem: entrada.origem,
    rota,
    metodo,
    status,
    codigo,
    mensagem,
    stack,
    userId: Number.isInteger(entrada.userId) ? Number(entrada.userId) : null,
    commitSha: origemDeploy().commit,
  };
}

function deveRegistrar(fingerprint: string, agora: number): boolean {
  const anterior = vistos.get(fingerprint);
  if (anterior !== undefined && agora - anterior < JANELA_DEDUPE_MS) return false;
  vistos.set(fingerprint, agora);
  if (vistos.size > MAX_CHAVES_EM_MEMORIA) {
    for (const [chave, quando] of vistos) {
      if (agora - quando > JANELA_DEDUPE_MS) vistos.delete(chave);
    }
  }
  return true;
}

function deveAlertar(fingerprint: string, agora: number): boolean {
  if (!process.env.ALERT_WEBHOOK_URL) return false;
  const anterior = alertados.get(fingerprint);
  if (anterior !== undefined && agora - anterior < JANELA_ALERTA_MS) return false;
  alertados.set(fingerprint, agora);
  if (alertados.size > MAX_CHAVES_EM_MEMORIA) {
    for (const [chave, quando] of alertados) {
      if (agora - quando > JANELA_ALERTA_MS) alertados.delete(chave);
    }
  }
  return true;
}

async function persistir(registro: RegistroErro): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(errorEvents).values({
      fingerprint: registro.fingerprint,
      origem: registro.origem,
      rota: registro.rota,
      metodo: registro.metodo,
      status: registro.status,
      codigo: registro.codigo,
      mensagem: registro.mensagem,
      stack: registro.stack,
      userId: registro.userId,
      commitSha: registro.commitSha,
    });
  } catch (erro) {
    // Nunca deixar a observabilidade derrubar a requisicao nem entrar em laco.
    console.warn("[observabilidade] falha ao gravar error_event:", erro);
  }
}

async function alertar(registro: RegistroErro): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const texto = [
    `Erro ${registro.status} em producao`,
    `rota: ${registro.rota}`,
    registro.codigo ? `codigo: ${registro.codigo}` : null,
    `commit: ${registro.commitSha}`,
    `mensagem: ${registro.mensagem}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` atende Slack, `content` atende Discord; cada um ignora o outro.
      body: JSON.stringify({ text: texto, content: texto }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (erro) {
    console.warn("[observabilidade] falha ao enviar alerta:", erro);
  }
}

/**
 * Registra um erro 5xx. Fire-and-forget de proposito: o caminho da requisicao
 * nao pode esperar o banco nem o webhook.
 */
export function registrarErro(entrada: EntradaErro): void {
  try {
    if ((entrada.status ?? 500) < 500) return;
    const agora = Date.now();
    const registro = montarRegistro(entrada);
    if (!deveRegistrar(registro.fingerprint, agora)) return;
    void persistir(registro);
    if (deveAlertar(registro.fingerprint, agora)) void alertar(registro);
  } catch (erro) {
    console.warn("[observabilidade] falha ao processar erro:", erro);
  }
}

/** Usado ao encerrar o processo em testes; nao mexe em banco. */
export function limparEstadoDeObservabilidade(): void {
  vistos.clear();
  alertados.clear();
}
