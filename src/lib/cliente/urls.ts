"use client";

/**
 * Cache de URLs pré-assinadas no navegador. Enquanto a URL guardada ainda vale
 * (com folga), reaproveitamos a mesma — o navegador também reaproveita a imagem
 * que já baixou. Perto de expirar, pedimos URLs novas em lote (/api/r2/assinar).
 */
type Entrada = { url: string; expira: number };
const cache = new Map<string, Entrada>();
const FOLGA_MS = 5 * 60 * 1000;

export function guardarUrl(chave: string, url: string, expira: number) {
  const atual = cache.get(chave);
  if (atual && atual.expira - FOLGA_MS > Date.now()) return atual.url;
  cache.set(chave, { url, expira });
  return url;
}

export function urlValida(chave: string): string | null {
  const e = cache.get(chave);
  return e && e.expira - FOLGA_MS > Date.now() ? e.url : null;
}

let pendentes = new Set<string>();
let espera: Promise<void> | null = null;

/** Junta pedidos feitos no mesmo instante numa só chamada. */
export function renovarUrls(chaves: string[]): Promise<void> {
  for (const c of chaves) pendentes.add(c);
  espera ??= new Promise<void>((resolver) => {
    setTimeout(async () => {
      const lote = [...pendentes].slice(0, 200);
      pendentes = new Set();
      espera = null;
      try {
        const r = await fetch("/api/r2/assinar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chaves: lote }),
        });
        if (r.ok) {
          const { urls, expira } = (await r.json()) as { urls: Record<string, string>; expira: number };
          for (const [k, v] of Object.entries(urls)) cache.set(k, { url: v, expira });
        }
      } finally {
        resolver();
      }
    }, 30);
  });
  return espera;
}
