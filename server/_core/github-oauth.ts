import crypto from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const STATE_COOKIE = "__Host-github_oauth_state";

function getBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim() || req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function getRedirectUri(req: Request): string {
  return `${getBaseUrl(req)}/api/auth/github/callback`;
}

function requireConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

async function githubJson<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub ${label} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return JSON.parse(body) as T;
}

export function registerGitHubOAuthRoutes(app: Express) {
  app.get("/api/auth/github", (req: Request, res: Response) => {
    try {
      const { clientId } = requireConfig();
      const state = crypto.randomBytes(32).toString("hex");
      const redirectUri = getRedirectUri(req);
      res.cookie(STATE_COOKIE, state, {
        ...getSessionCookieOptions(req),
        maxAge: 10 * 60 * 1000,
      });

      const authorize = new URL(GITHUB_AUTHORIZE_URL);
      authorize.searchParams.set("client_id", clientId);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("scope", "read:user user:email");
      authorize.searchParams.set("state", state);
      res.redirect(302, authorize.toString());
    } catch (error) {
      console.error("[GitHub OAuth] Start failed", error);
      res.status(503).json({ error: "GitHub OAuth is not configured" });
    }
  });

  app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE];

    const statesMatch = Boolean(
      state &&
        expectedState &&
        state.length === expectedState.length &&
        crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
    );
    if (!code || !statesMatch) {
      res.status(403).json({ error: "Invalid GitHub OAuth state" });
      return;
    }
    res.clearCookie(STATE_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });

    try {
      const { clientId, clientSecret } = requireConfig();
      const redirectUri = getRedirectUri(req);
      const token = await githubJson<{ access_token?: string }>(
        GITHUB_TOKEN_URL,
        {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
        },
        "token exchange"
      );
      if (!token.access_token) throw new Error("GitHub token exchange returned no access token");

      const headers = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "plataforma-obras-api",
      };
      const profile = await githubJson<{ id: number; login: string; name?: string | null; email?: string | null }>(
        `${GITHUB_API_URL}/user`,
        { headers },
        "user lookup"
      );
      let email = profile.email ?? null;
      if (!email) {
        const emails = await githubJson<Array<{ email: string; primary: boolean; verified: boolean }>>(
          `${GITHUB_API_URL}/user/emails`,
          { headers },
          "email lookup"
        );
        email = emails.find(item => item.primary && item.verified)?.email ?? emails.find(item => item.verified)?.email ?? null;
      }

      const openId = `github:${profile.id}`;
      await db.upsertUser({
        openId,
        name: profile.name || profile.login,
        email,
        loginMethod: "github",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: profile.name || profile.login,
      });
      res.cookie("app_session_id", sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[GitHub OAuth] Callback failed", error);
      res.status(502).json({ error: "GitHub login failed" });
    }
  });
}
