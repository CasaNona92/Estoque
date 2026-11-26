import "server-only";
import { NextResponse } from "next/server";
import { mensagemDeErro, statusDeErro } from "@/lib/erros";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

/** Envolve um Route Handler: erros viram JSON { erro } com status certo, sem detalhes internos. */
export async function responder<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json(await fn(), { headers: SEM_CACHE });
  } catch (e) {
    return NextResponse.json({ erro: mensagemDeErro(e) }, { status: statusDeErro(e), headers: SEM_CACHE });
  }
}

export function inteiro(v: string | null, padrao: number, min: number, max: number) {
  const n = Number.parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return padrao;
  return Math.min(Math.max(n, min), max);
}
