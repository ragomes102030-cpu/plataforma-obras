/* =============================================================================
   Service worker da Plataforma Obras
   =============================================================================

   Objetivo: permitir fixar o app na tela inicial (o Chrome exige um service
   worker com handler de fetch) e deixar a casca disponivel quando o sinal cai
   no canteiro, sem nunca servir versao velha para quem esta online.

   Regras:
   - navegacao  -> REDE PRIMEIRO. So usa o cache se a rede falhar (offline).
                   Isso garante que quem tem sinal sempre abre a versao nova,
                   inclusive depois de um deploy.
   - /assets/*  -> cache primeiro. Esses arquivos tem hash no nome, portanto sao
                   imutaveis: se o hash mudou, o nome mudou. Sem risco de stale.
   - /api/*     -> pass-through, jamais cacheado. Nada de dado de obra no cache.
   - qualquer outra origem -> ignorado.

   Ao mudar a estrategia, troque VERSAO para descartar o cache anterior.
   ============================================================================= */

const VERSAO = "obras-2026-10-09-1";
const CASCA = ["/", "/manifest.webmanifest", "/icone.svg", "/icone-192.png", "/icone-180.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(CASCA))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Dados e autenticacao nunca entram no cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known")) return;

  // Navegacao: rede primeiro, cache apenas como ultimo recurso.
  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(VERSAO).then((c) => c.put("/", copia)).catch(() => undefined);
          }
          return resp;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/")).then((m) => m || Response.error())),
    );
    return;
  }

  // Somente estaticos com hash (imutaveis) e os icones/manifest vao para o cache.
  const cacheavel =
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/manifest.webmanifest" ||
    /^\/icone(-[\w-]+)?\.(svg|png)$/.test(url.pathname);
  if (!cacheavel) return;

  evento.respondWith(
    caches.match(req).then(
      (guardado) =>
        guardado ||
        fetch(req).then((resp) => {
          if (resp && resp.ok && resp.type === "basic") {
            const copia = resp.clone();
            caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => undefined);
          }
          return resp;
        }),
    ),
  );
});
