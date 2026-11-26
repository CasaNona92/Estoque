import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Aceita só caminhos internos (evita "open redirect" no ?voltar=). */
export function caminhoInternoSeguro(destino: string | null | undefined, padrao = "/"): string {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.startsWith("/\\")) return padrao;
  return destino;
}

export function dividirEmLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

export const ehUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
