"use client";

import { useEffect, useRef, useState } from "react";
import type { RespostaBusca } from "@/lib/tipos";

/** Busca em tempo real com debounce (150 ms) e cancelamento da requisição anterior. */
export function useBusca(termo: string, limite = 8, atraso = 150, publico = false) {
  const [dados, setDados] = useState<RespostaBusca | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = termo.trim();
    if (!t) {
      controle.current?.abort();
      setDados(null);
      setCarregando(false);
      setErro(null);
      return;
    }
    setCarregando(true);
    const id = setTimeout(async () => {
      controle.current?.abort();
      const c = new AbortController();
      controle.current = c;
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(t)}&limite=${limite}${publico ? "&publico=1" : ""}`, {
          signal: c.signal,
        });
        if (r.status === 401) {
          window.location.href = "/sair?motivo=sessao";
          return;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? "Erro na busca");
        setDados(j);
        setErro(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErro((e as Error).message);
      } finally {
        if (!c.signal.aborted) setCarregando(false);
      }
    }, atraso);
    return () => clearTimeout(id);
  }, [termo, limite, atraso, publico]);

  return { dados, carregando, erro };
}

/** Procura um código de barras/código exato. Devolve o produto (e a cor) ou null. */
export async function procurarCodigo(codigo: string) {
  const r = await fetch(`/api/busca?q=${encodeURIComponent(codigo)}&limite=1`);
  if (!r.ok) return null;
  const j = (await r.json()) as RespostaBusca;
  const p = j.resultados[0];
  return p && p.relevancia === 1 ? p : null;
}
