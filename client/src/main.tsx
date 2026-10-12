import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";
// Componente proprio do cabecalho (o seletor de obra). Vem depois de index.css
// para poder ajustar o que o app ja define, e ANTES de mobile.css, para a camada
// de campo ainda ter a ultima palavra no celular.
import "@/seletor-obra.css";
// A camada de campo tem de ser a ULTIMA folha do bundle, e isto aqui e o unico
// lugar que garante isso. O `import "./index.css"` acima vem DEPOIS de
// "./App", entao todo o CSS que o app importa (planilha.css, eap.css) entra
// antes de index.css -- e index.css entra antes disto. Medido no bundle
// publicado: uma regra `.eap-rownum { font-size: 7px }` de index.css vencia um
// override de seletor identico vindo de dentro de App, porque na cascata, com
// especificidade igual, vence a declaracao que aparece depois.
import "@/mobile.css";
// Gerado por scripts/gerar-tipografia-campo.mjs; precisa vir depois de
// mobile.css. Ver a secao 3 de mobile.css.
import "@/campo-tipografia.css";
// Tema escuro da barra lateral: a `eap.css` descreve uma barra clara e entra
// depois de `planilha.css`, ganhando os empates de especificidade. Ver o
// cabecalho de barra-lateral.css para as medicoes.
import "@/barra-lateral.css";
// Contraste: gerado por scripts/gerar-legibilidade.mjs a partir da medicao de
// contraste das 15 telas. Vem por ultimo para poder corrigir qualquer folha
// anterior -- e nao define tamanho de fonte, entao nao interfere na camada de
// campo.
import "@/legibilidade-gerada.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Service worker: permite fixar a Plataforma Obras na tela inicial do celular e
// deixa a casca do app disponivel quando o sinal cai no canteiro. A estrategia
// esta documentada em client/public/sw.js (rede primeiro nas navegacoes, para
// nunca servir versao velha a quem esta online).
// Registrado apenas em producao: em desenvolvimento o cache atravancaria o HMR.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app segue funcionando; e um adicional, nao um requisito.
    });
  });
}
