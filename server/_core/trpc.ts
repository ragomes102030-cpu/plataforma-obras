import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Além do papel persistido no banco, o dono explicitamente configurado pelo
 * ambiente pode operar as rotas administrativas. Isso evita que o primeiro
 * login do proprietário fique preso em role="user" e receba
 * "required permission (10002)" antes de existir uma tela de bootstrap.
 */
export function isAdminUser(
  user: { role: string; openId: string } | null | undefined
): boolean {
  if (!user) return false;
  const isConfiguredOwner =
    Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId;
  return user.role === "admin" || isConfiguredOwner;
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    // Além do papel persistido no banco, o dono explicitamente configurado
    // pelo ambiente pode operar as rotas administrativas. Isso evita que o
    // primeiro login do proprietário fique preso em role="user" e receba
    // "required permission (10002)" antes de existir uma tela de bootstrap.
    const isConfiguredOwner =
      Boolean(ctx.user) &&
      Boolean(ENV.ownerOpenId) &&
      ctx.user!.openId === ENV.ownerOpenId;

    if (!ctx.user || (ctx.user.role !== "admin" && !isConfiguredOwner)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
