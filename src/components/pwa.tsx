"use client";

import { useEffect } from "react";

/** Registra o service worker (PWA instalável no tablet, abre em tela cheia). */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

/** Limpa caches locais ao sair (fotos/telas de outra pessoa não ficam no aparelho). */
export async function limparCachesLocais() {
  try {
    if ("caches" in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("estoque-")).map((n) => caches.delete(n)));
    }
    sessionStorage.clear();
  } catch {
    // sem problema
  }
}
