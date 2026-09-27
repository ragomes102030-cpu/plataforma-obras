import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "../db";
import { sdk } from "./sdk";
import { registerGitHubOAuthRoutes } from "./github-oauth";

const realFetch = globalThis.fetch;

// Nunca fixar um dominio de deploy aqui: quebra o CI a cada troca de plataforma.
const TEST_PUBLIC_APP_URL = "https://app.exemplo.test";

async function startTestServer() {
  const app = express();
  registerGitHubOAuthRoutes(app);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not start");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopTestServer(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
}

describe("GitHub OAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.PUBLIC_APP_URL;
  });

  it("redirects to GitHub with a callback URL and a CSRF state cookie", async () => {
    process.env.GITHUB_CLIENT_ID = "github-client-test";
    process.env.GITHUB_CLIENT_SECRET = "github-secret-test";
    process.env.PUBLIC_APP_URL = TEST_PUBLIC_APP_URL;
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await realFetch(`${baseUrl}/api/auth/github`, {
        redirect: "manual",
      });
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.origin).toBe("https://github.com");
      expect(location.pathname).toBe("/login/oauth/authorize");
      expect(location.searchParams.get("client_id")).toBe("github-client-test");
      expect(location.searchParams.get("redirect_uri")).toBe(
        `${TEST_PUBLIC_APP_URL}/api/auth/github/callback`
      );
      expect(location.searchParams.get("scope")).toBe("read:user user:email");
      expect(location.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
      const cookies = (
        response.headers as Headers & { getSetCookie(): string[] }
      ).getSetCookie();
      expect(
        cookies.some(cookie => cookie.startsWith("__Host-github_oauth_state="))
      ).toBe(true);
    } finally {
      await stopTestServer(server);
    }
  });

  it("rejects a callback with a missing or invalid state before contacting GitHub", async () => {
    process.env.GITHUB_CLIENT_ID = "github-client-test";
    process.env.GITHUB_CLIENT_SECRET = "github-secret-test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await realFetch(
        `${baseUrl}/api/auth/github/callback?code=code&state=wrong`,
        {
          redirect: "manual",
        }
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Invalid GitHub OAuth state",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await stopTestServer(server);
    }
  });

  it("exchanges the code, upserts the GitHub user, and creates a session", async () => {
    process.env.GITHUB_CLIENT_ID = "github-client-test";
    process.env.GITHUB_CLIENT_SECRET = "github-secret-test";
    process.env.PUBLIC_APP_URL = TEST_PUBLIC_APP_URL;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-test" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 12345,
            login: "obra-user",
            name: "Obra User",
            email: "obra@example.com",
          }),
          {
            status: 200,
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const upsertUser = vi.spyOn(db, "upsertUser").mockResolvedValue(undefined);
    vi.spyOn(sdk, "createSessionToken").mockResolvedValue("session-token-test");
    const { server, baseUrl } = await startTestServer();

    try {
      const startResponse = await realFetch(`${baseUrl}/api/auth/github`, {
        redirect: "manual",
      });
      const location = new URL(startResponse.headers.get("location") ?? "");
      const state = location.searchParams.get("state");
      const cookies = (
        startResponse.headers as Headers & { getSetCookie(): string[] }
      ).getSetCookie();
      const stateCookie = cookies
        .find(cookie => cookie.startsWith("__Host-github_oauth_state="))
        ?.split(";", 1)[0];
      expect(state).toBeTruthy();
      expect(stateCookie).toBeTruthy();

      const callbackResponse = await realFetch(
        `${baseUrl}/api/auth/github/callback?code=github-code&state=${state}`,
        { redirect: "manual", headers: { cookie: stateCookie! } }
      );
      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe("/");
      expect(callbackResponse.headers.get("set-cookie")).toContain(
        "app_session_id=session-token-test"
      );
      expect(upsertUser).toHaveBeenCalledWith(
        expect.objectContaining({
          openId: "github:12345",
          name: "Obra User",
          email: "obra@example.com",
          loginMethod: "github",
        })
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await stopTestServer(server);
    }
  });

  it("reports the failing stage without echoing GitHub's raw response body", async () => {
    process.env.GITHUB_CLIENT_ID = "github-client-test";
    process.env.GITHUB_CLIENT_SECRET = "github-secret-test";
    process.env.PUBLIC_APP_URL = TEST_PUBLIC_APP_URL;
    // O corpo do GitHub pode refletir o host ou o identificador da OAuth App.
    // Ele pertence ao log do servidor, nunca a resposta entregue ao cliente.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "bad_verification_code",
            leaked: "MARKER-OAUTH-APP-HOST",
          }),
          { status: 400 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const { server, baseUrl } = await startTestServer();

    try {
      const startResponse = await realFetch(`${baseUrl}/api/auth/github`, {
        redirect: "manual",
      });
      const location = new URL(startResponse.headers.get("location") ?? "");
      const state = location.searchParams.get("state");
      const cookies = (
        startResponse.headers as Headers & { getSetCookie(): string[] }
      ).getSetCookie();
      const stateCookie = cookies
        .find(cookie => cookie.startsWith("__Host-github_oauth_state="))
        ?.split(";", 1)[0];

      const callbackResponse = await realFetch(
        `${baseUrl}/api/auth/github/callback?code=github-code&state=${state}`,
        { redirect: "manual", headers: { cookie: stateCookie! } }
      );
      expect(callbackResponse.status).toBe(502);
      const body = (await callbackResponse.json()) as Record<string, unknown>;
      expect(body.stage).toBe("token_exchange");
      expect(body.code).toBe("oauth_token_exchange_failed");
      expect(body.message).toContain("GITHUB_CLIENT_SECRET");
      expect(body).not.toHaveProperty("detail");
      expect(JSON.stringify(body)).not.toContain("MARKER-OAUTH-APP-HOST");
    } finally {
      await stopTestServer(server);
    }
  });

  it("blames the session stage when the cookie secret cannot sign a token", async () => {
    process.env.GITHUB_CLIENT_ID = "github-client-test";
    process.env.GITHUB_CLIENT_SECRET = "github-secret-test";
    process.env.PUBLIC_APP_URL = TEST_PUBLIC_APP_URL;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-test" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 12345,
            login: "obra-user",
            name: "Obra User",
            email: "obra@example.com",
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(db, "upsertUser").mockResolvedValue(undefined);
    // Reproduz o sintoma real: JWT_SECRET presente porem vazio virava "" via
    // ?? "", e so quebrava aqui, longe da variavel que de fato causava.
    vi.spyOn(sdk, "createSessionToken").mockRejectedValue(
      new Error("DataError: Zero-length key is not supported")
    );
    const { server, baseUrl } = await startTestServer();

    try {
      const startResponse = await realFetch(`${baseUrl}/api/auth/github`, {
        redirect: "manual",
      });
      const location = new URL(startResponse.headers.get("location") ?? "");
      const state = location.searchParams.get("state");
      const cookies = (
        startResponse.headers as Headers & { getSetCookie(): string[] }
      ).getSetCookie();
      const stateCookie = cookies
        .find(cookie => cookie.startsWith("__Host-github_oauth_state="))
        ?.split(";", 1)[0];

      const callbackResponse = await realFetch(
        `${baseUrl}/api/auth/github/callback?code=github-code&state=${state}`,
        { redirect: "manual", headers: { cookie: stateCookie! } }
      );
      expect(callbackResponse.status).toBe(502);
      const body = (await callbackResponse.json()) as Record<string, unknown>;
      expect(body.stage).toBe("session");
      expect(body.code).toBe("oauth_session_failed");
      expect(body.message).toContain("JWT_SECRET");
      expect(body).not.toHaveProperty("detail");
    } finally {
      await stopTestServer(server);
    }
  });
});
