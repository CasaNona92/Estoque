// Service worker mínimo do PWA (instalar no tablet e abrir em tela cheia).
// Guarda só arquivos estáticos do próprio site. NUNCA guarda páginas, dados da API
// ou fotos (são privadas e mudam com o login).
const CACHE = "estoque-estatico-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("estoque-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const estatico = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/vendor/");
  if (!estatico) return; // páginas e API: sempre rede
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(e.request);
      if (guardado) return guardado;
      const resposta = await fetch(e.request);
      if (resposta.ok) cache.put(e.request, resposta.clone());
      return resposta;
    }),
  );
});
