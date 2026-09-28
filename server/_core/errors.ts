import { TRPCError } from "@trpc/server";

/**
 * Erros de dominio como TRPCError.
 *
 * Sem isso, todo `throw new Error(...)` numa procedure vira
 * INTERNAL_SERVER_ERROR (HTTP 500) — o cliente recebe "erro do servidor" para o
 * que e, na verdade, "voce nao tem acesso" ou "nao existe". Alem de enganar o
 * usuario, 500 tambem dispara alerta de monitoramento e mascara falha real de
 * banco.
 *
 * A mensagem continua sendo a mesma; so o codigo HTTP muda.
 *
 *   notFound   -> 404  recurso inexistente
 *   forbidden  -> 403  existe mas nao pertence a voce
 *   badRequest -> 400  entrada invalida / regra de negocio violada
 *   conflict   -> 409  estado ja alterado (duplicidade, versao fechada)
 *
 * "Banco de dados não configurado." NAO entra aqui: e falha de
 * infraestrutura/infra do servidor e continua 500 de proposito.
 */
export const notFound = (message: string) =>
  new TRPCError({ code: "NOT_FOUND", message });

export const forbidden = (message: string) =>
  new TRPCError({ code: "FORBIDDEN", message });

export const badRequest = (message: string) =>
  new TRPCError({ code: "BAD_REQUEST", message });

export const conflict = (message: string) =>
  new TRPCError({ code: "CONFLICT", message });
